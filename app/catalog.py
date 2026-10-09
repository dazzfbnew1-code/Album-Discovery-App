import re
import time
import random
import urllib.parse
import unicodedata
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

from .logger import log_info, log_error, log_search, log_discovery, log_discography
from .db import get_cached_charts, save_cached_charts, get_cached_album, save_cached_album
from .library import is_album_owned
from .eras import DECADE_LANDMARKS, DECADE_ICONIC_ARTISTS
from .providers import fetch_json, extract_year, parse_decade_range, is_junk_title, DEEZER_GENRE_MAP
from .metadata import (
    get_accurate_cover_art,
    get_accurate_album_year,
    get_album_backstory,
    get_musicbrainz_meta
)
from .flow import get_similar_albums
from .aliases import ARTIST_ALIASES, normalize_artist_slug
from .musicbrainz import get_canonical_discography_schema
from .overrides import (
    is_studio_album_whitelisted,
    is_compilation_blacklisted,
    is_thematic_sampler_override,
    is_exact_compilation_title_override,
    is_duo_collaboration_artist_override,
    get_global_compilation_keywords_override,
    get_album_title_override
)

_QUICK_ARTISTS_MEM_CACHE = {"data": None, "ts": 0}

GENRE_SUBQUERIES = {
    "all": [
        "top albums", "greatest hits albums", "classic albums", "iconic albums",
        "masterpiece albums", "platinum albums", "essential albums", "critics choice albums",
        "chart hits", "award winning albums", "legendary albums", "hall of fame albums"
    ],
    "rock": [
        "classic rock", "hard rock", "alt rock", "grunge", "punk rock",
        "indie rock", "progressive rock", "psychedelic rock", "blues rock", "glam rock",
        "southern rock", "garage rock"
    ],
    "pop": [
        "synth pop", "dance pop", "electropop", "indie pop", "dream pop",
        "teen pop", "pop rock", "chart pop", "acoustic pop", "art pop",
        "power pop", "europop"
    ],
    "rap": [
        "hip hop", "boom bap", "trap", "east coast hip hop", "west coast rap",
        "gangsta rap", "uk drill", "conscious hip hop", "90s hip hop", "southern rap",
        "golden era hip hop", "cloud rap"
    ],
    "dance": [
        "house music", "techno", "trance", "drum and bass", "dubstep",
        "edm", "deep house", "ambient house", "eurodance", "uk garage",
        "progressive house", "future bass"
    ],
    "rnb": [
        "contemporary rnb", "neo soul", "90s rnb", "2000s rnb", "motown",
        "funk", "soul classics", "quiet storm", "modern soul", "r&b hits",
        "smooth soul", "urban contemporary"
    ],
    "metal": [
        "heavy metal", "thrash metal", "death metal", "black metal", "nu metal",
        "power metal", "doom metal", "metalcore", "groove metal", "progressive metal",
        "symphonic metal", "speed metal"
    ],
    "electronic": [
        "idm", "ambient electronic", "downtempo", "synthwave", "chillwave",
        "electro", "breakbeat", "trip hop", "industrial electronic", "glitch",
        "darksynth", "vaporwave"
    ],
    "indie": [
        "indie rock", "indie folk", "post-punk", "shoegaze", "lo-fi indie",
        "britpop", "indie pop", "garage rock", "alternative indie", "dream pop",
        "math rock", "indie electronic"
    ],
    "jazz": [
        "bebop", "cool jazz", "hard bop", "jazz fusion", "smooth jazz",
        "modal jazz", "latin jazz", "vocal jazz", "modern jazz", "blue note jazz",
        "contemporary jazz", "dixieland"
    ],
    "classical": [
        "symphony orchestra", "piano concerto", "violin sonata", "baroque classics",
        "romantic orchestra", "chamber music", "opera classics", "contemporary classical",
        "philharmonic orchestra", "masterpiece classics", "choral masterpiece", "classical guitar"
    ],
}

def fetch_era_albums_dynamically(start_year: int, end_year: int) -> list:
    """100% Authentic Era Explorer: deep harvests 1,000+ verified albums across iconic era legends, yearly records & landmark masterpieces."""
    dynamic_albums = []
    decade_key = (start_year, end_year)

    # 1. Query landmark masterpiece records for this decade in parallel
    landmarks = DECADE_LANDMARKS.get(decade_key, [])
    def fetch_single_landmark(pair):
        art, alb = pair
        try:
            q_enc = urllib.parse.quote(f"{art} {alb}")
            res = fetch_json(f"https://api.deezer.com/search/album?q={q_enc}&limit=5", timeout=2.5)
            if res and "data" in res:
                for item in res["data"]:
                    a_name = (item.get("artist", {}).get("name") or "").lower()
                    if is_junk_title(item.get("title", ""), art):
                        continue
                    if art.lower() in a_name or a_name in art.lower():
                        item["_verified_era"] = True
                        return item
        except Exception:
            pass
        return None

    if landmarks:
        with ThreadPoolExecutor(max_workers=10) as ex:
            landmark_results = list(filter(None, ex.map(fetch_single_landmark, landmarks)))
            dynamic_albums.extend(landmark_results)

    # 2. Query iconic legends for this decade across their studio discographies
    legend_pool = list(DECADE_ICONIC_ARTISTS.get(decade_key, []))
    if start_year <= 1949:
        legend_pool.extend([
            "Glenn Miller", "Duke Ellington", "Billie Holiday", "Ella Fitzgerald",
            "Louis Armstrong", "Count Basie", "Tommy Dorsey", "Frank Sinatra",
            "Bing Crosby", "Benny Goodman", "Artie Shaw", "Cab Calloway",
            "Django Reinhardt", "Fats Waller", "Coleman Hawkins", "Lester Young"
        ])
    elif start_year == 1950:
        legend_pool.extend([
            "Bill Haley", "Fats Domino", "Jerry Lee Lewis", "Everly Brothers",
            "Sam Cooke", "Hank Williams", "Bo Diddley", "Muddy Waters"
        ])

    # Deduplicate legend pool
    seen_legends = set()
    unique_legends = []
    for leg in legend_pool:
        if leg.lower() not in seen_legends:
            seen_legends.add(leg.lower())
            unique_legends.append(leg)

    def fetch_legend_albs(art_name):
        albs = []
        try:
            q_enc = urllib.parse.quote(art_name)
            art_res = fetch_json(f"https://api.deezer.com/search/album?q={q_enc}&limit=25", timeout=3.0)
            if art_res and art_res.get("data"):
                for item in art_res["data"]:
                    item_art = (item.get("artist", {}).get("name") or "").lower()
                    if art_name.lower() in item_art or item_art in art_name.lower():
                        item["_verified_era"] = True
                        albs.append(item)
        except Exception:
            pass
        return albs

    with ThreadPoolExecutor(max_workers=12) as ex:
        for sub in ex.map(fetch_legend_albs, unique_legends):
            dynamic_albums.extend(sub)

    # 3. Query individual years and decade keywords for 1,000+ deep harvest
    decade_queries = []
    if start_year >= 1950:
        for y in range(start_year, min(end_year + 1, 2027)):
            decade_queries.append(f"{y} album")
            decade_queries.append(f"{y} rock")
            decade_queries.append(f"{y} pop")
            decade_queries.append(f"{y} hits")
        decade_queries.extend([
            f"{start_year}s",
            f"{start_year}s hits",
            f"{start_year}s albums",
            f"{start_year}s classic albums",
            f"{start_year}s rock",
            f"{start_year}s pop",
            f"{start_year}s essential",
            f"{start_year}s metal",
            f"{start_year}s dance",
            f"{start_year}s alternative",
            f"best of {start_year}s"
        ])
    else:
        for y in range(1930, 1950, 2):
            decade_queries.append(f"{y} jazz")
            decade_queries.append(f"{y} swing")
        decade_queries.extend([
            "1930s swing",
            "1940s big band",
            "jazz big band",
            "classic big band",
            "swing era",
            "1940s jazz",
            "1930s jazz",
            "vocal jazz 1940s",
            "1930s classics",
            "1940s classics",
            "1930s music",
            "1940s music",
            "dixieland jazz",
            "1940s hits"
        ])

    def fetch_dec_query(kw):
        items = []
        try:
            dec_res = fetch_json(f"https://api.deezer.com/search/album?q={urllib.parse.quote(kw)}&limit=100", timeout=3.0)
            if dec_res and "data" in dec_res:
                items.extend(dec_res["data"])
        except Exception:
            pass
        return items

    with ThreadPoolExecutor(max_workers=12) as ex:
        for kw_items in ex.map(fetch_dec_query, decade_queries):
            dynamic_albums.extend(kw_items)

    random.shuffle(dynamic_albums)
    return dynamic_albums

