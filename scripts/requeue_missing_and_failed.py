#!/usr/bin/env python3
r"""
Automated Recovery & Backfill Script
====================================
1. Scans `errors.log` and `app.log` for failed track entries.
2. Scans the local music library on `H:\` for sequence gaps and missing tracks.
3. Resolves track metadata via local SQLite cache and Deezer catalog.
4. Deduplicates and automatically re-queues missing tracks to the API server on port 8779.
"""

import os
import sys
import re
import time
import json
import argparse
import urllib.request
import urllib.parse
from pathlib import Path

# Add project root to path for local module access
WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(WORKSPACE_ROOT))
try:
    sys.stdout.reconfigure(line_buffering=True)
except Exception:
    pass

try:
    from app.config import CONFIG, DEFAULT_DOWNLOAD_DIR
    from app.system import sanitize_filename, sanitize_path
except ImportError:
    CONFIG = {}
    DEFAULT_DOWNLOAD_DIR = r"H:\Music"
    def sanitize_filename(name, fallback="Unknown", max_length=150):
        return re.sub(r'[<>:"/\\|?*]', '_', str(name or fallback)).strip(". ")
    def sanitize_path(p):
        return Path(p)

# ANSI Colors for clean terminal UI
CYAN = "\033[96m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
MAGENTA = "\033[95m"
BOLD = "\033[1m"
RESET = "\033[0m"


