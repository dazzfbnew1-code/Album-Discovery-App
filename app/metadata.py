"""High-precision metadata, Wikipedia backstories, and year resolution."""
import re
import urllib.parse

from .providers import extract_year, fetch_json

YEAR_CACHE = {}


def get_accurate_cover_art(
    artist: str,
    album: str,
    fallback_cover: str = ""
) -> str:
    """Obtain high-resolution 1000x1000 album artwork."""
    if fallback_cover and fallback_cover.strip():
        return fallback_cover.strip()

    clean_artist = re.sub(r"\(.*?\)|\[.*?\]", "", artist).strip()
    clean_album = re.sub(
        r"\(.*?\)|\[.*?\]|\bdeluxe\b|\bremastered\b",
        "",
        album
    ).strip()

    try:
        q = urllib.parse.quote(f"{clean_artist} {clean_album}")
        url = f"https://itunes.apple.com/search?term={q}&entity=album&limit=1"
        data = fetch_json(url, timeout=3)
        if data and data.get("results"):
            art = data["results"][0].get("artworkUrl100") or ""
            if art:
                return art.replace("100x100bb", "1000x1000bb")
    except Exception:
        pass
    return ""


def get_accurate_album_year(
    artist: str,
    album: str,
    fallback_date: str = ""
) -> str:
    """Resolve true historical original release year."""
    clean_artist = re.sub(r"\(.*?\)|\[.*?\]", "", artist).strip()
    edition_regex = (
        r"\(.*?\)|\[.*?\]|\bdeluxe\b|\bremaster(ed)?\b|"
        r"\banniversary\b|\bexpanded\b|\bedition\b|\bversion\b"
    )
    clean_album = re.sub(edition_regex, "", album).strip()
    cache_key = f"{clean_artist.lower()}:::{clean_album.lower()}"

    if cache_key in YEAR_CACHE:
        return YEAR_CACHE[cache_key]

    f_year = extract_year(fallback_date)
    # If the fallback date is already a classic pre-2000 year, trust it
    if f_year and int(f_year) < 2000:
        YEAR_CACHE[cache_key] = f_year
        return f_year

    # 1. Check Wikipedia API for true historic first release year
    try:
        art_slug = clean_artist.replace(" ", "_")
        alb_slug = clean_album.replace(" ", "_")
        suffixes = [
            f"{alb_slug}_({art_slug}_album)",
            f"{alb_slug}_(album)",
            f"{alb_slug}"
        ]
        for suffix in suffixes:
            s_enc = urllib.parse.quote(suffix)
            url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{s_enc}"
            data = fetch_json(url, timeout=2.5)
            if data and data.get("extract"):
                ext = data["extract"]
                m = re.search(r"\b(19\d\d|20\d\d)\b", ext[:250])
                if m:
                    y_wiki = m.group(1)
                    YEAR_CACHE[cache_key] = y_wiki
                    return y_wiki
    except Exception:
        pass

    # 2. Check iTunes for original release date
    try:
        q_enc = urllib.parse.quote(f"{clean_artist} {clean_album}")
        it_url = (
            f"https://itunes.apple.com/search?term={q_enc}&entity=album&limit=1"
        )
        it_data = fetch_json(it_url, timeout=2.5)
        if it_data and it_data.get("results"):
            it_year = extract_year(
                it_data["results"][0].get("releaseDate") or ""
            )
            if it_year:
                YEAR_CACHE[cache_key] = it_year
                return it_year
    except Exception:
        pass

    if f_year:
        YEAR_CACHE[cache_key] = f_year
        return f_year

    YEAR_CACHE[cache_key] = ""
    return ""


def get_album_backstory(artist: str, album: str) -> str:
    """Fetch verified Wikipedia summary extract for an album."""
    clean_album = re.sub(r"\(.*?\)|\[.*?\]", "", album).strip()
    clean_artist = re.sub(r"\(.*?\)|\[.*?\]", "", artist).strip()

    suffixes = [
        f"{clean_album.replace(' ', '_')}_(album)",
        clean_album.replace(" ", "_"),
        f"{clean_artist.replace(' ', '_')}_{clean_album.replace(' ', '_')}"
    ]

    for suffix in suffixes:
        s_enc = urllib.parse.quote(suffix)
        url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{s_enc}"
        data = fetch_json(url, timeout=4)
        if data and data.get("extract"):
            extract_txt = data.get("extract", "")
            if "may refer to:" not in extract_txt.lower():
                return extract_txt

    return ""


def get_musicbrainz_meta(artist: str, album: str) -> dict:
    """Query MusicBrainz for official label, barcode, and release country via cached client."""
    from .musicbrainz import query_musicbrainz

    clean_artist = re.sub(r"\(.*?\)|\[.*?\]", "", artist).strip()
    clean_album = re.sub(r"\(.*?\)|\[.*?\]", "", album).strip()
    q_str = f'artist:"{clean_artist}" AND release:"{clean_album}"'
    data = query_musicbrainz("release", {"query": q_str, "limit": 1})
    releases = data.get("releases") or [] if data else []

    if releases:
        rel = releases[0]
        label = ""
        label_info = rel.get("label-info") or []
        if label_info and label_info[0].get("label"):
            label = label_info[0]["label"].get("name", "")
        return {
            "label": label,
            "barcode": rel.get("barcode") or "",
            "country": rel.get("country") or ""
        }
    return {"label": "", "barcode": "", "country": ""}
