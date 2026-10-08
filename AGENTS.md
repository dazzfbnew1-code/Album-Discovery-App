# AGENTS.md — Workspace Focus & Operational Boundaries

## 🎯 Mandatory Workspace Constraint
- **Strict Active Workspace**: You are working **STRICTLY AND EXCLUSIVELY** on **Album Discovery App** located at `c:\Users\daz93\OneDrive\Desktop\Album Discovery App`.
- **Hard Isolation Boundary**: 
  - **NEVER** search, grep, view, read, modify, or reference files in other workspaces (such as `Nexus App`, `Plex Server Scanner`, or `tinyMediaManager`).
  - **NEVER** execute shell commands with working directories outside `c:\Users\daz93\OneDrive\Desktop\Album Discovery App`.
  - All user requests, prompts, questions, bug fixes, and feature additions apply solely to this codebase.

---

## 🏛️ Architecture Overview

The **Album Discovery App** is a standalone music curation, streaming, discovery, and gap-analysis workstation:

- **Frontend**: Vanilla HTML5, CSS3, and JavaScript located in `ui/` (`ui/index.html`, `ui/css/style.css`, `ui/js/app.js`).
- **Backend API Server**: High-speed native `ThreadedHTTPServer` in `app/server.py` and `main.py` (zero external framework overhead, multi-threaded request handling on port 8779).
- **Discography & Matching Engine**: `app/catalog.py`
  - Fetches artist releases from Deezer API (`https://api.deezer.com`).
  - Binds releases to official canonical **MusicBrainz Release Groups** via `app/musicbrainz.py`.
  - Strips diacritics / accents using NFKD ASCII normalization.
  - Cleans edition/remaster tags before canonical matching.
  - Clusters variant reissues (e.g. 2003 remasters) to their historical canonical studio LP Release Groups.
- **Canonical Overrides & Whitelist**: `data/canonical_overrides.json` & `app/overrides.py`
  - Whitelist exceptions for legitimate studio albums tagged as soundtracks or special editions (e.g. Queen's *Flash Gordon*, Pink Floyd's *More*, The Beatles' *A Hard Day's Night*, *Help!*, *Yellow Submarine*, *Magical Mystery Tour*).
  - Compilation title blacklists and custom metadata overrides.
- **Library Scanning & Gap Analysis**: `app/library.py` (in-memory hash indexing `OWNED_ALBUMS` and `OWNED_BY_ARTIST` for 0ms lookups; background disk scanning of configured music roots).
- **Download & Tagging Pipeline**: `app/downloader.py` (concurrent yt-dlp + FFmpeg multi-stream extraction) and `app/tagger.py` (Mutagen ID3/FLAC tagging with embedded cover art).
- **Database & Persistent Caching**: `app/db.py` (SQLite WAL mode database in `data/discovery.db`).
- **Process & Engine Telemetry**: `app/monitor.py` (isolated PID resource tracking, RAM trimming, live activity event deque).

---

## 📌 Architectural Maintenance Note (Frontend Stability & Code Size)
- **Current Architecture**: `ui/js/app.js` is deliberately maintained as a high-performance single-file vanilla JavaScript application (~3.8k lines, 160 KB). It loads into webview in ~2ms with zero import race conditions or circular dependencies across player, download queue, gap radar, and discovery views.
- **Legacy Stubs Note**: The `ui/js/modules/` directory contains inactive early prototype stubs from v1. The active, production frontend engine is strictly `ui/js/app.js`.
- **Trigger & Modularization Strategy**: If `ui/js/app.js` becomes unruly or exceeds ~5,500+ lines, follow a structured modularization plan:
  1. `ui/js/modules/player.js` (Audio engine, scrubber, lyrics sync, shortcuts).
  2. `ui/js/modules/downloader.js` (Queue management, batch downloader, thread trackers).
  3. `ui/js/modules/telemetry.js` (Hardware gauges, memory trimming, console log stream).
  4. `ui/js/modules/library.js` (Drive configuration, disk scans, deletion handlers).
  5. `ui/js/modules/discovery.js` (Catalog pagination, filters, gap radar, cards renderer).
  - Use a centralized lightweight event bus (`window.AppBus`) to coordinate state cleanly without circular import locks.
