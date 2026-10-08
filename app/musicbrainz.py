import json
import threading
import time
import urllib.parse
import urllib.request
import urllib.error
from typing import Dict, List, Optional, Any

from .db import get_cached_musicbrainz, save_cached_musicbrainz
from .logger import log_discovery, log_error
from .overrides import (
    is_compilation_blacklisted,
    is_studio_album_whitelisted
)

USER_AGENT = "AlbumDiscoveryStudio/1.0 (contact: info@albumdiscoverystudio.local)"
MB_API_BASE = "https://musicbrainz.org/ws/2"

_MB_LOCK = threading.Lock()
_LAST_MB_TIME = 0.0
_MIN_MB_INTERVAL = 1.1  # Enforce MusicBrainz 1 req/sec rate-limit rule


def _rate_limited_fetch(url: str, timeout: int = 10, retries: int = 2) -> Optional[dict]:
    """Fetch from MusicBrainz with strict rate-limiting and exponential backoff on 503."""
    global _LAST_MB_TIME

    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json"
        }
    )

    for attempt in range(retries + 1):
        with _MB_LOCK:
            now = time.time()
            elapsed = now - _LAST_MB_TIME
            if elapsed < _MIN_MB_INTERVAL:
                time.sleep(_MIN_MB_INTERVAL - elapsed)
            _LAST_MB_TIME = time.time()

        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data
        except urllib.error.HTTPError as he:
            if he.code == 503 and attempt < retries:
                # Rate limit or busy - wait and retry
                time.sleep(2.0 * (attempt + 1))
                continue
            log_error(f"[MUSICBRAINZ HTTP {he.code}] Failed URL {url}: {he}")
            if attempt >= retries:
                return None
        except Exception as e:
            if attempt < retries:
                time.sleep(1.5 * (attempt + 1))
                continue
            log_error(f"[MUSICBRAINZ ERROR] {url}: {e}")
            return None

    return None


def query_musicbrainz(path: str, params: dict = None) -> Optional[dict]:
    """Query MusicBrainz endpoint with automatic SQLite caching."""
    if params is None:
        params = {}
    params["fmt"] = "json"
    qs = urllib.parse.urlencode(params)
    cache_key = f"mb::{path}::{qs}"

    cached = get_cached_musicbrainz(cache_key)
    if cached is not None:
        return cached

    url = f"{MB_API_BASE}/{path}?{qs}"
    data = _rate_limited_fetch(url)
    if data is not None:
        save_cached_musicbrainz(cache_key, data)
    return data


def resolve_musicbrainz_artist(artist_name: str) -> Optional[dict]:
    """Resolve verified Artist MBID via MusicBrainz search query."""
    if not artist_name or not artist_name.strip():
        return None

    clean_name = artist_name.strip()
    cache_key = f"mb_artist::{clean_name.lower()}"
    cached = get_cached_musicbrainz(cache_key)
    if cached is not None:
        return cached

    # Search with quoted artist name
    q_str = f'artist:"{clean_name}"'
    res = query_musicbrainz("artist", {"query": q_str, "limit": 10})
    if not res or not res.get("artists"):
        # Fallback broader search
        res = query_musicbrainz("artist", {"query": clean_name, "limit": 10})

    if not res or not res.get("artists"):
        return None

    artists = res.get("artists", [])
    clean_low = clean_name.lower()

    # Prefer exact case-insensitive match with highest score
    exact_matches = [
        a for a in artists
        if (a.get("name") or "").strip().lower() == clean_low
        or clean_low in [alias.get("name", "").lower() for alias in a.get("aliases", [])]
    ]

    best = exact_matches[0] if exact_matches else artists[0]
    result = {
        "mbid": best["id"],
        "name": best.get("name") or clean_name,
        "type": best.get("type", ""),
        "country": best.get("country", ""),
        "score": best.get("score", 0)
    }

    save_cached_musicbrainz(cache_key, result)
    return result


def get_artist_release_groups(mbid: str) -> List[dict]:
    """Fetch all release groups for an artist MBID with pagination."""
    if not mbid:
        return []

    cache_key = f"mb_rgs::{mbid}"
    cached = get_cached_musicbrainz(cache_key)
    if cached is not None:
        return cached

    all_rgs = []
    limit = 100
    offset = 0
    total_count = 100

    while offset < total_count and offset < 300:
        data = query_musicbrainz(
            "release-group",
            {"artist": mbid, "limit": limit, "offset": offset}
        )
        if not data or "release-groups" not in data:
            break

        total_count = data.get("release-group-count", 0)
        rgs = data.get("release-groups", [])
        if not rgs:
            break

        all_rgs.extend(rgs)
        offset += len(rgs)
        if len(rgs) < limit:
            break

    save_cached_musicbrainz(cache_key, all_rgs)
    return all_rgs


def get_canonical_discography_schema(artist_name: str) -> Optional[dict]:
    """Generate official canonical discography schema from MusicBrainz authority."""
    art_meta = resolve_musicbrainz_artist(artist_name)
    if not art_meta or not art_meta.get("mbid"):
        return None

    mbid = art_meta["mbid"]
    rgs = get_artist_release_groups(mbid)
    if not rgs:
        return None

    schema = {
        "mbid": mbid,
        "artist": art_meta.get("name") or artist_name,
        "studio_albums": [],
        "compilations": [],
        "live": [],
        "eps": [],
        "singles": []
    }

    for rg in rgs:
        title = rg.get("title") or ""
        ptype = rg.get("primary-type") or ""
        stypes = rg.get("secondary-types") or []
        first_date = rg.get("first-release-date") or ""
        year = first_date[:4] if len(first_date) >= 4 else ""

        # Check whitelist override (e.g. Queen's Flash Gordon, Pink Floyd's More)
        is_whitelisted = is_studio_album_whitelisted(artist_name, title)
        is_blacklisted = is_compilation_blacklisted(artist_name, title)

        rg_entry = {
            "title": title,
            "year": year,
            "first_release_date": first_date,
            "mbid": rg.get("id"),
            "primary_type": ptype,
            "secondary_types": stypes
        }

        if is_whitelisted and not is_blacklisted and ptype == "Album" and "Compilation" not in stypes:
            schema["studio_albums"].append(rg_entry)
        elif is_blacklisted:
            schema["compilations"].append(rg_entry)
        elif ptype == "Album" and len(stypes) == 0:
            schema["studio_albums"].append(rg_entry)
        elif "Live" in stypes:
            schema["live"].append(rg_entry)
        elif "Compilation" in stypes or "Mixtape/Street" in stypes or "DJ-mix" in stypes:
            schema["compilations"].append(rg_entry)
        elif ptype == "EP":
            schema["eps"].append(rg_entry)
        elif ptype == "Single":
            schema["singles"].append(rg_entry)
        else:
            schema["compilations"].append(rg_entry)

    # Sort studio albums chronologically by release year
    schema["studio_albums"].sort(key=lambda x: str(x.get("year") or "9999"))

    log_discovery(
        f"[MUSICBRAINZ CANON] '{artist_name}': "
        f"{len(schema['studio_albums'])} official studio LPs, "
        f"{len(schema['compilations'])} compilations, "
        f"{len(schema['live'])} live (MBID: {mbid})"
    )
    return schema