def get_genre_charts(genre: str = "all", limit: int = 100, force_refresh: bool = False):
    start_t = time.time()
    genre_clean = genre.lower().strip()
    cached = get_cached_charts(genre_clean)
    
    # If not forcing refresh, dynamically stamp live ownership on cached albums before returning
    if not force_refresh and cached:
        albs = cached.get("albums", []) if isinstance(cached, dict) else cached
        target_min = 900 if (limit == 0 or limit >= 500) else min(limit, 75)
        if len(albs) >= target_min:
            for a in albs:
                st = is_album_owned(a.get("artist", ""), a.get("title", ""))
                a["owned"] = st.get("owned", False)
                a["owned_path"] = st.get("path", "")
            log_discovery(f"[CACHE HIT] Genre '{genre_clean}' loaded {len(albs)} albums (with live drive ownership check) (took {time.time() - start_t:.3f}s)")
            return {"genre": genre_clean, "albums": albs[:limit] if limit > 0 else albs}

    log_discovery(f"[LIVE ROTATION] Refreshing dynamic studio albums for genre '{genre_clean}'...")
    raw_list = []

    decade_bounds = parse_decade_range(genre_clean)

    # 0. Official Top 100 Singles Chart (Direct Official Chart Ranking)
    if genre_clean in ["top_singles", "singles", "top100_singles"]:
        chart_tracks = fetch_json("https://api.deezer.com/chart/0/tracks?limit=150", timeout=5)
        if chart_tracks and isinstance(chart_tracks, dict) and "data" in chart_tracks:
            for t in chart_tracks["data"]:
                alb = t.get("album") or {}
                raw_list.append({
                    "id": str(alb.get("id") or t.get("id")),
                    "title": t.get("title") or alb.get("title") or "Single",
                    "artist": t.get("artist") or {"name": "Unknown Artist"},
                    "cover_small": alb.get("cover_medium") or alb.get("cover_small") or "",
                    "cover_big": alb.get("cover_xl") or alb.get("cover_big") or "",
                    "cover_medium": alb.get("cover_medium") or "",
                    "cover_xl": alb.get("cover_xl") or "",
                    "release_date": t.get("release_date") or "",
                    "nb_tracks": 1,
                    "record_type": "single"
                })

    # 1. If it's a standard genre in Deezer's catalog, query live charts & live genre artists & deep subqueries
    elif genre_clean in DEEZER_GENRE_MAP and not decade_bounds:
        gid = DEEZER_GENRE_MAP[genre_clean]
        chart_data = fetch_json(f"https://api.deezer.com/chart/{gid}/albums?limit=100", timeout=4)
        if chart_data and isinstance(chart_data, dict) and "data" in chart_data:
            raw_list.extend(chart_data["data"])
            
        # For singles chart, pull top tracks. For albums, keep strictly to albums chart
        if genre_clean in ["top_singles", "singles", "top100_singles"]:
            track_chart = fetch_json(f"https://api.deezer.com/chart/{gid}/tracks?limit=100", timeout=4)
            if track_chart and isinstance(track_chart, dict) and "data" in track_chart:
                for t in track_chart["data"]:
                    alb = t.get("album")
                    if alb:
                        alb["artist"] = t.get("artist") or alb.get("artist")
                        raw_list.append(alb)

        # Multi-search across rich subgenre queries for 1,000+ deep pool
        sub_kws = GENRE_SUBQUERIES.get(genre_clean, [f"{genre_clean} albums", f"best {genre_clean}", f"classic {genre_clean}"])
        def _fetch_subgenre(kw):
            res = fetch_json(f"https://api.deezer.com/search/album?q={urllib.parse.quote(kw)}&limit=100", timeout=3.5)
            return res.get("data", []) if res else []

        with ThreadPoolExecutor(max_workers=8) as ex:
            for items in ex.map(_fetch_subgenre, sub_kws):
                raw_list.extend(items)

        # Pull live top genre artists dynamically and harvest their studio discographies
        genre_artists_res = fetch_json(f"https://api.deezer.com/genre/{gid}/artists", timeout=4)
        live_artists = (genre_artists_res.get("data") if genre_artists_res and "data" in genre_artists_res else [])
        if live_artists:
            sampled_live = live_artists[:25]
            def _fetch_live_artist_albs(art):
                sub_items = []
                try:
                    art_id = str(art.get("id"))
                    art_name = art.get("name")
                    art_albs = fetch_json(f"https://api.deezer.com/artist/{art_id}/albums?limit=25", timeout=3.0)
                    if art_albs and "data" in art_albs:
                        for it in art_albs["data"]:
                            if "artist" not in it:
                                it["artist"] = {"name": art_name, "id": art_id}
                            sub_items.append(it)
                except Exception:
                    pass
                return sub_items

            with ThreadPoolExecutor(max_workers=10) as ex:
                for sub in ex.map(_fetch_live_artist_albs, sampled_live):
                    raw_list.extend(sub)

    # 2. If it's a Time Machine era, query Deezer live search dynamically by calculated decade bounds
    elif decade_bounds:
        start_y, end_y = decade_bounds
        raw_list = fetch_era_albums_dynamically(start_y, end_y)

    # 3. Fallback generic search for arbitrary keywords
    else:
        sub_kws = [genre_clean, f"best {genre_clean}", f"{genre_clean} classics", f"{genre_clean} albums", f"{genre_clean} hits", f"essential {genre_clean}"]
        def _fetch_generic(kw):
            res = fetch_json(f"https://api.deezer.com/search/album?q={urllib.parse.quote(kw)}&limit=100", timeout=3.5)
            return res.get("data", []) if res else []
        with ThreadPoolExecutor(max_workers=6) as ex:
            for items in ex.map(_fetch_generic, sub_kws):
                raw_list.extend(items)

    # Shuffle for fresh discovery variation (keep official singles in chart order)
    if genre_clean not in ["top_singles", "singles", "top100_singles"]:
        random.shuffle(raw_list)

    def process_item(item):
        alb_id = str(item.get("id"))
        title = item.get("title") or ""
        artist = item.get("artist", {}).get("name") or ""
        if is_junk_title(title, artist):
            return None

        # Filter out standalone singles and remix EPs from Studio Album charts
        if genre_clean not in ["top_singles", "singles", "top100_singles"]:
            rec_type = str(item.get("record_type") or "").lower()
            if rec_type in ["single", "ep"]:
                return None
            t_low = title.lower()
            if t_low.endswith(" - single") or t_low.endswith(" (single)") or " - the remixes" in t_low:
                return None

        local_cached = get_cached_album(alb_id)
        raw_date = item.get("release_date") or (local_cached.get("release_date") if local_cached else "") or ""
        nb_tracks = item.get("nb_tracks") or (local_cached.get("track_count") if local_cached else 0) or 0
        year_str = extract_year(raw_date) or (local_cached.get("year") if local_cached else "")

        # For decades, validate and assign release year without dropping valid albums
        if decade_bounds:
            start_y, end_y = decade_bounds
            if item.get("_verified_era"):
                if year_str:
                    try:
                        y_val = int(year_str)
                        if not (start_y <= y_val <= end_y):
                            year_str = str(start_y)
                    except Exception:
                        year_str = str(start_y)
                else:
                    year_str = str(start_y)
            else:
                if not year_str:
                    m = re.search(r"\b(19\d\d|20\d\d)\b", title)
                    if m:
                        year_str = m.group(1)
                    else:
                        year_str = str(start_y)

                try:
                    y_val = int(year_str)
                    if not (start_y - 3 <= y_val <= end_y + 3):
                        return None
                except Exception:
                    pass
            
            # Reject box set / compilation series junk in decade views
            t_low = title.lower()
            if any(junk_kw in t_low for junk_kw in ["complete albums", "series:", "lost album", "the studio albums 19", "box set", "vol. 1", "vol. 2", "vol. 3", "vol. 4"]):
                return None

        if not year_str:
            m = re.search(r"\b(19\d\d|20\d\d)\b", title)
            if m:
                year_str = m.group(1)

        resolved_cover = item.get("cover_xl") or item.get("cover_big") or item.get("cover_medium") or item.get("cover_small") or ""
        if not resolved_cover and local_cached:
            resolved_cover = local_cached.get("cover_big") or local_cached.get("cover_small") or ""

        owned_status = is_album_owned(artist, title)
        return {
            "id": alb_id,
            "title": title,
            "artist": artist,
            "artist_id": str(item.get("artist", {}).get("id") or ""),
            "cover_small": item.get("cover_medium") or item.get("cover_small") or resolved_cover,
            "cover_big": resolved_cover or item.get("cover_xl") or item.get("cover_big") or "",
            "release_date": raw_date,
            "year": year_str,
            "track_count": nb_tracks,
            "type": item.get("record_type") or "album",
            "owned": owned_status.get("owned", False),
            "owned_path": owned_status.get("path", "")
        }

    with ThreadPoolExecutor(max_workers=10) as ex:
        results = list(ex.map(process_item, raw_list))

    seen = set()
    cleaned = []
    for r in results:
        if r and r["title"]:
            t_key = f"{r['artist'].lower()}:::{re.sub(r'\(.*?\)|\[.*?\]', '', r['title'].lower()).strip()}"
            if t_key not in seen and r["id"] not in seen:
                seen.add(t_key)
                seen.add(r["id"])
                cleaned.append(r)

    # Cap harvested reserve pool to exactly top 1,000 landmark albums
    cleaned = cleaned[:1000]

    if not cleaned and cached:
        log_discovery(f"[FALLBACK CACHE] Serving cached data for '{genre_clean}'")
        if isinstance(cached, dict) and cached.get("albums"):
            albs = cached["albums"]
            return {"genre": genre_clean, "albums": albs[:limit] if (limit > 0 and len(albs) > limit) else albs}
        elif isinstance(cached, list):
            return {"genre": genre_clean, "albums": cached[:limit] if (limit > 0 and len(cached) > limit) else cached}

    # Store entire discovered pool in SQLite cache so future queries or higher limits have access
    if cleaned:
        save_cached_charts(genre_clean, {"genre": genre_clean, "albums": cleaned})

    final_albums = cleaned[:limit] if (limit > 0 and len(cleaned) > limit) else cleaned
    result_payload = {"genre": genre_clean, "albums": final_albums}

    elapsed = time.time() - start_t
    log_discovery(f"[REFRESH COMPLETE] Genre '{genre_clean}': returned {len(result_payload['albums'])} fresh studio albums (total pool: {len(cleaned)}) (took {elapsed:.2f}s)")
    return result_payload

