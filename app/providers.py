"""External network providers, HTTP fetchers, and filtering utilities."""
import json
import re
import time
import urllib.parse
import urllib.request
from typing import Optional, Union

from .config import CONFIG
from .overrides import get_deezer_genre_map, get_junk_patterns


class _DynamicGenreMap(dict):
    """Dictionary-like proxy that queries the dynamic genre map."""

    def __getitem__(self, key):
        return get_deezer_genre_map().get(key, 0)

    def get(self, key, default=0):
        return get_deezer_genre_map().get(key, default)

    def __contains__(self, key):
        return key in get_deezer_genre_map()

    def items(self):
        return get_deezer_genre_map().items()

    def keys(self):
        return get_deezer_genre_map().keys()

    def values(self):
        return get_deezer_genre_map().values()


DEEZER_GENRE_MAP = _DynamicGenreMap()


def is_junk_title(title: str, artist_name: str = "") -> bool:
    """Filter out low-quality, AI bootleg, or spam releases."""
    if not CONFIG.get("filter_junk", True):
        return False

    combined = f"{title or ''} {artist_name or ''}".lower()
    patterns = get_junk_patterns()
    for pat in patterns:
        if re.search(pat, combined, re.IGNORECASE):
            return True
    return False


def fetch_json(url: str, timeout: Union[int, float] = 6, retries: int = 2, headers: Optional[dict] = None):
    """Fetch and decode JSON from a remote URL with retry backoff."""
    req_headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        )
    }
    if headers:
        req_headers.update(headers)

    req = urllib.request.Request(
        url,
        headers=req_headers
    )

    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if isinstance(data, dict) and data.get("error"):
                    if attempt < retries:
                        time.sleep(0.25 * (attempt + 1))
                        continue
                    return None
                return data
        except Exception:
            if attempt < retries:
                time.sleep(0.25 * (attempt + 1))
            else:
                return None
    return None


def extract_year(date_str: str) -> str:
    """Extract a 4-digit year string from a date or title timestamp."""
    if not date_str:
        return ""
    m = re.search(r"\b(19\d\d|20\d\d)\b", str(date_str))
    return m.group(1) if m else ""


def parse_decade_range(era_tag: str):
    """Dynamically compute start and end year bounds from an authentic era tag."""
    if not era_tag:
        return None
    tag = era_tag.lower().strip()

    # Must contain explicit decade pattern like '80s', '1980s', '2010s', '30s_40s'
    if not re.search(r"\b(\d{2,4}s|\d{2}s_\d{2}s)\b", tag):
        return None

    nums = [int(n) for n in re.findall(r"\d+", tag)]
    if not nums:
        return None

    def expand_year(n):
        if n < 30:
            return 2000 + n
        elif n < 100:
            return 1900 + n
        return n

    expanded = [expand_year(n) for n in nums]
    start_decade = (min(expanded) // 10) * 10
    end_decade = (max(expanded) // 10) * 10 + 9
    return (start_decade, end_decade)
