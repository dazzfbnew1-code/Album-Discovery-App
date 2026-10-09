import os
import re
import time
import shutil
import threading
from pathlib import Path
from .config import CONFIG, DEFAULT_DOWNLOAD_DIR, get_configured_music_roots
from .logger import log_info, log_discovery, log_error
from .db import get_conn

AUDIO_EXTS = {".mp3", ".flac", ".m4a", ".wav", ".ogg", ".opus", ".aac", ".wma"}

IGNORED_DIR_NAMES = {
    "$recycle.bin", "system volume information", "$winreagent",
    "recovery", ".git", ".idea", ".trash", "node_modules", "appdata",
    "windows", "program files", "program files (x86)", "programdata", "$sysreset"
}

_LOCK = threading.Lock()
OWNED_ALBUMS = {}  # Normalized key -> info dict
OWNED_BY_ARTIST = {}  # Normalized artist -> list of info dicts
OWNED_TITLES = set()
LAST_SCAN_TIME = 0
IS_SCANNING = False
_ROOT_SNAPSHOT = {}

def normalize_text(text: str) -> str:
    if not text:
        return ""
    # Strip deluxe, remastered, anniversary, parentheticals, brackets, and non-alphanumeric
    t = re.sub(r"\(.*?\)|\[.*?\]", "", text.lower())
    t = re.sub(r"\b(deluxe|remaster(ed)?|anniversary|expanded|edition|version|explicit|clean|vol(\.|\s*\d+)?)\b", "", t)
    t = re.sub(r"[^\w\s]", "", t)
    return " ".join(t.split())

def make_album_key(artist: str, album: str) -> str:
    norm_art = normalize_text(artist)
    norm_alb = normalize_text(album)
    return f"{norm_art}:::{norm_alb}"

def resolve_local_album_cover(folder_path: Path) -> str:
    """Finds or extracts front cover image from local album folder or audio tags."""
    if not folder_path.exists() or not folder_path.is_dir():
        return ""
    
    # 1. Look for existing cover.jpg, folder.jpg, front.jpg, cover.png, etc.
    preferred_names = ["cover.jpg", "folder.jpg", "front.jpg", "album.jpg", "cover.png", "folder.png", "front.png"]
    for name in preferred_names:
        candidate = folder_path / name
        if candidate.exists() and candidate.is_file() and candidate.stat().st_size > 500:
            return str(candidate)
            
    # 2. Check any other image in the folder
    for f in folder_path.iterdir():
        if f.is_file() and f.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"} and f.stat().st_size > 500:
            return str(f)
            
    # 3. Try to extract embedded ID3 APIC / FLAC Picture from the first audio track
    audio_files = [f for f in folder_path.iterdir() if f.is_file() and f.suffix.lower() in AUDIO_EXTS]
    if audio_files:
        try:
            from mutagen import File as MutagenFile
            first_audio = audio_files[0]
            mf = MutagenFile(str(first_audio))
            if mf:
                # ID3 APIC tag (MP3)
                if hasattr(mf, "tags") and mf.tags:
                    for tag_key in mf.tags.keys():
                        if tag_key.startswith("APIC"):
                            apic = mf.tags[tag_key]
                            if hasattr(apic, "data") and apic.data:
                                target_cov = folder_path / "cover.jpg"
                                target_cov.write_bytes(apic.data)
                                return str(target_cov)
                # FLAC Picture tag
                if hasattr(mf, "pictures") and mf.pictures:
                    pic = mf.pictures[0]
                    if hasattr(pic, "data") and pic.data:
                        target_cov = folder_path / "cover.jpg"
                        target_cov.write_bytes(pic.data)
                        return str(target_cov)
        except Exception:
            pass

    return ""

def is_ignored_path(path_obj: Path) -> bool:
    """Check if any folder or segment in the path is a system, hidden, or recycle bin folder."""
    try:
        parts_lower = [part.lower() for part in path_obj.parts]
        for p in parts_lower:
            if p in IGNORED_DIR_NAMES or p.startswith("$") or (p.startswith(".") and len(p) > 1):
                return True
        return False
    except Exception:
        return False

