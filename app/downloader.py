import os
import re
import time
import shutil
import tempfile
import threading
import importlib
import urllib.request
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from .config import CONFIG, DEFAULT_DOWNLOAD_DIR
from .logger import log_info, log_warn, log_error, log_download
from .db import record_download, load_persisted_queue, save_persisted_queue, clear_persisted_queue
from .system import check_free_disk_space, sanitize_filename, sanitize_path
from .tagger import tag_mp3_file

yt_dlp = None
try:
    yt_dlp = importlib.import_module("yt_dlp")
    HAS_YTDLP = True
except Exception:
    HAS_YTDLP = False

# Dynamic Mutagen Modules
EasyID3 = None
ID3 = None
APIC = None
FLAC = None
Picture = None
MP4 = None
MP4Cover = None
OggVorbis = None
OggOpus = None

try:
    EasyID3 = importlib.import_module("mutagen.easyid3").EasyID3
    mutagen_id3 = importlib.import_module("mutagen.id3")
    ID3 = mutagen_id3.ID3
    APIC = mutagen_id3.APIC
    FLAC = importlib.import_module("mutagen.flac").FLAC
    Picture = importlib.import_module("mutagen.flac").Picture
    mutagen_mp4 = importlib.import_module("mutagen.mp4")
    MP4 = mutagen_mp4.MP4
    MP4Cover = mutagen_mp4.MP4Cover
    OggVorbis = importlib.import_module("mutagen.oggvorbis").OggVorbis
    OggOpus = importlib.import_module("mutagen.oggopus").OggOpus
    HAS_MUTAGEN = True
except Exception:
    HAS_MUTAGEN = False

FORMAT_SPECS = {
    "flac": {"codec": "flac", "quality": None, "ext": "flac"},
    "alac": {"codec": "alac", "quality": None, "ext": "m4a"},
    "wav":  {"codec": "wav",  "quality": None, "ext": "wav"},
    "320k": {"codec": "mp3",  "quality": "320", "ext": "mp3"},
    "256k": {"codec": "mp3",  "quality": "256", "ext": "mp3"},
    "192k": {"codec": "mp3",  "quality": "192", "ext": "mp3"},
    "128k": {"codec": "mp3",  "quality": "128", "ext": "mp3"},
    "aac256": {"codec": "m4a", "quality": "256", "ext": "m4a"},
    "m4a":  {"codec": "m4a",  "quality": "256", "ext": "m4a"},
    "ogg320": {"codec": "vorbis", "quality": "320", "ext": "ogg"},
    "opus160": {"codec": "opus", "quality": "160", "ext": "opus"},
    "opus": {"codec": "opus", "quality": "160", "ext": "opus"}
}



def get_ffmpeg_path() -> str | None:
    """Find local FFmpeg binary across PATH, imageio_ffmpeg, and known Windows/user directories."""
    path = shutil.which("ffmpeg")
    if path:
        return path
    try:
        import imageio_ffmpeg
        p = imageio_ffmpeg.get_ffmpeg_exe()
        if p and os.path.exists(p):
            return p
    except Exception:
        pass
    candidates = [
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WindowsApps\ffmpeg.exe"),
        r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
        r"C:\ffmpeg\bin\ffmpeg.exe",
        os.path.expandvars(r"%USERPROFILE%\scoop\shims\ffmpeg.exe"),
        os.path.expandvars(r"%ProgramData%\chocolatey\bin\ffmpeg.exe")
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
_YTDLP_UPDATE_LOCK = threading.Lock()
_YTDLP_UPDATED = False


def auto_update_ytdlp_background():
    """Silently check and update yt-dlp in a background daemon thread on startup."""
    global _YTDLP_UPDATED
    with _YTDLP_UPDATE_LOCK:
        if _YTDLP_UPDATED:
            return
        _YTDLP_UPDATED = True

    def _worker():
        try:
            import sys
            import subprocess
            # Wait 3 seconds so the main window and UI load with zero delay
            time.sleep(3.0)
            log_download("[AUTO-UPDATE] Checking yt-dlp extractor updates in background...")
            
            kwargs = {}
            if sys.platform == "win32":
                kwargs["creationflags"] = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)

            cmd = [sys.executable, "-m", "pip", "install", "--upgrade", "yt-dlp"]
            res = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=120,
                **kwargs
            )
            if res.returncode == 0:
                log_download("[AUTO-UPDATE] yt-dlp check complete: extractors are up to date.")
            else:
                log_warn(f"[AUTO-UPDATE] yt-dlp upgrade check returned code {res.returncode}")
        except Exception as e:
            log_warn(f"[AUTO-UPDATE] yt-dlp auto-update check bypassed: {e}")

    t = threading.Thread(target=_worker, name="YtDlpAutoUpdater", daemon=True)
    t.start()


