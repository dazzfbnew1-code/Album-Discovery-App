"""Lyrics resolution engine supporting synchronized LRC, local file tags, and LRCLIB."""
import re
import urllib.parse
from pathlib import Path

from .logger import log_error, log_info
from .providers import fetch_json
from .db import get_cached_lyrics, save_cached_lyrics, delete_cached_lyrics

LYRICS_CACHE = {}


def extract_lyrics_from_local_file(file_path: str) -> dict:
    """Reads embedded ID3/FLAC lyrics or companion .lrc file directly from disk."""
    if not file_path:
        return {}
    try:
        p = Path(file_path)
        if not p.exists() or not p.is_file():
            return {}

        # 1. Check companion .lrc file in the same folder
        lrc_file = p.with_suffix(".lrc")
        if lrc_file.exists() and lrc_file.is_file():
            try:
                content = lrc_file.read_text(encoding="utf-8", errors="replace").strip()
                if content and "[" in content and "]" in content:
                    return {
                        "synced": content,
                        "plain": "",
                        "instrumental": False,
                        "source": "local_lrc"
                    }
            except Exception:
                pass

        # 2. Check embedded audio tags via mutagen
        from mutagen import File as MutagenFile
        mf = MutagenFile(str(p))
        if mf is None:
            return {}

        raw_lyrics = ""

        # ID3 (MP3 / AIFF)
        if hasattr(mf, "tags") and mf.tags:
            # Look for USLT frame
            for k in list(mf.tags.keys()):
                if k.startswith("USLT") or k == "USLT":
                    uslt_frame = mf.tags.get(k)
                    if hasattr(uslt_frame, "text") and uslt_frame.text:
                        raw_lyrics = str(uslt_frame.text).strip()
                        break

            # Vorbis / FLAC comments
            if not raw_lyrics:
                for k in ["LYRICS", "UNSYNCEDLYRICS", "UNSYNCED LYRICS", "lyrics"]:
                    if k in mf.tags:
                        v = mf.tags[k]
                        raw_lyrics = (v[0] if isinstance(v, list) and v else str(v)).strip()
                        if raw_lyrics:
                            break

            # MP4 / M4A (©lyr)
            if not raw_lyrics and "©lyr" in mf.tags:
                v = mf.tags["©lyr"]
                raw_lyrics = (v[0] if isinstance(v, list) and v else str(v)).strip()

        if raw_lyrics:
            # If lyrics contain LRC timestamp markers, treat as synced
            if re.search(r"\[\d{1,2}:\d{2}", raw_lyrics):
                return {
                    "synced": raw_lyrics,
                    "plain": "",
                    "instrumental": False,
                    "source": "local_embedded_synced"
                }
            else:
                return {
                    "synced": "",
                    "plain": raw_lyrics,
                    "instrumental": False,
                    "source": "local_embedded_plain"
                }
    except Exception as e:
        log_error(f"Error extracting local lyrics from {file_path}: {e}")
    return {}