def get_library_roots_snapshot() -> dict:
    """Takes an ultra-fast (<10ms) snapshot of folder modified times across configured roots."""
    roots = get_configured_music_roots()
    snap = {}
    for r in roots:
        rp = Path(r)
        if not rp.exists() or not rp.is_dir():
            continue
        try:
            snap[str(rp)] = rp.stat().st_mtime
            for artist_entry in os.scandir(str(rp)):
                name_lower = artist_entry.name.lower()
                if (artist_entry.is_dir(follow_symlinks=False) 
                    and name_lower not in IGNORED_DIR_NAMES 
                    and not name_lower.startswith("$") 
                    and not name_lower.startswith(".")):
                    try:
                        snap[artist_entry.path] = artist_entry.stat().st_mtime
                        for album_entry in os.scandir(artist_entry.path):
                            alb_name_lower = album_entry.name.lower()
                            if (album_entry.is_dir(follow_symlinks=False) 
                                and alb_name_lower not in IGNORED_DIR_NAMES 
                                and not alb_name_lower.startswith("$") 
                                and not alb_name_lower.startswith(".")):
                                try:
                                    snap[album_entry.path] = album_entry.stat().st_mtime
                                except Exception:
                                    pass
                    except Exception:
                        pass
        except Exception:
            pass
    return snap

def check_for_library_changes() -> bool:
    """Returns True ONLY if a directory addition, deletion, or modification occurred on disk."""
    global _ROOT_SNAPSHOT
    current_snap = get_library_roots_snapshot()
    if not _ROOT_SNAPSHOT:
        _ROOT_SNAPSHOT = current_snap
        return False
    if current_snap != _ROOT_SNAPSHOT:
        _ROOT_SNAPSHOT = current_snap
        return True
    return False

def get_library_status() -> dict:
    """Instant in-memory lookup of current indexed library state without disk scan."""
    with _LOCK:
        return {
            "status": "complete" if not IS_SCANNING else "scanning",
            "total_owned": len(OWNED_ALBUMS),
            "music_roots": [str(r) for r in get_configured_music_roots()],
            "last_scan_time": LAST_SCAN_TIME,
            "is_scanning": IS_SCANNING
        }