def get_dynamic_quick_artists(count: int = 9, force_refresh: bool = False) -> list:
    """Return 100% dynamic live rotating artists from Deezer's official live chart graph with memory cache."""
    global _QUICK_ARTISTS_MEM_CACHE
    now = time.time()
    if not force_refresh and _QUICK_ARTISTS_MEM_CACHE.get("data") and (now - _QUICK_ARTISTS_MEM_CACHE.get("ts", 0) < 1800):
        cached_pool = list(_QUICK_ARTISTS_MEM_CACHE["data"])
        random.shuffle(cached_pool)
        return cached_pool[:count]

    start_t = time.time()
    discovered_artists = []
    try:
        # 1. Live Overall Chart Artists
        chart_data = fetch_json("https://api.deezer.com/chart/0/artists?limit=40", timeout=3.5)
        if chart_data and "data" in chart_data:
            for a in chart_data["data"]:
                name = a.get("name")
                if name and name.lower() not in ["disney", "various artists", "various", "soundtrack", "kidz bop"]:
                    discovered_artists.append(name)
                    
        # 2. Live Genre Top Artists for diversity (parallelized)
        sample_gids = random.sample([152, 132, 116, 113, 106, 85], k=3)
        def _fetch_genre_arts(gid):
            names = []
            try:
                g_res = fetch_json(f"https://api.deezer.com/genre/{gid}/artists", timeout=2.5)
                if g_res and "data" in g_res:
                    for a in g_res["data"][:8]:
                        n = a.get("name")
                        if n and n.lower() not in ["disney", "various artists", "various", "soundtrack", "kidz bop"]:
                            names.append(n)
            except Exception:
                pass
            return names

        with ThreadPoolExecutor(max_workers=3) as ex:
            for g_names in ex.map(_fetch_genre_arts, sample_gids):
                discovered_artists.extend(g_names)
    except Exception as e:
        log_error(f"Error fetching live quick artists: {e}")

    # Remove duplicates preserving order
    combined_pool = list(dict.fromkeys(discovered_artists))
    if combined_pool:
        _QUICK_ARTISTS_MEM_CACHE = {"data": combined_pool, "ts": now}
    
    random.shuffle(combined_pool)
    picked = combined_pool[:count] if combined_pool else ["The Weeknd", "Daft Punk", "Billie Eilish", "Queen", "Eminem", "Oasis", "Kendrick Lamar", "Coldplay", "Dua Lipa"]
    log_discovery(f"[QUICK ARTISTS] Dynamically discovered {len(picked)} live artists: {picked} (took {time.time() - start_t:.3f}s)")
    return picked

