"""Album Discovery App Desktop Launcher."""
import ctypes
import importlib
import os
import socket
import sys
import threading
import time

# Explicitly register Windows Taskbar AppUserModelID for custom icon grouping
try:
    myappid = "dazz.albumdiscovery.station.1.0"
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
except Exception:
    pass

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


def main():
    if focus_existing_instance(APP_WINDOW_TITLE):
        sys.exit(0)

    try:
        from app.downloader import auto_update_ytdlp_background
        auto_update_ytdlp_background()
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

    root_dir = os.path.dirname(os.path.abspath(__file__))
    icon_path = os.path.join(root_dir, "ui", "app_icon.ico")
    if not os.path.exists(icon_path):
        icon_path = os.path.join(root_dir, "ui", "favicon.ico")
        if not os.path.exists(icon_path):
            icon_path = None

    def apply_win32_window_icon(window_title: str, ico: str):
        """Force the native Win32 window and Windows Taskbar to display the custom icon instead of python.exe."""
        if os.name != "nt" or not ico or not os.path.exists(ico):
            return
        try:
            user32 = ctypes.windll.user32
            IMAGE_ICON = 1
            LR_LOADFROMFILE = 0x00000010
            LR_DEFAULTSIZE = 0x00000040
            WM_SETICON = 0x0080
            ICON_SMALL = 0
            ICON_BIG = 1
            for _ in range(50):
                hwnd = user32.FindWindowW(None, window_title)
                if hwnd:
                    h_big = user32.LoadImageW(None, ico, IMAGE_ICON, 0, 0, LR_LOADFROMFILE | LR_DEFAULTSIZE)
                    h_sm = user32.LoadImageW(None, ico, IMAGE_ICON, 16, 16, LR_LOADFROMFILE)
                    if h_big:
                        user32.SendMessageW(hwnd, WM_SETICON, ICON_BIG, h_big)
                    if h_sm:
                        user32.SendMessageW(hwnd, WM_SETICON, ICON_SMALL, h_sm)
                    break
                time.sleep(0.1)
        except Exception:
            pass

    if webview:
        win_title = APP_WINDOW_TITLE
        window = webview.create_window(
            title=win_title,
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
        if icon_path:
            threading.Thread(target=apply_win32_window_icon, args=(win_title, icon_path), daemon=True).start()
        webview.start(icon=icon_path, debug=False)
        from app.system import cleanup_system_resources
        cleanup_system_resources()
        os._exit(0)
    else:
        import webbrowser
        webbrowser.open(app_url)
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            from app.system import cleanup_system_resources
            cleanup_system_resources()
            sys.exit(0)


if __name__ == "__main__":
    main()