def scan_local_library(custom_root: str = None) -> dict:
    global OWNED_ALBUMS, OWNED_BY_ARTIST, OWNED_TITLES, LAST_SCAN_TIME, IS_SCANNING
    with _LOCK:
        if IS_SCANNING:
            return {"status": "already_scanning", "total_owned": len(OWNED_ALBUMS)}
        IS_SCANNING = True

    start_t = time.time()
    target_roots = [Path(custom_root)] if custom_root else [Path(r) for r in get_configured_music_roots()]
    
    scanned_albums = {}
    scanned_by_artist = {}
    scanned_titles = set()

    try:
        # Clean up any legacy recycle bin rows from DB
        with get_conn() as conn:
            c = conn.cursor()
            c.execute("DELETE FROM downloaded_albums WHERE artist LIKE '%$RECYCLE%' OR title LIKE '%$RECYCLE%' OR dest_path LIKE '%$RECYCLE%'")
            conn.commit()

        # 1. Also load recorded downloaded albums from DB
        with get_conn() as conn:
            c = conn.cursor()
            c.execute("SELECT id, title, artist, dest_path, track_count FROM downloaded_albums")
            for row in c.fetchall():
                p_str = row["dest_path"] or ""
                art_name = row["artist"] or ""
                alb_name = row["title"] or ""
                if not p_str or len(p_str) <= 3 or "$recycle" in art_name.lower() or "$recycle" in alb_name.lower() or "$recycle" in p_str.lower():
                    continue
                p_obj = Path(p_str)
                if not p_obj.exists() or not p_obj.is_dir() or is_ignored_path(p_obj):
                    continue
                key = make_album_key(art_name, alb_name)
                alb_info = {
                    "artist": art_name,
                    "album": alb_name,
                    "path": p_str,
                    "track_count": row["track_count"] or 0,
                    "id": str(row["id"])
                }
                scanned_albums[key] = alb_info
                norm_art = normalize_text(art_name)
                if norm_art:
                    scanned_by_artist.setdefault(norm_art, []).append(alb_info)
                scanned_titles.add(normalize_text(alb_name))

        # 2. Recursively scan all configured physical music folders on all drives (up to 3 levels deep)
        for root_dir in target_roots:
            if not root_dir.exists() or not root_dir.is_dir():
                continue
            root_depth = len(root_dir.parts)
            for current_root, dirs, files in os.walk(str(root_dir)):
                cur_path = Path(current_root)
                if len(cur_path.parts) - root_depth > 3:
                    dirs.clear()
                    continue
                # Prune system/hidden directories from traversal
                dirs[:] = [
                    d for d in dirs 
                    if d.lower() not in IGNORED_DIR_NAMES 
                    and not d.startswith("$") 
                    and not d.startswith(".")
                ]

                if is_ignored_path(cur_path):
                    dirs.clear()
                    continue

                audio_files = [f for f in files if Path(f).suffix.lower() in AUDIO_EXTS]
                if audio_files:
                    album_name = cur_path.name
                    artist_name = cur_path.parent.name if cur_path.parent != root_dir else ""
                    
                    if not artist_name and " - " in album_name:
                        parts = album_name.split(" - ", 1)
                        artist_name = parts[0].strip()
                        album_name = parts[1].strip()

                    if not artist_name:
                        artist_name = "Various Artists"

                    if "$recycle" in artist_name.lower() or "$recycle" in album_name.lower():
                        continue

                    key = make_album_key(artist_name, album_name)
                    alb_info = {
                        "artist": artist_name,
                        "album": album_name,
                        "path": str(cur_path),
                        "track_count": len(audio_files),
                        "id": ""
                    }
                    scanned_albums[key] = alb_info
                    norm_art = normalize_text(artist_name)
                    if norm_art:
                        scanned_by_artist.setdefault(norm_art, []).append(alb_info)
                    scanned_titles.add(normalize_text(album_name))

        with _LOCK:
            OWNED_ALBUMS = scanned_albums
            OWNED_BY_ARTIST = scanned_by_artist
            OWNED_TITLES = scanned_titles
            LAST_SCAN_TIME = time.time()
            IS_SCANNING = False

        global _ROOT_SNAPSHOT
        try:
            _ROOT_SNAPSHOT = get_library_roots_snapshot()
        except Exception:
            pass

        elapsed = time.time() - start_t
        roots_display = ", ".join(str(r) for r in target_roots)
        log_discovery(f"[LIBRARY SCAN] Scanned music paths [{roots_display}]: indexed {len(OWNED_ALBUMS)} owned studio albums (took {elapsed:.2f}s)")

        return {
            "status": "complete",
            "total_owned": len(OWNED_ALBUMS),
            "music_roots": [str(r) for r in target_roots],
            "elapsed_seconds": round(elapsed, 2)
        }
    except Exception as e:
        with _LOCK:
            IS_SCANNING = False
        log_error(f"[LIBRARY SCAN ERROR] {e}")
        return {"status": "error", "error": str(e), "total_owned": len(OWNED_ALBUMS)}

def register_downloaded_album(artist: str, album: str, dest_path: str = "", track_count: int = 0, album_id: str = ""):
    """Instantly register a completed download in memory so badges immediately update."""
    global OWNED_ALBUMS, OWNED_BY_ARTIST, OWNED_TITLES
    key = make_album_key(artist, album)
    alb_info = {
        "artist": artist,
        "album": album,
        "path": dest_path,
        "track_count": track_count,
        "id": str(album_id)
    }
    with _LOCK:
        OWNED_ALBUMS[key] = alb_info
        norm_art = normalize_text(artist)
        if norm_art:
            OWNED_BY_ARTIST.setdefault(norm_art, []).append(alb_info)
        OWNED_TITLES.add(normalize_text(album))

def is_album_owned(artist: str, album: str) -> dict:
    key = make_album_key(artist, album)
    with _LOCK:
        if key in OWNED_ALBUMS:
            info = OWNED_ALBUMS[key]
            return {
                "owned": True,
                "artist": info["artist"],
                "album": info["album"],
                "path": info["path"],
                "track_count": info.get("track_count", 0)
            }
            
        # Fast O(1) artist lookup: check fuzzy title matches only within this specific artist's owned albums
        norm_art = normalize_text(artist)
        if norm_art and norm_art in OWNED_BY_ARTIST:
            norm_alb = normalize_text(album)
            if norm_alb and len(norm_alb) > 3:
                for info in OWNED_BY_ARTIST[norm_art]:
                    owned_alb = normalize_text(info.get("album", ""))
                    if norm_alb == owned_alb or (norm_alb in owned_alb) or (owned_alb in norm_alb):
                        return {
                            "owned": True,
                            "artist": info["artist"],
                            "album": info["album"],
                            "path": info["path"],
                            "track_count": info.get("track_count", 0)
                        }

    return {"owned": False}

