"""System-level hardware, port binding, and Windows filesystem safety."""
import atexit
import re
import shutil
import signal
import socket
import sys
from pathlib import Path

from .logger import log_error

_REGISTERED_CLEANUP_CALLBACKS = []


def register_cleanup_callback(callback):
    """Register a callback function to be called upon application shutdown."""
    if callback not in _REGISTERED_CLEANUP_CALLBACKS:
        _REGISTERED_CLEANUP_CALLBACKS.append(callback)


def cleanup_system_resources():
    """Execute all registered cleanup callbacks to ensure zero zombie threads."""
    for cb in _REGISTERED_CLEANUP_CALLBACKS:
        try:
            cb()
        except Exception as e:
            log_error(f"Error during shutdown callback: {e}")


# Register atexit and standard signal hooks
atexit.register(cleanup_system_resources)
try:
    signal.signal(
        signal.SIGINT,
        lambda s, f: (cleanup_system_resources(), sys.exit(0))
    )
    signal.signal(
        signal.SIGTERM,
        lambda s, f: (cleanup_system_resources(), sys.exit(0))
    )
except Exception:
    pass


def find_available_port(start_port: int = 8779, max_attempts: int = 20) -> int:
    """Find a free TCP port starting from start_port, avoiding conflicts."""
    for p in range(start_port, start_port + max_attempts):
        sock_af = (
            socket.AF_SOCKET
            if hasattr(socket, "AF_SOCKET")
            else socket.AF_INET
        )
        with socket.socket(sock_af, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(("127.0.0.1", p))
                return p
            except OSError:
                continue
    return start_port


get_free_port = find_available_port


def sanitize_filename(name: str, fallback: str = "Unknown", max_length: int = 150) -> str:
    """Sanitize strings for Windows filenames removing illegal characters, control chars, and trailing dots/spaces."""
    if not name or not str(name).strip():
        return fallback
    clean = str(name).strip()
    # Strip ASCII control characters (0x00 to 0x1f and 0x7f)
    clean = re.sub(r'[\x00-\x1f\x7f]', '', clean)
    # Strip illegal Windows filename characters: < > : " / \ | ? *
    clean = re.sub(r'[<>:"/\\|?*]', '_', clean)
    # Collapse multiple underscores or spaces
    clean = re.sub(r'_+', '_', clean)
    clean = re.sub(r'\s+', ' ', clean).strip()
    # Strip forbidden Windows trailing/leading periods and spaces
    clean = clean.strip(". ")
    # Ensure stem before file extension also strips trailing periods and spaces
    if "." in clean and not clean.startswith("."):
        parts = clean.rsplit(".", 1)
        stem = parts[0].rstrip(". ")
        ext = parts[1].strip(". ")
        clean = f"{stem}.{ext}" if ext else stem
    # Handle Windows reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
    reserved = {
        "CON", "PRN", "AUX", "NUL",
        "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
        "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"
    }
    stem_check = clean.split(".")[0].upper()
    if stem_check in reserved or clean.upper() in reserved:
        clean = f"_{clean}_"
    # Limit length safely to avoid Windows MAX_PATH/component overflow
    if max_length and len(clean) > max_length:
        clean = clean[:max_length].rstrip(". ")
    return clean or fallback


def sanitize_path(path: str | Path, max_component_len: int = 120) -> Path:
    """Sanitize every segment of a directory or file path on Windows safely handling long paths."""
    p = Path(path)
    parts = list(p.parts)
    if not parts:
        return p

    start_idx = 0
    # Keep drive root intact (e.g. 'C:\', 'H:\', or '\\')
    if p.is_absolute() and (":" in parts[0] or parts[0].startswith(("\\", "/"))):
        start_idx = 1

    sanitized_parts = list(parts[:start_idx])
    for part in parts[start_idx:]:
        sanitized_parts.append(sanitize_filename(part, fallback="_", max_length=max_component_len))

    safe_p = Path(*sanitized_parts)

    # Long path safety on Windows NT: prefix with \\?\ if approaching MAX_PATH (260 chars)
    str_path = str(safe_p)
    if sys.platform == "win32" and len(str_path) >= 240 and not str_path.startswith("\\\\?\\"):
        try:
            resolved = str(safe_p.resolve())
            if not resolved.startswith("\\\\?\\"):
                if resolved.startswith("\\\\"):
                    resolved = "\\\\?\\UNC\\" + resolved[2:]
                else:
                    resolved = "\\\\?\\" + resolved
            return Path(resolved)
        except Exception:
            pass

    return safe_p



def check_free_disk_space(target_path: str, min_mb: int = 250) -> dict:
    """Check if the target storage drive has enough free disk space (in MB)."""
    try:
        p = Path(target_path).resolve()
        # Find closest existing parent path to check disk space
        check_p = p
        while not check_p.exists() and check_p.parent != check_p:
            check_p = check_p.parent

        stat = shutil.disk_usage(str(check_p))
        free_mb = stat.free // (1024 * 1024)
        total_mb = stat.total // (1024 * 1024)
        return {
            "has_space": free_mb >= min_mb,
            "free_mb": free_mb,
            "total_mb": total_mb,
            "path": str(check_p)
        }
    except Exception as e:
        log_error(f"Failed to query disk space for {target_path}: {e}")
        return {
            "has_space": True,
            "free_mb": -1,
            "total_mb": -1,
            "path": target_path
        }
