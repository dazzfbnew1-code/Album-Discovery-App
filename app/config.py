import json
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = APP_ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)
CONFIG_FILE = DATA_DIR / "config.json"

# Default download folder is a dedicated 'Album Downloads' folder inside the app directory
DEFAULT_DOWNLOAD_DIR = str(APP_ROOT / "Album Downloads")
Path(DEFAULT_DOWNLOAD_DIR).mkdir(parents=True, exist_ok=True)

import shutil

DEFAULT_CONFIG = {
    "music_root": DEFAULT_DOWNLOAD_DIR,
    "music_roots": [DEFAULT_DOWNLOAD_DIR],
    "download_root": DEFAULT_DOWNLOAD_DIR,
    "show_local_library": False,
    "audio_quality": "320k",
    "folder_structure": "artist_album_year",
    "download_concurrency": 4,
    "save_lrc_lyrics": False,
    "embed_cover_art": True,
    "save_cover_jpg": True,
    "filter_junk": True,
    "auto_advance_preview": True,
    "crossfade_audio": True,
    "crossfade_duration": 3,
    "first_run_completed": False,
    "auto_rescan_on_download": True,
    "radio_batch_size": 60,
    "radio_artist_spacing": True,
    "auto_open_lyrics": False,
    "show_track_toasts": True,
    "default_startup_view": "all",
    "default_discography_filter": "albums",
    "discovery_album_limit": 100
}

def load_config() -> dict:
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                cfg = {**DEFAULT_CONFIG, **data}
                # Clamp download concurrency to 1..10
                if "download_concurrency" in cfg:
                    try:
                        cfg["download_concurrency"] = max(1, min(10, int(cfg["download_concurrency"])))
                    except (ValueError, TypeError):
                        cfg["download_concurrency"] = 4

                # Multi-drive synchronization
                single_root = cfg.get("music_root", DEFAULT_DOWNLOAD_DIR)
                roots_list = cfg.get("music_roots", [])
                if not isinstance(roots_list, list) or not roots_list:
                    roots_list = [single_root]
                elif single_root and single_root not in roots_list:
                    roots_list.insert(0, single_root)
                cfg["music_roots"] = roots_list

                # Designated download target
                if not cfg.get("download_root"):
                    cfg["download_root"] = single_root

                return cfg
        except Exception:
            pass
    return DEFAULT_CONFIG.copy()

CONFIG = load_config()

def get_configured_music_roots() -> list:
    """Returns a list of all unique configured local library and drive paths."""
    roots = []
    cfg_roots = CONFIG.get("music_roots")
    if isinstance(cfg_roots, list):
        for r in cfg_roots:
            s = str(r).strip()
            if s and s not in roots:
                roots.append(s)
    single = CONFIG.get("music_root")
    if single:
        s = str(single).strip()
        if s and s not in roots:
            roots.append(s)
    if not roots:
        roots.append(DEFAULT_DOWNLOAD_DIR)
    return roots

def get_drive_info(path_str: str) -> dict:
    """Calculates disk space usage and free capacity for a drive or path."""
    try:
        p = Path(path_str)
        target = p if p.exists() else p.parent
        total, used, free = shutil.disk_usage(str(target))
        return {
            "path": path_str,
            "exists": p.exists(),
            "total_gb": round(total / (1024**3), 1),
            "free_gb": round(free / (1024**3), 1),
            "used_gb": round(used / (1024**3), 1),
            "free_pct": round((free / total) * 100, 1) if total else 0
        }
    except Exception as e:
        return {
            "path": path_str,
            "exists": False,
            "total_gb": 0,
            "free_gb": 0,
            "used_gb": 0,
            "free_pct": 0,
            "error": str(e)
        }

def save_config(new_config: dict) -> dict:
    CONFIG.update(new_config)
    if "download_concurrency" in CONFIG:
        try:
            CONFIG["download_concurrency"] = max(1, min(10, int(CONFIG["download_concurrency"])))
        except (ValueError, TypeError):
            CONFIG["download_concurrency"] = 3

    # Sync single root with list
    if "music_roots" in CONFIG and isinstance(CONFIG["music_roots"], list) and CONFIG["music_roots"]:
        if "music_root" not in new_config:
            CONFIG["music_root"] = CONFIG["music_roots"][0]
    elif "music_root" in CONFIG:
        single = CONFIG["music_root"]
        if "music_roots" not in CONFIG or not CONFIG["music_roots"]:
            CONFIG["music_roots"] = [single]
        elif single not in CONFIG["music_roots"]:
            CONFIG["music_roots"].insert(0, single)

    if not CONFIG.get("download_root"):
        CONFIG["download_root"] = CONFIG.get("music_root", DEFAULT_DOWNLOAD_DIR)

    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(CONFIG, f, indent=2)
    return CONFIG