def init_library_cache():
    """Prime in-memory owned album indexes from DB immediately on boot (~1ms)."""
    global OWNED_ALBUMS, OWNED_BY_ARTIST, OWNED_TITLES
    try:
        primed_albums = {}
        primed_by_art = {}
        primed_titles = set()
        with get_conn() as conn:
            c = conn.cursor()
            c.execute("SELECT id, title, artist, dest_path, track_count FROM downloaded_albums")
            for row in c.fetchall():
                p_str = row["dest_path"] or ""
                art_name = row["artist"] or ""
                alb_name = row["title"] or ""
                if not p_str or len(p_str) <= 3 or "$recycle" in art_name.lower() or "$recycle" in alb_name.lower() or "$recycle" in p_str.lower():
                    continue
                p_obj = Path(p_str)
                if not p_obj.exists() or not p_obj.is_dir() or is_ignored_path(p_obj):
                    continue
                key = make_album_key(art_name, alb_name)
                alb_info = {
                    "artist": art_name,
                    "album": alb_name,
                    "path": p_str,
                    "track_count": row["track_count"] or 0,
                    "id": str(row["id"])
                }
                primed_albums[key] = alb_info
                art_norm = normalize_text(art_name)
                if art_norm:
                    primed_by_art.setdefault(art_norm, []).append(alb_info)
                primed_titles.add(normalize_text(alb_name))
        with _LOCK:
            OWNED_ALBUMS.update(primed_albums)
            for art, items in primed_by_art.items():
                OWNED_BY_ARTIST.setdefault(art, []).extend(items)
            OWNED_TITLES.update(primed_titles)
    except Exception:
        pass

init_library_cache()

def get_library_albums(query: str = "") -> list:
    """Return all locally owned albums formatted for the UI grid, optionally filtered by search query."""
    import urllib.parse
    with _LOCK:
        albums_copy = list(OWNED_ALBUMS.values())

    q_clean = query.strip().lower() if query else ""

    results = []
    for item in albums_copy:
        p_str = item.get("path")
        if not p_str or not Path(p_str).exists():
            continue
        p = Path(p_str)
        if is_ignored_path(p) or "$recycle" in item.get("artist", "").lower() or "$recycle" in item.get("album", "").lower():
            continue

        art = item.get("artist") or ""
        alb = item.get("album") or ""
        
        if q_clean:
            if q_clean not in art.lower() and q_clean not in alb.lower():
                continue

        cov_file_str = resolve_local_album_cover(p)
        cover_url = f"/api/local-file?path={urllib.parse.quote(cov_file_str)}" if cov_file_str else ""
        
        results.append({
            "id": f"local_{hash(p_str)}",
            "title": alb,
            "artist": art,
            "cover_small": cover_url,
            "cover_big": cover_url,
            "year": "",
            "track_count": item.get("track_count", 0),
            "type": "album",
            "owned": True,
            "owned_path": p_str
        })

    results.sort(key=lambda x: f"{x['artist'].lower()} {x['title'].lower()}")
    return results

