import os
import sys
import time
import gc
import psutil
from pathlib import Path
from .config import CONFIG
from .logger import get_recent_events, log_info

_START_TIME = time.time()
_PROCESS = psutil.Process(os.getpid())
# Initial call to cpu_percent to start interval measuring
try:
    _PROCESS.cpu_percent(interval=None)
except Exception:
    pass


def get_system_stats() -> dict:
    now = time.time()
    uptime_seconds = int(now - _START_TIME)

    # Process CPU & RAM
    try:
        mem_info = _PROCESS.memory_info()
        rss_bytes = mem_info.rss
        ram_mb = round(rss_bytes / (1024 * 1024), 1)
        ram_pct = round(_PROCESS.memory_percent(), 1)
        raw_cpu = _PROCESS.cpu_percent(interval=None)
        cpu_cores = psutil.cpu_count() or 1
        # Normalize CPU to 0-100% scale (consistent with Windows Task Manager)
        cpu_pct = min(100.0, max(0.0, round(raw_cpu / cpu_cores, 1)))
        raw_cpu_pct = round(raw_cpu, 1)
        num_threads = _PROCESS.num_threads()
    except Exception:
        ram_mb = 0.0
        ram_pct = 0.0
        cpu_pct = 0.0
        raw_cpu_pct = 0.0
        cpu_cores = 1
        num_threads = 0

    # Subprocesses (e.g. ffmpeg.exe, yt-dlp, webview)
    children_info = []
    encoder_count = 0
    try:
        for child in _PROCESS.children(recursive=True):
            try:
                c_name = child.name()
                c_pid = child.pid
                c_mem = round(child.memory_info().rss / (1024 * 1024), 1)
                is_enc = ("ffmpeg" in c_name.lower() or "ffprobe" in c_name.lower())
                if is_enc:
                    encoder_count += 1
                children_info.append({
                    "name": c_name,
                    "pid": c_pid,
                    "ram_mb": c_mem,
                    "is_encoder": is_enc
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
    except Exception:
        pass

    # Subsystems: Downloader
    active_dl_info = None
    queue_len = 0
    try:
        from .downloader import DOWNLOAD_MANAGER
        dl_status = DOWNLOAD_MANAGER.get_status()
        active = dl_status.get("active")
        queue_len = len(dl_status.get("queue", []))
        if active:
            raw_threads = active.get("active_threads") or {}
            active_threads = {str(k): dict(v) for k, v in raw_threads.items() if isinstance(v, dict)} if isinstance(raw_threads, dict) else {}
            active_dl_info = {
                "title": active.get("title", ""),
                "artist": active.get("artist", ""),
                "completed_tracks": active.get("completed_tracks", 0),
                "total_tracks": active.get("total_tracks", 0),
                "progress_pct": active.get("progress_pct", 0),
                "current_track_title": active.get("current_track_title", ""),
                "active_streams_count": len(active_threads),
                "active_threads": active_threads
            }
        elif encoder_count > 0:
            active_dl_info = {
                "title": "Audio Stream Extraction",
                "artist": "FFmpeg Engine",
                "completed_tracks": 0,
                "total_tracks": encoder_count,
                "progress_pct": 50,
                "current_track_title": f"{encoder_count} active audio transcoders",
                "active_streams_count": encoder_count,
                "active_threads": {}
            }
    except Exception as e:
        log_info(f"[MONITOR] Downloader status parse note: {e}")

    # Subsystems: Library
    owned_count = 0
    try:
        from .library import OWNED_ALBUMS
        owned_count = len(OWNED_ALBUMS)
    except Exception:
        pass

    # Subsystems: Database (Dual Databases: discovery.db + music_library.db)
    db_size_str = "0 KB"
    lib_db_size_str = "0 KB"
    try:
        data_dir = Path(__file__).resolve().parent.parent / "data"
        db_path = data_dir / "discovery.db"
        lib_path = data_dir / "music_library.db"
        if db_path.exists():
            sz = db_path.stat().st_size
            db_size_str = f"{round(sz / (1024 * 1024), 1)} MB" if sz >= 1024 * 1024 else f"{round(sz / 1024, 1)} KB"
        if lib_path.exists():
            lsz = lib_path.stat().st_size
            lib_db_size_str = f"{round(lsz / (1024 * 1024), 1)} MB" if lsz >= 1024 * 1024 else f"{round(lsz / 1024, 1)} KB"
    except Exception:
        pass

    # System total RAM
    sys_ram_total_gb = 0.0
    sys_ram_used_pct = 0.0
    try:
        vm = psutil.virtual_memory()
        sys_ram_total_gb = round(vm.total / (1024 * 1024 * 1024), 1)
        sys_ram_used_pct = round(vm.percent, 1)
    except Exception:
        pass

    return {
        "pid": os.getpid(),
        "uptime_seconds": uptime_seconds,
        "cpu_pct": cpu_pct,
        "raw_cpu_pct": raw_cpu_pct,
        "cpu_cores": cpu_cores,
        "ram_mb": ram_mb,
        "ram_pct": ram_pct,
        "threads": num_threads,
        "sys_ram_total_gb": sys_ram_total_gb,
        "sys_ram_used_pct": sys_ram_used_pct,
        "children": children_info,
        "encoder_count": encoder_count,
        "downloader": {
            "is_active": bool(active_dl_info),
            "active_job": active_dl_info,
            "queue_count": queue_len
        },
        "library": {
            "total_owned": owned_count,
            "music_root": str(CONFIG.get("music_root", ""))
        },
        "database": {
            "size_str": f"{db_size_str} App • {lib_db_size_str} Lib" if lib_db_size_str != "0 KB" else db_size_str,
            "name": "discovery.db + music_library.db",
            "app_size": db_size_str,
            "library_size": lib_db_size_str
        },
        "recent_events": get_recent_events(30)
    }


def trim_memory() -> dict:
    """Run garbage collection and return reclaimed memory statistics."""
    try:
        before_mem = round(_PROCESS.memory_info().rss / (1024 * 1024), 1)
    except Exception:
        before_mem = 0.0

    gc.collect()
    time.sleep(0.05)

    try:
        after_mem = round(_PROCESS.memory_info().rss / (1024 * 1024), 1)
    except Exception:
        after_mem = before_mem

    freed_mb = max(0.0, round(before_mem - after_mem, 1))
    log_info(f"[MONITOR] Memory trimmed: reclaimed {freed_mb} MB (was {before_mem} MB, now {after_mem} MB)")

    return {
        "status": "success",
        "before_mb": before_mem,
        "after_mb": after_mem,
        "freed_mb": freed_mb
    }