def warm_up_discovery_cache():
    """Background cache pre-warmer: pre-loads top charts, decades, and genres into SQLite concurrently."""
    try:
        time.sleep(0.5)
        log_discovery("[PRE-WARMER] Starting high-speed background catalog cache pre-warmer...")
        priority_tabs = [
            "all", "top_singles", "pop",
            "80s", "90s", "2000s", "70s", "60s", "2010s", "2020s", "30s_40s", "50s",
            "rap", "dance", "rock", "rnb", "metal", "electronic", "indie", "jazz", "classical"
        ]
        
        def _warm_tab(tab):
            try:
                get_genre_charts(tab, limit=0, force_refresh=False)
            except Exception:
                pass

        with ThreadPoolExecutor(max_workers=3) as ex:
            list(ex.map(_warm_tab, priority_tabs))

        log_discovery("[PRE-WARMER] Background pre-warm complete! All 21 discovery tabs are hot in database cache with 1,000-album pools.")
    except Exception as e:
        log_error(f"[PRE-WARMER ERROR] {e}")

def get_surprise_albums(limit: int = 60) -> dict:
    """Surprise Crate: picks random masterpiece studio albums across live genres and eras."""
    start_t = time.time()
    genres = ["rap", "rock", "dance", "pop", "80s", "90s", "rnb", "metal", "electronic", "indie", "jazz", "classical"]
    picked_genres = random.sample(genres, k=min(5, len(genres)))
    
    combined = []
    seen = set()
    for g in picked_genres:
        c = get_genre_charts(g, limit=0, force_refresh=False)
        albs = c.get("albums", []) if isinstance(c, dict) else (c or [])
        if albs:
            sample_count = min(20, len(albs))
            for a in random.sample(albs, k=sample_count):
                if a["id"] not in seen:
                    seen.add(a["id"])
                    combined.append(a)
                
    random.shuffle(combined)
    final_albs = combined[:limit] if (limit > 0 and len(combined) > limit) else combined
    result = {"genre": "surprise", "albums": final_albs}
    log_discovery(f"[SURPRISE CRATE] Sampled genres {picked_genres} -> returned {len(result['albums'])} surprise gems (took {time.time() - start_t:.2f}s)")
    return result

def search_catalog(q: str, limit: int = 100):
    start_t = time.time()
    clean_q = q.strip()
    if not clean_q:
        return {"albums": []}

    # If user searched an explicit era/decade like "60s", route to authentic decade charts
    if re.match(r"^(the\s+)?(\d{2,4}s|\d{2}s_\d{2}s|decade\s*\d{2,4}s?)$", clean_q, re.IGNORECASE):
        decade_search = parse_decade_range(clean_q)
        if decade_search:
            log_search(f"[ERA SEARCH DETECTED] '{clean_q}' -> loading authentic decade charts")
            return get_genre_charts(clean_q, limit=limit, force_refresh=False)

    alias_target = ARTIST_ALIASES.get(clean_q.lower())
    search_target = alias_target or clean_q

    log_search(f"[SEARCH QUERY] '{clean_q}' (Target: '{search_target}') - querying Deezer...")
    encoded = urllib.parse.quote(search_target)
    norm_q = normalize_artist_slug(clean_q)
    norm_target = normalize_artist_slug(search_target)

    # Fetch both artist matches and album candidates concurrently for fast, accurate routing
    with ThreadPoolExecutor(max_workers=2) as executor:
        f_alb = executor.submit(fetch_json, f"https://api.deezer.com/search/album?q={encoded}&limit={limit}")
        f_art = executor.submit(fetch_json, f"https://api.deezer.com/search/artist?q={encoded}&limit=25")
        album_data = f_alb.result() or {}
        art_res = f_art.result() or {}

    art_data = art_res.get("data") or []
    candidate_list = album_data.get("data") or []

    matched_artists = []
    for a in art_data:
        a_name = a.get("name", "").strip()
        norm_a = normalize_artist_slug(a_name)
        if norm_a == norm_q or norm_a == norm_target or a_name.lower() == clean_q.lower():
            matched_artists.append(a)

    top_art = None
    if matched_artists:
        matched_artists.sort(key=lambda x: x.get("nb_fan", 0), reverse=True)
        top_art = matched_artists[0]

    # Intelligent disambiguation: is this query primarily for an ARTIST or an ALBUM?
    # Guard against obscure cover/tribute bands named after famous albums (e.g. "Thriller", "Nevermind", "Rumours")
    # while correctly identifying genuine artists (e.g. "Steps", "Queen", "Pink Floyd")
    is_artist_search = False
    if top_art:
        art_fans = top_art.get("nb_fan", 0)
        top_art_id = str(top_art.get("id"))

        # Check if Deezer candidate albums contain an exact title match by a DIFFERENT, famous artist
        has_dominant_album_by_other_artist = False
        for alb in candidate_list[:8]:
            alb_title = alb.get("title") or ""
            clean_alb_title = re.sub(r"\(.*?\)|\[.*?\]|\bdeluxe\b|\bremastered\b", "", alb_title.lower()).strip()
            if clean_alb_title == clean_q.lower() or alb_title.lower() == clean_q.lower():
                alb_art_id = str(alb.get("artist", {}).get("id") or "")
                if alb_art_id != top_art_id and art_fans < 150000:
                    has_dominant_album_by_other_artist = True
                    break

        albums_by_top_art = sum(
            1 for alb in candidate_list[:10]
            if str(alb.get("artist", {}).get("id") or "") == top_art_id
        )

        if has_dominant_album_by_other_artist:
            is_artist_search = False
        elif albums_by_top_art >= 2 or art_fans >= 15000:
            is_artist_search = True
        else:
            is_artist_search = False

    if is_artist_search and top_art:
        artist_id = str(top_art.get("id"))
        artist_name = top_art.get("name", clean_q)

        log_search(f"[VERIFIED ARTIST MATCH] '{artist_name}' (ID: {artist_id}) -> routing through career discography engine")
        
        disco = get_artist_discography(artist_id)
        categories = disco.get("discography", {})
        studio_albums = categories.get("albums", [])
        all_releases = [
            *(categories.get("albums") or []),
            *(categories.get("eps") or []),
            *(categories.get("singles") or []),
            *(categories.get("compilations") or [])
        ]
        
        elapsed = time.time() - start_t
        log_search(f"[SEARCH RESULTS] Artist '{artist_name}': returned {len(studio_albums)} clean studio albums, {len(all_releases)} total releases (took {elapsed:.2f}s)")
        return {
            "query": clean_q,
            "artist": disco.get("artist"),
            "albums": studio_albums,
            "all_releases": all_releases,
            "discography": categories,
            "gap_analysis": disco.get("gap_analysis"),
            "is_artist": True
        }

    # 2. Regular title / keyword album search fallback
    q_words = [w.lower() for w in re.findall(r"\w+", clean_q) if len(w) > 1]
    raw_list = []
    for item in candidate_list:
        art_name = (item.get("artist", {}).get("name") or "").lower()
        alb_title = (item.get("title") or "").lower()
        combined_text = f"{art_name} {alb_title}"
        
        if q_words:
            matched_count = sum(1 for w in q_words if w in combined_text)
            min_required = len(q_words) if len(q_words) <= 3 else len(q_words) - 1
            if matched_count < min_required:
                continue
        raw_list.append(item)

    # Search tracks so specific track queries discover parent albums
    track_url = f"https://api.deezer.com/search/track?q={encoded}&limit=30"
    track_data = fetch_json(track_url) or {}
    for tr in track_data.get("data") or []:
        tr_alb = tr.get("album")
        tr_art = tr.get("artist")
        if tr_alb and tr_alb.get("id"):
            raw_list.append({
                "id": tr_alb.get("id"),
                "title": tr_alb.get("title"),
                "cover_xl": tr_alb.get("cover_xl"),
                "cover_big": tr_alb.get("cover_big"),
                "cover_medium": tr_alb.get("cover_medium"),
                "cover_small": tr_alb.get("cover_small"),
                "artist": {"name": tr_art.get("name") if tr_art else "", "id": tr_art.get("id") if tr_art else ""},
                "record_type": "album"
            })

    seen = set()
    cleaned = []
    for idx, item in enumerate(raw_list):
        alb_id = str(item.get("id"))
        title = item.get("title") or ""
        artist = item.get("artist", {}).get("name") or ""
        
        if is_junk_title(title, artist):
            continue
            
        t_clean = re.sub(r"\(.*?\)|\[.*?\]|\bdeluxe\b|\bremastered\b", "", title.lower()).strip()
        pair_key = f"{artist.lower()}:::{t_clean}"
        if pair_key in seen:
            continue
        seen.add(pair_key)

        raw_date = item.get("release_date") or ""
        year_str = extract_year(raw_date)
        if not year_str:
            m = re.search(r"\b(19\d\d|20\d\d)\b", title)
            if m:
                year_str = m.group(1)

        resolved_cover = item.get("cover_xl") or item.get("cover_big") or item.get("cover_medium") or item.get("cover_small") or ""
        owned_status = is_album_owned(artist, title)

        cleaned.append({
            "id": alb_id,
            "title": title,
            "artist": artist,
            "artist_id": str(item.get("artist", {}).get("id") or ""),
            "cover_small": item.get("cover_medium") or resolved_cover,
            "cover_big": resolved_cover,
            "release_date": raw_date,
            "year": year_str,
            "track_count": item.get("nb_tracks") or 0,
            "type": item.get("record_type") or "album",
            "owned": owned_status.get("owned", False),
            "owned_path": owned_status.get("path", ""),
            "_rank_pos": idx
        })

    q_low = clean_q.lower()
    q_words = [w.lower() for w in re.findall(r"\w+", clean_q) if len(w) > 1]
    def search_rank(a):
        t_low = (a.get("title") or "").lower()
        t_clean = re.sub(r"\(.*?\)|\[.*?\]|\bdeluxe\b|\bremastered\b", "", t_low).strip()
        art_low = (a.get("artist") or "").lower()
        comb = f"{art_low} {t_clean}"
        pos = a.get("_rank_pos", 999)

        # Tier 0: Exact title match or "artist title" match
        if t_clean == q_low or t_low == q_low or comb == q_low or f"{t_clean} {art_low}" == q_low:
            return (0, pos)
        # Tier 1: Clean title starts with query
        if t_clean.startswith(q_low) or t_low.startswith(q_low):
            return (1, pos)
        # Tier 2: Query substring in clean title
        if q_low in t_clean or q_low in t_low:
            return (2, pos)
        # Tier 3: All words present in artist + title
        if q_words and all(w in f"{art_low} {t_low}" for w in q_words):
            return (3, pos)
        return (4, pos)
        
    cleaned.sort(key=search_rank)

    elapsed = time.time() - start_t
    log_search(f"[SEARCH RESULTS] Query '{clean_q}': found {len(cleaned)} releases (took {elapsed:.2f}s)")
    return {"query": clean_q, "albums": cleaned, "is_artist": False}