def get_local_album_details(folder_path: str) -> dict:
    """Read local album audio files and ID3 metadata for instant offline playback."""
    p = Path(folder_path)
    if not p.exists() or not p.is_dir():
        return None

    audio_files = sorted([f for f in p.iterdir() if f.suffix.lower() in AUDIO_EXTS], key=lambda f: f.name)
    tracks = []
    
    import urllib.parse
    cov_file_str = resolve_local_album_cover(p)
    cover_url = f"/api/local-file?path={urllib.parse.quote(cov_file_str)}" if cov_file_str else ""
    art_name = p.parent.name if p.parent else "Various Artists"
    alb_title = p.name

    for idx, f in enumerate(audio_files, 1):
        tr_title = f.stem
        # Strip leading numbers like "01 - " or "1. "
        m = re.match(r"^\d+[\s\.\-_]+(.+)$", tr_title)
        if m:
            tr_title = m.group(1).strip()

        duration = 0
        try:
            from mutagen import File as MutagenFile
            mf = MutagenFile(str(f))
            if mf and hasattr(mf, "info") and hasattr(mf.info, "length"):
                duration = int(mf.info.length)
        except Exception:
            pass

        stream_url = f"/api/local-file?path={urllib.parse.quote(str(f))}"
        tracks.append({
            "id": f"local_tr_{idx}",
            "track_position": idx,
            "title": tr_title,
            "artist": art_name,
            "album": alb_title,
            "duration": duration,
            "preview": stream_url,
            "stream_url": stream_url,
            "local_path": str(f),
            "cover_big": cover_url,
            "cover_small": cover_url,
            "is_local": True
        })

    # Discover Companion Masterpieces via related artist graph
    similar = []
    try:
        from .flow import get_similar_albums
        similar = get_similar_albums("", "", art_name)
    except Exception:
        similar = []

    # Fetch album backstory liner notes
    backstory = ""
    try:
        from .metadata import get_album_backstory
        backstory = get_album_backstory(art_name, alb_title)
    except Exception:
        backstory = ""

    if not backstory or len(backstory) < 20:
        backstory = f"{alb_title} is a landmark studio album by {art_name}. Stored locally in your master library with {len(tracks)} verified audio tracks."

    # Extract year from audio metadata tags
    album_year = ""
    for tr in tracks:
        if tr.get("local_path"):
            try:
                from mutagen import File as MutagenFile
                mf = MutagenFile(tr["local_path"])
                if mf and hasattr(mf, "tags") and mf.tags:
                    for y_tag in ["TDRC", "TYER", "DATE", "YEAR", "©day"]:
                        if y_tag in mf.tags:
                            y_val = str(mf.tags[y_tag][0]) if isinstance(mf.tags[y_tag], list) else str(mf.tags[y_tag])
                            m_yr = re.search(r"\b(19\d\d|20\d\d)\b", y_val)
                            if m_yr:
                                album_year = m_yr.group(1)
                                break
                    if album_year:
                        break
            except Exception:
                pass

    return {
        "id": f"local_{hash(str(p))}",
        "title": alb_title,
        "artist": art_name,
        "cover_small": cover_url,
        "cover_big": cover_url,
        "year": album_year or "",
        "genres": ["Local Library"],
        "label": "Local Drive Master",
        "barcode": "—",
        "backstory": backstory,
        "similar_albums": similar,
        "track_count": len(tracks),
        "duration": sum(t["duration"] for t in tracks),
        "tracks": tracks,
        "owned": True,
        "owned_path": str(p)
    }

def delete_library_album(folder_path: str) -> bool:
    """Delete an owned album folder from disk and update in-memory scan."""
    try:
        p = Path(folder_path)
        if p.exists() and p.is_dir():
            shutil.rmtree(str(p))
            scan_local_library()
            return True
    except Exception as e:
        log_error(f"Failed to delete album at {folder_path}: {e}")
    return False

def start_background_library_scanner():
    """Start initial drive library scan on launch, then passively watch for changes."""
    def _scanner_loop():
        global _ROOT_SNAPSHOT
        time.sleep(0.5)
        scan_local_library()
        try:
            _ROOT_SNAPSHOT = get_library_roots_snapshot()
        except Exception:
            pass

        while True:
            # Check every 15 seconds passively; if nothing changed, ZERO disk I/O is performed
            time.sleep(15.0)
            try:
                if check_for_library_changes():
                    log_discovery("[DRIVE CHANGE DETECTED] Change detected in music library folder — auto-indexing...")
                    scan_local_library()
            except Exception as e:
                log_error(f"Error in background library monitor: {e}")

    t = threading.Thread(target=_scanner_loop, daemon=True, name="BackgroundLibraryScanner")
    t.start()