def get_track_lyrics(
    artist: str,
    title: str,
    album: str = "",
    duration: int = 0,
    force_refresh: bool = False,
    file_path: str = ""
) -> dict:
    """Fetch synchronized and plain lyrics for a track with local tag fallback and SQLite caching."""
    clean_art = re.sub(r"\(.*?\)|\[.*?\]", "", artist).strip()
    clean_title = re.sub(
        r"\(.*?\)|\[.*?\]|\bfeat\..*|\bft\..*",
        "",
        title
    ).strip()
    cache_key = f"{clean_art.lower()}:::{clean_title.lower()}"

    # Handle force refresh
    if force_refresh:
        LYRICS_CACHE.pop(cache_key, None)
        delete_cached_lyrics(clean_art, clean_title)

    # 1. First, check local file / companion .lrc if file_path is provided
    if file_path:
        local_res = extract_lyrics_from_local_file(file_path)
        if local_res and (local_res.get("synced") or local_res.get("plain")):
            LYRICS_CACHE[cache_key] = local_res
            save_cached_lyrics(clean_art, clean_title, local_res)
            return local_res

    # 2. Check in-memory session cache (unless force_refresh requested)
    if not force_refresh and cache_key in LYRICS_CACHE:
        return LYRICS_CACHE[cache_key]

    # 3. Check local SQLite persistent cache for 0ms offline instant loading
    if not force_refresh:
        db_cached = get_cached_lyrics(clean_art, clean_title)
        if db_cached:
            LYRICS_CACHE[cache_key] = db_cached
            return db_cached

    # 4. Check if this track exists in local library on disk to extract tags
    try:
        from .library import OWNED_BY_ARTIST, normalize_text
        norm_a = normalize_text(clean_art)
        if norm_a in OWNED_BY_ARTIST:
            for owned in OWNED_BY_ARTIST[norm_a]:
                f_path = owned.get("path")
                if f_path and Path(f_path).is_dir():
                    norm_t = normalize_text(clean_title)
                    for audio_file in Path(f_path).iterdir():
                        if audio_file.is_file() and normalize_text(audio_file.stem) == norm_t:
                            loc_res = extract_lyrics_from_local_file(str(audio_file))
                            if loc_res and (loc_res.get("synced") or loc_res.get("plain")):
                                LYRICS_CACHE[cache_key] = loc_res
                                save_cached_lyrics(clean_art, clean_title, loc_res)
                                return loc_res
    except Exception:
        pass

    # 5. Query verified LRCLIB API with multi-tiered resolution
    data = None
    network_error = False

    try:
        # Pass dedicated User-Agent
        custom_headers = {
            "User-Agent": "AlbumDiscoveryStation/2.5.0 (https://github.com/dazzfbnew1-code/Album-Discovery-App)"
        }

        # Attempt 1: Strict lookup
        q_params = {
            "artist_name": clean_art,
            "track_name": clean_title
        }
        if album:
            q_params["album_name"] = re.sub(r"\(.*?\)|\[.*?\]", "", album).strip()
        if duration > 0:
            q_params["duration"] = str(int(duration))

        qs = urllib.parse.urlencode(q_params)
        url = f"https://lrclib.net/api/get?{qs}"
        data = fetch_json(url, headers=custom_headers, timeout=4.0)

        # Attempt 2: Lookup without album/duration constraints
        if not data or not (data.get("syncedLyrics") or data.get("plainLyrics")):
            qs_simple = urllib.parse.urlencode({
                "artist_name": clean_art,
                "track_name": clean_title
            })
            data = fetch_json(f"https://lrclib.net/api/get?{qs_simple}", headers=custom_headers, timeout=3.5)

        # Attempt 3: Search endpoint fallback
        if not data or not (data.get("syncedLyrics") or data.get("plainLyrics")):
            term = urllib.parse.quote(f"{clean_art} {clean_title}")
            search_url = f"https://lrclib.net/api/search?q={term}"
            search_data = fetch_json(search_url, headers=custom_headers, timeout=4.0)
            if search_data and isinstance(search_data, list) and len(search_data) > 0:
                data = search_data[0]

        # Attempt 4: Clean title stripped of punctuation / remaster / radio edit
        if not data or not (data.get("syncedLyrics") or data.get("plainLyrics")):
            simplified_title = re.sub(r"\b(remaster(ed)?|radio edit|original mix|version|edit)\b.*", "", clean_title, flags=re.I).strip()
            if simplified_title and simplified_title != clean_title:
                term_clean = urllib.parse.quote(f"{clean_art} {simplified_title}")
                clean_search = fetch_json(f"https://lrclib.net/api/search?q={term_clean}", headers=custom_headers, timeout=3.5)
                if clean_search and isinstance(clean_search, list) and len(clean_search) > 0:
                    data = clean_search[0]

        if data and (data.get("syncedLyrics") or data.get("plainLyrics")):
            result = {
                "synced": data.get("syncedLyrics") or "",
                "plain": data.get("plainLyrics") or "",
                "instrumental": data.get("instrumental", False)
            }
            # Cache both in memory and persistently in SQLite database
            LYRICS_CACHE[cache_key] = result
            save_cached_lyrics(clean_art, clean_title, result)
            return result
    except Exception as e:
        network_error = True
        log_error(f"Error fetching lyrics for '{title}' by {artist}: {e}")

    # If a network error occurred (e.g. 503 Service Unavailable), do NOT permanently cache failure
    if network_error:
        return {
            "synced": "",
            "plain": "Lyrics server is busy or currently unreachable. Click 'Reload Lyrics' to try again.",
            "instrumental": False,
            "error": True
        }

    # If successfully reached server but track has no verified lyrics
    empty_res = {
        "synced": "",
        "plain": "No lyrics found for this track.",
        "instrumental": False
    }
    LYRICS_CACHE[cache_key] = empty_res
    return empty_res
