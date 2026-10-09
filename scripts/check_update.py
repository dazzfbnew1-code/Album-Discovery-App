import os
import sys
import json
import time
import zipfile
import tempfile
import urllib.request
from pathlib import Path

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent

# Developer Safety Guard: Never auto-overwrite if active Git repository is present
if (WORKSPACE_ROOT / ".git").exists():
    sys.exit(0)

VERSION_FILE = WORKSPACE_ROOT / "data" / "commit_sha.txt"
REPO_API_URL = "https://api.github.com/repos/dazzfbnew1-code/Album-Discovery-App/commits/stable"
ZIP_URL = "https://github.com/dazzfbnew1-code/Album-Discovery-App/archive/refs/heads/stable.zip"


def get_local_sha() -> str:
    if VERSION_FILE.exists():
        try:
            return VERSION_FILE.read_text("utf-8").strip()
        except Exception:
            return ""
    return ""


def get_remote_sha() -> str:
    try:
        req = urllib.request.Request(
            REPO_API_URL,
            headers={
                "User-Agent": "AlbumDiscoveryApp-AutoUpdater",
                "Accept": "application/vnd.github.v3+json"
            }
        )
        with urllib.request.urlopen(req, timeout=3.5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("sha", "").strip()
    except Exception:
        return ""


def apply_update(remote_sha: str):
    print(" [*] New update detected! Downloading latest version...")
    try:
        with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp_f:
            tmp_path = Path(tmp_f.name)

        req = urllib.request.Request(
            ZIP_URL,
            headers={"User-Agent": "AlbumDiscoveryApp-AutoUpdater"}
        )
        with urllib.request.urlopen(req, timeout=25) as resp:
            with open(tmp_path, "wb") as out_f:
                out_f.write(resp.read())

        protected_prefixes = [
            "data/config.json",
            "data/cookies.txt",
            "data/logs",
            "data/cache",
            "Album Downloads"
        ]
        protected_suffixes = [".db", ".db-wal", ".db-shm", ".log"]

        with zipfile.ZipFile(tmp_path, "r") as zf:
            for member in zf.infolist():
                if member.is_dir():
                    continue
                parts = Path(member.filename).parts
                if len(parts) <= 1:
                    continue
                rel_parts = parts[1:]
                rel_str = "/".join(rel_parts)

                if any(rel_str == p or rel_str.startswith(p + "/") for p in protected_prefixes):
                    continue
                if any(rel_str.endswith(s) for s in protected_suffixes):
                    continue

                dest_file = WORKSPACE_ROOT.joinpath(*rel_parts)
                dest_file.parent.mkdir(parents=True, exist_ok=True)
                with zf.open(member) as src_f, open(dest_file, "wb") as dst_f:
                    dst_f.write(src_f.read())

        try:
            tmp_path.unlink()
        except Exception:
            pass

        VERSION_FILE.parent.mkdir(parents=True, exist_ok=True)
        VERSION_FILE.write_text(remote_sha, "utf-8")
        print(f" [SUCCESS] Successfully updated to latest version ({remote_sha[:7]})!")
        time.sleep(1)
    except Exception as e:
        print(f" [NOTICE] Auto-update skipped: {e}")


def main():
    remote_sha = get_remote_sha()
    if not remote_sha:
        return
    local_sha = get_local_sha()
    if not local_sha:
        VERSION_FILE.parent.mkdir(parents=True, exist_ok=True)
        VERSION_FILE.write_text(remote_sha, "utf-8")
        return
    if local_sha != remote_sha:
        apply_update(remote_sha)


if __name__ == "__main__":
    main()