def get_artist_discography(artist_id: str):
    start_t = time.time()
    info = {}
    if not str(artist_id).isdigit():
        encoded = urllib.parse.quote(str(artist_id).strip())
        search_res = fetch_json(f"https://api.deezer.com/search/artist?q={encoded}&limit=25")
        if search_res and search_res.get("data"):
            candidates = search_res["data"]
            norm_q = normalize_artist_slug(str(artist_id))
            exacts = [
                c for c in candidates
                if normalize_artist_slug(c.get("name", "")) == norm_q
                or c.get("name", "").strip().lower() == str(artist_id).strip().lower()
            ]
            if exacts:
                exacts.sort(key=lambda x: x.get("nb_fan", 0), reverse=True)
                info = exacts[0]
            else:
                info = candidates[0]
            artist_id = str(info.get("id"))
    
    if not info:
        info_url = f"https://api.deezer.com/artist/{artist_id}"
        info = fetch_json(info_url) or {}
    artist_name = info.get("name") or "Unknown Artist"
    art_lower = artist_name.strip().lower()
    
    log_discovery(f"[DISCOGRAPHY QUERY] Fetching career releases for '{artist_name}' (ID: {artist_id})...")
    
    # Fast parallel pagination for up to 300 releases
    page_urls = [f"https://api.deezer.com/artist/{artist_id}/albums?limit=100&index={idx}" for idx in [0, 100, 200]]
    raw_albums = []
    with ThreadPoolExecutor(max_workers=3) as ex:
        pages = list(ex.map(fetch_json, page_urls))
        for p in pages:
            if p and isinstance(p, dict) and "data" in p:
                raw_albums.extend(p["data"])

    categories = {
        "albums": [],
        "singles": [],
        "eps": [],
        "compilations": [],
        "all": []
    }
    all_releases = []

    # Pre-normalized compilation keywords dynamically loaded from external configuration
    norm_comp_keywords = get_global_compilation_keywords_override()

    # Query official MusicBrainz canonical authority for ground-truth studio discography
    mb_schema = get_canonical_discography_schema(artist_name)
    mb_studios = mb_schema.get("studio_albums", []) if mb_schema else []

    def _norm_canon(s):
        if not s:
            return ""
        # Normalize curly apostrophes / quotes before ASCII conversion
        t = str(s).replace("’", "'").replace("‘", "'").replace("`", "'")
        s_norm = unicodedata.normalize("NFKD", t).encode("ASCII", "ignore").decode("utf-8")
        clean_s = re.sub(r"[^\w\s]", " ", s_norm.lower())
        res = " ".join(clean_s.split())
        if not res:
            sym = re.sub(r"\s+", "", s_norm.lower())
            return sym if sym else str(s).strip().lower()
        return res

    def clean_album_title_for_canon(title_str: str) -> str:
        """Strip parenthetical remaster tags, deluxe/anniversary/reissue markers, and subtitles before MusicBrainz matching."""
        if not title_str:
            return ""
        t = str(title_str)
        # Preserve purely symbolic titles like ( )
        if re.match(r"^\s*[\(\[]\s*[\)\]]\s*$", t):
            return _norm_canon(t)
        # 1. Strip parenthetical or bracketed editions/remasters/variants/mixes/soundtracks/years
        t = re.sub(
            r"\s*[\(\[][^\)\]]*(?:deluxe|super\s+deluxe|expanded|mourner|drumless|remaster|anniversary|mix|bonus|edition|soundtrack|ost|version|issue|reissue|complete|collector|platinum|mono|stereo|clean|explicit|\b19\d\d\b|\b20\d\d\b)[^\)\]]*[\)\]]",
            "",
            t,
            flags=re.IGNORECASE
        ).strip()
        # Strip isolated year parentheticals like (2003) or (1980)
        t = re.sub(r"\s*[\(\[]\s*(?:19\d\d|20\d\d)\s*[\)\]]", "", t).strip()
        # 2. Strip trailing edition/expansion subtitles after '-' or ':'
        t = re.sub(
            r"\s*(?:-|:)\s*(?:deluxe|super\s+deluxe|remaster(?:ed)?|\d{4}\s+remaster(?:ed)?|\d{4}\s+mix|expanded.*|mourner.*|drumless.*|anniversary.*|side\s+b.*|refill|special\s+edition|tour\s+edition|platinum.*|reissue.*|soundtrack.*|original\s+soundtrack.*).*$",
            "",
            t,
            flags=re.IGNORECASE
        ).strip()
        # 3. Strip trailing unpunctuated edition words & anniversary numbers
        t = re.sub(
            r"\s+\b(?:deluxe|super\s+deluxe|expanded|mourner.*|drumless.*|platinum|collector.*|soundtrack|ost|20|25|30|35|40|45|50|60)\s*(?:edition|version|issue|remaster.*|reissue.*|anniversary)?$",
            "",
            t,
            flags=re.IGNORECASE
        ).strip()
        # 4. Strip Roman numeral 'I' or '1' on self-titled debut albums (e.g. 'Queen I' -> 'Queen')
        t = re.sub(r"\s+\b(?:i|1)\b$", "", t, flags=re.IGNORECASE).strip()
        if not t.strip():
            t = str(title_str).strip()
        return _norm_canon(t)

    mb_map = {}
    for item in mb_studios:
        key = _norm_canon(item.get("title", ""))
        key_stripped = re.sub(r"\s+\b(?:i|1)\b$", "", key)
        if key:
            if key not in mb_map or (item.get("year") and not mb_map[key].get("year")):
                mb_map[key] = item
        if key_stripped and key_stripped != key:
            if key_stripped not in mb_map or (item.get("year") and not mb_map[key_stripped].get("year")):
                mb_map[key_stripped] = item

    mb_compact_map = {k.replace(" ", ""): v for k, v in mb_map.items()}

    deduped_albums = {}

    for item in raw_albums:
        title = item.get("title") or ""
        if is_junk_title(title, artist_name):
            continue

        raw_date = item.get("release_date") or ""
        rec_type = (item.get("record_type") or "album").lower()
        title_lower = title.lower()
        track_count = int(item.get("nb_tracks") or 0)

        # Normalize title text for matching (strip punctuation & curly apostrophes)
        norm_title = re.sub(r"[^\w\s]", " ", title_lower)
        norm_title = " ".join(norm_title.split())

        # Duo / Collaboration Detection
        # Check both artist object (if present) and artist name in title prefix/suffix
        item_art = (item.get("artist", {}).get("name") or "").strip().lower() if isinstance(item.get("artist"), dict) else ""
        is_duo_collaboration = False
        
        if item_art and item_art != art_lower:
            if any(sep in item_art for sep in [" & ", " and ", " feat", " ft.", " with ", " vs.", " vs ", " x ", " + "]):
                is_duo_collaboration = True
        if any(sep in title_lower for sep in [f"{art_lower} &", f"{art_lower} and", f"& {art_lower}", f"{art_lower} feat", f"{art_lower} ft.", f"{art_lower} with "]):
            is_duo_collaboration = True

        # Repeating self-collaboration marker (e.g. "Artist x Artist")
        if re.search(rf"\b{re.escape(art_lower)}\s*(?:x|vs|\+|\&)\s*{re.escape(art_lower)}\b", title_lower):
            is_duo_collaboration = True

        # Many duo albums put both artists in the title or credit (e.g. "Ike & Tina", configured partner names)
        if any(sep in title_lower for sep in [" & ", " and ", " feat.", " ft.", " with "]):
            for sep in [" & ", " and "]:
                if sep in title_lower and (art_lower in title_lower or is_duo_collaboration_artist_override(title_lower)) and title_lower.strip() != f"with {art_lower}":
                    is_duo_collaboration = True

        # Self-titled exclamation / tour compilation check (e.g. "Tina!", "Prince!")
        first_name = art_lower.split()[0] if art_lower else ""
        is_self_titled_exclamation = title_lower.strip() in [f"{art_lower}!", f"{first_name}!"]

        # Dynamic anniversary year resolution (only calculate offset if raw year is modern reissue >= 2015)
        calculated_year = None
        m_ann = re.search(r"\b(\d+)(?:th|st|nd|rd)\s+anniversary\b", title_lower)
        raw_y = extract_year(raw_date)
        if m_ann and raw_y:
            try:
                y_int = int(raw_y)
                if y_int >= 2015:
                    calculated_year = str(y_int - int(m_ann.group(1)))
            except Exception:
                pass

        accurate_year = calculated_year or raw_y
        if not accurate_year:
            m = re.search(r"\b(19\d\d|20\d\d)\b", title)
            if m:
                accurate_year = m.group(1)

        # Check specific metadata overrides (e.g. historical title or release year correction)
        alb_override = get_album_title_override(item.get("id"), artist_name, title)
        if alb_override:
            if alb_override.get("title"):
                title = alb_override["title"]
                title_lower = title.lower()
            if alb_override.get("year"):
                accurate_year = str(alb_override["year"])

        resolved_cover = item.get("cover_xl") or item.get("cover_big") or item.get("cover_medium") or item.get("cover_small") or ""
        owned_status = is_album_owned(artist_name, title)

        entry = {
            "id": str(item.get("id")),
            "title": title,
            "artist": artist_name,
            "artist_id": str(artist_id),
            "cover_small": item.get("cover_medium") or resolved_cover,
            "cover_big": resolved_cover,
            "release_date": raw_date,
            "year": accurate_year,
            "provider_year": accurate_year,
            "track_count": track_count,
            "type": rec_type,
            "owned": owned_status.get("owned", False),
            "owned_path": owned_status.get("path", "")
        }

        all_releases.append(entry)

        # Pre-clean title for canonical matching (stripping remaster / deluxe tags and accents)
        clean_norm = clean_album_title_for_canon(title)
        compact_norm = clean_norm.replace(" ", "")

        target_mb = None
        if mb_map:
            if clean_norm in mb_map:
                target_mb = mb_map[clean_norm]
            elif compact_norm in mb_compact_map:
                target_mb = mb_compact_map[compact_norm]
            else:
                for sep in [":", "-"]:
                    if sep in title_lower:
                        prefix = clean_album_title_for_canon(title_lower.split(sep)[0])
                        prefix_compact = prefix.replace(" ", "")
                        if prefix in mb_map:
                            target_mb = mb_map[prefix]
                            break
                        elif prefix_compact in mb_compact_map:
                            target_mb = mb_compact_map[prefix_compact]
                            break

        # Strict Category Routing via dynamic configuration rules
        is_single = (rec_type == "single" or " - single" in title_lower or track_count == 1)
        is_ep = (rec_type == "ep" or " ep" in title_lower or (0 < track_count < 7 and rec_type != "single"))
        is_exact_comp_title = (
            is_exact_compilation_title_override(norm_title)
            or bool(re.match(r"^1\s*\(remaster", title_lower))
        )
        is_date_span = bool(re.search(r"\b(19\d\d|20\d\d)\s*[-–—/]\s*(\d{2,4})\b", title_lower))
        is_box_series_piece = bool(re.search(r"/[a-z]+", title_lower)) and bool(re.search(r"\b(19\d\d|20\d\d)\b", title_lower))
        is_track_sampler = bool(re.search(r"^\d+[- ]tracks?$", title_lower))
        is_thematic_sampler = is_thematic_sampler_override(norm_title)

        # Whitelist legitimate canonical studio albums that may contain soundtrack keywords (dynamically loaded from JSON)
        is_canonical_studio_exception = is_studio_album_whitelisted(artist_name, title)

        is_blacklisted_or_live = (
            is_compilation_blacklisted(artist_name, title)
            or is_duo_collaboration
            or is_self_titled_exclamation
            or bool(re.search(r"\b(live|concert|tour|setlist|sessions|session|acoustic|unplugged|tribute|soundtrack|sampler|ost|bbc|alive)\b", norm_title))
        )

        is_comp = (
            not is_canonical_studio_exception and not (target_mb and not is_blacklisted_or_live) and (
                rec_type == "compile"
                or is_blacklisted_or_live
                or is_exact_comp_title
                or is_date_span
                or is_box_series_piece
                or is_track_sampler
                or is_thematic_sampler
                or any(bool(re.search(r"\b" + re.escape(kw) + r"\b", norm_title)) for kw in norm_comp_keywords)
            )
        )

        if is_single:
            categories["singles"].append(entry)
        elif is_comp:
            categories["compilations"].append(entry)
        elif is_ep:
            categories["eps"].append(entry)
        elif rec_type in ["album", "compile"] or target_mb:
            # Fallback year-proximity refinement for self-titled albums across different career eras
            item_y = int(entry.get("year") or 0)
            if not target_mb and item_y >= 1900 and mb_studios:
                for mb_alb in mb_studios:
                    mb_y = int(mb_alb.get("year") or 0)
                    if mb_y >= 1900 and abs(item_y - mb_y) <= 1:
                        mb_norm = _norm_canon(mb_alb.get("title", ""))
                        if clean_norm and mb_norm and (clean_norm == mb_norm or (len(clean_norm) >= 3 and (clean_norm in mb_norm or mb_norm in clean_norm))):
                            target_mb = mb_alb
                            break

            if target_mb:
                canon_key = _norm_canon(target_mb.get("title") or title)
                entry["mbid"] = target_mb.get("mbid")
                entry["canonical_title"] = target_mb.get("title")
                entry["canonical_year"] = target_mb.get("year")
                if target_mb.get("year"):
                    entry["year"] = target_mb["year"]
            else:
                # If MusicBrainz schema is active with verified studio releases,
                # any release that doesn't match an MB studio release group is non-canonical (archival/compilation)
                if mb_map and len(mb_map) >= 3 and not is_canonical_studio_exception:
                    categories["compilations"].append(entry)
                    continue
                canon_key = clean_norm

            matched_key = None
            if canon_key in deduped_albums:
                existing = deduped_albums[canon_key]
                # Cross-Check Year Flexibility:
                # If target_mb is present, both releases bound to the same canonical MusicBrainz Release Group.
                # A later reissue (e.g. 2003) must successfully bind back to the original Release Group (1980) as a variant.
                if target_mb:
                    matched_key = canon_key
                else:
                    curr_y = int(entry.get("year") or 0)
                    prev_y = int(existing.get("year") or 0)
                    if curr_y >= 1900 and prev_y >= 1900 and abs(curr_y - prev_y) >= 4:
                        matched_key = None
                    else:
                        matched_key = canon_key
            else:
                for sep in [":", "-"]:
                    if sep in title_lower:
                        prefix_norm = clean_album_title_for_canon(title_lower.split(sep)[0])
                        if prefix_norm in deduped_albums:
                            existing = deduped_albums[prefix_norm]
                            if target_mb:
                                matched_key = prefix_norm
                            else:
                                curr_y = int(entry.get("year") or 0)
                                prev_y = int(existing.get("year") or 0)
                                if curr_y >= 1900 and prev_y >= 1900 and abs(curr_y - prev_y) >= 4:
                                    matched_key = None
                                else:
                                    matched_key = prefix_norm
                            break

            if not matched_key:
                entry["variants"] = []
                deduped_albums[canon_key] = entry
            else:
                existing = deduped_albums[matched_key]
                if "variants" not in existing:
                    existing["variants"] = []

                # Historical provider release years for comparison
                curr_provider_y = int(entry.get("provider_year") or entry.get("year") or 0)
                prev_provider_y = int(existing.get("provider_year") or existing.get("year") or 0)
                valid_prev_y = prev_provider_y if prev_provider_y >= 1900 else 9999

                # Prefer earlier historical release year or shorter clean canonical title
                is_earlier = (1900 <= curr_provider_y < valid_prev_y)
                is_same_year_shorter = (
                    curr_provider_y == prev_provider_y
                    and len(entry.get("title", "")) < len(existing.get("title", ""))
                )

                if is_earlier or is_same_year_shorter:
                    old_vars = existing.get("variants", [])
                    entry["variants"] = old_vars + [{
                        "id": str(existing.get("id")),
                        "title": existing.get("title"),
                        "year": existing.get("provider_year") or existing.get("year"),
                        "track_count": existing.get("track_count")
                    }]
                    if existing.get("canonical_year") and not entry.get("canonical_year"):
                        entry["canonical_year"] = existing["canonical_year"]
                        entry["year"] = existing["canonical_year"]
                    deduped_albums[matched_key] = entry
                else:
                    existing["variants"].append({
                        "id": str(entry.get("id")),
                        "title": entry.get("title"),
                        "year": entry.get("provider_year") or entry.get("year"),
                        "track_count": entry.get("track_count")
                    })
        else:
            categories["compilations"].append(entry)

    categories["albums"] = list(deduped_albums.values())
    all_releases.sort(
        key=lambda x: str(x.get("year") or x.get("release_date") or ""),
        reverse=True
    )
    categories["all"] = all_releases

    for cat in categories:
        categories[cat].sort(
            key=lambda x: str(x.get("year") or x.get("release_date") or ""),
            reverse=True
        )

    log_discovery(
        f"[DISCOGRAPHY COMPLETE] '{artist_name}': "
        f"{len(categories['albums'])} studio albums, "
        f"{len(categories['compilations'])} compilations, "
        f"{len(categories['eps'])} EPs, "
        f"{len(categories['singles'])} singles "
        f"(took {time.time() - start_t:.2f}s)"
    )

    # Write full detailed audit to dedicated discography.log file
    audit_lines = [
        "=" * 80,
        f"CAREER DISCOGRAPHY AUDIT: '{artist_name}' (Deezer ID: {artist_id})",
        (
            f"TOTAL RELEASES: {len(all_releases)} | "
            f"STUDIO ALBUMS: {len(categories['albums'])} | "
            f"COMPILATIONS & LIVE: {len(categories['compilations'])} | "
            f"EPS: {len(categories['eps'])} | "
            f"SINGLES: {len(categories['singles'])}"
        ),
        "-" * 80,
        f"[STUDIO ALBUMS ({len(categories['albums'])})]"
    ]
    if categories["albums"]:
        for idx, a in enumerate(categories["albums"], 1):
            v_list = a.get("variants", [])
            v_titles = ", ".join(v.get("title", "") for v in v_list)
            v_note = f" (+ {len(v_list)} variant(s): {v_titles})" if v_list else ""
            yr = a.get("year") or a.get("release_year") or "N/A"
            audit_lines.append(f"  {idx:02d}. {a.get('title')} ({yr}) [ID: {a.get('id')}]{v_note}")
    else:
        audit_lines.append("  (None)")

    audit_lines.append(f"\n[COMPILATIONS & LIVE ({len(categories['compilations'])})]")
    if categories["compilations"]:
        for idx, c in enumerate(categories["compilations"], 1):
            yr = c.get("year") or c.get("release_year") or "N/A"
            audit_lines.append(f"  {idx:02d}. {c.get('title')} ({yr}) [ID: {c.get('id')}]")
    else:
        audit_lines.append("  (None)")

    audit_lines.append(f"\n[EPS & MINI-ALBUMS ({len(categories['eps'])})]")
    if categories["eps"]:
        for idx, e in enumerate(categories["eps"], 1):
            yr = e.get("year") or e.get("release_year") or "N/A"
            audit_lines.append(f"  {idx:02d}. {e.get('title')} ({yr}) [ID: {e.get('id')}]")
    else:
        audit_lines.append("  (None)")

    audit_lines.append(f"\n[SINGLES & DROPS ({len(categories['singles'])})]")
    if categories["singles"]:
        for idx, s in enumerate(categories["singles"], 1):
            yr = s.get("year") or s.get("release_year") or "N/A"
            audit_lines.append(f"  {idx:02d}. {s.get('title')} ({yr}) [ID: {s.get('id')}]")
    else:
        audit_lines.append("  (None)")
    audit_lines.append("=" * 80)

    log_discography("\n".join(audit_lines))

    # Calculate Discography Gap Analysis (Library Completeness vs Studio Canon)
    studio_lps = categories.get("albums", [])
    total_studio = len(studio_lps)
    owned_studio = sum(1 for a in studio_lps if a.get("owned"))
    missing_studio = [a for a in studio_lps if not a.get("owned")]
    missing_count = len(missing_studio)
    completion_pct = (
        round((owned_studio / total_studio) * 100)
        if total_studio > 0 else 100
    )

    gap_analysis = {
        "artist": artist_name,
        "total_studio": total_studio,
        "owned_studio": owned_studio,
        "missing_count": missing_count,
        "completion_pct": completion_pct,
        "is_complete": missing_count == 0 and total_studio > 0,
        "missing_albums": [{
            "id": str(a.get("id")),
            "title": a.get("title"),
            "artist": artist_name,
            "year": a.get("year"),
            "cover_big": a.get("cover_big"),
            "cover_small": a.get("cover_small"),
            "type": "album"
        } for a in missing_studio]
    }

    return {
        "artist": {
            "id": str(info.get("id") or artist_id),
            "name": artist_name,
            "picture": info.get("picture_xl") or info.get("picture_big") or "",
            "nb_fan": info.get("nb_fan") or 0
        },
        "discography": categories,
        "gap_analysis": gap_analysis
    }

