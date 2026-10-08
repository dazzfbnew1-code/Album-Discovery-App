# 💿 Album Discovery Studio

A lightning-fast, high-fidelity Windows music workstation, discography curator, and gap-analysis discovery engine. Search any artist, album, or song, stream in **320kbps Master Quality**, audit career discographies via canonical **MusicBrainz Release Groups**, shuffle your downloaded library with seamless DJ radio transitions, and batch-download studio discographies with embedded high-res cover art and ID3 metadata.

---

## 🎧 High-Fidelity Audio Architecture (320kbps vs 128kbps)

Most web streaming platforms compress audio down to **128kbps**, truncating high-frequency air above 16kHz and smearing bass transient impact.

Album Discovery Studio streams and downloads in **true 320kbps MP3 / AAC**:
- **Dynamic Low-End Punch**: Kick drums and sub-bass lines retain instantaneous attack and physical depth.
- **Pristine High-Frequency Detail**: Vocal breath, acoustic guitar transients, cymbals, and reverberation tails remain open and uncompressed.
- **Audiophile & Amplifier Ready**: Tuned for high-end studio monitors, headphones, and external power amplifiers (e.g., SPL-1500BT) with zero digital clipping.
- **Persistent Volume Normalization**: Remembers your preferred listening level across sessions to protect your ears and speakers.

---

## 🏛️ MusicBrainz Canonical Discography Engine

Streaming APIs frequently clutter studio album discographies with reissues, 20th-anniversary remasters, box sets, and live bootlegs. Album Discovery Studio solves this with a multi-layered canonical matching pipeline:

- **Canonical Release Group Binding**: Pins reissues and anniversary editions back to their original historical studio LP Release Group.
- **Diacritic & Accent Flattening**: NFKD Unicode normalization flattens special accents and non-standard typography (e.g., *Zenyattà Mondatta*, *Ágætis byrjun*, *Með suð í eyrum við spilum endalaust*) to prevent query drops.
- **Clean Variant Clustering**: Edition tags like `(2003 Remaster)`, `[Deluxe Edition]`, or `(Super Deluxe)` are cleaned prior to matching, collapsing reissue clones into the definitive studio album card.
- **Rigorous Category Segregation**: Automatically isolates:
  - 💿 **Studio Albums**: Mainline historical canon only.
  - 📦 **Compilations & Live**: Greatest hits, anthologies, box sets, and concert recordings.
  - ⚡ **EPs & Mini-Albums**: Short-form releases.
  - 🎵 **Singles & Drops**: Standalone tracks and promo drops.
