import re
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

from .logger import log_discovery
from .providers import (
    DEEZER_GENRE_MAP,
    extract_year,
    fetch_json,
    is_junk_title
)


def discover_top_album_for_artist(rel_name: str):
    """Discover the single best studio masterpiece for an artist via Deezer & Apple Music."""
    try:
        # 1. Direct Deezer query for artist's top studio albums
        deezer_q = urllib.parse.quote(f'artist:"{rel_name}"')
        deezer_data = fetch_json(
            f"https://api.deezer.com/search/album?q={deezer_q}&limit=8",
            timeout=3.5
        ) or {}
        results = deezer_data.get("data", [])

        for d_item in results:
            d_art = (d_item.get("artist", {}).get("name") or "").strip()
            rel_lower = rel_name.strip().lower()
            if d_art.lower() != rel_lower and rel_lower not in d_art.lower():
                continue

            col = d_item.get("title") or ""
            if is_junk_title(col, rel_name):
                continue

            col_low = col.lower()
            skip_terms = [
                "greatest hits", "best of", "karaoke",
                "tribute", "anthology", "live at", "- single"
            ]
            if any(w in col_low for w in skip_terms):
                continue

            cover = (
                d_item.get("cover_xl")
                or d_item.get("cover_big")
                or d_item.get("cover_medium")
                or ""
            )
            return {
                "id": str(d_item.get("id")),
                "title": col,
                "artist": d_art or rel_name,
                "cover_big": cover,
                "year": extract_year(d_item.get("release_date") or "")
            }

        # 2. High-speed Apple Music / iTunes fallback
        itunes_q = urllib.parse.quote(rel_name)
        url = f"https://itunes.apple.com/search?term={itunes_q}&entity=album&limit=8"
        data = fetch_json(url, timeout=3.5) or {}

        for item in data.get("results", []):
            it_art = (item.get("artistName") or "").strip()
            rel_lower = rel_name.strip().lower()
            if it_art.lower() != rel_lower and rel_lower not in it_art.lower():
                continue

            col = item.get("collectionName") or ""
            if is_junk_title(col, rel_name):
                continue

            cover = (
                item.get("artworkUrl100", "")
                .replace("100x100bb", "1000x1000bb")
            )
            year = (item.get("releaseDate") or "")[:4]
            return {
                "id": str(item.get("collectionId")),
                "title": col,
                "artist": it_art or rel_name,
                "cover_big": cover,
                "year": year
            }
    except Exception:
        pass
    return None


def resolve_artist_id(artist_name: str) -> str:
    """Find the best verified artist ID on Deezer matching the name."""
    if not artist_name:
        return ""

    q_enc = urllib.parse.quote(artist_name)
    search_art = fetch_json(
        f"https://api.deezer.com/search/artist?q={q_enc}&limit=10"
    )
    if not search_art or not search_art.get("data"):
        return ""

    items = search_art["data"]
    art_lower = artist_name.strip().lower()
    exact = [
        a for a in items
        if (a.get("name") or "").strip().lower() == art_lower
    ]

    if exact:
        best = max(exact, key=lambda a: a.get("nb_fan", 0))
    else:
        best = max(items, key=lambda a: a.get("nb_fan", 0))

    return str(best["id"]) if best else ""


def get_similar_albums(
    artist_id: str,
    current_album_id: str = "",
    artist_name: str = ""
) -> list:
    """Discover live related artists & their top-ranking classic studio albums."""
    similar_albums = []
    seen_ids = {str(current_album_id)}
    seen_titles = set()

    if not artist_id and artist_name:
        artist_id = resolve_artist_id(artist_name)

    if not artist_id:
        return []

    url = f"https://api.deezer.com/artist/{artist_id}/related?limit=12"
    data = fetch_json(url, timeout=4)
    related_artists = data.get("data") or []

    def resolve_rel(rel):
        rname = rel.get("name") or ""
        if not rname:
            return None
        return discover_top_album_for_artist(rname)

    with ThreadPoolExecutor(max_workers=8) as ex:
        resolved = list(ex.map(resolve_rel, related_artists))

    for item in resolved:
        if not item:
            continue
        aid = str(item.get("id"))
        t_clean = re.sub(
            r"\(.*?\)|\[.*?\]|\bdeluxe\b|\bremastered\b",
            "",
            item["title"].lower()
        ).strip()

        if aid in seen_ids or t_clean in seen_titles:
            continue

        seen_ids.add(aid)
        seen_titles.add(t_clean)
        similar_albums.append(item)
        if len(similar_albums) >= 6:
            break

    return similar_albums[:6]


def get_album_flow(
    album_id: str = "",
    artist_name: str = "",
    genre: str = ""
) -> dict:
    """Generate a dynamic discovery flow chain of connected landmark records."""
    start_t = time.time()
    flow_albums = []
    seen_titles = set()

    related_artists = []
    if artist_name:
        aid = resolve_artist_id(artist_name)
        if aid:
            rel_data = fetch_json(
                f"https://api.deezer.com/artist/{aid}/related?limit=30"
            )
            if rel_data and rel_data.get("data"):
                related_artists = [
                    a["name"] for a in rel_data["data"]
                    if a.get("name")
                ]

    # If related artists list is short, blend in live artists from top genre charts
    if len(related_artists) < 15:
        gid = DEEZER_GENRE_MAP.get(genre.lower(), 0)
        g_data = fetch_json(
            f"https://api.deezer.com/genre/{gid}/artists",
            timeout=3
        )
        if g_data and "data" in g_data:
            for ga in g_data["data"]:
                gname = ga.get("name")
                if (
                    gname
                    and gname not in related_artists
                    and gname.lower() != artist_name.lower()
                ):
                    related_artists.append(gname)

    with ThreadPoolExecutor(max_workers=10) as ex:
        futures = [
            ex.submit(discover_top_album_for_artist, art)
            for art in related_artists[:28]
        ]
        for f in futures:
            try:
                alb = f.result()
                if alb and alb.get("title"):
                    art_name = (alb.get("artist") or "").lower()
                    ignore_arts = [
                        "various artists", "various",
                        "soundtrack", "karaoke", "unknown artist"
                    ]
                    if art_name in ignore_arts:
                        continue
                    if alb["title"].lower() not in seen_titles:
                        seen_titles.add(alb["title"].lower())
                        flow_albums.append(alb)
            except Exception:
                continue

    log_discovery(
        f"[ALBUM FLOW GENERATED] '{artist_name}' -> "
        f"{len(flow_albums)} connected records (took {time.time() - start_t:.2f}s)"
    )
    return {
        "seed_artist": artist_name,
        "seed_album_id": album_id,
        "albums": flow_albums[:24]
    }
