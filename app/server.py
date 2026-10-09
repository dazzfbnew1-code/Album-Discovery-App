import os
import re
import json
import time
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler
import threading
from socketserver import ThreadingMixIn
from pathlib import Path
from .config import CONFIG, DEFAULT_DOWNLOAD_DIR, save_config, get_configured_music_roots, get_drive_info
from .logger import log_info, log_error, log_server, log_download
from .catalog import (
    get_genre_charts,
    search_catalog,
    get_artist_discography,
    get_album_details,
    get_dynamic_quick_artists,
    get_surprise_albums,
    warm_up_discovery_cache
)
from .flow import get_album_flow
from .downloader import DOWNLOAD_MANAGER
from .library import (
    scan_local_library, 
    start_background_library_scanner, 
    is_album_owned, 
    backfill_missing_covers,
    get_library_albums,
    get_local_album_details,
    delete_library_album,
    get_library_dj_radio
)
from .lyrics import get_track_lyrics
from .monitor import get_system_stats, trim_memory

UI_DIR = Path(__file__).parent.parent / "ui"

STREAM_URL_CACHE = {}

def resolve_full_audio_stream(artist: str, title: str) -> dict:
    clean_art = re.sub(r'[\/*?:"<>|]', "", artist).strip()
    clean_title = re.sub(r'[\/*?:"<>|]', "", title).strip()
    cache_key = f"{clean_art.lower()}:::{clean_title.lower()}"
    
    if cache_key in STREAM_URL_CACHE:
        entry = STREAM_URL_CACHE[cache_key]
        if time.time() - entry.get("resolved_at", 0) < 1800:
            return {"stream_url": entry["url"], "duration": entry.get("duration", 0), "cached": True}

    try:
        import yt_dlp
        search_queries = [
            f"ytsearch5:{clean_art} - {clean_title} Topic",
            f"ytsearch5:{clean_art} {clean_title} official audio",
            f"ytsearch5:{clean_art} {clean_title} audio",
            f"ytsearch5:{clean_art} {clean_title} lyrics",
            f"ytsearch5:{clean_art} {clean_title}"
        ]
        
        search_opts = {
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "extract_flat": "in_playlist",
            "ignoreerrors": True
        }

        candidate_ids = []
        with yt_dlp.YoutubeDL(search_opts) as search_ydl:
            for sq in search_queries:
                try:
                    res = search_ydl.extract_info(sq, download=False)
                    if res and "entries" in res:
                        for entry in res["entries"]:
                            if entry and entry.get("id") and entry["id"] not in candidate_ids:
                                candidate_ids.append(entry["id"])
                    if len(candidate_ids) >= 3:
                        break
                except Exception:
                    continue

        if not candidate_ids:
            candidate_ids = [f"ytsearch1:{clean_art} - {clean_title} audio"]

        stream_opts = {
            "format": "bestaudio/best",
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "skip_download": True,
            "extractor_args": {
                "youtube": {
                    "player_client": ["android", "ios"]
                }
            }
        }
        cookies_file = Path(__file__).parent.parent / "data" / "cookies.txt"
        if cookies_file.exists():
            stream_opts["cookiefile"] = str(cookies_file)
            search_opts["cookiefile"] = str(cookies_file)

        with yt_dlp.YoutubeDL(stream_opts) as stream_ydl:
            for cid in candidate_ids:
                target = f"https://www.youtube.com/watch?v={cid}" if not cid.startswith("ytsearch") else cid
                try:
                    info = stream_ydl.extract_info(target, download=False)
                    if info:
                        url = info.get("url")
                        if url:
                            duration = info.get("duration", 0)
                            if len(STREAM_URL_CACHE) > 150:
                                now_t = time.time()
                                for ek in [k for k, v in STREAM_URL_CACHE.items() if now_t - v.get("resolved_at", 0) > 1800]:
                                    STREAM_URL_CACHE.pop(ek, None)
                                if len(STREAM_URL_CACHE) > 200:
                                    for ek in sorted(STREAM_URL_CACHE.keys(), key=lambda x: STREAM_URL_CACHE[x].get("resolved_at", 0))[:50]:
                                        STREAM_URL_CACHE.pop(ek, None)
                            STREAM_URL_CACHE[cache_key] = {
                                "url": url,
                                "duration": duration,
                                "resolved_at": time.time()
                            }
                            return {"stream_url": url, "duration": duration, "cached": False}
                except Exception:
                    continue

    except Exception as e:
        log_error(f"[STREAM RESOLVER ERROR] {e}")

    return {"stream_url": None, "error": "Stream resolution failed"}

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

class AppRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(UI_DIR), **kwargs)

    def log_message(self, format, *args):
        try:
            msg = format % args
            if any(k in msg for k in ["GET /api/download/queue", "GET /api/download/status", "GET /api/stream/proxy", "GET /api/monitor/stats"]):
                return
            log_server(f"[HTTP] {msg}")
        except Exception:
            pass

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        qs = urllib.parse.parse_qs(parsed.query)

        def get1(key, default=""):
            return qs.get(key, [default])[0]

        if path.startswith("/api/"):
            self._handle_api_get(path[5:], get1, qs)
        else:
            super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path.startswith("/api/"):
            content_length = int(self.headers.get("Content-Length", 0))
            body_bytes = self.rfile.read(content_length) if content_length > 0 else b"{}"
            try:
                data = json.loads(body_bytes.decode("utf-8"))
            except Exception:
                data = {}
            self._handle_api_post(path[5:], data)
        else:
            self.send_error(404, "Endpoint not found")

    def _handle_api_get(self, route: str, get1, qs):
        if route == "stream/proxy":
            artist = get1("artist") or ""
            title = get1("title") or ""
            if not artist or not title:
                self._send_json({"error": "Missing artist or title"}, 400)
            else:
                self._proxy_audio_stream(artist, title)

        elif route == "stream/full":
            artist = get1("artist") or ""
            title = get1("title") or ""
            if not artist or not title:
                self._send_json({"error": "Missing artist or title"}, 400)
            else:
                # Return proxy URL for 100% reliable full song playback
                self._send_json({
                    "stream_url": f"/api/stream/proxy?artist={urllib.parse.quote(artist)}&title={urllib.parse.quote(title)}",
                    "full_mode": True
                })

        elif route == "charts":
            genre = get1("genre") or "all"
            limit_val = get1("limit")
            limit = int(limit_val) if limit_val != "" else 0
            force_refresh = get1("refresh") == "1"
            chart_data = get_genre_charts(genre, limit, force_refresh=force_refresh)
            if isinstance(chart_data, dict):
                self._send_json(chart_data)
            else:
                self._send_json({"genre": genre, "albums": chart_data or []})

        elif route == "artists/quick":
            force_refresh = get1("refresh") == "1"
            self._send_json({"artists": get_dynamic_quick_artists(9, force_refresh=force_refresh)})

        elif route == "discovery/surprise":
            limit = int(get1("limit") or 60)
            self._send_json(get_surprise_albums(limit))

        elif route == "discovery/flow":
            aid = get1("id") or ""
            artist = get1("artist") or ""
            genre = get1("genre") or ""
            self._send_json(get_album_flow(aid, artist, genre))
            
        elif route == "search":
            q = get1("q") or ""
            self._send_json(search_catalog(q))
            
        elif route == "artist":
            aid = get1("id") or ""
            if not aid:
                self._send_json({"error": "Missing artist ID"}, 400)
            else:
                self._send_json(get_artist_discography(aid))
                
        elif route == "album":
            aid = get1("id") or ""
            if not aid:
                self._send_json({"error": "Missing album ID"}, 400)
            else:
                self._send_json(get_album_details(aid))

        elif route in ["download/status", "download/queue"]:
            self._send_json(DOWNLOAD_MANAGER.get_status())

        elif route == "monitor/stats":
            self._send_json(get_system_stats())

        elif route == "config":
            self._send_json(CONFIG)

        elif route == "library/status":
            self._send_json(scan_local_library())

        elif route == "library/drives":
            roots = get_configured_music_roots()
            def_root = CONFIG.get("download_root") or CONFIG.get("music_root", DEFAULT_DOWNLOAD_DIR)
            drives_data = []
            for r in roots:
                info = get_drive_info(r)
                info["is_default"] = (r == def_root)
                drives_data.append(info)
            self._send_json({
                "roots": roots,
                "drives": drives_data,
                "download_root": def_root
            })

        elif route == "library/albums":
            q = get1("q") or ""
            self._send_json({"albums": get_library_albums(q)})

        elif route == "library/radio":
            limit_val = get1("limit")
            limit = int(limit_val) if limit_val and limit_val.isdigit() else int(CONFIG.get("radio_batch_size", 60))
            self._send_json(get_library_dj_radio(limit))

        elif route == "library/album-details":
            p_path = get1("path") or ""
            details = get_local_album_details(p_path)
            if details:
                self._send_json(details)
            else:
                self._send_json({"error": "Album not found on disk"}, 404)

        elif route == "lyrics":
            artist = get1("artist") or ""
            title = get1("title") or ""
            album = get1("album") or ""
            duration = int(get1("duration") or 0)
            self._send_json(get_track_lyrics(artist, title, album, duration))

        elif route == "local-file":
            file_path_str = get1("path") or ""
            if not file_path_str:
                self.send_error(400, "Missing path parameter")
                return
            
            p = Path(file_path_str)
            if not p.exists() or not p.is_file():
                self.send_error(404, "File not found")
                return
                
            suffix = p.suffix.lower()
            mime_map = {
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".png": "image/png",
                ".webp": "image/webp",
                ".mp3": "audio/mpeg",
                ".flac": "audio/flac",
                ".m4a": "audio/mp4",
                ".wav": "audio/wav",
                ".ogg": "audio/ogg",
                ".opus": "audio/opus"
            }
            content_type = mime_map.get(suffix, "application/octet-stream")
            
            try:
                stat = p.stat()
                file_size = stat.st_size
                range_header = self.headers.get("Range")
                
                if range_header and range_header.startswith("bytes="):
                    ranges = range_header.replace("bytes=", "").split("-")
                    start = int(ranges[0]) if ranges[0] else 0
                    end = int(ranges[1]) if len(ranges) > 1 and ranges[1] else file_size - 1
                    end = min(end, file_size - 1)
                    length = end - start + 1
                    
                    self.send_response(206)
                    self.send_header("Content-Type", content_type)
                    self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
                    self.send_header("Content-Length", str(length))
                    self.send_header("Accept-Ranges", "bytes")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    
                    with open(p, "rb") as f:
                        f.seek(start)
                        remaining = length
                        while remaining > 0:
                            chunk_size = min(remaining, 64 * 1024)
                            chunk = f.read(chunk_size)
                            if not chunk:
                                break
                            self.wfile.write(chunk)
                            remaining -= len(chunk)
                else:
                    self.send_response(200)
                    self.send_header("Content-Type", content_type)
                    self.send_header("Content-Length", str(file_size))
                    self.send_header("Accept-Ranges", "bytes")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    
                    with open(p, "rb") as f:
                        while True:
                            chunk = f.read(64 * 1024)
                            if not chunk:
                                break
                            self.wfile.write(chunk)
            except (ConnectionResetError, BrokenPipeError, ConnectionAbortedError):
                pass
            except Exception as e:
                if "10054" in str(e) or "10053" in str(e):
                    pass
                else:
                    log_error(f"Error serving local file {file_path_str}: {e}")

        elif route == "library/backfill-covers":
            self._send_json(backfill_missing_covers())

        elif route == "browse-folder":
            self._browse_folder_dialog()

        else:
            self._send_json({"error": "Unknown GET endpoint"}, 404)

    def _proxy_audio_stream(self, artist: str, title: str):
        res = resolve_full_audio_stream(artist, title)
        stream_url = res.get("stream_url")
        if not stream_url:
            self._send_json({"error": "Audio stream unavailable"}, 404)
            return

        range_header = self.headers.get("Range")
        req_headers = {
            "User-Agent": "com.google.android.youtube/19.05.36 (Linux; U; Android 11) gzip"
        }
        if range_header:
            req_headers["Range"] = range_header

        try:
            req = urllib.request.Request(stream_url, headers=req_headers)
            with urllib.request.urlopen(req, timeout=12) as upstream:
                status_code = upstream.status
                content_type = upstream.headers.get("Content-Type") or "audio/mp4"
                content_length = upstream.headers.get("Content-Length")
                content_range = upstream.headers.get("Content-Range")

                self.send_response(status_code)
                self.send_header("Content-Type", content_type)
                self.send_header("Accept-Ranges", "bytes")
                if content_length:
                    self.send_header("Content-Length", content_length)
                if content_range:
                    self.send_header("Content-Range", content_range)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()

                # Stream in 64KB chunks
                while True:
                    chunk = upstream.read(64 * 1024)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
        except Exception:
            pass

    def _handle_api_post(self, route: str, data: dict):
        if route == "download":
            album_id = str(data.get("id") or data.get("album_id") or "")
            title = data.get("title") or ""
            artist = data.get("artist") or ""
            cover = data.get("cover_big") or data.get("cover_small") or ""
            year = data.get("year", "")
            tracks = data.get("tracks", [])

            if not album_id or not title or not artist:
                self._send_json({"error": "Incomplete album payload"}, 400)
                return

            # Skip if already owned on disk
            owned_st = is_album_owned(artist, title)
            if owned_st.get("owned"):
                self._send_json({"status": "already_owned", "message": f"'{title}' is already in your local library."})
                return

            if not tracks:
                details = get_album_details(album_id)
                if details and details.get("tracks"):
                    tracks = details["tracks"]
                    cover = cover or details.get("cover_big") or ""
                    year = year or details.get("year") or ""

            if not tracks:
                self._send_json({"error": "No tracks found to download"}, 400)
                return

            job = DOWNLOAD_MANAGER.add_album_job(album_id, title, artist, cover, year, tracks)
            self._send_json({"status": "queued", "job": job})

        elif route == "download/batch":
            albums = data.get("albums", [])
            queued_jobs = []
            skipped_owned = 0
            for alb in albums:
                aid = str(alb.get("id") or "")
                title = alb.get("title") or ""
                artist = alb.get("artist") or ""
                cover = alb.get("cover_big") or alb.get("cover_small") or alb.get("cover") or ""
                year = alb.get("year", "")

                # Skip already owned albums in batch downloads
                if is_album_owned(artist, title).get("owned"):
                    skipped_owned += 1
                    continue

                tracks = alb.get("tracks")
                if not tracks or len(tracks) == 0:
                    details = get_album_details(aid)
                    if details and details.get("tracks"):
                        tracks = details["tracks"]
                        cover = cover or details.get("cover_big") or ""
                        year = year or details.get("year") or ""
                        title = title or details.get("title") or ""
                        artist = artist or details.get("artist") or ""
                if aid and title and artist and tracks:
                    job = DOWNLOAD_MANAGER.add_album_job(aid, title, artist, cover, year, tracks)
                    queued_jobs.append(job)
            self._send_json({"status": "queued", "count": len(queued_jobs), "skipped_owned": skipped_owned, "jobs": queued_jobs})

        elif route == "download/track":
            album_id = data.get("album_id") or "single"
            album_title = data.get("album_title") or "Single"
            artist = data.get("artist") or "Unknown Artist"
            cover = data.get("cover_big") or ""
            year = data.get("year", "")
            track = data.get("track")

            if not track or not track.get("title"):
                self._send_json({"error": "Incomplete track payload"}, 400)
                return

            job = DOWNLOAD_MANAGER.add_track_job(album_id, album_title, artist, cover, year, track)
            self._send_json({"status": "queued", "job": job})

        elif route == "download/cancel":
            job_id = data.get("job_id")
            if job_id:
                DOWNLOAD_MANAGER.cancel_job(str(job_id))
                self._send_json({"status": "cancelled", "job_id": job_id})
            else:
                self._send_json({"error": "Missing job_id"}, 400)

        elif route == "download/clear-queue":
            DOWNLOAD_MANAGER.clear_queue()
            self._send_json({"status": "queue_cleared"})

        elif route == "download/clear-history":
            DOWNLOAD_MANAGER.clear_history()
            self._send_json({"status": "history_cleared"})

        elif route == "config":
            saved = save_config(data)
            self._send_json({"status": "saved", "config": saved})

        elif route == "library/rescan":
            try:
                import importlib
                import app.catalog, app.library, app.downloader
                importlib.reload(app.catalog)
                importlib.reload(app.library)
                importlib.reload(app.downloader)
            except Exception as reload_err:
                log_error(f"Module reload failed: {reload_err}")
            self._send_json(scan_local_library())

        elif route == "monitor/trim-memory":
            STREAM_URL_CACHE.clear()
            self._send_json(trim_memory())

        elif route == "library/delete":
            p_path = data.get("path") or ""
            if p_path and delete_library_album(p_path):
                self._send_json({"status": "deleted", "path": p_path})
            else:
                self._send_json({"error": "Failed to delete album or invalid path"}, 400)

        elif route in ["open-album-folder", "open-path"]:
            path_str = data.get("path") or ""
            if path_str and Path(path_str).exists():
                if os.name == "nt":
                    os.startfile(path_str)
                self._send_json({"status": "opened", "path": path_str})
            else:
                self._send_json({"error": "Folder not found"}, 404)

        elif route == "open-folder":
            folder = Path(CONFIG.get("music_root", DEFAULT_DOWNLOAD_DIR))
            folder.mkdir(parents=True, exist_ok=True)
            if os.name == "nt":
                os.startfile(str(folder))
            self._send_json({"status": "opened", "path": str(folder)})

        elif route == "library/drives":
            action = data.get("action", "")
            target_path = str(data.get("path", "")).strip()
            roots = list(get_configured_music_roots())
            current_def = CONFIG.get("download_root") or CONFIG.get("music_root", DEFAULT_DOWNLOAD_DIR)

            if action == "add" and target_path:
                if target_path not in roots:
                    roots.append(target_path)
                    save_config({"music_roots": roots})
                    threading.Thread(target=scan_local_library, daemon=True).start()

            elif action == "remove" and target_path:
                if target_path in roots and len(roots) > 1:
                    roots.remove(target_path)
                    new_def = current_def if current_def in roots else roots[0]
                    save_config({"music_roots": roots, "download_root": new_def, "music_root": new_def})
                    threading.Thread(target=scan_local_library, daemon=True).start()

            elif action == "set_default" and target_path:
                if target_path in roots:
                    save_config({"download_root": target_path, "music_root": target_path})

            updated_roots = get_configured_music_roots()
            updated_def = CONFIG.get("download_root") or CONFIG.get("music_root", DEFAULT_DOWNLOAD_DIR)
            drives_data = []
            for r in updated_roots:
                info = get_drive_info(r)
                info["is_default"] = (r == updated_def)
                drives_data.append(info)
            self._send_json({
                "status": "success",
                "roots": updated_roots,
                "drives": drives_data,
                "download_root": updated_def
            })

        else:
            self._send_json({"error": "Unknown POST endpoint"}, 404)

    def _browse_folder_dialog(self):
        try:
            import tkinter as tk
            from tkinter import filedialog
            root = tk.Tk()
            root.withdraw()
            root.attributes('-topmost', True)
            initial = CONFIG.get("music_root", DEFAULT_DOWNLOAD_DIR)
            folder = filedialog.askdirectory(initialdir=initial, title="Select Music Library Download Folder")
            root.destroy()
            if folder:
                folder_norm = str(Path(folder))
                save_config({"music_root": folder_norm})
                self._send_json({"folder": folder_norm})
            else:
                self._send_json({"folder": None})
        except Exception as e:
            self._send_json({"folder": None, "error": str(e)})

    def _send_json(self, data, status=200):
        try:
            body = json.dumps(data, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
        except (ConnectionResetError, BrokenPipeError, ConnectionAbortedError):
            pass
        except Exception as e:
            if "10054" in str(e) or "10053" in str(e):
                pass
            else:
                log_error(f"[HTTP SEND ERROR] {e}")

def start_server(port: int = 8779):
    start_background_library_scanner()
    threading.Thread(target=warm_up_discovery_cache, daemon=True, name="DiscoveryPreWarmer").start()
    server = ThreadedHTTPServer(("127.0.0.1", port), AppRequestHandler)
    log_server(f"[SERVER] Running Album Discovery Backend on http://127.0.0.1:{port}")
    server.serve_forever()
