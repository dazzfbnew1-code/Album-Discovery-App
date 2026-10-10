"""Album Discovery App Desktop Launcher."""
import ctypes
import importlib
import os
import socket
import sys
import threading
import time

# Prevent Python bytecode clutter in project directories
sys.dont_write_bytecode = True

# Explicitly register Windows Taskbar AppUserModelID for custom icon grouping
try:
    myappid = "dazz.albumdiscovery.station.1.0"
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
except Exception:
    pass

def ensure_dependencies():
    """Self-healing: if any required packages are missing, installs them automatically."""
    required = {
        "requests": "requests>=2.28.0",
        "mutagen": "mutagen>=1.46.0",
        "yt_dlp": "yt-dlp>=2026.08.19",
        "imageio_ffmpeg": "imageio-ffmpeg>=0.4.8",
        "psutil": "psutil>=5.9.0",
    }
    missing = []
    for mod, pkg in required.items():
        try:
            importlib.import_module(mod)
        except ImportError:
            missing.append(pkg)
    if missing:
        import subprocess
        try:
            subprocess.check_call(
                [sys.executable, "-m", "pip", "install", *missing],
                stdout=subprocess.DEVNULL if not sys.stdout else None,
                stderr=subprocess.DEVNULL if not sys.stderr else None,
            )
        except Exception:
            pass

ensure_dependencies()

webview = None
try:
    webview = importlib.import_module("webview")
except Exception:
    pass

from app.server import start_server


def find_free_port(start_port=8779):
    for port in range(start_port, start_port + 50):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    return 8779


APP_WINDOW_TITLE = "Album Discovery App - Music & Discography Hub"


def get_browser_app_executable() -> str | None:
    """Finds Microsoft Edge or Google Chrome executable for native App Mode."""
    candidates = [
        os.path.join(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"), r"Microsoft\Edge\Application\msedge.exe"),
        os.path.join(os.environ.get("ProgramFiles", r"C:\Program Files"), r"Microsoft\Edge\Application\msedge.exe"),
        os.path.join(os.environ.get("LocalAppData", ""), r"Microsoft\Edge\Application\msedge.exe"),
        os.path.join(os.environ.get("ProgramFiles", r"C:\Program Files"), r"Google\Chrome\Application\chrome.exe"),
        os.path.join(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"), r"Google\Chrome\Application\chrome.exe"),
        os.path.join(os.environ.get("LocalAppData", ""), r"Google\Chrome\Application\chrome.exe"),
    ]
    for p in candidates:
        if p and os.path.isfile(p):
            return p
    return None


def focus_existing_instance(window_title: str) -> bool:
    """If an existing instance of the desktop window is already running, brings it to focus and returns True."""
    if os.name != "nt":
        return False
    try:
        user32 = ctypes.windll.user32
        hwnd = user32.FindWindowW(None, window_title)
        if hwnd:
            # SW_RESTORE = 9
            user32.ShowWindow(hwnd, 9)
            user32.SetForegroundWindow(hwnd)
            return True
    except Exception:
        pass
    return False


def is_server_alive(port: int = 8779) -> bool:
    """Quick check if our server is already answering on port."""
    try:
        import urllib.request
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/system/status", timeout=0.8) as resp:
            return resp.status == 200
    except Exception:
        return False


def open_desktop_window(app_url: str):
    """Launches the app in a dedicated, borderless app window."""
    app_exe = get_browser_app_executable()
    if app_exe:
        import subprocess
        # Native Edge/Chrome App Mode: zero browser chrome, instant startup, full WebAudio
        proc = subprocess.Popen([app_exe, f"--app={app_url}", "--window-size=1440,900"])
        try:
            proc.wait()
        except KeyboardInterrupt:
            pass
        return True

    # Fallback 1: pywebview if available
    if webview:
        try:
            webview.create_window(
                title=APP_WINDOW_TITLE,
                url=app_url,
                width=1440,
                height=900,
                min_size=(1020, 680),
                maximized=True,
                resizable=True,
                background_color="#0b0f19",
                text_select=False,
                confirm_close=False
            )
            webview.start(debug=False)
            return True
        except Exception:
            pass

    # Fallback 2: Default web browser
    import webbrowser
    webbrowser.open(app_url)
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    return True


def main():
    # If the server is already running in background, focus window or open UI immediately
    if is_server_alive(8779):
        if not focus_existing_instance(APP_WINDOW_TITLE):
            open_desktop_window("http://127.0.0.1:8779/index.html")
        sys.exit(0)

    if focus_existing_instance(APP_WINDOW_TITLE):
        sys.exit(0)

    try:
        from app.downloader import auto_update_ytdlp_background, auto_sync_cookies_background
        auto_update_ytdlp_background()
        auto_sync_cookies_background()
    except Exception:
        pass

    port = find_free_port(8779)
    server_thread = threading.Thread(
        target=start_server,
        args=(port,),
        daemon=True
    )
    server_thread.start()

    time.sleep(0.4)
    app_url = f"http://127.0.0.1:{port}/index.html"

    try:
        open_desktop_window(app_url)
    finally:
        from app.system import cleanup_system_resources
        cleanup_system_resources()


def safe_main():
    try:
        main()
    except Exception as e:
        import traceback
        log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "logs")
        os.makedirs(log_dir, exist_ok=True)
        crash_log = os.path.join(log_dir, "crash.log")
        with open(crash_log, "a", encoding="utf-8") as f:
            f.write(f"\n--- CRASH AT {time.strftime('%Y-%m-%d %H:%M:%S')} ---\n")
            traceback.print_exc(file=f)
        try:
            ctypes.windll.user32.MessageBoxW(
                0,
                f"Album Discovery App encountered an unexpected startup error:\n\n{e}\n\nPlease check data/logs/crash.log",
                "Album Discovery App",
                0x10
            )
        except Exception:
            pass
        sys.exit(1)


if __name__ == "__main__":
    safe_main()