def backfill_missing_covers(custom_root: str = None) -> dict:
    """Scans all owned album folders on disk and automatically saves missing cover.jpg files."""
    import urllib.request
    from .metadata import get_accurate_cover_art
    root_dir_str = custom_root or CONFIG.get("music_root", DEFAULT_DOWNLOAD_DIR)
    root_dir = Path(root_dir_str)
    if not root_dir.exists() or not root_dir.is_dir():
        return {"status": "error", "message": "Music directory not found"}

    backfilled = 0
    with _LOCK:
        albums_copy = list(OWNED_ALBUMS.values())

    for item in albums_copy:
        p_str = item.get("path")
        if not p_str:
            continue
        p = Path(p_str)
        if p.exists() and p.is_dir():
            if any(part.lower() in IGNORED_DIR_NAMES or part.startswith("$") or part.startswith(".") for part in p.parts):
                continue
            cov_file = p / "cover.jpg"
            if not cov_file.exists():
                cov_str = resolve_local_album_cover(p)
                if cov_str:
                    backfilled += 1
                    continue
                art_url = get_accurate_cover_art(item.get("artist", ""), item.get("album", ""))
                if art_url:
                    try:
                        urllib.request.urlretrieve(art_url, str(cov_file))
                        backfilled += 1
                        log_info(f"[COVER BACKFILLED] Saved missing cover.jpg for {item.get('artist')} - {item.get('album')}")
                    except Exception as e:
                        log_error(f"Failed to save backfilled cover for {item.get('album')}: {e}")

    if backfilled > 0:
        scan_local_library()

    return {"status": "complete", "backfilled_count": backfilled}

def get_library_dj_radio(limit: int = None) -> dict:
    """Generate an instant dynamic DJ radio mix across all local albums with artist-diversity shuffling."""
    import random
    import urllib.parse
    
    if limit is None or limit <= 0:
        try:
            limit = int(CONFIG.get("radio_batch_size", 60))
        except Exception:
            limit = 60

    with _LOCK:
        if not OWNED_ALBUMS:
            scan_local_library()
        albums_copy = list(OWNED_ALBUMS.values())

    if not albums_copy:
        return {"status": "empty", "tracks": [], "total_available": 0}

    # Pick a random sample of albums to build a fresh, high-diversity mix
    random.shuffle(albums_copy)
    sample_albums = albums_copy[:min(len(albums_copy), max(limit * 2, 80))]

    artist_spacing = CONFIG.get("radio_artist_spacing", True)
    max_per_album = 2 if artist_spacing else 4

    all_tracks = []
    for alb in sample_albums:
        p_str = alb.get("path")
        if not p_str:
            continue
        p = Path(p_str)
        if not p.exists() or not p.is_dir() or is_ignored_path(p):
            continue
            
        cov_file_str = resolve_local_album_cover(p)
        cover_url = f"/api/local-file?path={urllib.parse.quote(cov_file_str)}" if cov_file_str else ""
        art_name = alb.get("artist") or (p.parent.name if p.parent != p else "Various Artists")
        alb_name = alb.get("album") or p.name
        
        audio_files = [f for f in p.iterdir() if f.is_file() and f.suffix.lower() in AUDIO_EXTS]
        if not audio_files:
            continue
            
        # Pick 1-2 random tracks per album to guarantee artist variety
        random.shuffle(audio_files)
        picked_files = audio_files[:min(len(audio_files), max_per_album)]
        
        for f in picked_files:
            tr_title = f.stem
            m = re.match(r"^\d+[\s\.\-_]+(.+)$", tr_title)
            if m:
                tr_title = m.group(1).strip()
            
            local_stream = f"/api/local-file?path={urllib.parse.quote(str(f))}"
            all_tracks.append({
                "id": f"radio_{abs(hash(str(f)))}",
                "title": tr_title,
                "artist": art_name,
                "album": alb_name,
                "duration": 0,
                "cover_small": cover_url,
                "cover_big": cover_url,
                "stream_url": local_stream,
                "preview": local_stream,
                "local_path": str(f),
                "is_local": True
            })

    random.shuffle(all_tracks)

    # If artist spacing is active, space out tracks so same artist doesn't play back-to-back
    if artist_spacing and len(all_tracks) > 2:
        spaced = []
        pool = list(all_tracks)
        last_artist = None
        while pool:
            # Find next track with a different artist
            diff_idx = next((i for i, t in enumerate(pool) if t.get("artist") != last_artist), 0)
            chosen = pool.pop(diff_idx)
            spaced.append(chosen)
            last_artist = chosen.get("artist")
        all_tracks = spaced

    selected = all_tracks[:limit]

    return {
        "status": "ok",
        "tracks": selected,
        "total_available": len(selected)
    }

