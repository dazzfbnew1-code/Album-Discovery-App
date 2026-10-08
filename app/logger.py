import sys
import re
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

# Ensure standard streams handle UTF-8 / replace on Windows console
if sys.platform == "win32":
    try:
        if sys.stdout and hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if sys.stderr and hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

BASE_DIR = Path(__file__).resolve().parent.parent / "data"
LOG_DIR = BASE_DIR / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

FORMATTER = logging.Formatter("[%(asctime)s] [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S")

def _create_category_logger(name: str, filename: str, is_app_main: bool = False, max_bytes: int = 5 * 1024 * 1024, backup_count: int = 3):
    log = logging.getLogger(name)
    log.setLevel(logging.INFO)
    log.propagate = False
    if not log.handlers:
        file_path = LOG_DIR / filename
        fh = RotatingFileHandler(str(file_path), maxBytes=max_bytes, backupCount=backup_count, encoding="utf-8")
        fh.setFormatter(FORMATTER)
        log.addHandler(fh)
        
        # Only the main App logger prints to console (avoiding duplicate prints)
        if is_app_main:
            ch = logging.StreamHandler(sys.stdout)
            ch.setFormatter(FORMATTER)
            log.addHandler(ch)
    return log

# Dedicated Loggers
_app_log = _create_category_logger("App", "app.log", is_app_main=True)
_search_log = _create_category_logger("Search", "search.log")
_discovery_log = _create_category_logger("Discovery", "discovery.log")
_download_log = _create_category_logger("Download", "downloads.log")
_server_log = _create_category_logger("Server", "server.log")
_error_log = _create_category_logger("Error", "errors.log")
_discography_log = _create_category_logger("Discography", "discography.log")

import collections
import threading
import time

_RECENT_EVENTS = collections.deque(maxlen=60)
_EVENTS_LOCK = threading.Lock()

def add_event(category: str, msg: str, level: str = "info"):
    clean_msg = str(msg).strip()
    # Filter out frequent polling requests from clogging the activity stream
    if any(noisy in clean_msg for noisy in [
        "/api/monitor/stats",
        "/api/download/status",
        "/api/download/queue",
        "/api/stream/proxy"
    ]):
        return
    clean_msg = re.sub(r'^\s*\[(?:DOWNLOAD|SEARCH|DISCOVERY|APP|SERVER|WARN|ERROR)\]\s*', '', clean_msg)
    with _EVENTS_LOCK:
        _RECENT_EVENTS.append({
            "ts": time.time(),
            "time_str": time.strftime("%H:%M:%S"),
            "category": category,
            "message": clean_msg,
            "level": level
        })

def get_recent_events(limit: int = 35) -> list:
    with _EVENTS_LOCK:
        return list(_RECENT_EVENTS)[-limit:]

def log_info(msg: str):
    _app_log.info(msg)
    add_event("APP", msg, "info")

def log_warn(msg: str):
    _app_log.warning(msg)
    _error_log.warning(msg)
    add_event("WARN", msg, "warn")

def log_error(msg: str):
    _app_log.error(msg)
    _error_log.error(msg)
    add_event("ERROR", msg, "error")

def log_search(msg: str):
    _search_log.info(msg)
    _app_log.info(f"[SEARCH] {msg}")
    add_event("SEARCH", msg, "info")

def log_discovery(msg: str):
    _discovery_log.info(msg)
    _app_log.info(f"[DISCOVERY] {msg}")
    add_event("DISCOVERY", msg, "info")

def log_discography(msg: str):
    _discography_log.info(msg)
    add_event("DISCOGRAPHY", msg, "info")

def log_download(msg: str):
    _download_log.info(msg)
    _app_log.info(f"[DOWNLOAD] {msg}")
    add_event("DOWNLOAD", msg, "info")

def log_server(msg: str):
    _server_log.info(msg)
    _app_log.info(msg)
    add_event("SERVER", msg, "info")