class DownloadManager:
    def __init__(self):
        self.queue = load_persisted_queue()
        self.active_job = None
        self.history = []
        self._lock = threading.Lock()
        self._worker_thread = threading.Thread(target=self._process_queue, daemon=True)
        self._running = True
        self._worker_thread.start()
        auto_update_ytdlp_background()
        if self.queue:
            log_download(f"[PERSISTENCE RESTORED] Resumed {len(self.queue)} pending downloads from previous session.")

    def _sync_db(self):
        try:
            jobs = []
            if self.active_job and self.active_job.get("status") in ["downloading", "queued"]:
                jobs.append(self.active_job)
            jobs.extend(self.queue)
            save_persisted_queue(jobs)
        except Exception as e:
            log_error(f"Failed to sync persistent queue: {e}")

    def add_album_job(self, album_id: str, title: str, artist: str, cover: str, year: str, tracks: list) -> dict:
        with self._lock:
            for j in self.queue:
                if j["id"] == str(album_id):
                    return j
            if self.active_job and self.active_job["id"] == str(album_id):
                return self.active_job

            job = {
                "id": str(album_id),
                "title": title,
                "artist": artist,
                "cover": cover,
                "year": year,
                "tracks": tracks,
                "total_tracks": len(tracks),
                "completed_tracks": 0,
                "current_track_idx": 0,
                "current_track_title": "",
                "current_track_pct": 0,
                "current_track_speed": "",
                "current_track_eta": "",
                "status": "queued",  # queued, downloading, complete, failed, cancelling
                "progress_pct": 0,
                "error": None,
                "concurrency": max(1, min(10, int(CONFIG.get("download_concurrency", 3)))),
                "queued_at": time.time()
            }
            self.queue.append(job)
            self._sync_db()
            log_download(f"[QUEUED] Album '{title}' by {artist} ({len(tracks)} tracks)")
            return job

    def add_track_job(self, album_id: str, album_title: str, artist: str, cover: str, year: str, track: dict) -> dict:
        with self._lock:
            track_job_id = f"{album_id}_tr_{track.get('id', track.get('track_number', 1))}"
            for j in self.queue:
                if j["id"] == track_job_id:
                    return j
            if self.active_job and self.active_job["id"] == track_job_id:
                return self.active_job

            job = {
                "id": track_job_id,
                "title": f"{track.get('title', 'Track')} ({album_title})",
                "artist": track.get("artist") or artist,
                "album": album_title,
                "cover": cover,
                "year": year,
                "tracks": [track],
                "total_tracks": 1,
                "completed_tracks": 0,
                "current_track_idx": 1,
                "current_track_title": track.get("title", "Track"),
                "current_track_pct": 0,
                "current_track_speed": "",
                "current_track_eta": "",
                "status": "queued",
                "progress_pct": 0,
                "error": None,
                "concurrency": 1,
                "queued_at": time.time()
            }
            self.queue.append(job)
            self._sync_db()
            log_download(f"[QUEUED TRACK] '{track.get('title')}' by {artist}")
            return job

    def cancel_job(self, job_id: str):
        with self._lock:
            self.queue = [j for j in self.queue if j["id"] != str(job_id)]
            self._sync_db()
            if self.active_job and self.active_job["id"] == str(job_id):
                self.active_job["status"] = "cancelling"
                log_download(f"[CANCELLED] Job {job_id} cancelled by user.")

    def clear_queue(self):
        with self._lock:
            self.queue.clear()
            clear_persisted_queue()
            log_download("[QUEUE CLEARED] All pending downloads removed from queue.")

    def clear_history(self):
        with self._lock:
            self.history.clear()

    def get_status(self) -> dict:
        with self._lock:
            return {
                "active": self.active_job,
                "queue": list(self.queue),
                "history": list(self.history)[-15:]
            }

    def _process_queue(self):
        while self._running:
            job = None
            with self._lock:
                if self.queue:
                    job = self.queue.pop(0)
                    self.active_job = job
                    job["status"] = "downloading"
                    self._sync_db()

            if not job:
                time.sleep(0.5)
                continue

            try:
                log_download(f"[STARTING DOWNLOAD] '{job['title']}' by {job['artist']} - {job['total_tracks']} tracks")
                self._execute_album_download(job)
                if job.get("status") != "cancelling":
                    job["status"] = "complete"
                    job["progress_pct"] = 100
                    job["current_track_pct"] = 100
                    dest_dir = str(CONFIG.get("download_root") or CONFIG.get("music_root", DEFAULT_DOWNLOAD_DIR))
                    record_download(job, dest_dir)
                    try:
                        from .library import register_downloaded_album, scan_local_library
                        register_downloaded_album(
                            artist=job.get("artist", ""),
                            album=job.get("title", ""),
                            dest_path=dest_dir,
                            track_count=job.get("total_tracks", 0),
                            album_id=str(job.get("id", ""))
                        )
                        if CONFIG.get("auto_rescan_on_download", True):
                            threading.Thread(target=scan_local_library, daemon=True).start()
                    except Exception as scan_err:
                        log_error(f"Auto-rescan on download completion failed: {scan_err}")
            except Exception as e:
                job["status"] = "failed"
                job["error"] = str(e)
                log_error(f"[DOWNLOAD FAILED ❌] '{job['title']}' by {job['artist']}: {e}")
                log_download(f"[DOWNLOAD FAILED ❌] '{job['title']}' by {job['artist']}: {e}")

            with self._lock:
                self.history.append(job)
                self.active_job = None
                self._sync_db()

    def _execute_album_download(self, job: dict):
        artist = job["artist"]
        album = job.get("album") or job["title"]
        tracks = job["tracks"]
        year = job["year"]
        cover_url = job["cover"]
        
        quality_key = CONFIG.get("audio_quality", "320k")
        spec = FORMAT_SPECS.get(quality_key, FORMAT_SPECS["320k"])
        ext = spec["ext"]

        safe_artist = sanitize_filename(artist, "Unknown Artist", max_length=80)
        safe_album = sanitize_filename(album, "Unknown Album", max_length=80)
        safe_year = sanitize_filename(str(year), "", max_length=12) if year else ""

        music_root = Path(CONFIG.get("download_root") or CONFIG.get("music_root", DEFAULT_DOWNLOAD_DIR))
        
        # Pre-flight check: ensure target disk has at least 250MB free
        disk_check = check_free_disk_space(str(music_root), min_mb=250)
        if not disk_check["has_space"]:
            raise RuntimeError(f"Disk full on {disk_check['path']} ({disk_check['free_mb']}MB free, need 250MB)")

        folder_tmpl = CONFIG.get("folder_structure", "artist_album_year")
        if folder_tmpl == "artist_album_year":
            raw_dir_name = f"{safe_album} ({safe_year})" if safe_year and safe_year not in safe_album else safe_album
            album_dir_name = sanitize_filename(raw_dir_name, safe_album, max_length=100)
            album_dir = music_root / safe_artist / album_dir_name
        elif folder_tmpl == "flat":
            raw_flat = f"{safe_artist} - {safe_album} ({safe_year})" if safe_year else f"{safe_artist} - {safe_album}"
            flat_name = sanitize_filename(raw_flat, f"{safe_artist} - {safe_album}", max_length=120)
            album_dir = music_root / flat_name
        else: # "artist_album"
            album_dir = music_root / safe_artist / safe_album

        album_dir = sanitize_path(album_dir)
        album_dir.mkdir(parents=True, exist_ok=True)

        cover_path = album_dir / "cover.jpg"
        if cover_url and not cover_path.exists() and CONFIG.get("save_cover_jpg", True):
            try:
                urllib.request.urlretrieve(cover_url, str(cover_path))
                log_download(f"  [COVER ART] Saved album artwork to {cover_path}")
            except Exception as e:
                log_warn(f"  [COVER ART WARNING] Could not download cover: {e}")

        total = len(tracks)
        completed_count = 0
        progress_lock = threading.Lock()

        def download_single_track(item):
            nonlocal completed_count
            idx, tr = item
            if job.get("status") == "cancelling":
                return

            tr_title = tr.get("title", f"Track {idx}")
            tr_num = tr.get("track_number") or idx
            tr_artist = tr.get("artist") or artist

            safe_title = sanitize_filename(tr_title, f"Track {idx}", max_length=90)
            out_filename = f"{tr_num:02d} - {safe_title}.{ext}"
            out_file = sanitize_path(album_dir / out_filename)

            if out_file.exists() and out_file.stat().st_size > 100000:
                with progress_lock:
                    completed_count += 1
                    job["completed_tracks"] = completed_count
                    job["progress_pct"] = int((completed_count / total) * 100) if total else 100
                log_download(f"  [TRACK {idx}/{total} EXISTS] '{tr_title}' already downloaded, skipping.")
                return

            if "active_threads" not in job:
                job["active_threads"] = {}
            with progress_lock:
                job["active_threads"][str(idx)] = {
                    "idx": idx,
                    "title": tr_title,
                    "pct": 0,
                    "speed": "Starting...",
                    "eta": ""
                }

            log_download(f"  [TRACK {idx}/{total} START] '{tr_artist} - {tr_title}' - downloading...")
            try:
                self._download_audio_track_with_retry(tr_artist, tr_title, str(out_file), spec, job, idx)

                embed_art = CONFIG.get("embed_cover_art", True)
                cov_to_embed = str(cover_path) if (embed_art and cover_path.exists()) else ""

                if ext == "mp3" and out_file.exists():
                    tag_mp3_file(
                        str(out_file),
                        title=tr_title,
                        artist=tr_artist,
                        album=album,
                        track_num=tr_num,
                        total_tracks=total,
                        year=year,
                        genre=CONFIG.get("default_genre", "Music"),
                        cover_path=cov_to_embed
                    )
                    log_download(f"  [TRACK {idx}/{total} TAGGED ✓] ID3 tags & artwork embedded in {out_filename}")
                elif HAS_MUTAGEN and out_file.exists():
                    self._tag_audio_file(str(out_file), tr_title, tr_artist, album, tr_num, total, year, cov_to_embed or None, ext)
                    log_download(f"  [TRACK {idx}/{total} TAGGED ✓] ID3 tags written to {out_filename}")

                # Auto-save synchronized .lrc lyrics file alongside track (disabled by default)
                if CONFIG.get("save_lrc_lyrics", False):
                    try:
                        from .lyrics import get_track_lyrics
                        lyr_data = get_track_lyrics(artist, tr_title, album, tr.get("duration", 0))
                        if lyr_data and lyr_data.get("synced"):
                            lrc_file = sanitize_path(album_dir / f"{tr_num:02d} - {safe_title}.lrc")
                            lrc_file.write_text(lyr_data["synced"], encoding="utf-8")
                            log_download(f"  [LYRICS SYNC] Saved .lrc lyrics to {lrc_file.name}")
                    except Exception:
                        pass

                with progress_lock:
                    completed_count += 1
                    job["completed_tracks"] = completed_count
                    job["current_track_idx"] = idx
                    job["current_track_title"] = tr_title
                    job["progress_pct"] = int((completed_count / total) * 100) if total else 100
                log_download(f"  [TRACK {idx}/{total} COMPLETE ✓] '{tr_title}' ({completed_count}/{total} done)")
            except Exception as tr_err:
                log_warn(f"  [TRACK {idx}/{total} FAILED] '{tr_title}': {tr_err}")
                with progress_lock:
                    completed_count += 1
                    job["completed_tracks"] = completed_count
                    job["progress_pct"] = int((completed_count / total) * 100) if total else 100
            finally:
                with progress_lock:
                    if "active_threads" in job:
                        job["active_threads"].pop(str(idx), None)

        concurrency = max(1, min(10, int(CONFIG.get("download_concurrency", 3))))
        job["concurrency"] = concurrency
        with ThreadPoolExecutor(max_workers=concurrency) as pool:
            list(pool.map(download_single_track, enumerate(tracks, 1)))

        # Post-download verification & temporary artifact cleanup
        verified_count = 0
        for idx, tr in enumerate(tracks, 1):
            tr_title = tr.get("title", f"Track {idx}")
            tr_num = tr.get("track_number") or idx
            safe_title = sanitize_filename(tr_title, f"Track {idx}", max_length=90)
            out_file = sanitize_path(album_dir / f"{tr_num:02d} - {safe_title}.{ext}")
            if out_file.exists() and out_file.stat().st_size > 50000:
                verified_count += 1

        try:
            for junk_file in album_dir.glob("*.part*"):
                junk_file.unlink(missing_ok=True)
            for junk_file in album_dir.glob("*.ytdl*"):
                junk_file.unlink(missing_ok=True)
            for junk_file in album_dir.glob("*.temp*"):
                junk_file.unlink(missing_ok=True)
        except Exception:
            pass

        log_download(f"  [ALBUM VERIFIED ✓] {verified_count}/{total} tracks verified intact on disk.")

    def _make_progress_hook(self, job: dict, track_idx: int, tr_title: str):
        def hook(d):
            if d.get("status") == "downloading":
                total_bytes = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
                downloaded = d.get("downloaded_bytes") or 0
                pct = 0
                if total_bytes > 0:
                    pct = round((downloaded / total_bytes) * 100, 1)
                speed_str = ""
                speed = d.get("speed")
                if speed:
                    speed_mb = speed / (1024 * 1024)
                    speed_str = f"{speed_mb:.1f} MB/s"
                eta_str = ""
                eta = d.get("eta")
                if eta:
                    eta_str = f"{eta}s"

                job["current_track_pct"] = pct
                job["current_track_speed"] = speed_str
                job["current_track_eta"] = eta_str
                job["current_track_idx"] = track_idx
                job["current_track_title"] = tr_title

                if "active_threads" not in job:
                    job["active_threads"] = {}
                job["active_threads"][str(track_idx)] = {
                    "idx": track_idx,
                    "title": tr_title,
                    "pct": pct,
                    "speed": speed_str,
                    "eta": eta_str
                }
            elif d.get("status") == "finished":
                job["current_track_pct"] = 99
                if "active_threads" in job and str(track_idx) in job["active_threads"]:
                    job["active_threads"][str(track_idx)]["pct"] = 99
                    job["active_threads"][str(track_idx)]["speed"] = "Processing tags..."
        return hook

    @staticmethod
    def _clean_track_query_terms(artist: str, title: str) -> tuple[str, str, str, list[str]]:
        """Clean track query strings stripping edition tags, parentheticals, and featured artists."""
        clean_art = re.sub(r'[\\/*?:"<>|]', "", str(artist or "")).strip()
        clean_tit = re.sub(r'[\\/*?:"<>|]', "", str(title or "")).strip()

        # Extract primary artist (strip collab partners like feat., ft., featuring, &, with, x)
        primary_art = re.split(r'\s*(?:feat\.|ft\.|featuring|,|&|x|with)\s*', clean_art, flags=re.IGNORECASE)[0].strip()
        if not primary_art:
            primary_art = clean_art

        # Strip parenthetical edition tags:
        # e.g. (Album Version), (Explicit), (Deluxe), (Remastered 2009), (Mono), (Stereo), etc.
        edition_pattern = re.compile(
            r'\s*[\(\[](?:[^\)\]]*?\b(?:album version|new album version|explicit|deluxe|remaster(?:ed)?|bonus track|clean version|radio edit|original mix|single version|mono|stereo|official|audio|video|lyrics?)\b[^\)\]]*?)[\)\]]',
            re.IGNORECASE
        )
        # Featured artist tags inside parentheses: (feat. ...), [feat. ...], (featuring ...), etc.
        feat_paren_pattern = re.compile(
            r'\s*[\(\[](?:feat\.?|ft\.?|featuring|with)\b[^\)\]]*?[\)\]]',
            re.IGNORECASE
        )
        # Trailing feat clauses: "Song feat. Artist"
        trailing_feat_pattern = re.compile(
            r'\s+(?:feat\.?|ft\.?|featuring|with)\s+.*$',
            re.IGNORECASE
        )

        t_clean = edition_pattern.sub('', clean_tit)
        t_clean = feat_paren_pattern.sub('', t_clean)
        t_clean = trailing_feat_pattern.sub('', t_clean)

        # Normalize any dangling or unclosed parentheses/brackets
        t_clean = re.sub(r'[\(\[\{\)\]\}]', ' ', t_clean)
        t_clean = re.sub(r'\s+', ' ', t_clean).strip()
        if not t_clean:
            t_clean = clean_tit

        # Core title (stripping all parentheticals)
        core_tit = re.sub(r'\(.*?\)|\[.*?\]', '', clean_tit).strip()
        core_tit = re.sub(r'\s+', ' ', core_tit).strip()
        if not core_tit:
            core_tit = t_clean

        is_va = primary_art.lower() in ["various artists", "various", "va", "compilation", "v/a", ""]

        queries = []
        if is_va:
            queries.append(f"ytsearch3:{t_clean} official audio")
            queries.append(f"ytsearch3:{t_clean} audio")
            if core_tit != t_clean:
                queries.append(f"ytsearch2:{core_tit} audio")
        else:
            queries.append(f"ytsearch3:{primary_art} - {t_clean} official audio")
            queries.append(f"ytsearch3:{primary_art} {t_clean} audio")
            if t_clean != clean_tit:
                queries.append(f"ytsearch2:{primary_art} - {clean_tit}")
            if core_tit != t_clean and core_tit != clean_tit:
                queries.append(f"ytsearch2:{primary_art} {core_tit} audio")

        seen = set()
        deduped = []
        for q in queries:
            if q not in seen:
                seen.add(q)
                deduped.append(q)

        return primary_art, t_clean, core_tit, deduped

    def _download_audio_track_with_retry(self, artist: str, title: str, out_path: str, spec: dict, job: dict, track_idx: int = 1):
        if not HAS_YTDLP or not yt_dlp:
            time.sleep(1)
            return

        safe_out = sanitize_path(out_path)
        str_out = str(safe_out)

        codec = spec["codec"]
        qual = spec.get("quality")
        ext = spec["ext"]
        ffmpeg_bin = get_ffmpeg_path()

        pp = {
            "key": "FFmpegExtractAudio",
            "preferredcodec": codec
        }
        if qual:
            pp["preferredquality"] = qual

        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": str_out.replace(f".{ext}", ".%(ext)s"),
            "windowsfilenames": True,
            "postprocessors": [pp],
            "postprocessor_args": {
                "FFmpegExtractAudio": ["-threads", "1"],
                "ffmpeg": ["-threads", "1"]
            },
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "ignoreerrors": True,
            "ignore_no_formats_error": True,
            "extractor_args": {
                "youtube": {
                    "player_client": ["android", "ios"]
                }
            },
            "http_headers": {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            },
            "progress_hooks": [self._make_progress_hook(job, track_idx, title)]
        }
        if ffmpeg_bin:
            ydl_opts["ffmpeg_location"] = ffmpeg_bin

        def _cleanup_partial_artifacts():
            try:
                if safe_out.exists() and safe_out.stat().st_size < 50000:
                    safe_out.unlink(missing_ok=True)
                p_dir = safe_out.parent
                stem = safe_out.stem
                if p_dir.exists():
                    for f in p_dir.iterdir():
                        if f.is_file() and f.name.startswith(stem) and (f.suffix in [".part", ".ytdl", ".temp", ".mp4", ".m4a", ".webm"] or f.stat().st_size < 50000):
                            if f != safe_out:
                                f.unlink(missing_ok=True)
            except Exception:
                pass

        primary_art, clean_title, core_title, search_queries = self._clean_track_query_terms(artist, title)

        search_opts = {
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "extract_flat": "in_playlist",
            "ignoreerrors": True,
            "extractor_args": {
                "youtube": {
                    "player_client": ["android", "ios"]
                }
            },
            "http_headers": {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            }
        }

        def _attempt_candidate_download(cid: str) -> tuple[bool, Exception | None]:
            """Execute tiered resolution: Tier 1 (Mobile Emulation) -> Tier 2 (Edge / Cookies Fallback)."""
            target = f"https://www.youtube.com/watch?v={cid}" if not cid.startswith("ytsearch") else cid
            
            # --- TIER 1: Zero-Configuration Mobile Emulation ---
            tier1_opts = dict(ydl_opts)
            tier1_opts["extractor_args"] = {
                "youtube": {
                    "player_client": ["android", "ios"]
                }
            }
            
            last_candidate_err = None
            try:
                with yt_dlp.YoutubeDL(tier1_opts) as ydl:
                    ydl.download([target])
                if safe_out.exists() and safe_out.stat().st_size > 50000:
                    return True, None
            except Exception as t1_err:
                last_candidate_err = t1_err
                log_warn(f"    [TIER 1] Mobile emulation for '{cid}' encountered error: {t1_err}. Escalating to Tier 2 (Edge fallback)...")
                _cleanup_partial_artifacts()

            # --- TIER 2: Automatic Microsoft Edge Fallback ---
            # Handle Windows Chromium file locks gracefully (e.g. copying Edge cookie database to temp dir)
            edge_temp_dir = None
            try:
                edge_data = Path(os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Edge\User Data"))
                cookie_src = edge_data / "Default" / "Network" / "Cookies"
                local_state = edge_data / "Local State"
                if cookie_src.exists():
                    td = Path(tempfile.mkdtemp(prefix="edge_cookies_"))
                    nd = td / "Default" / "Network"
                    nd.mkdir(parents=True, exist_ok=True)
                    try:
                        shutil.copy2(str(cookie_src), str(nd / "Cookies"))
                        if local_state.exists():
                            shutil.copy2(str(local_state), str(td / "Local State"))
                        edge_temp_dir = str(td)
                    except PermissionError:
                        shutil.rmtree(str(td), ignore_errors=True)
                        log_warn("    [TIER 2] Edge cookie file locked by active browser session; proceeding to direct/cookiefile resolution.")
                    except Exception as copy_err:
                        shutil.rmtree(str(td), ignore_errors=True)
                        log_warn(f"    [TIER 2] Edge cookie copy note: {copy_err}")
            except Exception as edge_inspect_err:
                log_warn(f"    [TIER 2] Chromium lock inspection note: {edge_inspect_err}")

            tier2_strategies = []
            if edge_temp_dir:
                opts_temp = dict(ydl_opts)
                opts_temp.pop("extractor_args", None)
                opts_temp["cookiesfrombrowser"] = ("edge", edge_temp_dir)
                tier2_strategies.append(("edge_temp_copy", opts_temp))

            opts_edge_dir = dict(ydl_opts)
            opts_edge_dir.pop("extractor_args", None)
            opts_edge_dir["cookiesfrombrowser"] = ("edge",)
            tier2_strategies.append(("edge_direct", opts_edge_dir))

            # Bundled/user offline cookies fallback for headless workstation stability
            cookies_file = Path(__file__).parent.parent / "data" / "cookies.txt"
            if cookies_file.exists():
                opts_cf = dict(ydl_opts)
                opts_cf.pop("extractor_args", None)
                opts_cf["cookiefile"] = str(cookies_file)
                tier2_strategies.append(("cookies_file", opts_cf))

            try:
                for strat_name, strat_opts in tier2_strategies:
                    try:
                        with yt_dlp.YoutubeDL(strat_opts) as ydl:
                            ydl.download([target])
                        if safe_out.exists() and safe_out.stat().st_size > 50000:
                            log_download(f"    [TIER 2 SUCCESS ✓] Candidate '{cid}' downloaded via {strat_name}")
                            return True, None
                    except Exception as t2_err:
                        last_candidate_err = t2_err
                        log_warn(f"    [TIER 2] Strategy '{strat_name}' failed for '{cid}': {t2_err}")
                        _cleanup_partial_artifacts()
            finally:
                if edge_temp_dir:
                    try:
                        shutil.rmtree(edge_temp_dir, ignore_errors=True)
                    except Exception:
                        pass

            return False, last_candidate_err

        candidate_ids = []
        try:
            with yt_dlp.YoutubeDL(search_opts) as search_ydl:
                for sq in search_queries[:2]:
                    try:
                        res = search_ydl.extract_info(sq, download=False)
                        if res and "entries" in res:
                            for entry in res["entries"]:
                                if entry and entry.get("id") and entry["id"] not in candidate_ids:
                                    candidate_ids.append(entry["id"])
                        if len(candidate_ids) >= 2:
                            break
                    except Exception:
                        continue
        except Exception:
            pass

        if not candidate_ids:
            candidate_ids = [f"ytsearch1:{primary_art} - {clean_title} audio"]

        last_err = None
        for cid in candidate_ids:
            success, err = _attempt_candidate_download(cid)
            if success and safe_out.exists() and safe_out.stat().st_size > 50000:
                return
            last_err = err
            log_warn(f"    [RETRY] Candidate '{cid}' failed. Trying next candidate...")
            _cleanup_partial_artifacts()
            time.sleep(0.2)

        # Automatic Search Fallback for Failed Downloads:
        if not safe_out.exists() or safe_out.stat().st_size < 50000:
            log_download(f"  [FALLBACK RETRY] Primary extraction failed for '{title}'. Retrying with cleaned search: '{primary_art} - {core_title}'...")

            fallback_queries = [
                f"ytsearch3:{primary_art} - {core_title} official audio",
                f"ytsearch3:{primary_art} {core_title} audio",
                f"ytsearch2:{primary_art} {clean_title}"
            ]

            fallback_candidate_ids = []
            try:
                with yt_dlp.YoutubeDL(search_opts) as search_ydl:
                    for fq in fallback_queries:
                        try:
                            res = search_ydl.extract_info(fq, download=False)
                            if res and "entries" in res:
                                for entry in res["entries"]:
                                    if entry and entry.get("id") and entry["id"] not in fallback_candidate_ids:
                                        fallback_candidate_ids.append(entry["id"])
                            if len(fallback_candidate_ids) >= 2:
                                break
                        except Exception:
                            continue
            except Exception:
                pass

            if not fallback_candidate_ids:
                fallback_candidate_ids = [f"ytsearch1:{primary_art} - {core_title} official audio"]

            for cid in fallback_candidate_ids:
                success, err = _attempt_candidate_download(cid)
                if success and safe_out.exists() and safe_out.stat().st_size > 50000:
                    log_download(f"  [FALLBACK SUCCESS ✓] Successfully recovered and downloaded '{title}' using fallback '{primary_art} - {core_title}'")
                    return
                last_err = err
                log_warn(f"    [FALLBACK CANDIDATE RETRY] Candidate '{cid}' failed. Trying next fallback candidate...")
                _cleanup_partial_artifacts()
                time.sleep(0.2)

        if not safe_out.exists() or safe_out.stat().st_size < 50000:
            _cleanup_partial_artifacts()
            err_msg = str(last_err) if last_err else "No playable audio stream or candidates resolved across primary and fallback searches"
            raise RuntimeError(f"Could not download audio track '{title}': {err_msg}")

    def _tag_audio_file(self, file_path: str, title: str, artist: str, album: str, track_no: int, total_tracks: int, year: str, cover_path: str = None, ext: str = "mp3"):
        try:
            if ext == "flac" and FLAC:
                audio = FLAC(file_path)
                audio["title"] = title
                audio["artist"] = artist
                audio["albumartist"] = artist
                audio["album"] = album
                audio["tracknumber"] = f"{track_no}/{total_tracks}"
                if year: audio["date"] = str(year)
                if cover_path and Path(cover_path).exists() and Picture:
                    img = Picture()
                    img.type = 3
                    img.mime = "image/jpeg"
                    with open(cover_path, "rb") as f: img.data = f.read()
                    audio.add_picture(img)
                audio.save()

            elif ext == "m4a" and MP4:
                audio = MP4(file_path)
                audio["\xa9nam"] = [title]
                audio["\xa9ART"] = [artist]
                audio["aART"] = [artist]
                audio["\xa9alb"] = [album]
                audio["trkn"] = [(track_no, total_tracks)]
                if year: audio["\xa9day"] = [str(year)]
                if cover_path and Path(cover_path).exists() and MP4Cover:
                    with open(cover_path, "rb") as f:
                        audio["covr"] = [MP4Cover(f.read(), imageformat=MP4Cover.FORMAT_JPEG)]
                audio.save()

            elif ext in ["ogg", "opus"]:
                if ext == "opus" and OggOpus:
                    audio = OggOpus(file_path)
                elif OggVorbis:
                    audio = OggVorbis(file_path)
                else:
                    audio = None
                if audio:
                    audio["title"] = title
                    audio["artist"] = artist
                    audio["albumartist"] = artist
                    audio["album"] = album
                    audio["tracknumber"] = f"{track_no}/{total_tracks}"
                    if year: audio["date"] = str(year)
                    audio.save()

            elif EasyID3 and ID3:
                try:
                    audio = EasyID3(file_path)
                except Exception:
                    audio = EasyID3()
                    audio.save(file_path)
                audio["title"] = title
                audio["artist"] = artist
                audio["albumartist"] = artist
                audio["album"] = album
                audio["tracknumber"] = f"{track_no}/{total_tracks}"
                if year: audio["date"] = str(year)
                audio.save()

                if cover_path and Path(cover_path).exists() and APIC:
                    try:
                        id3 = ID3(file_path)
                        with open(cover_path, "rb") as f:
                            id3.add(APIC(
                                encoding=3,
                                mime="image/jpeg",
                                type=3,
                                desc="Cover",
                                data=f.read()
                            ))
                        id3.save(v2_version=3)
                    except Exception:
                        pass
        except Exception as e:
            log_warn(f"Tagging error for {file_path}: {e}")

DOWNLOAD_MANAGER = DownloadManager()