- **Canonical Overrides & Whitelist**: Managed via [`data/canonical_overrides.json`](file:///c:/Users/daz93/OneDrive/Desktop/Album%20Discovery%20App/data/canonical_overrides.json) to accurately classify legitimate studio albums historically cataloged as soundtracks (e.g., Queen's *Flash Gordon*, Pink Floyd's *More*, The Beatles' *A Hard Day's Night*, *Help!*, *Yellow Submarine*, and *Magical Mystery Tour*).

---

## ⚡ Core Features & Superpowers

### 📻 1. Library DJ Radio (DJ Mix Engine)
- Zero-buffer continuous playback shuffling directly from your downloaded library files.
- **Smart Artist Spacing**: Automatically prevents back-to-back songs by the same artist for maximum station variety.
- **`🔀 Re-roll Mix`**: Re-seeds the queue with a fresh batch from your collection in one click.

### ⏳ 2. Time Machine Era Explorer
Travel through musical history with 100 landmark studio albums per era, backed by 200–300 album deep-harvest pools:
- **30s & 40s Swing & Big Band** • **50s Rock 'n' Roll** • **60s Psychedelic**
- **70s Rock & Disco** • **80s Synth & Pop** • **90s Golden Era**
- **2000s R&B & Nu-Metal** • **2010s EDM & Indie** • **2020s Current Wave**
- **Shuffle Era**: Jump instantly to a random historical decade.

### 🎸 3. Deep Genre Hubs & Interactive Multi-Page Navigation
- Explore deep collections across **Rap / Hip-Hop**, **Dance & EDM**, **Rock & Alt**, **R&B / Soul**, **Metal & Heavy**, **Electronic**, **Indie**, **Jazz & Blues**, and **Classical**.
- **Numbered Pagination Bar (`Page 1, Page 2, Page 3...`)**:
  - Unlocks access to the entire 300–400+ album deep catalog reserve pools per genre and era.
  - Features dedicated numbered page pills, ellipsis compression, and Previous / Next controls.
  - **Zero-Latency (0ms) Page Flips**: Browsing between pages happens instantaneously in memory with smooth top scrolling.
  - **Dynamic Page Size Control**: Switch effortlessly between `50`, `60`, `100`, or `All Albums` directly from the bottom bar.
  - **Live Range Summary**: Displays exact item counts (e.g. `Showing 1–50 of 402 albums • Page 1 of 9`).

### 🎲 4. Surprise Discovery Crate
- Dynamically blends 60 certified masterpieces across multiple genres and eras.
- Samples safely from cached catalog data with zero cache poisoning or truncation.

### 🎙️ 5. Dynamic Quick Artists
- Top sidebar displays 9 live-rotating chart artists dynamically discovered from Deezer's live graph.
- Includes a dedicated **`Shuffle`** button to fetch new live artists on demand.

### 🎤 6. Real-Time Synchronized Lyrics
- Click **`Lyrics`** in the player HUD for line-by-line real-time synchronized karaoke-style scrolling.
- Automatically queries and matches synchronized lyrics without littering your drive with `.lrc` files unless enabled.

### 💾 7. Local Library Gap Analysis & Live Ownership Tracking
- Scans your music directory and live-stamps albums with **`💾 In Library`** or **`⏳ Missing`**.
- Instant visual identification of missing studio discography gaps for any artist.

### 📥 8. Turbo Batch Downloader (Up to 10x Parallel Streams)
- **1-Click Batch Download**: Grab complete artist studio discographies with one click.
- **Parallel Stream Turbo Engine**: Configurable concurrency (1 to 10 simultaneous downloads).
- **Smart Resume**: Detects existing tracks in `0.1s` and skips them automatically without re-downloading.
- **Metadata Tagging**: Embeds high-res front cover art (APIC ID3v2.3), title, artist, album, year, and track numbering, plus saves standalone `cover.jpg`.

---

## 📁 Library Directory Hierarchy

Downloaded albums are saved in an organized folder structure optimized for Plex, Kodi, Navidrome, car stereos, and portable DAPs:

```
Your Music Folder/
└── Artist Name/
    └── Album Name (Year)/
        ├── cover.jpg
        ├── 01 - Track Title.mp3
        ├── 02 - Track Title.mp3
        └── ...
```

---

## ⌨️ Global Keyboard Shortcuts

| Shortcut | Function |
| :--- | :--- |
| <kbd>Space</kbd> | Toggle Play / Pause |
| <kbd>Ctrl</kbd> + <kbd>→</kbd> | Next Track |
| <kbd>Ctrl</kbd> + <kbd>←</kbd> | Previous Track |
| <kbd>→</kbd> | Seek forward 10 seconds |
| <kbd>←</kbd> | Seek backward 10 seconds |
| <kbd>Esc</kbd> | Close modals, drawers, or dialogs |

---

## 🛠️ System Requirements & Dependencies

The application relies on lightweight, focused third-party libraries:

```
pywebview>=5.0.0
mutagen>=1.47.0
yt-dlp>=2026.08.19
requests>=2.31.0
imageio-ffmpeg>=0.5.1
```

- **Python**: 3.10+ on Windows 10 / 11
- **yt-dlp**: Auto-updating & maintained (`>=2026.08.19`) with silent background updates on startup so extractors never break.
- **imageio-ffmpeg**: Provides standalone FFmpeg binaries automatically for audio transcoding without manual system PATH setup.

---

## 🚀 Quick Start Guide

1. Extract the application folder to any location on your PC.
2. Double-click **`START.bat`**:
   - Automatically checks and installs any missing dependencies from `requirements.txt`.
   - Creates a desktop shortcut with high-resolution application icon.
   - Launches the native workstation window.
3. On first run, choose your preferred download directory in the **First-Run Setup Wizard** (or configure anytime in **Settings ⚙️**).
4. Discover, explore, listen, and complete your music collection!
