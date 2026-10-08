"""Lyrics resolution engine supporting synchronized LRC and plain-text lyrics."""
import re
import urllib.parse

from .logger import log_error, log_info
from .providers import fetch_json
from .db import get_cached_lyrics, save_cached_lyrics

LYRICS_CACHE = {}


def get_track_lyrics(
    artist: str,
    title: str,
    album: str = "",
    duration: int = 0
) -> dict:
    """Fetch synchronized and plain lyrics for a track with 0ms SQLite local caching."""
    clean_art = re.sub(r"\(.*?\)|\[.*?\]", "", artist).strip()
    clean_title = re.sub(
        r"\(.*?\)|\[.*?\]|\bfeat\..*|\bft\..*",
        "",
        title
    ).strip()
    cache_key = f"{clean_art.lower()}:::{clean_title.lower()}"

    # 1. Check in-memory session cache
    if cache_key in LYRICS_CACHE:
        return LYRICS_CACHE[cache_key]

    # 2. Check local SQLite persistent cache for 0ms offline instant loading
    db_cached = get_cached_lyrics(clean_art, clean_title)
    if db_cached:
        LYRICS_CACHE[cache_key] = db_cached
        return db_cached

    try:
        q_params = {
            "artist_name": clean_art,
            "track_name": clean_title
        }
        if album:
            q_params["album_name"] = re.sub(
                r"\(.*?\)|\[.*?\]",
                "",
                album
            ).strip()
        if duration > 0:
            q_params["duration"] = str(int(duration))

        qs = urllib.parse.urlencode(q_params)
        url = f"https://lrclib.net/api/get?{qs}"
        data = fetch_json(url, timeout=3.5)

        if not data or not (data.get("syncedLyrics") or data.get("plainLyrics")):
            # Fallback search endpoint
            term = urllib.parse.quote(f"{clean_art} {clean_title}")
            search_url = f"https://lrclib.net/api/search?q={term}"
            search_data = fetch_json(search_url, timeout=3.5)
            if (
                search_data
                and isinstance(search_data, list)
                and len(search_data) > 0
            ):
                data = search_data[0]

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
        log_error(f"Error fetching lyrics for '{title}' by {artist}: {e}")

    empty_res = {
        "synced": "",
        "plain": "No lyrics found for this track.",
        "instrumental": False
    }
    LYRICS_CACHE[cache_key] = empty_res
    return empty_res