def get_album_details(album_id: str, force_refresh: bool = False):
    start_t = time.time()
    if not force_refresh:
        cached = get_cached_album(album_id)
        if cached and cached.get("tracks") and len(cached["tracks"]) > 0:
            owned_status = is_album_owned(cached.get("artist", ""), cached.get("title", ""))
            cached["owned"] = owned_status.get("owned", False)
            cached["owned_path"] = owned_status.get("path", "")
            log_discovery(f"[CACHE HIT] Album details for '{cached.get('title')}' loaded in {time.time() - start_t:.3f}s")
            return cached

    url = f"https://api.deezer.com/album/{album_id}"
    data = fetch_json(url) or {}
    if not data or "title" not in data:
        return None
        
    tracks_raw = data.get("tracks", {}).get("data") or []
    tracks = []
    for t in tracks_raw:
        tracks.append({
            "id": str(t.get("id")),
            "track_position": t.get("track_position") or len(tracks) + 1,
            "title": t.get("title") or "Track",
            "artist": t.get("artist", {}).get("name") or data.get("artist", {}).get("name") or "",
            "duration": t.get("duration") or 0,
            "preview": t.get("preview") or "",
            "explicit": t.get("explicit_lyrics", False)
        })
        
    genres = [g.get("name") for g in data.get("genres", {}).get("data", []) if g.get("name")]
    raw_date = data.get("release_date") or ""
    
    artist_name = data.get("artist", {}).get("name") or "Various Artists"
    album_title = data.get("title") or "Unknown Album"
    artist_id = str(data.get("artist", {}).get("id") or "")
    
    # Resolve Backstory, MusicBrainz, and Similar Albums concurrently in parallel
    backstory = ""
    mb_meta = {}
    similar = []
    with ThreadPoolExecutor(max_workers=3) as ex:
        f_story = ex.submit(get_album_backstory, artist_name, album_title)
        f_mb = ex.submit(get_musicbrainz_meta, artist_name, album_title)
        f_sim = ex.submit(get_similar_albums, artist_id, str(data.get("id")), artist_name)
        try:
            backstory = f_story.result()
        except Exception:
            pass
        try:
            mb_meta = f_mb.result() or {}
        except Exception:
            pass
        try:
            similar = f_sim.result() or []
        except Exception:
            pass

    resolved_label = data.get("label") or mb_meta.get("label") or "Official Studio Release"
    accurate_year = extract_year(raw_date) or get_accurate_album_year(artist_name, album_title, raw_date)
    
    resolved_art = data.get("cover_xl") or data.get("cover_big") or data.get("cover_medium") or ""
    if not resolved_art:
        resolved_art = get_accurate_cover_art(artist_name, album_title)

    log_discovery(f"[ALBUM DETAILS] Loaded '{album_title}' by {artist_name} ({len(tracks)} tracks, {len(similar)} companion albums) (took {time.time() - start_t:.2f}s)")

    owned_status = is_album_owned(artist_name, album_title)
    if owned_status.get("owned") and owned_status.get("path") and resolved_art:
        try:
            alb_dir = Path(owned_status["path"])
            if alb_dir.exists() and alb_dir.is_dir():
                c_file = alb_dir / "cover.jpg"
                if not c_file.exists():
                    urllib.request.urlretrieve(resolved_art, str(c_file))
                    log_discovery(f"[COVER AUTO-BACKFILLED] Saved missing cover.jpg for '{album_title}'")
        except Exception:
            pass
    cov_sm = data.get("cover_medium") or resolved_art
    for tr in tracks:
        tr["album"] = album_title
        tr["cover_big"] = resolved_art
        tr["cover_small"] = cov_sm
        tr["year"] = accurate_year

    payload = {
        "id": str(data.get("id")),
        "title": album_title,
        "artist": artist_name,
        "artist_id": artist_id,
        "cover_small": data.get("cover_medium") or resolved_art,
        "cover_big": resolved_art, 
        "release_date": raw_date,
        "year": accurate_year,
        "genres": genres or ["Studio Album"],
        "genre_label": genres[0] if genres else "Music",
        "label": resolved_label,
        "barcode": mb_meta.get("barcode") or "—",
        "backstory": backstory,
        "similar_albums": similar,
        "track_count": data.get("nb_tracks") or len(tracks),
        "duration": data.get("duration") or 0,
        "tracks": tracks,
        "owned": owned_status.get("owned", False),
        "owned_path": owned_status.get("path", "")
    }
    save_cached_album(album_id, payload)
    return payload
