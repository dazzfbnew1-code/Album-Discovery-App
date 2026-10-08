import json
import os
import re
from typing import Dict, List, Tuple, Any

from .config import DATA_DIR
from .logger import log_discovery

OVERRIDES_FILE = DATA_DIR / "canonical_overrides.json"

_OVERRIDES_CACHE: Dict[str, Any] = {
    "mtime": 0,
    "data": {}
}


import unicodedata

def _normalize_str(text: str) -> str:
    """Strip punctuation and extra whitespace for robust rule matching."""
    if not text:
        return ""
    t = str(text).replace("’", "'").replace("‘", "'").replace("`", "'")
    text_norm = unicodedata.normalize("NFKD", t).encode("ASCII", "ignore").decode("utf-8")
    clean = re.sub(r"[^\w\s]", " ", text_norm.lower())
    return " ".join(clean.split())


def get_overrides() -> Dict[str, Any]:
    """Dynamically load overrides from JSON with file modification caching."""
    if not OVERRIDES_FILE.exists():
        return {}

    try:
        cur_mtime = os.path.getmtime(OVERRIDES_FILE)
        if _OVERRIDES_CACHE["mtime"] == cur_mtime and _OVERRIDES_CACHE["data"]:
            return _OVERRIDES_CACHE["data"]

        with open(OVERRIDES_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            _OVERRIDES_CACHE["mtime"] = cur_mtime
            _OVERRIDES_CACHE["data"] = data
            return data
    except Exception as e:
        log_discovery(f"[OVERRIDES] Error reading {OVERRIDES_FILE}: {e}")
        return _OVERRIDES_CACHE.get("data") or {}


def is_studio_album_whitelisted(artist: str, title: str) -> bool:
    """Check if an album is explicitly whitelisted as a canonical studio LP."""
    overrides = get_overrides()
    whitelist = overrides.get("studio_album_whitelist", [])

    norm_art = _normalize_str(artist)
    # Strip remaster/deluxe edition parentheticals for matching
    clean_t = re.sub(
        r"\s*[\(\[][^\)\]]*(?:deluxe|super\s+deluxe|expanded|remaster|anniversary|mix|bonus|edition|soundtrack|version|reissue)[^\)\]]*[\)\]]",
        "",
        str(title),
        flags=re.IGNORECASE
    ).strip()
    norm_title = _normalize_str(clean_t)

    for rule in whitelist:
        rule_art = _normalize_str(rule.get("artist", ""))
        rule_title = _normalize_str(rule.get("title", ""))
        match_type = rule.get("match", "contains")

        if rule_art and rule_art not in norm_art and norm_art not in rule_art:
            continue

        if match_type == "exact":
            if norm_title == rule_title:
                return True
        else:
            if rule_title in norm_title:
                return True

    return False


def get_album_title_override(album_id: str, artist: str = "", title: str = "") -> dict:
    """Check for specific album metadata overrides (e.g. title or release year correction)."""
    overrides = get_overrides()
    items = overrides.get("album_title_overrides", [])
    alb_id_str = str(album_id).strip()
    norm_art = _normalize_str(artist)
    norm_title = _normalize_str(title)

    for item in items:
        if str(item.get("id", "")).strip() == alb_id_str and alb_id_str:
            return item

        rule_art = _normalize_str(item.get("artist", ""))
        rule_title = _normalize_str(item.get("title", ""))
        if rule_art and rule_art == norm_art and rule_title and rule_title == norm_title:
            return item

    return {}


def is_compilation_blacklisted(artist: str, title: str) -> bool:
    """Check if an album is blacklisted from studio LPs into compilations."""
    overrides = get_overrides()
    blacklist = overrides.get("compilation_blacklist_titles", [])

    norm_art = _normalize_str(artist)
    norm_title = _normalize_str(title)

    for rule in blacklist:
        rule_art = _normalize_str(rule.get("artist", ""))
        rule_title = _normalize_str(rule.get("title", ""))
        match_type = rule.get("match", "contains")

        if rule_art and (rule_art not in norm_art and norm_art not in rule_art):
            continue

        if match_type == "exact":
            if norm_title == rule_title:
                return True
        else:
            if rule_title in norm_title:
                return True

    return False


def is_thematic_sampler_override(title: str) -> bool:
    """Check if title matches thematic sampler/playlist keywords."""
    overrides = get_overrides()
    keywords = overrides.get("thematic_sampler_keywords", [])
    norm_title = _normalize_str(title)
    words = norm_title.split()

    if norm_title in keywords:
        return True

    if len(words) <= 2 and any(kw in norm_title for kw in keywords):
        return True

    return False


def is_exact_compilation_title_override(title: str) -> bool:
    """Check if title is an exact generic compilation name like '1', 'The Hits'."""
    overrides = get_overrides()
    exact_titles = overrides.get("exact_compilation_titles", [])
    norm_title = _normalize_str(title)
    return norm_title in exact_titles


def is_duo_collaboration_artist_override(text: str) -> bool:
    """Check if text mentions partner names from configured duo artists."""
    overrides = get_overrides()
    duo_names = overrides.get("duo_collaboration_artist_names", [])
    norm_text = _normalize_str(text)
    return any(_normalize_str(name) in norm_text for name in duo_names)


def get_global_compilation_keywords_override() -> List[str]:
    """Get all pre-normalized global compilation keywords."""
    overrides = get_overrides()
    raw_kws = overrides.get("global_compilation_keywords", [])
    return [_normalize_str(kw) for kw in raw_kws]


def get_artist_aliases() -> Dict[str, str]:
    """Get mapping of artist alias variations to official stylized names."""
    overrides = get_overrides()
    return overrides.get("artist_aliases", {})


def get_deezer_genre_map() -> Dict[str, int]:
    """Get Deezer genre IDs mapping."""
    overrides = get_overrides()
    return overrides.get("deezer_genre_map", {
        "all": 0, "pop": 132, "rock": 152, "rap": 116,
        "dance": 113, "rnb": 165, "metal": 464,
        "electronic": 106, "indie": 85, "jazz": 129, "classical": 98
    })


def get_junk_patterns() -> List[str]:
    """Get regex patterns for filtering low-quality or gimmicky releases."""
    overrides = get_overrides()
    return overrides.get("junk_filter_patterns", [])


def get_decade_landmarks() -> Dict[Tuple[int, int], List[Tuple[str, str]]]:
    """Get historical landmark albums grouped by decade (start_year, end_year)."""
    overrides = get_overrides()
    raw = overrides.get("decade_landmarks", {})
    result = {}
    for k_str, items in raw.items():
        try:
            parts = k_str.split("_")
            bounds = (int(parts[0]), int(parts[1]))
            result[bounds] = [(pair[0], pair[1]) for pair in items if len(pair) >= 2]
        except Exception:
            continue
    return result


def get_decade_iconic_artists() -> Dict[Tuple[int, int], List[str]]:
    """Get iconic artist legends grouped by decade (start_year, end_year)."""
    overrides = get_overrides()
    raw = overrides.get("decade_iconic_artists", {})
    result = {}
    for k_str, items in raw.items():
        try:
            parts = k_str.split("_")
            bounds = (int(parts[0]), int(parts[1]))
            result[bounds] = list(items)
        except Exception:
            continue
    return result