class RecoveryEngine:
    def __init__(self, music_root: str, server_url: str, errors_log: str, app_log: str):
        self.music_root = Path(music_root)
        self.server_url = server_url.rstrip("/")
        self.errors_log_path = Path(errors_log)
        self.app_log_path = Path(app_log)
        self.db_path = WORKSPACE_ROOT / "data" / "discovery.db"
        self._album_cache = {}
        self._load_db_cache()

    def _load_db_cache(self):
        if self.db_path.exists():
            try:
                import sqlite3
                conn = sqlite3.connect(str(self.db_path), timeout=5)
                c = conn.cursor()
                c.execute("SELECT id, title, artist, year, cover_url, data_json FROM cached_albums")
                for row in c.fetchall():
                    if row[5]:
                        try:
                            d = json.loads(row[5])
                            if d.get("tracks"):
                                res = {
                                    "id": str(row[0]),
                                    "title": row[1],
                                    "artist": row[2],
                                    "year": row[3] or "",
                                    "cover": row[4] or d.get("cover_big") or "",
                                    "tracks": d["tracks"]
                                }
                                self._album_cache[(row[2].lower().strip(), row[1].lower().strip())] = res
                        except Exception:
                            pass
                conn.close()
            except Exception:
                pass

    def log(self, prefix: str, msg: str, color: str = ""):
        print(f"{color}{BOLD}[{prefix}]{RESET} {msg}")

    # ==========================================
    # 1. Harvest Failed Tracks from Error Logs
    # ==========================================
    def harvest_failed_tracks_from_logs(self) -> list[dict]:
        self.log("LOG SCAN", "Scanning logs for failed track events...", CYAN)
        failed_items = []
        seen_keys = set()

        # Parse app.log sessions for context (Album, Artist, Track Number)
        if self.app_log_path.exists():
            try:
                with open(self.app_log_path, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()

                # Find album download sessions: [STARTING DOWNLOAD] 'Album' by Artist - N tracks
                pattern = r"\[STARTING DOWNLOAD\] '([^']+)' by ([^-\n]+) - (\d+) tracks(.*?)(?=\[STARTING DOWNLOAD\]|\Z)"
                for alb_title, artist, count, body in re.findall(pattern, content, re.DOTALL):
                    alb_title = alb_title.strip()
                    artist = artist.strip()

                    # Find failures within this session: [TRACK N/TOTAL FAILED] 'Title': Reason
                    fail_matches = re.findall(r"\[TRACK (\d+)/(\d+) FAILED\] '([^']+)'", body)
                    for tr_num, total_tr, tr_title in fail_matches:
                        key = (artist.lower(), alb_title.lower(), tr_title.lower())
                        if key not in seen_keys:
                            seen_keys.add(key)
                            failed_items.append({
                                "artist": artist,
                                "album": alb_title,
                                "title": tr_title,
                                "track_number": int(tr_num),
                                "total_tracks": int(total_tr),
                                "source": "app.log"
                            })
            except Exception as e:
                self.log("WARN", f"Could not parse app.log: {e}", YELLOW)

        # Parse errors.log as supplementary
        if self.errors_log_path.exists():
            try:
                with open(self.errors_log_path, "r", encoding="utf-8", errors="ignore") as f:
                    for line in f:
                        m = re.search(r"\[TRACK (\d+)/(\d+) FAILED\] '([^']+)': (.*)", line)
                        if m:
                            tr_num, total_tr, tr_title, err = m.groups()
                            # If not already recorded with full context
                            matched = any(it["title"].lower() == tr_title.lower() for it in failed_items)
                            if not matched:
                                failed_items.append({
                                    "artist": "",
                                    "album": "",
                                    "title": tr_title,
                                    "track_number": int(tr_num),
                                    "total_tracks": int(total_tr),
                                    "source": "errors.log"
                                })
            except Exception as e:
                self.log("WARN", f"Could not parse errors.log: {e}", YELLOW)

        self.log("LOG SCAN", f"Found {len(failed_items)} failed track events across logs.", GREEN)
        return failed_items

    # ==========================================
    # 2. Scan Disk Library for Gaps
    # ==========================================
    def scan_library_for_gaps(self) -> list[dict]:
        self.log("DISK SCAN", f"Scanning library at '{self.music_root}' for track gaps...", CYAN)
        if not self.music_root.exists():
            self.log("ERROR", f"Music root drive '{self.music_root}' does not exist!", RED)
            return []

        gap_items = []
        ignored_dirs = {"$recycle.bin", "system volume information", ".thumbnails", ".git"}
        audio_exts = {".mp3", ".flac", ".m4a", ".wav", ".ogg", ".opus"}

        artist_dirs = [d for d in self.music_root.iterdir() if d.is_dir() and d.name.lower() not in ignored_dirs]
        self.log("DISK SCAN", f"Found {len(artist_dirs)} artist directories to inspect.", CYAN)

        for artist_dir in artist_dirs:
            artist_name = artist_dir.name
            try:
                album_dirs = [d for d in artist_dir.iterdir() if d.is_dir()]
            except Exception:
                continue

            for alb_dir in album_dirs:
                # Extract clean album name and year
                folder_name = alb_dir.name
                year_match = re.search(r"\((\d{4})\)$", folder_name)
                year = year_match.group(1) if year_match else ""
                clean_album = re.sub(r"\s*\(\d{4}\)$", "", folder_name).strip()

                try:
                    audio_files = [f for f in alb_dir.iterdir() if f.is_file() and f.suffix.lower() in audio_exts]
                except Exception:
                    continue

                # Map track numbers present on disk from filename
                present_numbers = set()
                for f in audio_files:
                    m = re.match(r"^(\d{1,3})\s*[-.]", f.name)
                    if m:
                        present_numbers.add(int(m.group(1)))

                # Case A: Empty Album Folder (0 audio files)
                if len(audio_files) == 0:
                    gap_items.append({
                        "artist": artist_name,
                        "album": clean_album,
                        "year": year,
                        "missing_type": "empty_folder",
                        "missing_track_nums": [],
                        "dir": alb_dir
                    })
                    continue

                # Case B: Sequence gap detected (e.g. tracks 1, 2, 4 present -> 3 missing)
                if present_numbers:
                    max_num = max(present_numbers)
                    missing_in_seq = [n for n in range(1, max_num + 1) if n not in present_numbers]
                    if missing_in_seq:
                        gap_items.append({
                            "artist": artist_name,
                            "album": clean_album,
                            "year": year,
                            "missing_type": "sequence_gap",
                            "missing_track_nums": missing_in_seq,
                            "dir": alb_dir,
                            "expected_total": max_num,
                            "present_count": len(present_numbers)
                        })

        self.log("DISK SCAN", f"Identified {len(gap_items)} album folders with gaps or missing tracks.", GREEN)
        return gap_items

    # ==========================================
    # 3. Resolve Metadata for Missing Items
    # ==========================================
    def resolve_album_metadata(self, artist: str, album: str) -> dict | None:
        art_clean = artist.lower().strip()
        alb_clean = album.lower().strip()
        key = (art_clean, alb_clean)

        # Exact match in pre-loaded cache
        if key in self._album_cache:
            return self._album_cache[key]

        # Fuzzy match in pre-loaded cache
        for (c_art, c_alb), data in self._album_cache.items():
            if c_art == art_clean and (alb_clean in c_alb or c_alb in alb_clean):
                return data

        # Query Local API server search if not in local cache
        try:
            q_enc = urllib.parse.quote(f"{artist} {album}")
            req = urllib.request.Request(
                f"{self.server_url}/api/search?q={q_enc}",
                headers={"User-Agent": "RecoveryBackfill/1.0"}
            )
            with urllib.request.urlopen(req, timeout=3) as resp:
                data = json.loads(resp.read().decode())
                albums = data.get("albums", [])
                for alb in albums:
                    if (
                        alb.get("artist", "").lower() == art_clean
                        and (alb_clean in alb.get("title", "").lower() or alb.get("title", "").lower() in alb_clean)
                    ):
                        aid = alb.get("id")
                        req_alb = urllib.request.Request(
                            f"{self.server_url}/api/album?id={aid}",
                            headers={"User-Agent": "RecoveryBackfill/1.0"}
                        )
                        with urllib.request.urlopen(req_alb, timeout=3) as a_resp:
                            alb_data = json.loads(a_resp.read().decode())
                            if alb_data and alb_data.get("tracks"):
                                res = {
                                    "id": str(alb_data.get("id", aid)),
                                    "title": alb_data.get("title", album),
                                    "artist": alb_data.get("artist", artist),
                                    "year": str(alb_data.get("year", "")),
                                    "cover": alb_data.get("cover_big", alb_data.get("cover", "")),
                                    "tracks": alb_data["tracks"]
                                }
                                self._album_cache[key] = res
                                return res
        except Exception:
            pass

        return None

    # ==========================================
    # 4. Synthesize & Deduplicate Missing Tracks
    # ==========================================
    def build_deduplicated_missing_list(self, failed_logs: list[dict], library_gaps: list[dict], limit: int | None = None) -> list[dict]:
        self.log("RECOVERY", "Synthesizing and deduplicating missing tracks list...", CYAN)
        missing_tracks = []
        seen_keys = set()
        dir_stems_cache = {}

        def get_dir_stems(dir_p: Path):
            if dir_p not in dir_stems_cache:
                stems = set()
                try:
                    if dir_p.exists():
                        for f in dir_p.iterdir():
                            if f.is_file() and f.stat().st_size > 50000:
                                stems.add(f.name.lower())
                except Exception:
                    pass
                dir_stems_cache[dir_p] = stems
            return dir_stems_cache[dir_p]

        # Helper: check if file is already intact on disk
        def is_on_disk(artist, album, tr_num, tr_title, dir_hint=None):
            if dir_hint:
                stems = get_dir_stems(dir_hint)
                return any(s.startswith(f"{tr_num:02d} -") or (tr_title and tr_title.lower() in s) for s in stems)

            try:
                art_dir = self.music_root / sanitize_filename(artist)
                if not art_dir.exists():
                    return False
                for alb_dir in art_dir.iterdir():
                    if alb_dir.is_dir() and album.lower() in alb_dir.name.lower():
                        stems = get_dir_stems(alb_dir)
                        if any(s.startswith(f"{tr_num:02d} -") or (tr_title and tr_title.lower() in s) for s in stems):
                            return True
            except Exception:
                pass
            return False

        # 1. Process Library Gaps
        for gap in library_gaps:
            if limit and len(missing_tracks) >= limit:
                break

            artist = gap["artist"]
            album = gap["album"]
            year = gap["year"]
            alb_dir = gap["dir"]

            meta = self.resolve_album_metadata(artist, album)
            if not meta or not meta.get("tracks"):
                continue

            album_id = meta["id"]
            cover_url = meta["cover"]
            tracks_list = meta["tracks"]

            if gap["missing_type"] == "empty_folder":
                for idx, tr in enumerate(tracks_list, 1):
                    if limit and len(missing_tracks) >= limit:
                        break
                    tr_num = tr.get("track_position") or tr.get("track_number") or idx
                    tr_title = tr.get("title", f"Track {tr_num}")
                    if is_on_disk(artist, album, tr_num, tr_title, alb_dir):
                        continue

                    key = (artist.lower(), album.lower(), tr_num)
                    if key not in seen_keys:
                        seen_keys.add(key)
                        missing_tracks.append({
                            "album_id": album_id,
                            "album_title": meta["title"],
                            "artist": artist,
                            "year": year or meta.get("year", ""),
                            "cover_big": cover_url,
                            "track_number": tr_num,
                            "track_id": tr.get("id", f"{album_id}_{tr_num}"),
                            "title": tr_title,
                            "duration": tr.get("duration", 180)
                        })

            elif gap["missing_type"] == "sequence_gap":
                missing_nums = set(gap["missing_track_nums"])
                for idx, tr in enumerate(tracks_list, 1):
                    if limit and len(missing_tracks) >= limit:
                        break
                    tr_num = tr.get("track_position") or tr.get("track_number") or idx
                    if tr_num in missing_nums:
                        tr_title = tr.get("title", f"Track {tr_num}")
                        if is_on_disk(artist, album, tr_num, tr_title, alb_dir):
                            continue

                        key = (artist.lower(), album.lower(), tr_num)
                        if key not in seen_keys:
                            seen_keys.add(key)
                            missing_tracks.append({
                                "album_id": album_id,
                                "album_title": meta["title"],
                                "artist": artist,
                                "year": year or meta.get("year", ""),
                                "cover_big": cover_url,
                                "track_number": tr_num,
                                "track_id": tr.get("id", f"{album_id}_{tr_num}"),
                                "title": tr_title,
                                "duration": tr.get("duration", 180)
                            })

        # 2. Process Log Failures (app.log & errors.log)
        for fl in failed_logs:
            if limit and len(missing_tracks) >= limit:
                break
            artist = fl.get("artist")
            album = fl.get("album")
            title = fl.get("title")
            tr_num = fl.get("track_number", 1)

            if not artist or not album:
                continue

            if is_on_disk(artist, album, tr_num, title):
                continue

            key = (artist.lower(), album.lower(), tr_num)
            if key not in seen_keys:
                meta = self.resolve_album_metadata(artist, album)
                album_id = meta["id"] if meta else "recovery_job"
                cover_url = meta["cover"] if meta else ""
                year = meta.get("year", "") if meta else ""

                tr_id = f"{album_id}_{tr_num}"
                dur = 180
                if meta and meta.get("tracks"):
                    for tr in meta["tracks"]:
                        if (
                            tr.get("track_position") == tr_num
                            or tr.get("title", "").lower() == title.lower()
                        ):
                            tr_id = tr.get("id", tr_id)
                            dur = tr.get("duration", 180)
                            title = tr.get("title", title)
                            break

                seen_keys.add(key)
                missing_tracks.append({
                    "album_id": album_id,
                    "album_title": album,
                    "artist": artist,
                    "year": year,
                    "cover_big": cover_url,
                    "track_number": tr_num,
                    "track_id": tr_id,
                    "title": title,
                    "duration": dur
                })

        self.log("RECOVERY", f"Total unique missing tracks to re-queue: {len(missing_tracks)}", GREEN)
        return missing_tracks

    # ==========================================
    # 5. Dispatch Download Jobs to Port 8779
    # ==========================================
    def dispatch_queue_requests(self, missing_tracks: list[dict], limit: int | None = None, dry_run: bool = False):
        if not missing_tracks:
            self.log("COMPLETE", "Zero missing tracks detected! Your library is 100% complete.", GREEN)
            return

        to_process = missing_tracks[:limit] if limit else missing_tracks

        print("\n" + "=" * 80)
        self.log("DISPATCH", f"Re-queueing {len(to_process)} missing tracks to server {self.server_url}...", CYAN)
        if dry_run:
            self.log("DRY RUN", "Dry-run mode active. No HTTP requests will be dispatched.", YELLOW)
        print("=" * 80 + "\n")

        success_count = 0
        already_queued = 0
        failed_count = 0

        for idx, item in enumerate(to_process, 1):
            artist = item["artist"]
            album = item["album_title"]
            title = item["title"]
            tr_num = item["track_number"]

            if dry_run:
                print(f"[{idx:03d}/{len(to_process):03d}] {YELLOW}[DRY RUN]{RESET} Track {tr_num:02d} | '{title}' by {artist} ({album})")
                continue

            payload = {
                "album_id": item["album_id"],
                "album_title": album,
                "artist": artist,
                "cover_big": item["cover_big"],
                "year": item["year"],
                "track": {
                    "id": item["track_id"],
                    "title": title,
                    "track_number": tr_num,
                    "artist": artist,
                    "duration": item.get("duration", 180)
                }
            }

            try:
                data_bytes = json.dumps(payload).encode("utf-8")
                req = urllib.request.Request(
                    f"{self.server_url}/api/download/track",
                    data=data_bytes,
                    headers={
                        "Content-Type": "application/json",
                        "User-Agent": "RecoveryBackfill/1.0"
                    },
                    method="POST"
                )

                with urllib.request.urlopen(req, timeout=5) as resp:
                    res = json.loads(resp.read().decode())
                    status = res.get("status")
                    if status == "queued":
                        success_count += 1
                        print(f"[{idx:03d}/{len(to_process):03d}] {GREEN}✓ QUEUED{RESET} Track {tr_num:02d} | '{title}' by {artist} ({album})")
                    else:
                        already_queued += 1
                        print(f"[{idx:03d}/{len(to_process):03d}] {CYAN}ℹ {status.upper()}{RESET} Track {tr_num:02d} | '{title}' by {artist}")

                # Stagger requests slightly to keep server thread pool silky smooth
                time.sleep(0.04)

            except Exception as e:
                failed_count += 1
                print(f"[{idx:03d}/{len(to_process):03d}] {RED}✗ FAILED{RESET} Track {tr_num:02d} | '{title}' by {artist}: {e}")

        print("\n" + "=" * 80)
        self.log(
            "SUMMARY",
            f"Done! {success_count} queued | {already_queued} already in queue | {failed_count} errors.",
            GREEN if failed_count == 0 else YELLOW
        )
        print("=" * 80 + "\n")

    # ==========================================
    # 6. Live Queue Monitor
    # ==========================================
    def monitor_queue(self):
        self.log("MONITOR", f"Connecting to live download queue on {self.server_url}...", CYAN)
        print("Press Ctrl+C to stop monitoring.\n")

        try:
            while True:
                req = urllib.request.Request(
                    f"{self.server_url}/api/download/status",
                    headers={"User-Agent": "RecoveryBackfill/1.0"}
                )
                with urllib.request.urlopen(req, timeout=3) as resp:
                    data = json.loads(resp.read().decode())
                    active = data.get("active")
                    q = data.get("queue", [])

                    if not active and not q:
                        self.log("IDLE", "Download queue is completely empty. All jobs finished! ✓", GREEN)
                        break

                    status_line = ""
                    if active:
                        title = active.get("title", "Unknown")
                        pct = active.get("progress_pct", 0)
                        speed = active.get("current_track_speed") or ""
                        eta = active.get("current_track_eta") or ""
                        track_title = active.get("current_track_title") or ""
                        speed_str = f" | {speed}" if speed else ""
                        eta_str = f" | ETA {eta}" if eta else ""
                        status_line = f"{YELLOW}[DOWNLOADING]{RESET} '{title}' - {pct}% ({track_title}){speed_str}{eta_str} | Queue: {len(q)} remaining"
                    else:
                        status_line = f"{CYAN}[WAITING]{RESET} Preparing next item... Queue: {len(q)} remaining"

                    print(f"\r{status_line.ljust(110)}", end="", flush=True)

                time.sleep(1.5)
        except KeyboardInterrupt:
            print(f"\n{YELLOW}Monitoring stopped by user.{RESET}")


def main():
    parser = argparse.ArgumentParser(
        description="Automated Recovery & Backfill Workflow for Album Discovery App"
    )
    parser.add_argument(
        "--drive",
        default=CONFIG.get("download_root") or CONFIG.get("music_root") or "H:\\",
        help="Target music storage drive (default: H:\\)"
    )
    parser.add_argument(
        "--server",
        default="http://127.0.0.1:8779",
        help="API server URL (default: http://127.0.0.1:8779)"
    )
    parser.add_argument(
        "--errors-log",
        default=str(WORKSPACE_ROOT / "data" / "logs" / "errors.log"),
        help="Path to errors.log"
    )
    parser.add_argument(
        "--app-log",
        default=str(WORKSPACE_ROOT / "data" / "logs" / "app.log"),
        help="Path to app.log"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit number of tracks to queue (e.g. --limit 20 for batch testing)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Scan and report missing/failed tracks without sending download requests"
    )
    parser.add_argument(
        "--monitor",
        action="store_true",
        help="Keep running after queueing to live-stream download progress"
    )

    args = parser.parse_args()

    engine = RecoveryEngine(
        music_root=args.drive,
        server_url=args.server,
        errors_log=args.errors_log,
        app_log=args.app_log
    )

    print("\n" + "=" * 80)
    print(f"{BOLD}{MAGENTA} ALBUM DISCOVERY APP — AUTOMATED RECOVERY & BACKFILL PIPELINE {RESET}")
    print("=" * 80)
    print(f"Target Storage:  {args.drive}")
    print(f"API Server:      {args.server}")
    print(f"Dry Run:         {args.dry_run}")
    print(f"Limit:           {args.limit or 'Unlimited'}")
    print("=" * 80 + "\n")

    # Step 1: Parse logs
    failed_logs = engine.harvest_failed_tracks_from_logs()

    # Step 2: Scan disk for sequence gaps
    library_gaps = engine.scan_library_for_gaps()

    # Step 3: Combine, resolve metadata & deduplicate
    missing_tracks = engine.build_deduplicated_missing_list(failed_logs, library_gaps, limit=args.limit)

    # Step 4: Dispatch to server
    engine.dispatch_queue_requests(missing_tracks, limit=args.limit, dry_run=args.dry_run)

    # Step 5: Optional live queue monitoring
    if args.monitor and not args.dry_run:
        engine.monitor_queue()


if __name__ == "__main__":
    main()
