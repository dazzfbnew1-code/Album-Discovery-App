import os
import sys
import re
import urllib.parse
from pathlib import Path
import mutagen

# Add app to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.providers import fetch_json
from app.downloader import DownloadManager
from app.tagger import tag_mp3_file
from app.lyrics import get_track_lyrics
from app.logger import log_download, log_info, log_error

def scan_and_repair(dry_run: bool = False):
    root = Path("H:/")
    if not root.exists():
        print(f"Error: {root} does not exist!")
        return

    abnormal_files = []
    print("Step 1: Scanning H:/ for oversized audio files (>35MB / >12 mins)...")

    for dirpath, dirnames, filenames in os.walk(str(root)):
        if "$RECYCLE.BIN" in dirpath or "System Volume Information" in dirpath:
            continue
        for f in filenames:
            if f.lower().endswith((".mp3", ".m4a")):
                fp = Path(dirpath) / f
                try:
                    sz = fp.stat().st_size
                    if sz > 35 * 1024 * 1024:
                        m = mutagen.File(str(fp))
                        dur = int(m.info.length) if (m and m.info and m.info.length) else 0
                        if dur > 720:
                            tit = str(m.get("TIT2") or m.get("title") or f).strip()
                            art = str(m.get("TPE1") or m.get("artist") or fp.parent.parent.name).strip()
                            alb = str(m.get("TALB") or m.get("album") or fp.parent.name).strip()
                            trck = str(m.get("TRCK") or "1").split("/")[0]
                            try:
                                tr_num = int(re.sub(r"\D", "", trck)) if trck else 1
                            except ValueError:
                                tr_num = 1
                            abnormal_files.append({
                                "path": fp,
                                "size_mb": round(sz / 1024 / 1024, 1),
                                "dur_sec": dur,
                                "title": tit,
                                "artist": art,
                                "album": alb,
                                "track_num": tr_num
                            })
                except Exception:
                    pass

    print(f"Found {len(abnormal_files)} candidate files. Querying official track metadata...")

    mismatches = []
    for item in abnormal_files:
        # Search Deezer for the authentic track
        art_clean = re.sub(r"\(.*?\)|\[.*?\]", "", item["artist"]).strip()
        tit_clean = re.sub(r"\(.*?\)|\[.*?\]", "", item["title"]).strip()
        q = urllib.parse.quote(f"{art_clean} {tit_clean}")
        res = fetch_json(f"https://api.deezer.com/search/track?q={q}&limit=5", timeout=4)
        
        expected_dur = 0
        official_title = item["title"]
        official_artist = item["artist"]
        official_album = item["album"]
        
        if res and res.get("data"):
            for t in res["data"]:
                expected_dur = t.get("duration", 0)
                official_title = t.get("title") or official_title
                if t.get("artist") and t["artist"].get("name"):
                    official_artist = t["artist"]["name"]
                if t.get("album") and t["album"].get("title"):
                    official_album = t["album"]["title"]
                break

        # Check if legitimate long track (like Pink Floyd 23m Echoes or Animals 17m Dogs)
        is_legit = False
        lower_tit = item["title"].lower()
        if "echoes" in lower_tit or "atom heart" in lower_tit or "dogs" in lower_tit or "untitled" in lower_tit:
            is_legit = True
        elif expected_dur > 700 and abs(item["dur_sec"] - expected_dur) < 180:
            is_legit = True

        if not is_legit and expected_dur > 0 and expected_dur < 700 and item["dur_sec"] > max(expected_dur * 2, 600):
            mismatches.append((item, expected_dur, official_title, official_artist, official_album))
            print(f"  [MISMATCH] {item['artist']} - {item['title']} | Disk: {item['dur_sec']}s ({item['size_mb']}MB) vs Expected: {expected_dur}s")

    print(f"\nIdentified {len(mismatches)} genuine mismatched full-album files to repair.")
    if dry_run:
        return

    dm = DownloadManager()
    repaired_count = 0

    for item, exp_dur, off_tit, off_art, off_alb in mismatches:
        fp = item["path"]
        print(f"\n--> Repairing ({repaired_count + 1}/{len(mismatches)}): '{off_art} - {off_tit}' (Expected ~{exp_dur}s)...")
        
        # Look for cover.jpg in the same directory
        cover_path = fp.parent / "cover.jpg"
        temp_out = fp.parent / f"_temp_repair_{fp.name}"

        job = {"active_threads": {}, "completed_tracks": 0, "status": "running"}
        spec = {"codec": "mp3", "ext": "mp3", "quality": "320"}

        try:
            # Download authentic studio audio with expected_duration guard
            dm._download_audio_track_with_retry(
                artist=off_art,
                title=off_tit,
                out_path=str(temp_out),
                spec=spec,
                job=job,
                track_idx=item["track_num"],
                expected_duration=exp_dur
            )

            if temp_out.exists() and temp_out.stat().st_size > 50000:
                # Embed tags
                lyr = get_track_lyrics(off_art, off_tit, off_alb, exp_dur)
                l_text = (lyr.get("synced") or lyr.get("plain") or "") if lyr else ""
                
                # Replace old oversized file
                fp.unlink(missing_ok=True)
                temp_out.rename(fp)

                tag_mp3_file(
                    str(fp),
                    title=off_tit,
                    artist=off_art,
                    album=off_alb,
                    track_num=item["track_num"],
                    total_tracks=1,
                    year="",
                    cover_path=str(cover_path) if cover_path.exists() else "",
                    lyrics=l_text
                )

                m_chk = mutagen.File(str(fp))
                new_len = int(m_chk.info.length) if (m_chk and m_chk.info) else 0
                new_mb = round(fp.stat().st_size / 1024 / 1024, 1)
                print(f"  [REPAIRED OK] '{off_tit}' is now {new_len}s ({new_mb}MB)")
                repaired_count += 1
            else:
                print(f"  [FAILED] Could not download clean replacement for '{off_tit}'")
                temp_out.unlink(missing_ok=True)
        except Exception as e:
            print(f"  [ERROR] Failed to repair {fp.name}: {e}")
            temp_out.unlink(missing_ok=True)

    print(f"\n==========================================")
    print(f"Repair Complete: {repaired_count}/{len(mismatches)} files successfully replaced with full studio tracks.")

if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    scan_and_repair(dry_run=dry)
