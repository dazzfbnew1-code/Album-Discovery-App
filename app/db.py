import json
import sqlite3
from pathlib import Path
from .logger import log_info, log_error

DB_DIR = Path(__file__).resolve().parent.parent / "data"
DB_DIR.mkdir(parents=True, exist_ok=True)
DISCOVERY_DB_PATH = DB_DIR / "discovery.db"
LIBRARY_DB_PATH = DB_DIR / "music_library.db"
DB_PATH = DISCOVERY_DB_PATH

def _create_wal_connection(db_file: Path):
    conn = sqlite3.connect(str(db_file), timeout=15)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        conn.execute("PRAGMA cache_size = 10000;")
        conn.execute("PRAGMA temp_store = MEMORY;")
        conn.execute("PRAGMA mmap_size = 268435456;")
    except Exception:
        pass
    return conn

def get_conn():
    """Returns WAL connection to the Discovery & App operational database (discovery.db)."""
    return _create_wal_connection(DISCOVERY_DB_PATH)

def get_library_conn():
    """Returns WAL connection to the Personal Music Library database (music_library.db)."""
    return _create_wal_connection(LIBRARY_DB_PATH)

def init_db():
    try:
        # 1. Initialize discovery.db (App operational cache, charts, lyrics, favorites, queue)
        with get_conn() as conn:
            c = conn.cursor()
            
            # Cached album metadata
            c.execute("""
                CREATE TABLE IF NOT EXISTS cached_albums (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    artist TEXT NOT NULL,
                    year TEXT,
                    genre TEXT,
                    cover_url TEXT,
                    data_json TEXT NOT NULL,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Cached genre charts for 0ms instant loading
            c.execute("""
                CREATE TABLE IF NOT EXISTS cached_charts (
                    genre TEXT PRIMARY KEY,
                    data_json TEXT NOT NULL,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)

            c.execute("""
                CREATE TABLE IF NOT EXISTS favorite_albums (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    artist TEXT NOT NULL,
                    year TEXT,
                    cover_url TEXT,
                    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Persistent download queue for crash/restart recovery
            c.execute("""
                CREATE TABLE IF NOT EXISTS persisted_queue (
                    id TEXT PRIMARY KEY,
                    position INTEGER NOT NULL,
                    job_json TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # MusicBrainz Canon API Cache for 0ms discography lookup
            c.execute("""
                CREATE TABLE IF NOT EXISTS musicbrainz_cache (
                    cache_key TEXT PRIMARY KEY,
                    data_json TEXT NOT NULL,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # Cached synchronized and plain lyrics for offline 0ms instant loading
            c.execute("""
                CREATE TABLE IF NOT EXISTS cached_lyrics (
                    cache_key TEXT PRIMARY KEY,
                    artist TEXT NOT NULL,
                    title TEXT NOT NULL,
                    synced_lyrics TEXT,
                    plain_lyrics TEXT,
                    instrumental INTEGER DEFAULT 0,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # High-speed indexes for instantaneous lookup
            c.execute("CREATE INDEX IF NOT EXISTS idx_cached_charts_genre ON cached_charts(genre);")
            c.execute("CREATE INDEX IF NOT EXISTS idx_cached_albums_id ON cached_albums(id);")
            c.execute("CREATE INDEX IF NOT EXISTS idx_mb_cache_key ON musicbrainz_cache(cache_key);")
            c.execute("CREATE INDEX IF NOT EXISTS idx_cached_lyrics_key ON cached_lyrics(cache_key);")
            c.execute("CREATE INDEX IF NOT EXISTS idx_cached_lyrics_art_tit ON cached_lyrics(artist, title);")
            conn.commit()

        # 2. Initialize music_library.db (Personal physical music collection index)
        with get_library_conn() as lib_conn:
            lc = lib_conn.cursor()

            # Physical indexed albums from disk
            lc.execute("""
                CREATE TABLE IF NOT EXISTS library_albums (
                    key TEXT PRIMARY KEY,
                    artist TEXT NOT NULL,
                    album TEXT NOT NULL,
                    norm_artist TEXT,
                    norm_album TEXT,
                    path TEXT NOT NULL,
                    track_count INTEGER DEFAULT 0,
                    year TEXT,
                    cover_path TEXT,
                    source TEXT DEFAULT 'disk',
                    mtime REAL DEFAULT 0,
                    indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # Recorded downloaded albums
            lc.execute("""
                CREATE TABLE IF NOT EXISTS downloaded_albums (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    artist TEXT NOT NULL,
                    artist_id TEXT,
                    year TEXT,
                    cover_url TEXT,
                    track_count INTEGER DEFAULT 0,
                    dest_path TEXT,
                    downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)

            lc.execute("CREATE INDEX IF NOT EXISTS idx_lib_norm_artist ON library_albums(norm_artist);")
            lc.execute("CREATE INDEX IF NOT EXISTS idx_lib_path ON library_albums(path);")
            lc.execute("CREATE INDEX IF NOT EXISTS idx_dl_id ON downloaded_albums(id);")
            lc.execute("CREATE INDEX IF NOT EXISTS idx_dl_art_alb ON downloaded_albums(artist, title);")
            lib_conn.commit()

        # 3. One-time seamless migration of existing download history from discovery.db to music_library.db
        try:
            with get_conn() as disc_conn, get_library_conn() as lib_conn:
                d_cur = disc_conn.cursor()
                l_cur = lib_conn.cursor()
                d_cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='downloaded_albums'")
                if d_cur.fetchone():
                    d_cur.execute("SELECT id, title, artist, artist_id, year, cover_url, track_count, dest_path, downloaded_at FROM downloaded_albums")
                    rows = d_cur.fetchall()
                    if rows:
                        for r in rows:
                            l_cur.execute("""
                                INSERT OR IGNORE INTO downloaded_albums 
                                (id, title, artist, artist_id, year, cover_url, track_count, dest_path, downloaded_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """, (r["id"], r["title"], r["artist"], r["artist_id"], r["year"], r["cover_url"], r["track_count"], r["dest_path"], r["downloaded_at"]))
                        lib_conn.commit()
        except Exception:
            pass

        log_info("[DB] Dual SQLite databases initialized (discovery.db + music_library.db) in WAL mode.")
    except Exception as e:
        log_error(f"[DB INIT ERROR] {e}")

# Initialize on module load
init_db()

def record_download(album: dict, dest_path: str = ""):
    try:
        with get_library_conn() as conn:
            c = conn.cursor()
            c.execute("""
                INSERT OR REPLACE INTO downloaded_albums 
                (id, title, artist, artist_id, year, cover_url, track_count, dest_path, downloaded_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
            """, (
                str(album.get("id")),
                album.get("title", "Unknown Album"),
                album.get("artist", "Unknown Artist"),
                str(album.get("artist_id", "")),
                str(album.get("year", "")),
                album.get("cover_big") or album.get("cover_small") or "",
                int(album.get("track_count") or len(album.get("tracks", []))),
                str(dest_path)
            ))
            conn.commit()
            log_info(f"[DB] Recorded download in music_library.db: {album.get('title')} by {album.get('artist')}")
    except Exception as e:
        log_error(f"[DB ERROR] record_download failed: {e}")

def get_downloaded_ids() -> list:
    try:
        with get_library_conn() as conn:
            c = conn.cursor()
            c.execute("SELECT id FROM downloaded_albums")
            return [str(row["id"]) for row in c.fetchall()]
    except Exception as e:
        log_error(f"[DB ERROR] get_downloaded_ids failed: {e}")
        return []

def get_downloads_history(limit: int = 50) -> list:
    try:
        with get_library_conn() as conn:
            c = conn.cursor()
            c.execute("SELECT * FROM downloaded_albums ORDER BY downloaded_at DESC LIMIT ?", (limit,))
            return [dict(row) for row in c.fetchall()]
    except Exception as e:
        log_error(f"[DB ERROR] get_downloads_history failed: {e}")
        return []

def toggle_favorite(album: dict) -> bool:
    aid = str(album.get("id"))
    try:
        with get_conn() as conn:
            c = conn.cursor()
            c.execute("SELECT id FROM favorite_albums WHERE id = ?", (aid,))
            exists = c.fetchone()
            if exists:
                c.execute("DELETE FROM favorite_albums WHERE id = ?", (aid,))
                conn.commit()
                log_info(f"[DB] Removed favorite: {album.get('title')}")
                return False
            else:
                c.execute("""
                    INSERT INTO favorite_albums (id, title, artist, year, cover_url, added_at)
                    VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))
                """, (
                    aid,
                    album.get("title", ""),
                    album.get("artist", ""),
                    str(album.get("year", "")),
                    album.get("cover_big") or album.get("cover_small") or ""
                ))
                conn.commit()
                log_info(f"[DB] Added favorite: {album.get('title')}")
                return True
    except Exception as e:
        log_error(f"[DB ERROR] toggle_favorite failed: {e}")
        return False

def get_favorite_ids() -> list:
    try:
        with get_conn() as conn:
            c = conn.cursor()
            c.execute("SELECT id FROM favorite_albums")
            return [str(row["id"]) for row in c.fetchall()]
    except Exception as e:
        log_error(f"[DB ERROR] get_favorite_ids failed: {e}")
        return []

def get_favorites() -> list:
    try:
        with get_conn() as conn:
            c = conn.cursor()
            c.execute("SELECT * FROM favorite_albums ORDER BY added_at DESC")
            return [dict(row) for row in c.fetchall()]
    except Exception as e:
        log_error(f"[DB ERROR] get_favorites failed: {e}")
        return []

def get_cached_album(album_id: str) -> dict:
    try:
        with get_conn() as conn:
            c = conn.cursor()
            c.execute("SELECT data_json FROM cached_albums WHERE id = ?", (str(album_id),))
            row = c.fetchone()
            if row and row["data_json"]:
                return json.loads(row["data_json"])
    except Exception as e:
        log_error(f"[DB ERROR] get_cached_album failed: {e}")
    return None

def save_cached_album(album_id: str, album_data: dict):
    try:
        with get_conn() as conn:
            c = conn.cursor()
            c.execute("""
                INSERT OR REPLACE INTO cached_albums (id, title, artist, year, genre, cover_url, data_json, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
            """, (
                str(album_id),
                album_data.get("title", ""),
                album_data.get("artist", ""),
                str(album_data.get("year", "")),
                album_data.get("genre_label", ""),
                album_data.get("cover_big") or album_data.get("cover_small") or "",
                json.dumps(album_data)
            ))
            conn.commit()
    except Exception as e:
        log_error(f"[DB ERROR] save_cached_album failed: {e}")


def get_cached_charts(genre: str = "all", max_age_hours: int = 24) -> list:
    """Return cached charts if updated within max_age_hours (default 24h), else None for fresh rotation."""
    try:
        with get_conn() as conn:
            c = conn.cursor()
            c.execute("""
                SELECT data_json FROM cached_charts 
                WHERE genre = ? AND updated_at >= datetime('now', 'localtime', '-' || ? || ' hours')
            """, (genre.lower(), max_age_hours))
            row = c.fetchone()
            if row and row["data_json"]:
                return json.loads(row["data_json"])
    except Exception as e:
        log_error(f"[DB ERROR] get_cached_charts failed: {e}")
    return None

def save_cached_charts(genre: str, albums: list):
    if not albums or len(albums) == 0:
        return
    try:
        with get_conn() as conn:
            c = conn.cursor()
            c.execute("""
                INSERT OR REPLACE INTO cached_charts (genre, data_json, updated_at)
                VALUES (?, ?, datetime('now', 'localtime'))
            """, (genre.lower(), json.dumps(albums)))
            conn.commit()
    except Exception as e:
        log_error(f"[DB ERROR] save_cached_charts failed: {e}")


def load_persisted_queue() -> list:
    """Load pending download queue jobs from SQLite on app startup."""
    jobs = []
    try:
        with get_conn() as conn:
            c = conn.cursor()
            c.execute("SELECT job_json FROM persisted_queue ORDER BY position ASC")
            for row in c.fetchall():
                if row["job_json"]:
                    try:
                        job = json.loads(row["job_json"])
                        job["status"] = "queued"
                        jobs.append(job)
                    except Exception:
                        pass
    except Exception as e:
        log_error(f"[DB ERROR] load_persisted_queue failed: {e}")
    return jobs

def save_persisted_queue(jobs: list):
    """Save current pending download queue to SQLite so it survives restarts."""
    try:
        with get_conn() as conn:
            c = conn.cursor()
            c.execute("DELETE FROM persisted_queue")
            for idx, job in enumerate(jobs):
                # Clean snapshot for storage
                clean_job = dict(job)
                clean_job["status"] = "queued"
                c.execute("""
                    INSERT OR REPLACE INTO persisted_queue (id, position, job_json)
                    VALUES (?, ?, ?)
                """, (clean_job.get("id", str(idx)), idx, json.dumps(clean_job)))
            conn.commit()
    except Exception as e:
        log_error(f"[DB ERROR] save_persisted_queue failed: {e}")

def clear_persisted_queue():
    """Clear all persisted queue jobs in SQLite."""
    try:
        with get_conn() as conn:
            c = conn.cursor()
            c.execute("DELETE FROM persisted_queue")
            conn.commit()
    except Exception as e:
        log_error(f"[DB ERROR] clear_persisted_queue failed: {e}")


def get_cached_musicbrainz(cache_key: str):
    """Retrieve cached MusicBrainz JSON data from SQLite."""
    try:
        with get_conn() as conn:
            c = conn.cursor()
            c.execute(
                "SELECT data_json FROM musicbrainz_cache WHERE cache_key = ?",
                (cache_key,)
            )
            row = c.fetchone()
            if row and row["data_json"]:
                return json.loads(row["data_json"])
    except Exception as e:
        log_error(f"[DB ERROR] get_cached_musicbrainz failed for {cache_key}: {e}")
    return None


def save_cached_musicbrainz(cache_key: str, data: dict):
    """Save MusicBrainz JSON data to SQLite for 0ms future lookups."""
    try:
        with get_conn() as conn:
            c = conn.cursor()
            c.execute("""
                INSERT OR REPLACE INTO musicbrainz_cache (cache_key, data_json, updated_at)
                VALUES (?, ?, datetime('now', 'localtime'))
            """, (cache_key, json.dumps(data)))
            conn.commit()
    except Exception as e:
        log_error(f"[DB ERROR] save_cached_musicbrainz failed for {cache_key}: {e}")


def get_cached_lyrics(artist: str, title: str) -> dict:
    """Retrieve cached lyrics from SQLite by normalized artist and title."""
    import re
    clean_art = re.sub(r"\(.*?\)|\[.*?\]", "", artist).strip().lower()
    clean_tit = re.sub(r"\(.*?\)|\[.*?\]|\bfeat\..*|\bft\..*", "", title).strip().lower()
    cache_key = f"{clean_art}:::{clean_tit}"
    try:
        with get_conn() as conn:
            c = conn.cursor()
            c.execute(
                "SELECT synced_lyrics, plain_lyrics, instrumental FROM cached_lyrics WHERE cache_key = ?",
                (cache_key,)
            )
            row = c.fetchone()
            if row:
                return {
                    "synced": row["synced_lyrics"] or "",
                    "plain": row["plain_lyrics"] or "",
                    "instrumental": bool(row["instrumental"])
                }
    except Exception as e:
        log_error(f"[DB ERROR] get_cached_lyrics failed for {cache_key}: {e}")
    return None


def save_cached_lyrics(artist: str, title: str, lyrics_data: dict):
    """Save synchronized lyrics to SQLite so subsequent plays load offline in 0ms."""
    if not lyrics_data or not (lyrics_data.get("synced") or lyrics_data.get("plain")):
        return
    import re
    clean_art = re.sub(r"\(.*?\)|\[.*?\]", "", artist).strip().lower()
    clean_tit = re.sub(r"\(.*?\)|\[.*?\]|\bfeat\..*|\bft\..*", "", title).strip().lower()
    cache_key = f"{clean_art}:::{clean_tit}"
    try:
        with get_conn() as conn:
            c = conn.cursor()
            c.execute("""
                INSERT OR REPLACE INTO cached_lyrics (cache_key, artist, title, synced_lyrics, plain_lyrics, instrumental, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
            """, (
                cache_key,
                artist,
                title,
                lyrics_data.get("synced", ""),
                lyrics_data.get("plain", ""),
                1 if lyrics_data.get("instrumental") else 0
            ))
            conn.commit()
    except Exception as e:
        log_error(f"[DB ERROR] save_cached_lyrics failed for {cache_key}: {e}")


def clear_downloads_history():
    """Clear all downloaded albums history records from music_library.db."""
    try:
        with get_library_conn() as conn:
            c = conn.cursor()
            c.execute("DELETE FROM downloaded_albums")
            conn.commit()
            log_info("[DB] Cleared downloaded_albums history in music_library.db.")
    except Exception as e:
        log_error(f"[DB ERROR] clear_downloads_history failed: {e}")

def save_library_albums_batch(albums_list: list):
    """Batch upsert scanned local albums into music_library.db."""
    if not albums_list:
        return
    try:
        with get_library_conn() as conn:
            c = conn.cursor()
            for alb in albums_list:
                key = alb.get("key") or f"{alb.get('artist', '')}:::{alb.get('album', '')}"
                c.execute("""
                    INSERT INTO library_albums
                    (key, artist, album, norm_artist, norm_album, path, track_count, year, cover_path, source, mtime, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
                    ON CONFLICT(key) DO UPDATE SET
                        path = excluded.path,
                        track_count = excluded.track_count,
                        mtime = excluded.mtime,
                        cover_path = COALESCE(excluded.cover_path, library_albums.cover_path),
                        updated_at = datetime('now', 'localtime')
                """, (
                    key,
                    alb.get("artist", ""),
                    alb.get("album", ""),
                    alb.get("norm_artist", ""),
                    alb.get("norm_album", ""),
                    alb.get("path", ""),
                    int(alb.get("track_count") or 0),
                    str(alb.get("year") or ""),
                    alb.get("cover_path") or "",
                    alb.get("source") or "disk",
                    float(alb.get("mtime") or 0.0)
                ))
            conn.commit()
    except Exception as e:
        log_error(f"[DB ERROR] save_library_albums_batch failed: {e}")

def load_all_library_albums() -> list:
    """Instant load of all indexed albums from music_library.db (~2ms)."""
    try:
        with get_library_conn() as conn:
            c = conn.cursor()
            c.execute("SELECT key, artist, album, norm_artist, norm_album, path, track_count, year, cover_path, source, mtime FROM library_albums")
            return [dict(row) for row in c.fetchall()]
    except Exception as e:
        log_error(f"[DB ERROR] load_all_library_albums failed: {e}")
        return []

def prune_missing_library_albums(valid_paths: set):
    """Remove albums from music_library.db if their folder was deleted from disk."""
    if not valid_paths:
        return
    try:
        with get_library_conn() as conn:
            c = conn.cursor()
            c.execute("SELECT key, path FROM library_albums")
            to_delete = []
            for row in c.fetchall():
                p = row["path"]
                if p and p not in valid_paths:
                    to_delete.append(row["key"])
            if to_delete:
                c.executemany("DELETE FROM library_albums WHERE key = ?", [(k,) for k in to_delete])
                conn.commit()
                log_info(f"[DB] Pruned {len(to_delete)} deleted albums from music_library.db")
    except Exception as e:
        log_error(f"[DB ERROR] prune_missing_library_albums failed: {e}")

def delete_library_album_from_db(folder_path: str):
    """Delete an album entry from music_library.db when deleted by user."""
    try:
        with get_library_conn() as conn:
            c = conn.cursor()
            c.execute("DELETE FROM library_albums WHERE path = ?", (str(folder_path),))
            c.execute("DELETE FROM downloaded_albums WHERE dest_path = ?", (str(folder_path),))
            conn.commit()
    except Exception as e:
        log_error(f"[DB ERROR] delete_library_album_from_db failed: {e}")


