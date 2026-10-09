/* =============================================================================
   ALBUM DISCOVERY STATION — FRONTEND CONTROLLER (VANILLA JS ENGINE)
   Architecture Note: Currently maintained as a single 160KB high-performance bundle.
   Loads in ~2ms with zero import race conditions across Audio, Telemetry & Queue.
   If this file exceeds ~5,500 lines or becomes difficult to maintain, follow the 
   modularization blueprint outlined in AGENTS.md (modules/player, downloader, etc.).
   ============================================================================= */
document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const omniSearchInput = document.getElementById("omniSearchInput");
  const searchClearBtn = document.getElementById("searchClearBtn");
  const albumsGrid = document.getElementById("albumsGrid");
  const viewSectionTitle = document.getElementById("viewSectionTitle");
  const viewSectionCount = document.getElementById("viewSectionCount");
  const loadingIndicator = document.getElementById("loadingIndicator");
  const emptyIndicator = document.getElementById("emptyIndicator");
  const btnRefreshView = document.getElementById("btnRefreshView");
  const btnShuffleEra = document.getElementById("btnShuffleEra");
  const btnShuffleGenre = document.getElementById("btnShuffleGenre");
  const discographyCategoryPills = document.getElementById("discographyCategoryPills");
  const catPillBtns = document.querySelectorAll(".cat-pill");
  const librarySearchWrap = document.getElementById("librarySearchWrap");
  const librarySearchInput = document.getElementById("librarySearchInput");
  const librarySearchClearBtn = document.getElementById("librarySearchClearBtn");

  // Modal Elements
  const albumModal = document.getElementById("albumModal");
  const modalCloseBtn = document.getElementById("modalCloseBtn");
  const modalCoverArt = document.getElementById("modalCoverArt");
  const modalTypeBadge = document.getElementById("modalTypeBadge");
  const modalAlbumTitle = document.getElementById("modalAlbumTitle");
  const modalArtistName = document.getElementById("modalArtistName");
  const modalYearBadge = document.getElementById("modalYearBadge");
  const modalTracksCount = document.getElementById("modalTracksCount");
  const modalGenreBadge = document.getElementById("modalGenreBadge");
  const modalLabelBadge = document.getElementById("modalLabelBadge");
  const modalBarcodeBadge = document.getElementById("modalBarcodeBadge");
  const modalTracklist = document.getElementById("modalTracklist");
  const modalPlayFullAlbumBtn = document.getElementById("modalPlayFullAlbumBtn");
  const modalLyricsHeaderBtn = document.getElementById("modalLyricsHeaderBtn");
  const modalStartFlowBtn = document.getElementById("modalStartFlowBtn");
  const modalDownloadAlbumBtn = document.getElementById("modalDownloadAlbumBtn");
  const modalDownloadBtnText = document.getElementById("modalDownloadBtnText");
  const modalTracklistTabCount = document.getElementById("modalTracklistTabCount");

  // Modal Tabs & Panes
  const modalTabBtns = document.querySelectorAll(".modal-tab-btn");
  const modalPaneTracks = document.getElementById("modalPaneTracks");
  const modalPaneLyrics = document.getElementById("modalPaneLyrics");
  const modalPaneStory = document.getElementById("modalPaneStory");
  const modalPaneSimilar = document.getElementById("modalPaneSimilar");
  const lyricsTrackTitle = document.getElementById("lyricsTrackTitle");
  const modalLyricsBody = document.getElementById("modalLyricsBody");
  const btnRefreshLyrics = document.getElementById("btnRefreshLyrics");
  const storyLabelVal = document.getElementById("storyLabelVal");
  const storyYearVal = document.getElementById("storyYearVal");
  const storyUpcVal = document.getElementById("storyUpcVal");
  const storyTracksVal = document.getElementById("storyTracksVal");
  const modalBackstoryText = document.getElementById("modalBackstoryText");
  const modalSimilarGrid = document.getElementById("modalSimilarGrid");

  // Stealth Smart Floating Island Player Elements
  const smartHud = document.getElementById("smartPlayerHud");
  const playerCoverImg = document.getElementById("playerCoverImg");
  const playerTrackTitle = document.getElementById("playerTrackTitle");
  const playerArtistName = document.getElementById("playerArtistName");
  const hudAlbumTitle = document.getElementById("hudAlbumTitle");
  const playerBadge = hudAlbumTitle;
  const currentTimeLabel = document.getElementById("currentTimeLabel");
  const durationTimeLabel = document.getElementById("durationTimeLabel");
  const playerScrubBar = document.getElementById("playerScrubBar");
  const playerScrubFill = document.getElementById("playerScrubFill");
  const playPauseBtn = document.getElementById("playPauseBtn");
  const hudPlayIcon = document.getElementById("hudPlayIcon");
  const hudPauseIcon = document.getElementById("hudPauseIcon");
  const stopBtn = document.getElementById("stopBtn");
  const prevTrackBtn = document.getElementById("prevTrackBtn");
  const nextTrackBtn = document.getElementById("nextTrackBtn");
  const playerVolumeSlider = document.getElementById("playerVolumeSlider");
  const playerVolumeLabel = document.getElementById("playerVolumeLabel");
  const hudLyricsBtn = document.getElementById("hudLyricsBtn");
  const hudDismissBtn = document.getElementById("hudDismissBtn");
  const deckA = document.getElementById("globalAudioPlayer");
  const deckB = document.getElementById("standbyAudioPlayer") || (function() {
    const el = document.createElement("audio");
    el.id = "standbyAudioPlayer";
    el.preload = "none";
    document.body.appendChild(el);
    return el;
  })();
  let activeDeck = deckA;
  let standbyDeck = deckB;

  // Transparent audio proxy routing all operations to the active playback deck
  const audio = new Proxy({}, {
    get(_, prop) {
      const target = activeDeck;
      const val = target[prop];
      if (typeof val === "function") {
        return val.bind(target);
      }
      return val;
    },
    set(_, prop, value) {
      activeDeck[prop] = value;
      return true;
    }
  });
  const btnHeaderPlayerToggle = document.getElementById("btnHeaderPlayerToggle");
  const navLibraryRadio = document.getElementById("navLibraryRadio");
  const btnLibraryRadioLaunch = document.getElementById("btnLibraryRadioLaunch");
  const hudRerollRadioBtn = document.getElementById("hudRerollRadioBtn");
  const playerDockPill = document.getElementById("playerDockPill");
  const dockPillCover = document.getElementById("dockPillCover");
  const dockPillEq = document.getElementById("dockPillEq");
  const dockPillTitle = document.getElementById("dockPillTitle");
  const dockPillArtist = document.getElementById("dockPillArtist");
  const dockPillPlayPauseBtn = document.getElementById("dockPillPlayPauseBtn");
  const dockPillPlayIcon = document.getElementById("dockPillPlayIcon");
  const dockPillPauseIcon = document.getElementById("dockPillPauseIcon");
  const dockPillLyricsBtn = document.getElementById("dockPillLyricsBtn");
  const dockPillRerollBtn = document.getElementById("dockPillRerollBtn");
  const dockPillExpandBtn = document.getElementById("dockPillExpandBtn");
  const dockPillStopBtn = document.getElementById("dockPillStopBtn");

  // App Resource & Activity Monitor Elements
  const btnAppMonitorToggle = document.getElementById("btnAppMonitorToggle");
  const hdrMonitorCpu = document.getElementById("hdrMonitorCpu");
  const hdrMonitorRam = document.getElementById("hdrMonitorRam");
  const appMonitorModal = document.getElementById("appMonitorModal");
  const appMonitorCloseBtn = document.getElementById("appMonitorCloseBtn");
  const btnMonClose = document.getElementById("btnMonClose");
  const btnMonTrimMemory = document.getElementById("btnMonTrimMemory");
  const btnMonRescanLibrary = document.getElementById("btnMonRescanLibrary");
  const monValPid = document.getElementById("monValPid");
  const monValUptime = document.getElementById("monValUptime");
  const monMetricCpu = document.getElementById("monMetricCpu");
  const monBarCpu = document.getElementById("monBarCpu");
  const monCpuHint = document.getElementById("monCpuHint");
  const monMetricRam = document.getElementById("monMetricRam");
  const monBarRam = document.getElementById("monBarRam");
  const monRamHint = document.getElementById("monRamHint");
  const monMetricThreads = document.getElementById("monMetricThreads");
  const monBarThreads = document.getElementById("monBarThreads");
  const monMetricChildren = document.getElementById("monMetricChildren");
  const monBarChildren = document.getElementById("monBarChildren");
  const monChildrenHint = document.getElementById("monChildrenHint");
  const monDlStatusBadge = document.getElementById("monDlStatusBadge");
  const monDlBody = document.getElementById("monDlBody");
  const monLibCount = document.getElementById("monLibCount");
  const monLibPath = document.getElementById("monLibPath");
  const monDbName = document.getElementById("monDbName");
  const monDbSize = document.getElementById("monDbSize");
  const monLogConsole = document.getElementById("monLogConsole");
  const btnMonClearConsole = document.getElementById("btnMonClearConsole");

  // Settings & Queue
  const btnSettingsToggle = document.getElementById("btnSettingsToggle");
  const settingsModal = document.getElementById("settingsModal");
  const settingsCloseBtn = document.getElementById("settingsCloseBtn");
  const btnSaveSettings = document.getElementById("btnSaveSettings");
  const settingQualitySelect = document.getElementById("settingQualitySelect");
  const settingMusicRoot = document.getElementById("settingMusicRoot");
  const btnAddMusicDriveBtn = document.getElementById("btnAddMusicDriveBtn");
  const drivesListContainer = document.getElementById("drivesListContainer");
  const settingFolderStructure = document.getElementById("settingFolderStructure");
  const settingConcurrencySelect = document.getElementById("settingConcurrencySelect");
  const settingSaveLrc = document.getElementById("settingSaveLrc");
  const settingEmbedCover = document.getElementById("settingEmbedCover");
  const settingSaveCoverJpg = document.getElementById("settingSaveCoverJpg");
  const settingCrossfade = document.getElementById("settingCrossfade");
  const btnRescanLibraryNow = document.getElementById("btnRescanLibraryNow");
  const btnBackfillCoversNow = document.getElementById("btnBackfillCoversNow");
  const settingAutoRescan = document.getElementById("settingAutoRescan");
  const settingCrossfadeDuration = document.getElementById("settingCrossfadeDuration");
  const settingRadioBatchSize = document.getElementById("settingRadioBatchSize");
  const settingStartupView = document.getElementById("settingStartupView");
  const settingRadioArtistSpacing = document.getElementById("settingRadioArtistSpacing");
  const settingDefaultDiscographyFilter = document.getElementById("settingDefaultDiscographyFilter");
  const settingAutoOpenLyrics = document.getElementById("settingAutoOpenLyrics");
  const settingTrackToasts = document.getElementById("settingTrackToasts");
  const settingFilterJunk = document.getElementById("settingFilterJunk");
  const settingAutoAdvance = document.getElementById("settingAutoAdvance");
  const settingDiscoveryLimit = document.getElementById("settingDiscoveryLimit");
  const btnOpenDownloadsFolder = document.getElementById("btnOpenDownloadsFolder");
  const btnQueueToggle = document.getElementById("btnQueueToggle");
  const queueDrawer = document.getElementById("queueDrawer");

  // Onboarding Wizard Elements
  const firstRunModal = document.getElementById("firstRunModal");
  const wizardMusicRoot = document.getElementById("wizardMusicRoot");
  const btnWizardBrowseRoot = document.getElementById("btnWizardBrowseRoot");
  const wizardQualitySelect = document.getElementById("wizardQualitySelect");
  const wizardFilterJunk = document.getElementById("wizardFilterJunk");
  const wizardAutoAdvance = document.getElementById("wizardAutoAdvance");
  const btnWizardFinish = document.getElementById("btnWizardFinish");
  const queueCloseBtn = document.getElementById("queueCloseBtn");
  const queueListBody = document.getElementById("queueListBody");
  const queueBadge = document.getElementById("queueBadge");
  const btnClearQueueHistory = document.getElementById("btnClearQueueHistory");
  const btnClearActiveQueue = document.getElementById("btnClearActiveQueue");
  const toastContainer = document.getElementById("appToastContainer");

  // Batch Download Elements
  const btnBatchDownload = document.getElementById("btnBatchDownload");
  const btnBatchDownloadText = document.getElementById("btnBatchDownloadText");
  const batchDownloadModal = document.getElementById("batchDownloadModal");
  const batchModalCloseBtn = document.getElementById("batchModalCloseBtn");
  const btnCancelBatch = document.getElementById("btnCancelBatch");
  const btnConfirmBatch = document.getElementById("btnConfirmBatch");
  const btnConfirmBatchText = document.getElementById("btnConfirmBatchText");
  const batchSelectAllCheckbox = document.getElementById("batchSelectAllCheckbox");
  const batchSelectAllText = document.getElementById("batchSelectAllText");
  const batchTotalTracksSummary = document.getElementById("batchTotalTracksSummary");
  const batchAlbumsList = document.getElementById("batchAlbumsList");
  const batchModalHeading = document.getElementById("batchModalHeading");
  const batchModalSubheading = document.getElementById("batchModalSubheading");

  // Pagination Elements & State
  const paginationBar = document.getElementById("paginationBar");
  const paginationSummary = document.getElementById("paginationSummary");
  const paginationNumbers = document.getElementById("paginationNumbers");
  const btnPrevPage = document.getElementById("btnPrevPage");
  const btnNextPage = document.getElementById("btnNextPage");
  const selectPageSize = document.getElementById("selectPageSize");

  let currentPage = 1;
  let currentPageSize = 50;
  let currentFullCollection = [];

  // 🎯 Discography Gap Radar Elements
  const artistGapBanner = document.getElementById("artistGapBanner");
  const gapBannerArtist = document.getElementById("gapBannerArtist");
  const gapStatusPill = document.getElementById("gapStatusPill");
  const gapProgressBar = document.getElementById("gapProgressBar");
  const gapBannerSubtext = document.getElementById("gapBannerSubtext");
  const btnCompleteCollection = document.getElementById("btnCompleteCollection");
  const btnCompleteCollectionText = document.getElementById("btnCompleteCollectionText");
  let currentArtistGapData = null;

  // State & Caching
  let currentGenre = "all";
  let currentViewType = "genre"; // 'genre' | 'special' | 'artist' | 'flow'
  let searchDebounceTimer = null;
  let activeSearchAbortController = null;
  let currentSearchSequenceId = 0;
  let currentAlbumDetails = null;
  let currentTracklist = [];
  let currentTrackIndex = -1;
  let isPlaying = false;
  let isFullAlbumMode = false;
  let isLibraryRadioMode = false;
  let isFetchingMoreRadioTracks = false;
  let configData = {};
  let currentArtistDiscography = null;
  let currentCategoryFilter = "all";
  let currentDisplayedAlbums = [];
  let localLibraryAlbums = [];

  // Instant Tab & Query In-Memory Caches
  const TAB_ALBUMS_CACHE = new Map();
  const SEARCH_CACHE = new Map();
  const ALBUM_MODAL_CACHE = new Map();

  const ERA_TITLES = {
    "all": "🔥 Official Top 100 Studio Albums",
    "top_singles": "⚡ Official Top 100 Singles & Hits",
    "pop": "✨ Trending Pop & Hot Hits",
    "30s_40s": "🎺 30s & 40s Swing & Big Band Masters",
    "50s": "🎙️ 50s Rock 'n' Roll & Golden Era",
    "60s": "🎸 60s Psychedelic & Classic Rock",
    "70s": "🕺 70s Classic Rock, Funk & Disco",
    "80s": "📼 80s Synthwave & New Wave",
    "90s": "📻 90s Grunge & Golden Era Hip-Hop",
    "2000s": "💿 2000s R&B, Nu-Metal & Pop",
    "2010s": "🎧 2010s Modern EDM & Indie",
    "2020s": "✨ 2020s Current Wave & Trending",
    "rap": "🎤 Rap & Hip-Hop Essentials",
    "dance": "🎧 Dance & Electronic Anthems",
    "rock": "🎸 Rock & Alternative Classics",
    "rnb": "🎷 R&B & Soul Masterpieces",
    "metal": "⚡ Heavy Metal & Hard Rock",
    "electronic": "🎹 Ambient & Electronic Gems",
    "indie": "🌿 Indie & Alternative Hits",
    "jazz": "🎺 Jazz & Blues Heritage",
    "classical": "🎻 Classical & Cinematic Masters"
  };

  window.FALLBACK_COVER_SVG = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSczMDAnIGhlaWdodD0nMzAwJyB2aWV3Qm94PScwIDAgMzAwIDMwMCc+PHJlY3Qgd2lkdGg9JzMwMCcgaGVpZ2h0PSczMDAnIGZpbGw9JyMxMDE1MjQnLz48Y2lyY2xlIGN4PScxNTAnIGN5PScxNTAnIHI9JzEwMCcgZmlsbD0nIzBiMGUxOCcgc3Ryb2tlPScjOGI1Y2Y2JyBzdHJva2Utd2lkdGg9JzYnLz48Y2lyY2xlIGN4PScxNTAnIGN5PScxNTAnIHI9JzM2JyBmaWxsPScjOGI1Y2Y2Jy8+PGNpcmNsZSBjeD0nMTUwJyBjeT0nMTUwJyByPScxMicgZmlsbD0nIzEwMTUyNCcvPjwvc3ZnPg==';

  // Helper: Escape HTML to prevent broken tags or attribute injection
  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Helper: Toast Notifications
  function showToast(message, type = "info") {
    if (!toastContainer) return;
    const toast = document.createElement("div");
    toast.className = `app-toast ${type}`;
    const icon = type === "success" ? "✓" : (type === "error" ? "⚠️" : (type === "flow" ? "🌊" : "🎵"));
    toast.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <span class="toast-msg">${message}</span>
    `;
    toastContainer.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 400);
    }, 3200);
  }

  function formatTime(sec) {
    if (!sec || isNaN(sec)) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  // Master Volume & Audio Deck State
  let masterVolume = 1.0;
  const savedVol = localStorage.getItem("discovery_player_vol");
  if (savedVol !== null) {
    const v = parseFloat(savedVol);
    if (!isNaN(v)) masterVolume = Math.max(0, Math.min(1, v));
  }
  deckA.volume = masterVolume;
  deckB.volume = masterVolume;
  if (playerVolumeSlider) playerVolumeSlider.value = masterVolume;
  if (playerVolumeLabel) playerVolumeLabel.textContent = `${Math.round(masterVolume * 100)}%`;

  let isCrossfading = false;
  let crossfadeInterval = null;
  let preloadedTrackIndex = -1;

  function cancelCrossfade() {
    if (crossfadeInterval) {
      clearInterval(crossfadeInterval);
      crossfadeInterval = null;
    }
    isCrossfading = false;
  }

  // =========================================================================
  // 1. SMART PLAYER & AUDIO ENGINE (DUAL-DECK GAPLESS & DJ CROSSFADE)
  // =========================================================================
  function showPlayerHud() {
    smartHud.classList.remove("stealth");
    if (playerDockPill) playerDockPill.classList.add("hidden");
    if (btnHeaderPlayerToggle) btnHeaderPlayerToggle.classList.add("active");
  }

  function minimizePlayerHud() {
    smartHud.classList.add("stealth");
    if (btnHeaderPlayerToggle) btnHeaderPlayerToggle.classList.remove("active");
    // Show mini dock pill if music is loaded or active
    if (activeDeck.src || isPlaying || (currentTracklist && currentTracklist.length > 0)) {
      if (playerDockPill) playerDockPill.classList.remove("hidden");
    }
  }

  function stopPlayerHud() {
    cancelCrossfade();
    smartHud.classList.add("stealth");
    if (playerDockPill) playerDockPill.classList.add("hidden");
    if (btnHeaderPlayerToggle) btnHeaderPlayerToggle.classList.remove("active");
    activeDeck.pause();
    activeDeck.src = "";
    standbyDeck.pause();
    standbyDeck.src = "";
    isPlaying = false;
    updatePlayPauseState(false);
    highlightActiveTrack();
  }

  function togglePlayerHud() {
    if (smartHud.classList.contains("stealth")) {
      showPlayerHud();
    } else {
      minimizePlayerHud();
    }
  }

  function getTrackPlayUrl(track) {
    if (!track) return "";
    if (track.local_path || track.is_local) {
      return track.local_path 
        ? `/api/local-file?path=${encodeURIComponent(track.local_path)}`
        : (track.stream_url || track.preview || "");
    }
    const artist = track.artist || (currentAlbumDetails && currentAlbumDetails.artist) || "Unknown Artist";
    if (isFullAlbumMode) {
      return `/api/stream/proxy?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(track.title)}`;
    }
    return track.preview || "";
  }

  function preloadNextTrack() {
    if (!currentTracklist || currentTrackIndex < 0 || currentTrackIndex + 1 >= currentTracklist.length) return;
    const nextIndex = currentTrackIndex + 1;
    const nextTrack = currentTracklist[nextIndex];
    if (!nextTrack) return;
    const nextUrl = getTrackPlayUrl(nextTrack);
    if (!nextUrl) return;

    if (standbyDeck.src !== nextUrl && !standbyDeck.src.endsWith(encodeURIComponent(nextTrack.local_path || ""))) {
      standbyDeck.src = nextUrl;
      standbyDeck.preload = "auto";
      standbyDeck.load();
      standbyDeck.volume = 0;
    }
    preloadedTrackIndex = nextIndex;

    // In DJ Radio mode, auto-fetch upcoming batch when approaching end of queue
    if (isLibraryRadioMode && currentTrackIndex >= currentTracklist.length - 4 && !isFetchingMoreRadioTracks) {
      fetchMoreRadioTracks();
    }
  }

  // Lyrics Engine State
  let currentLyrics = null;
  let parsedSyncedLyrics = [];

  function parseLrc(lrcText) {
    if (!lrcText) return [];
    const lines = lrcText.split("\n");
    const result = [];
    const timeReg = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
    for (const line of lines) {
      const match = timeReg.exec(line);
      if (match) {
        const min = parseInt(match[1], 10);
        const sec = parseInt(match[2], 10);
        const ms = parseFloat("0." + match[3]);
        const time = min * 60 + sec + ms;
        const text = line.replace(timeReg, "").trim();
        if (text) {
          result.push({ time, text });
        }
      }
    }
    return result;
  }

  async function loadTrackLyrics(artist, title, album = "", duration = 0) {
    if (!lyricsTrackTitle || !modalLyricsBody) return;
    lyricsTrackTitle.textContent = `${artist} — ${title}`;
    modalLyricsBody.innerHTML = "<div class='lyrics-placeholder'>Fetching verified lyrics...</div>";
    
    try {
      const url = `/api/lyrics?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}&album=${encodeURIComponent(album)}&duration=${encodeURIComponent(duration)}`;
      const res = await fetch(url);
      const data = await res.json();
      currentLyrics = data;

      if (data.synced) {
        parsedSyncedLyrics = parseLrc(data.synced);
        modalLyricsBody.innerHTML = parsedSyncedLyrics.map((line, idx) => `
          <div class="synced-line" data-idx="${idx}" data-time="${line.time}">${line.text}</div>
        `).join("");

        // Click to seek to lyric line
        modalLyricsBody.querySelectorAll(".synced-line").forEach(el => {
          el.addEventListener("click", () => {
            const t = parseFloat(el.getAttribute("data-time"));
            if (!isNaN(t)) {
              cancelCrossfade();
              activeDeck.currentTime = t;
              if (activeDeck.paused) activeDeck.play();
            }
          });
        });
      } else if (data.plain) {
        parsedSyncedLyrics = [];
        modalLyricsBody.textContent = data.plain;
      } else {
        parsedSyncedLyrics = [];
        modalLyricsBody.innerHTML = "<div class='lyrics-placeholder'>No lyrics found for this track.</div>";
      }
    } catch (e) {
      modalLyricsBody.innerHTML = "<div class='lyrics-placeholder'>Failed to load lyrics.</div>";
    }
  }

  function syncLyricsToTime(curTime) {
    if (parsedSyncedLyrics.length > 0 && modalLyricsBody) {
      let activeIdx = -1;
      for (let i = 0; i < parsedSyncedLyrics.length; i++) {
        if (curTime >= parsedSyncedLyrics[i].time) {
          activeIdx = i;
        } else {
          break;
        }
      }
      if (activeIdx >= 0) {
        const lines = modalLyricsBody.querySelectorAll(".synced-line");
        lines.forEach((l, idx) => {
          if (idx === activeIdx) {
            if (!l.classList.contains("active")) {
              l.classList.add("active");
              l.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          } else {
            l.classList.remove("active");
          }
        });
      }
    }
  }

  if (btnRefreshLyrics) {
    btnRefreshLyrics.addEventListener("click", () => {
      if (currentTracklist && currentTrackIndex >= 0 && currentTracklist[currentTrackIndex]) {
        const tr = currentTracklist[currentTrackIndex];
        const art = tr.artist || (currentAlbumDetails && currentAlbumDetails.artist) || "";
        const alb = currentAlbumDetails ? currentAlbumDetails.title : "";
        loadTrackLyrics(art, tr.title, alb, tr.duration);
      }
    });
  }

  function updatePlayerTrackUi(track, index) {
    const artist = track.artist || (currentAlbumDetails && currentAlbumDetails.artist) || "Unknown Artist";
    const albumTitle = isLibraryRadioMode ? (track.album || "Library DJ Radio") : (currentAlbumDetails ? currentAlbumDetails.title : "Album Discovery");
    const coverArt = (track.cover_big || track.cover_small || (currentAlbumDetails && (currentAlbumDetails.cover_big || currentAlbumDetails.cover_small))) || window.FALLBACK_COVER_SVG;

    showPlayerHud();
    playerCoverImg.src = coverArt;
    playerArtistName.textContent = `${artist} — ${albumTitle}`;
    playerArtistName.title = `${artist} — ${albumTitle}`;
    playerTrackTitle.textContent = `${track.title}`;
    playerTrackTitle.title = track.title;
    currentTimeLabel.textContent = formatTime(0);
    playerScrubFill.style.width = "0%";
    durationTimeLabel.textContent = isFullAlbumMode ? (track.duration ? formatTime(track.duration) : "0:00") : "0:30";
    
    // Sync Mini Dock Pill
    if (dockPillCover) dockPillCover.src = coverArt;
    if (dockPillTitle) {
      dockPillTitle.textContent = track.title;
      dockPillTitle.title = track.title;
    }
    if (dockPillArtist) {
      dockPillArtist.textContent = `${artist} — ${albumTitle}`;
      dockPillArtist.title = `${artist} — ${albumTitle}`;
    }

    // Sync Re-roll DJ Mix buttons
    if (hudRerollRadioBtn) hudRerollRadioBtn.classList.toggle("hidden", !isLibraryRadioMode);
    if (dockPillRerollBtn) dockPillRerollBtn.classList.toggle("hidden", !isLibraryRadioMode);

    highlightActiveTrack();
    updateMediaSession(track, artist, albumTitle, coverArt);

    // Fetch and sync lyrics in background
    loadTrackLyrics(artist, track.title, albumTitle, track.duration);

    // Show toast notification if enabled
    if (configData && configData.show_track_toasts !== false && !isLibraryRadioMode) {
      showToast(`▶ Now Playing: "${track.title}" • ${artist}`, "info");
    }

    // Auto-open live scrolling lyrics if enabled
    if (configData && configData.auto_open_lyrics) {
      openLyricsForCurrentTrack();
    }

    // Update Player Badge
    if (isLibraryRadioMode) {
      playerBadge.textContent = `📻 Library DJ Radio (${index + 1}/${currentTracklist.length})`;
      hudAlbumTitle.textContent = "📻 LIBRARY RADIO (LIVE DJ MIX)";
    } else if (track.local_path || track.is_local) {
      playerBadge.textContent = `💾 Local Master (${index + 1}/${currentTracklist.length})`;
    } else if (isFullAlbumMode) {
      playerBadge.textContent = `💿 Full Studio (${index + 1}/${currentTracklist.length})`;
    } else {
      playerBadge.textContent = `⚡ 30s Audition (${index + 1}/${currentTracklist.length})`;
    }
  }

  function triggerSeamlessTransition(crossfadeSec) {
    if (isCrossfading) return;
    const nextIndex = currentTrackIndex + 1;
    if (!currentTracklist || nextIndex >= currentTracklist.length) return;

    const nextTrack = currentTracklist[nextIndex];
    const nextUrl = getTrackPlayUrl(nextTrack);
    if (!nextUrl) return;

    isCrossfading = true;

    // Ensure standbyDeck has the correct source
    if (standbyDeck.src !== nextUrl && !standbyDeck.src.endsWith(encodeURIComponent(nextTrack.local_path || ""))) {
      standbyDeck.src = nextUrl;
      standbyDeck.load();
    }

    const outgoingDeck = activeDeck;
    const incomingDeck = standbyDeck;

    incomingDeck.currentTime = 0;
    incomingDeck.volume = (crossfadeSec > 0.3) ? 0 : masterVolume;

    const playPromise = incomingDeck.play();
    if (!playPromise) {
      isCrossfading = false;
      return;
    }

    playPromise.then(() => {
      // Incoming deck is playing! Shift active controls and UI immediately
      activeDeck = incomingDeck;
      standbyDeck = outgoingDeck;
      currentTrackIndex = nextIndex;
      updatePlayerTrackUi(nextTrack, nextIndex);
      updatePlayPauseState(true);

      if (crossfadeSec <= 0.3) {
        // Gapless instantaneous handoff (zero silent gap)
        outgoingDeck.pause();
        outgoingDeck.currentTime = 0;
        outgoingDeck.volume = masterVolume;
        activeDeck.volume = masterVolume;
        isCrossfading = false;
        preloadNextTrack();
        return;
      }

      // Smooth equal-power DJ crossfade
      const fadeMs = crossfadeSec * 1000;
      const stepMs = 40;
      const totalSteps = Math.max(1, Math.round(fadeMs / stepMs));
      let currentStep = 0;

      if (crossfadeInterval) clearInterval(crossfadeInterval);
      crossfadeInterval = setInterval(() => {
        currentStep++;
        const progress = Math.min(1, currentStep / totalSteps);

        // Equal-power curve prevents mid-transition audio dip
        const outVol = masterVolume * Math.cos(progress * 0.5 * Math.PI);
        const inVol = masterVolume * Math.sin(progress * 0.5 * Math.PI);

        if (!outgoingDeck.paused) {
          outgoingDeck.volume = Math.max(0, Math.min(masterVolume, outVol));
        }
        activeDeck.volume = Math.max(0, Math.min(masterVolume, inVol));

        if (progress >= 1) {
          clearInterval(crossfadeInterval);
          crossfadeInterval = null;
          outgoingDeck.pause();
          outgoingDeck.currentTime = 0;
          outgoingDeck.volume = masterVolume;
          activeDeck.volume = masterVolume;
          isCrossfading = false;
          preloadNextTrack();
        }
      }, stepMs);
    }).catch(err => {
      console.warn("Seamless transition playback failed, falling back:", err);
      isCrossfading = false;
    });
  }

  async function playTrackAtIndex(index, fullAlbum = false, startTime = 0) {
    if (!currentTracklist || index < 0 || index >= currentTracklist.length) return;
    
    cancelCrossfade();
    currentTrackIndex = index;
    isFullAlbumMode = fullAlbum;
    const track = currentTracklist[index];
    const targetUrl = getTrackPlayUrl(track);

    updatePlayerTrackUi(track, index);

    // If standbyDeck already has this track buffered, switch instantly with 0ms delay!
    if (standbyDeck.src && (standbyDeck.src === targetUrl || standbyDeck.src.endsWith(encodeURIComponent(track.local_path || "")))) {
      activeDeck.pause();
      activeDeck.currentTime = 0;
      const temp = activeDeck;
      activeDeck = standbyDeck;
      standbyDeck = temp;
      activeDeck.volume = masterVolume;
      if (startTime > 0) activeDeck.currentTime = startTime;
      activeDeck.play().then(() => {
        isPlaying = true;
        updatePlayPauseState(true);
        preloadNextTrack();
      }).catch(err => {
        console.warn("Preloaded deck play failed, reloading direct:", err);
        startDeckDirect(targetUrl, startTime, track);
      });
      return;
    }

    startDeckDirect(targetUrl, startTime, track);
  }

  function startDeckDirect(url, startTime, track) {
    standbyDeck.pause();
    activeDeck.pause();
    activeDeck.src = url;
    activeDeck.load();
    activeDeck.volume = masterVolume;
    if (startTime > 0) activeDeck.currentTime = startTime;
    activeDeck.play().then(() => {
      isPlaying = true;
      updatePlayPauseState(true);
      preloadNextTrack();
    }).catch(err => {
      console.error("Direct audio playback failed:", err);
      if (!track.local_path && !track.is_local && track.preview) {
        fallbackToPreview(track, startTime);
      }
    });
  }

  function updateMediaSession(track, artist, albumTitle, coverArt) {
    if ("mediaSession" in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title || "Track",
          artist: artist,
          album: albumTitle,
          artwork: coverArt ? [{ src: coverArt, sizes: "512x512", type: "image/jpeg" }] : []
        });
        navigator.mediaSession.setActionHandler("play", () => togglePlayPause());
        navigator.mediaSession.setActionHandler("pause", () => togglePlayPause());
        navigator.mediaSession.setActionHandler("previoustrack", () => playPrevTrack());
        navigator.mediaSession.setActionHandler("nexttrack", () => playNextTrack());
        navigator.mediaSession.setActionHandler("stop", () => stopPlayerHud());
      } catch (e) {
        console.warn("MediaSession update warning:", e);
      }
    }
  }

  function fallbackToPreview(track, startTime = 0) {
    if (track.preview) {
      playerTrackTitle.textContent = track.title;
      if (dockPillTitle) dockPillTitle.textContent = track.title;
      cancelCrossfade();
      standbyDeck.pause();
      activeDeck.pause();
      activeDeck.src = track.preview;
      activeDeck.load();
      activeDeck.volume = masterVolume;
      if (startTime > 0) activeDeck.currentTime = startTime;
      activeDeck.play().then(() => {
        isPlaying = true;
        updatePlayPauseState(true);
        preloadNextTrack();
      }).catch(err => console.error("Preview playback failed:", err));
    }
  }

  function togglePlayPause() {
    if (activeDeck.paused) {
      if (activeDeck.src) {
        activeDeck.play().then(() => {
          isPlaying = true;
          updatePlayPauseState(true);
          if (isCrossfading && standbyDeck.src) {
            standbyDeck.play().catch(() => {});
          }
        });
      } else if (currentTracklist.length > 0) {
        playTrackAtIndex(0, isFullAlbumMode);
      }
    } else {
      pauseTrack();
    }
  }

  function pauseTrack() {
    activeDeck.pause();
    if (isCrossfading) {
      standbyDeck.pause();
    }
    isPlaying = false;
    updatePlayPauseState(false);
  }

  function updatePlayPauseState(playing) {
    if (playing) {
      smartHud.classList.add("playing");
      hudPlayIcon.classList.add("hidden");
      hudPauseIcon.classList.remove("hidden");
      if (playerDockPill) {
        playerDockPill.classList.add("playing");
        if (dockPillPlayIcon) dockPillPlayIcon.classList.add("hidden");
        if (dockPillPauseIcon) dockPillPauseIcon.classList.remove("hidden");
      }
    } else {
      smartHud.classList.remove("playing");
      hudPlayIcon.classList.remove("hidden");
      hudPauseIcon.classList.add("hidden");
      if (playerDockPill) {
        playerDockPill.classList.remove("playing");
        if (dockPillPlayIcon) dockPillPlayIcon.classList.remove("hidden");
        if (dockPillPauseIcon) dockPillPauseIcon.classList.add("hidden");
      }
    }
  }

  function playNextTrack() {
    if (isLibraryRadioMode && currentTrackIndex >= currentTracklist.length - 3 && !isFetchingMoreRadioTracks) {
      fetchMoreRadioTracks();
    }
    if (currentTrackIndex + 1 < currentTracklist.length) {
      playTrackAtIndex(currentTrackIndex + 1, isFullAlbumMode);
    } else if (currentTracklist.length > 0 && (isFullAlbumMode || isLibraryRadioMode)) {
      playTrackAtIndex(0, true);
    }
  }

  async function fetchMoreRadioTracks() {
    if (isFetchingMoreRadioTracks) return;
    isFetchingMoreRadioTracks = true;
    try {
      const res = await fetch("/api/library/radio?limit=30");
      const data = await res.json();
      if (data && data.status === "ok" && Array.isArray(data.tracks)) {
        const existingPaths = new Set(currentTracklist.map(t => t.local_path || t.id));
        const fresh = data.tracks.filter(t => !existingPaths.has(t.local_path || t.id));
        if (fresh.length > 0) {
          currentTracklist.push(...fresh);
        }
      }
    } catch (e) {
      console.warn("Could not fetch more radio tracks:", e);
    } finally {
      isFetchingMoreRadioTracks = false;
    }
  }

  function playPrevTrack() {
    if (currentTrackIndex - 1 >= 0) {
      playTrackAtIndex(currentTrackIndex - 1, isFullAlbumMode);
    } else if (currentTracklist.length > 0) {
      playTrackAtIndex(currentTracklist.length - 1, isFullAlbumMode);
    }
  }

  function highlightActiveTrack() {
    document.querySelectorAll(".track-row").forEach((el, idx) => {
      if (idx === currentTrackIndex) {
        el.classList.add("playing");
      } else {
        el.classList.remove("playing");
      }
    });
  }

  function onDeckTimeUpdate(deck) {
    if (deck !== activeDeck) return;
    if (!deck.duration || isNaN(deck.duration)) return;

    const cur = deck.currentTime;
    const dur = deck.duration;
    const pct = (cur / dur) * 100;
    playerScrubFill.style.width = `${pct}%`;
    currentTimeLabel.textContent = formatTime(cur);
    durationTimeLabel.textContent = formatTime(dur);

    // Real-time synced lyric line scrolling
    syncLyricsToTime(cur);

    // Check seamless track transition
    if (isCrossfading) return;
    const nextIndex = currentTrackIndex + 1;
    const hasNext = currentTracklist && (nextIndex < currentTracklist.length);
    if (!hasNext) {
      if (isLibraryRadioMode && !isFetchingMoreRadioTracks) {
        fetchMoreRadioTracks();
      }
      return;
    }

    const crossfadeEnabled = (configData && configData.crossfade_audio !== false);
    let crossfadeSec = crossfadeEnabled 
      ? (configData.crossfade_duration !== undefined ? Number(configData.crossfade_duration) : 3) 
      : 0;
    
    // In Library DJ Radio: NEVER allow silent gaps!
    // If crossfade setting is 0s, trigger a 0.25s instant gapless handoff so playback never pauses.
    // If crossfade setting > 0s, trigger smooth equal-power DJ crossfade.
    if (isLibraryRadioMode && crossfadeSec <= 0) {
      crossfadeSec = 0.25;
    }

    const triggerThreshold = (crossfadeSec > 0) ? crossfadeSec : 0.25;
    const remaining = dur - cur;

    if (dur > 5 && cur > 2 && remaining <= triggerThreshold) {
      triggerSeamlessTransition(crossfadeSec);
    }
  }

  function onDeckEnded(deck) {
    if (deck !== activeDeck) {
      deck.pause();
      deck.currentTime = 0;
      return;
    }
    if (isCrossfading) return;
    if (isFullAlbumMode || isLibraryRadioMode || configData.auto_advance_preview !== false) {
      playNextTrack();
    } else {
      pauseTrack();
    }
  }

  function onDeckLoadedMetadata(deck) {
    if (deck === activeDeck && deck.duration && !isNaN(deck.duration)) {
      durationTimeLabel.textContent = formatTime(deck.duration);
    }
  }

  [deckA, deckB].forEach(deck => {
    deck.addEventListener("loadedmetadata", () => onDeckLoadedMetadata(deck));
    deck.addEventListener("timeupdate", () => onDeckTimeUpdate(deck));
    deck.addEventListener("ended", () => onDeckEnded(deck));
    deck.addEventListener("error", (e) => {
      console.warn("Audio deck error:", e);
    });
  });

  playerScrubBar.addEventListener("click", (e) => {
    if (!activeDeck.duration) return;
    cancelCrossfade();
    const rect = playerScrubBar.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    activeDeck.currentTime = pos * activeDeck.duration;
  });

  if (playerVolumeSlider) {
    playerVolumeSlider.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      masterVolume = val;
      if (!isCrossfading) {
        activeDeck.volume = val;
      }
      if (playerVolumeLabel) playerVolumeLabel.textContent = `${Math.round(val * 100)}%`;
      localStorage.setItem("discovery_player_vol", val);
    });
  }

  playPauseBtn.addEventListener("click", togglePlayPause);
  stopBtn.addEventListener("click", stopPlayerHud);
  hudDismissBtn.addEventListener("click", minimizePlayerHud);
  nextTrackBtn.addEventListener("click", playNextTrack);
  prevTrackBtn.addEventListener("click", playPrevTrack);

  function openLyricsForCurrentTrack() {
    albumModal.classList.remove("hidden");
    switchModalTab("lyrics");
    if (currentTracklist && currentTrackIndex >= 0 && currentTracklist[currentTrackIndex]) {
      const tr = currentTracklist[currentTrackIndex];
      const art = tr.artist || (currentAlbumDetails && currentAlbumDetails.artist) || "Unknown Artist";
      const alb = tr.album || (currentAlbumDetails ? currentAlbumDetails.title : "") || tr.title;
      const cov = (tr.cover_big || tr.cover_small || (currentAlbumDetails && (currentAlbumDetails.cover_big || currentAlbumDetails.cover_small))) || window.FALLBACK_COVER_SVG;

      modalCoverArt.onerror = () => { modalCoverArt.src = window.FALLBACK_COVER_SVG; };
      modalCoverArt.src = cov;
      modalAlbumTitle.textContent = alb;
      modalArtistName.textContent = art;
      modalTracksCount.textContent = isLibraryRadioMode ? `📻 DJ Radio (${currentTracklist.length} Tracks)` : `🎵 ${currentTracklist.length} Tracks`;
      modalTracklistTabCount.textContent = currentTracklist.length;
      modalYearBadge.textContent = tr.year ? `📅 ${tr.year}` : (isLibraryRadioMode ? "📻 Live Mix" : "📅 Studio Album");
      if (modalTypeBadge) modalTypeBadge.textContent = isLibraryRadioMode ? "LIBRARY DJ RADIO" : "STUDIO ALBUM";
      if (modalGenreBadge) modalGenreBadge.textContent = isLibraryRadioMode ? "⚡ DJ Radio Mix" : "⚡ Music";
      if (modalLabelBadge) modalLabelBadge.textContent = isLibraryRadioMode ? "🏷️ Local Library Collection" : "🏷️ Studio Release";
      if (modalBarcodeBadge) modalBarcodeBadge.textContent = "📦 High-Fidelity Audio";
      if (modalDownloadBtnText) modalDownloadBtnText.textContent = "💾 In Library";
      if (modalDownloadAlbumBtn) {
        modalDownloadAlbumBtn.disabled = true;
        modalDownloadAlbumBtn.style.opacity = "0.7";
      }

      renderTracklist(currentTracklist);
      loadTrackLyrics(art, tr.title, alb, tr.duration);
    }
  }

  if (hudLyricsBtn) {
    hudLyricsBtn.addEventListener("click", () => {
      openLyricsForCurrentTrack();
    });
  }

  // Mini Dock Pill & Header Player Button Listeners
  if (btnHeaderPlayerToggle) {
    btnHeaderPlayerToggle.addEventListener("click", togglePlayerHud);
  }
  if (dockPillLyricsBtn) {
    dockPillLyricsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openLyricsForCurrentTrack();
    });
  }
  if (dockPillExpandBtn) {
    dockPillExpandBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      showPlayerHud();
    });
  }
  if (dockPillPlayPauseBtn) {
    dockPillPlayPauseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      togglePlayPause();
    });
  }
  if (dockPillStopBtn) {
    dockPillStopBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      stopPlayerHud();
    });
  }
  if (playerDockPill) {
    playerDockPill.addEventListener("click", (e) => {
      if (!e.target.closest("button")) {
        showPlayerHud();
      }
    });
  }

  // Keyboard Shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") {
      if (e.key === "Escape") e.target.blur();
      return;
    }

    if (e.code === "Space") {
      e.preventDefault();
      togglePlayPause();
    } else if (e.key === "ArrowRight") {
      if (e.ctrlKey) {
        playNextTrack();
      } else if (audio.duration) {
        audio.currentTime = Math.min(audio.duration, audio.currentTime + 10);
      }
    } else if (e.key === "ArrowLeft") {
      if (e.ctrlKey) {
        playPrevTrack();
      } else if (audio.duration) {
        audio.currentTime = Math.max(0, audio.currentTime - 10);
      }
    } else if (e.key === "Escape") {
      albumModal.classList.add("hidden");
      settingsModal.classList.add("hidden");
      queueDrawer.classList.add("hidden");
    }
  });

  // =========================================================================
  // 2. DISCOVERY & TIME MACHINE ERAS
  // =========================================================================
  async function loadCharts(genre, forceRefresh = false) {
    currentGenre = genre;
    currentViewType = "genre";
    discographyCategoryPills.classList.add("hidden");
    if (btnLibraryRadioLaunch) btnLibraryRadioLaunch.classList.add("hidden");
    if (librarySearchWrap) librarySearchWrap.classList.add("hidden");

    viewSectionTitle.textContent = ERA_TITLES[genre] || `${genre.toUpperCase()} Albums`;

    // 0ms INSTANT SWITCH IF IN MEMORY OR SESSION CACHE
    if (!forceRefresh && !TAB_ALBUMS_CACHE.has(genre)) {
      try {
        const stored = sessionStorage.getItem("tab_cache_" + genre);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            TAB_ALBUMS_CACHE.set(genre, parsed);
          }
        }
      } catch (e) {}
    }

    if (!forceRefresh && TAB_ALBUMS_CACHE.has(genre)) {
      const cachedAlbums = TAB_ALBUMS_CACHE.get(genre);
      if (cachedAlbums && cachedAlbums.length >= 50) {
        loadingIndicator.classList.add("hidden");
        emptyIndicator.classList.add("hidden");
        if (btnRefreshView) btnRefreshView.classList.remove("spinning");
        viewSectionCount.textContent = `${cachedAlbums.length} landmark albums`;
        renderCurrentView(cachedAlbums, true);
        if (cachedAlbums.length >= 850) {
          return;
        }
      }
    }

    // Only blank grid if no albums are currently displayed
    if (!albumsGrid.children || albumsGrid.children.length === 0) {
      loadingIndicator.classList.remove("hidden");
      emptyIndicator.classList.add("hidden");
      albumsGrid.innerHTML = "";
      viewSectionCount.textContent = forceRefresh ? "Refreshing live charts..." : "Scanning era...";
    }

    if (btnRefreshView && forceRefresh) {
      btnRefreshView.classList.add("spinning");
    }

    try {
      const rawLimit = (configData && configData.discovery_album_limit !== undefined)
        ? configData.discovery_album_limit
        : (settingDiscoveryLimit ? parseInt(settingDiscoveryLimit.value, 10) : 0);
      // With pagination enabled, default 0 loads all available albums for multi-page browsing
      const discLimit = (rawLimit === 100) ? 0 : rawLimit;
      const url = `/api/charts?genre=${encodeURIComponent(genre)}&limit=${discLimit}${forceRefresh ? '&refresh=1' : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      
      let albums = [];
      if (Array.isArray(data)) {
        albums = data;
      } else if (data && Array.isArray(data.albums)) {
        albums = data.albums;
      } else if (data && data.albums && Array.isArray(data.albums.albums)) {
        albums = data.albums.albums;
      }

      loadingIndicator.classList.add("hidden");
      if (btnRefreshView) btnRefreshView.classList.remove("spinning");

      if (!albums || albums.length === 0) {
        if (!albumsGrid.children || albumsGrid.children.length === 0) {
          emptyIndicator.classList.remove("hidden");
          viewSectionCount.textContent = "0 albums";
        }
        return;
      }

      TAB_ALBUMS_CACHE.set(genre, albums);
      try {
        sessionStorage.setItem("tab_cache_" + genre, JSON.stringify(albums.slice(0, 250)));
      } catch (e) {}
      viewSectionCount.textContent = `${albums.length} landmark albums`;
      renderCurrentView(albums);
    } catch (err) {
      console.error("Failed to load charts:", err);
      loadingIndicator.classList.add("hidden");
      if (btnRefreshView) btnRefreshView.classList.remove("spinning");
      emptyIndicator.classList.remove("hidden");
    }
  }

  async function loadSurpriseCrate(forceRefresh = false) {
    currentViewType = "special";
    discographyCategoryPills.classList.add("hidden");
    if (librarySearchWrap) librarySearchWrap.classList.add("hidden");
    viewSectionTitle.textContent = "🎲 Surprise Discovery Crate";

    if (!forceRefresh && TAB_ALBUMS_CACHE.has("surprise")) {
      const cached = TAB_ALBUMS_CACHE.get("surprise");
      loadingIndicator.classList.add("hidden");
      emptyIndicator.classList.add("hidden");
      viewSectionCount.textContent = `${cached.length} surprise gems`;
      renderCurrentView(cached);
      return;
    }

    loadingIndicator.classList.remove("hidden");
    emptyIndicator.classList.add("hidden");
    albumsGrid.innerHTML = "";
    if (albumsTableBody) albumsTableBody.innerHTML = "";
    viewSectionCount.textContent = "Rolling masterworks across genres...";

    try {
      const discLimit = (configData && configData.discovery_album_limit !== undefined)
        ? configData.discovery_album_limit
        : (settingDiscoveryLimit ? parseInt(settingDiscoveryLimit.value, 10) : 60);
      const res = await fetch(`/api/discovery/surprise?limit=${discLimit}`);
      const data = await res.json();
      const albums = (data && data.albums) || [];

      loadingIndicator.classList.add("hidden");
      if (albums.length === 0) {
        emptyIndicator.classList.remove("hidden");
        viewSectionCount.textContent = "0 albums";
        return;
      }

      TAB_ALBUMS_CACHE.set("surprise", albums);
      viewSectionCount.textContent = `${albums.length} surprise gems`;
      renderCurrentView(albums);
    } catch (err) {
      console.error("Failed to load surprise crate:", err);
      loadingIndicator.classList.add("hidden");
      emptyIndicator.classList.remove("hidden");
    }
  }

  // =========================================================================
  // 3. ALBUM DISCOVERY FLOW (SUPERPOWER 2)
  // =========================================================================
  async function startAlbumFlow(albumId, artistName, genre = "") {
    currentViewType = "flow";
    albumModal.classList.add("hidden");
    discographyCategoryPills.classList.add("hidden");
    if (librarySearchWrap) librarySearchWrap.classList.add("hidden");
    loadingIndicator.classList.remove("hidden");
    emptyIndicator.classList.add("hidden");
    albumsGrid.innerHTML = "";
    if (albumsTableBody) albumsTableBody.innerHTML = "";
    viewSectionTitle.textContent = `🌊 Discovery Flow: ${artistName}`;
    viewSectionCount.textContent = "Synthesizing connected masterworks & rare gems...";
    showToast(`Generating dynamic flow for "${artistName}"`, "flow");

    try {
      const res = await fetch(`/api/discovery/flow?id=${encodeURIComponent(albumId)}&artist=${encodeURIComponent(artistName)}&genre=${encodeURIComponent(genre)}`);
      const data = await res.json();
      const albums = (data && data.albums) || [];

      loadingIndicator.classList.add("hidden");
      if (albums.length === 0) {
        emptyIndicator.classList.remove("hidden");
        viewSectionCount.textContent = "0 albums found in flow";
        return;
      }

      viewSectionCount.textContent = `${albums.length} connected records`;
      renderCurrentView(albums);
    } catch (err) {
      console.error("Discovery flow failed:", err);
      loadingIndicator.classList.add("hidden");
      emptyIndicator.classList.remove("hidden");
    }
  }

  if (modalStartFlowBtn) {
    modalStartFlowBtn.addEventListener("click", () => {
      if (currentAlbumDetails && currentAlbumDetails.artist) {
        const genre = (currentAlbumDetails.genres && currentAlbumDetails.genres[0]) || "";
        startAlbumFlow(currentAlbumDetails.id, currentAlbumDetails.artist, genre);
      }
    });
  }

  function resolveAlbumBadges(album) {
    if (!album) return { yearText: "", typeLabel: "💿 Studio LP", typeClass: "badge-type-album", tracksText: "" };
    const titleLow = (album.title || "").toLowerCase();
    const rawType = (album.type || album.record_type || "").toLowerCase();
    const trackCount = parseInt(album.track_count || (album.tracks ? album.tracks.length : 0) || 0, 10);
    const albumIdStr = String(album.id || "");
    
    // 1. Determine accurate Release Type
    let typeLabel = "💿 Studio LP";
    let typeClass = "badge-type-album";
    let fullModalType = "STUDIO ALBUM";
    
    // Check if album is in active discography buckets
    let inComp = false;
    let inEp = false;
    let inStudio = false;
    if (currentArtistDiscography) {
      inComp = (currentArtistDiscography.compilations || []).some(c => String(c.id) === albumIdStr);
      inEp = (currentArtistDiscography.eps || []).some(e => String(e.id) === albumIdStr);
      inStudio = (currentArtistDiscography.albums || []).some(a => String(a.id) === albumIdStr);
    }

    if (inComp || rawType === "compile" || rawType === "compilation") {
      if (titleLow.includes("live") || titleLow.includes("concert") || titleLow.includes("tour") || titleLow.includes("session")) {
        typeLabel = "🔴 Live";
        typeClass = "badge-type-live";
        fullModalType = "LIVE CONCERT / SESSIONS";
      } else if (titleLow.includes("remix") || titleLow.includes("remixes")) {
        typeLabel = "🎛️ Remix";
        typeClass = "badge-type-remix";
        fullModalType = "REMIX ALBUM";
      } else {
        typeLabel = "📦 Compilation";
        typeClass = "badge-type-compilation";
        fullModalType = "COMPILATION / GREATEST HITS";
      }
    } else if (inEp || rawType === "single" || rawType === "ep" || (trackCount > 0 && trackCount <= 6) || titleLow.includes(" - single") || titleLow.includes(" - ep")) {
      if (rawType === "single" || trackCount === 1 || titleLow.includes(" - single")) {
        typeLabel = "⚡ Single";
        typeClass = "badge-type-single";
        fullModalType = "OFFICIAL SINGLE";
      } else {
        typeLabel = "⚡ EP";
        typeClass = "badge-type-ep";
        fullModalType = "EP / MINI-ALBUM";
      }
    } else if (inStudio || rawType === "album") {
      if (titleLow.includes("deluxe") || titleLow.includes("expanded") || titleLow.includes("anniversary")) {
        typeLabel = "✨ Deluxe LP";
        typeClass = "badge-type-deluxe";
        fullModalType = "STUDIO ALBUM (DELUXE)";
      } else {
        typeLabel = "💿 Studio LP";
        typeClass = "badge-type-album";
        fullModalType = "STUDIO ALBUM";
      }
    } else if (titleLow.includes("live") || titleLow.includes("concert")) {
      typeLabel = "🔴 Live";
      typeClass = "badge-type-live";
      fullModalType = "LIVE ALBUM";
    }

    // 2. Determine Year / Era Badge
    let yearText = "";
    if (album.year && String(album.year).trim().length >= 4) {
      yearText = `📅 ${String(album.year).trim().substring(0, 4)}`;
    } else if (album.release_date && String(album.release_date).trim().length >= 4) {
      yearText = `📅 ${String(album.release_date).trim().substring(0, 4)}`;
    } else {
      const m = (album.title || "").match(/\b(19\d\d|20\d\d)\b/);
      if (m) {
        yearText = `📅 ${m[1]}`;
      }
    }

    // 3. Track Count
    const tracksText = trackCount > 0 ? (trackCount === 1 ? "1 Track" : `${trackCount} Tracks`) : "";

    return {
      yearText,
      typeLabel,
      typeClass,
      fullModalType,
      tracksText
    };
  }

  let currentViewLayout = "grid"; // "grid" | "list"
  const btnViewGrid = document.getElementById("btnViewGrid");
  const btnViewList = document.getElementById("btnViewList");
  const albumsListContainer = document.getElementById("albumsListContainer");
  const albumsTableBody = document.getElementById("albumsTableBody");

  if (btnViewGrid && btnViewList) {
    btnViewGrid.addEventListener("click", () => {
      currentViewLayout = "grid";
      btnViewGrid.classList.add("active");
      btnViewList.classList.remove("active");
      if (albumsGrid) albumsGrid.classList.remove("hidden");
      if (albumsListContainer) albumsListContainer.classList.add("hidden");
      renderCurrentView(currentDisplayedAlbums);
    });
    btnViewList.addEventListener("click", () => {
      currentViewLayout = "list";
      btnViewList.classList.add("active");
      btnViewGrid.classList.remove("active");
      if (albumsGrid) albumsGrid.classList.add("hidden");
      if (albumsListContainer) albumsListContainer.classList.remove("hidden");
      renderCurrentView(currentDisplayedAlbums);
    });
  }

  function goToPage(pageNum) {
    const isAll = currentPageSize === "all";
    const size = isAll ? currentFullCollection.length : (typeof currentPageSize === "number" ? currentPageSize : 50);
    const totalPages = isAll ? 1 : Math.max(1, Math.ceil(currentFullCollection.length / (size || 1)));
    currentPage = Math.max(1, Math.min(pageNum, totalPages));
    renderCurrentView(currentFullCollection, false);
    const mainArea = document.querySelector(".station-main");
    if (mainArea) {
      mainArea.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function renderPaginationControls(totalItems) {
    if (!paginationBar) return;
    const isAll = currentPageSize === "all";
    const size = isAll ? totalItems : (typeof currentPageSize === "number" ? currentPageSize : 50);
    const totalPages = isAll ? 1 : Math.max(1, Math.ceil(totalItems / (size || 1)));

    if (totalItems <= size && !isAll) {
      paginationBar.classList.add("hidden");
      return;
    }

    paginationBar.classList.remove("hidden");

    const startIdx = isAll ? 0 : (currentPage - 1) * size;
    const endIdx = isAll ? totalItems : Math.min(startIdx + size, totalItems);

    if (paginationSummary) {
      if (isAll || totalPages <= 1) {
        paginationSummary.textContent = `Showing all ${totalItems} albums`;
      } else {
        paginationSummary.textContent = `Showing ${startIdx + 1}–${endIdx} of ${totalItems} albums • Page ${currentPage} of ${totalPages}`;
      }
    }

    if (btnPrevPage) {
      btnPrevPage.disabled = isAll || currentPage <= 1;
      btnPrevPage.style.display = isAll ? "none" : "";
    }
    if (btnNextPage) {
      btnNextPage.disabled = isAll || currentPage >= totalPages;
      btnNextPage.style.display = isAll ? "none" : "";
    }

    if (!paginationNumbers) return;
    paginationNumbers.innerHTML = "";

    if (isAll || totalPages <= 1) return;

    function createPageBtn(p) {
      const b = document.createElement("button");
      b.className = `pagination-btn ${p === currentPage ? 'active' : ''}`;
      b.textContent = String(p);
      b.title = `Go to Page ${p}`;
      b.addEventListener("click", () => goToPage(p));
      return b;
    }

    function createEllipsis() {
      const span = document.createElement("span");
      span.className = "pagination-ellipsis";
      span.textContent = "...";
      return span;
    }

    if (totalPages <= 7) {
      for (let p = 1; p <= totalPages; p++) {
        paginationNumbers.appendChild(createPageBtn(p));
      }
    } else {
      paginationNumbers.appendChild(createPageBtn(1));

      if (currentPage > 3) {
        paginationNumbers.appendChild(createEllipsis());
      }

      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let p = start; p <= end; p++) {
        paginationNumbers.appendChild(createPageBtn(p));
      }

      if (currentPage < totalPages - 2) {
        paginationNumbers.appendChild(createEllipsis());
      }

      paginationNumbers.appendChild(createPageBtn(totalPages));
    }
  }

  if (btnPrevPage) {
    btnPrevPage.addEventListener("click", () => {
      if (currentPage > 1) {
        goToPage(currentPage - 1);
      }
    });
  }

  if (btnNextPage) {
    btnNextPage.addEventListener("click", () => {
      const isAll = currentPageSize === "all";
      const size = isAll ? currentFullCollection.length : (typeof currentPageSize === "number" ? currentPageSize : 50);
      const totalPages = isAll ? 1 : Math.max(1, Math.ceil(currentFullCollection.length / (size || 1)));
      if (currentPage < totalPages) {
        goToPage(currentPage + 1);
      }
    });
  }

  if (selectPageSize) {
    selectPageSize.addEventListener("change", (e) => {
      const val = e.target.value;
      currentPageSize = val === "all" ? "all" : parseInt(val, 10);
      currentPage = 1;
      renderCurrentView(currentFullCollection, true);
    });
  }

  function renderCurrentView(albums, resetPage = true) {
    if (resetPage) {
      currentPage = 1;
    }
    currentFullCollection = albums || [];

    const totalItems = currentFullCollection.length;
    const isAll = currentPageSize === "all";
    const size = isAll ? totalItems : (typeof currentPageSize === "number" ? currentPageSize : 50);
    const totalPages = isAll ? 1 : Math.max(1, Math.ceil(totalItems / (size || 1)));
    currentPage = Math.max(1, Math.min(currentPage, totalPages));

    let pageSlice = currentFullCollection;
    if (!isAll && size > 0) {
      const startIdx = (currentPage - 1) * size;
      const endIdx = Math.min(startIdx + size, totalItems);
      pageSlice = currentFullCollection.slice(startIdx, endIdx);
    }

    currentDisplayedAlbums = pageSlice;

    // Dynamic Batch Download button text and visibility
    const unownedAlbums = currentFullCollection.filter(a => !a.owned);
    const showBatchBtn = currentViewType !== "library" && unownedAlbums.length > 0;

    if (btnBatchDownloadText) {
      if (currentCategoryFilter === "albums") {
        btnBatchDownloadText.textContent = `📥 Download Studio Albums (${unownedAlbums.length})`;
      } else if (currentCategoryFilter === "eps") {
        btnBatchDownloadText.textContent = `📥 Download EPs & Mini-Albums (${unownedAlbums.length})`;
      } else if (currentCategoryFilter === "singles") {
        btnBatchDownloadText.textContent = `📥 Download Singles (${unownedAlbums.length})`;
      } else if (currentCategoryFilter === "compilations") {
        btnBatchDownloadText.textContent = `📥 Download Compilations (${unownedAlbums.length})`;
      } else {
        btnBatchDownloadText.textContent = `📥 Download All (${unownedAlbums.length})`;
      }
    }
    if (btnBatchDownload) {
      btnBatchDownload.classList.toggle("hidden", !showBatchBtn);
    }

    if (currentViewLayout === "list") {
      renderAlbumList(currentDisplayedAlbums);
    } else {
      renderAlbumGrid(currentDisplayedAlbums);
    }

    renderPaginationControls(totalItems);
  }

  function renderAlbumGrid(albums) {
    if (albumsGrid) albumsGrid.classList.remove("hidden");
    if (albumsListContainer) albumsListContainer.classList.add("hidden");
    albumsGrid.innerHTML = "";

    albums.forEach(album => {
      const card = document.createElement("div");
      card.className = "album-card";
      card.dataset.albumId = String(album.id);
      card.dataset.title = (album.title || "").toLowerCase();
      card.dataset.artist = (album.artist || "").toLowerCase();
      
      const b = resolveAlbumBadges(album);
      const yearBadgeHtml = b.yearText ? `<span class="card-year-badge">${b.yearText}</span>` : "";
      const typeBadgeHtml = `<span class="card-type-badge ${b.typeClass}">${b.typeLabel}</span>`;
      const cover = (album.cover_big || album.cover_small || "").trim() || window.FALLBACK_COVER_SVG;

      const ownedBadge = album.owned 
        ? `<span class="card-owned-badge">💾 In Library</span>` 
        : (currentArtistDiscography && currentArtistDiscography.is_artist ? `<span class="card-owned-badge badge-type-missing">⏳ Missing</span>` : "");
      
      const variantsCount = (album.variants || []).length;
      const variantBadgeHtml = variantsCount > 0 
        ? `<span class="variant-chip" title="Collapsed variants: ${album.variants.map(v => v.title).join(', ')}">+ ${variantsCount} Variant${variantsCount > 1 ? 's' : ''}</span>`
        : "";

      card.innerHTML = `
        <div class="card-cover-wrap">
          <img src="${cover}" alt="${album.title}" class="card-cover-img" onerror="this.onerror=null; this.src=window.FALLBACK_COVER_SVG;" loading="lazy" />
          ${ownedBadge}
        </div>
        <div class="card-meta-top">
          <div class="card-meta-left">
            ${yearBadgeHtml}
            ${typeBadgeHtml}
            ${variantBadgeHtml}
          </div>
        </div>
        <div class="card-title" title="${album.title}">${album.title}</div>
        <div class="card-artist" title="${album.artist}">${album.artist}</div>
      `;

      card.addEventListener("click", () => {
        if (currentViewType === "library" || String(album.id).startsWith("local_")) {
          openAlbumModal(album.id);
        } else {
          openInspectDrawer(album.id);
        }
      });
      albumsGrid.appendChild(card);
    });
  }

  function renderAlbumList(albums) {
    if (albumsGrid) albumsGrid.classList.add("hidden");
    if (albumsListContainer) albumsListContainer.classList.remove("hidden");
    if (!albumsTableBody) return;
    albumsTableBody.innerHTML = "";

    albums.forEach((album, idx) => {
      const tr = document.createElement("tr");
      tr.dataset.albumId = String(album.id);

      const b = resolveAlbumBadges(album);
      const cover = (album.cover_small || album.cover_big || "").trim() || window.FALLBACK_COVER_SVG;
      const yearText = b.yearText.replace("📅", "").trim() || "—";
      const trackCount = parseInt(album.track_count || (album.tracks ? album.tracks.length : 0) || 0, 10);
      const tracksDisplay = trackCount > 0 ? `${trackCount} tracks` : "—";
      
      const variantsCount = (album.variants || []).length;
      const variantHtml = variantsCount > 0 
        ? `<span class="variant-chip" title="Collapsed variants: ${album.variants.map(v => v.title).join(', ')}">+ ${variantsCount} Variant${variantsCount > 1 ? 's' : ''}</span>`
        : "";

      const ownedListBadge = album.owned
        ? `<span class="card-owned-badge" style="position: static; font-size: 10px; margin-left: 6px; padding: 2px 6px;">💾 In Library</span>`
        : (currentArtistDiscography && currentArtistDiscography.is_artist ? `<span class="card-owned-badge badge-type-missing" style="position: static; font-size: 10px; margin-left: 6px; padding: 2px 6px;">⏳ Missing</span>` : "");

      tr.innerHTML = `
        <td class="row-num">${idx + 1}</td>
        <td>
          <div class="row-cover-wrap">
            <img src="${cover}" alt="${album.title}" class="row-cover-img" onerror="this.onerror=null; this.src=window.FALLBACK_COVER_SVG;" loading="lazy" />
          </div>
        </td>
        <td>
          <div class="row-title-wrap">
            <span class="row-title-main">${album.title} ${variantHtml} ${ownedListBadge}</span>
            <span class="row-artist">${album.artist || ""}</span>
          </div>
        </td>
        <td class="row-artist">${album.artist || ""}</td>
        <td class="row-year">${yearText}</td>
        <td class="row-tracks">${tracksDisplay}</td>
        <td><span class="card-type-badge ${b.typeClass}">${b.typeLabel}</span></td>
        <td style="text-align: right;">
          <button class="row-action-btn" title="Inspect tracklist & quick audition">
            <span>Inspect</span> ➔
          </button>
        </td>
      `;

      tr.addEventListener("click", () => {
        if (currentViewType === "library" || String(album.id).startsWith("local_")) {
          openAlbumModal(album.id);
        } else {
          openInspectDrawer(album.id);
        }
      });
      albumsTableBody.appendChild(tr);
    });
  }

  // =========================================================================
  // BATCH DOWNLOAD MODAL & ACTIONS
  // =========================================================================
  function openBatchDownloadModal() {
    if (!currentDisplayedAlbums || currentDisplayedAlbums.length === 0) {
      showToast("No albums in current view to download", "info");
      return;
    }

    const isStudioTab = currentCategoryFilter === "albums";
    const isArtist = currentArtistDiscography !== null;
    const artistName = currentArtistDiscography ? (currentArtistDiscography.artist?.name || omniSearchInput.value) : "";

    if (batchModalHeading) {
      batchModalHeading.textContent = isArtist 
        ? (isStudioTab ? `Download Studio Albums (${artistName})` : `Download Releases (${artistName})`)
        : `Batch Download (${currentDisplayedAlbums.length} Albums)`;
    }

    if (batchModalSubheading) {
      batchModalSubheading.textContent = isStudioTab
        ? "Verified 100% pure solo studio LP albums (soundtracks and duplicate singles excluded)"
        : "Review releases to queue for background downloading to your music drive";
    }

    if (batchAlbumsList) {
      batchAlbumsList.innerHTML = "";
      
      currentDisplayedAlbums.forEach((alb, idx) => {
        const row = document.createElement("div");
        const isOwned = !!alb.owned;
        row.className = `batch-album-row ${isOwned ? 'already-owned' : 'selected'}`;
        const albType = (alb.type || "album").toLowerCase();
        const isStudio = albType === "album";
        const badgeText = isStudio ? "Studio Album" : (albType === "ep" ? "EP" : (albType === "single" ? "Single" : "Release"));
        const badgeClass = isStudio ? "studio" : "";
        const ownedBadge = isOwned ? `<span class="batch-owned-tag">💾 In Library</span>` : "";

        row.innerHTML = `
          <input type="checkbox" class="batch-album-chk" data-index="${idx}" ${isOwned ? '' : 'checked'} />
          <img src="${alb.cover_small || alb.cover_big || window.FALLBACK_COVER_SVG}" class="batch-row-art" onerror="this.onerror=null; this.src=window.FALLBACK_COVER_SVG;" />
          <div class="batch-row-info">
            <div class="batch-row-title">${alb.title}</div>
            <div class="batch-row-meta">
              <span>${alb.artist}</span>
              <span>•</span>
              <span>📅 ${alb.year || "Release"}</span>
              <span class="batch-tag-badge ${badgeClass}">${badgeText}</span>
              ${ownedBadge}
            </div>
          </div>
        `;

        const chk = row.querySelector(".batch-album-chk");
        chk.addEventListener("change", () => {
          row.classList.toggle("selected", chk.checked);
          updateBatchSelectionUI();
        });

        row.addEventListener("click", (e) => {
          if (e.target !== chk) {
            chk.checked = !chk.checked;
            row.classList.toggle("selected", chk.checked);
            updateBatchSelectionUI();
          }
        });

        batchAlbumsList.appendChild(row);
      });

      const unownedCount = currentDisplayedAlbums.filter(a => !a.owned).length;
      if (batchSelectAllCheckbox) {
        batchSelectAllCheckbox.checked = unownedCount > 0;
      }
      updateBatchSelectionUI();
    }

    if (batchDownloadModal) batchDownloadModal.classList.remove("hidden");
  }

  function updateBatchSelectionUI() {
    if (!batchAlbumsList) return;
    const chks = batchAlbumsList.querySelectorAll(".batch-album-chk");
    const selected = Array.from(chks).filter(c => c.checked);
    const count = selected.length;
    
    if (batchSelectAllCheckbox) {
      batchSelectAllCheckbox.checked = (count === chks.length && chks.length > 0);
    }
    if (batchSelectAllText) {
      batchSelectAllText.textContent = `Select All (${count} of ${chks.length} selected)`;
    }
    if (batchTotalTracksSummary) {
      batchTotalTracksSummary.textContent = `${count} Albums Selected`;
    }
    if (btnConfirmBatchText) {
      btnConfirmBatchText.textContent = `Start Downloading (${count} Albums)`;
    }
    if (btnConfirmBatch) {
      btnConfirmBatch.disabled = count === 0;
    }
  }

  if (batchSelectAllCheckbox) {
    batchSelectAllCheckbox.addEventListener("change", (e) => {
      const checked = e.target.checked;
      const rows = batchAlbumsList ? batchAlbumsList.querySelectorAll(".batch-album-row") : [];
      rows.forEach(row => {
        const isOwned = row.classList.contains("already-owned");
        const chk = row.querySelector(".batch-album-chk");
        if (chk) {
          chk.checked = checked && !isOwned;
          row.classList.toggle("selected", chk.checked);
        }
      });
      updateBatchSelectionUI();
    });
  }

  if (btnBatchDownload) {
    btnBatchDownload.addEventListener("click", openBatchDownloadModal);
  }
  if (batchModalCloseBtn) {
    batchModalCloseBtn.addEventListener("click", () => batchDownloadModal.classList.add("hidden"));
  }
  if (btnCancelBatch) {
    btnCancelBatch.addEventListener("click", () => batchDownloadModal.classList.add("hidden"));
  }

  if (btnConfirmBatch) {
    btnConfirmBatch.addEventListener("click", async () => {
      if (!batchAlbumsList) return;
      const chks = batchAlbumsList.querySelectorAll(".batch-album-chk:checked");
      const selectedAlbums = Array.from(chks).map(c => {
        const idx = parseInt(c.getAttribute("data-index"), 10);
        return currentDisplayedAlbums[idx];
      }).filter(a => a && !a.owned);

      if (selectedAlbums.length === 0) {
        showToast("All selected albums are already in your local library.", "info");
        if (batchDownloadModal) batchDownloadModal.classList.add("hidden");
        return;
      }

      btnConfirmBatch.disabled = true;
      if (btnConfirmBatchText) btnConfirmBatchText.textContent = "Queueing Albums...";

      try {
        const res = await fetch("/api/download/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ albums: selectedAlbums })
        });
        const data = await res.json();
        if (batchDownloadModal) batchDownloadModal.classList.add("hidden");
        showToast(`Queued ${data.count || selectedAlbums.length} albums to download queue!`, "success");
        updateQueueUI();
      } catch (err) {
        console.error("Batch download error:", err);
        showToast("Failed to queue batch download", "error");
      } finally {
        btnConfirmBatch.disabled = false;
        if (btnConfirmBatchText) btnConfirmBatchText.textContent = `Start Downloading (${selectedAlbums.length} Albums)`;
      }
    });
  }

  function refreshActiveView(forceLive = false) {
    if (currentArtistDiscography || currentViewType === "artist" || currentViewType === "search") {
      const q = omniSearchInput ? omniSearchInput.value.trim() : "";
      if (q) {
        SEARCH_CACHE.delete(`q:${q.toLowerCase()}`);
        SEARCH_CACHE.delete(`artist:${q.toLowerCase()}`);
        performSearch(q, currentArtistDiscography !== null);
      }
    } else if (currentViewType === "library") {
      localLibraryAlbums = [];
      loadLibrary();
    } else if (currentViewType === "genre") {
      TAB_ALBUMS_CACHE.delete(currentGenre);
      loadCharts(currentGenre, forceLive);
    } else if (currentViewType === "special") {
      TAB_ALBUMS_CACHE.delete("surprise");
      loadSurpriseCrate(forceLive);
    }
  }

  // Refresh Button Handler
  if (btnRefreshView) {
    btnRefreshView.addEventListener("click", () => {
      SEARCH_CACHE.clear();
      TAB_ALBUMS_CACHE.clear();
      if (btnRefreshView) btnRefreshView.classList.add("spinning");
      showToast("Refreshing library status and releases...", "info");
      fetch("/api/library/rescan", { method: "POST" })
        .catch(() => {})
        .finally(() => {
          if (btnRefreshView) btnRefreshView.classList.remove("spinning");
          refreshActiveView(true);
        });
    });
  }



  // =========================================================================
  // 5. SEARCH & DISCOGRAPHY CATEGORIZATION (SUPERPOWER 4)
  // =========================================================================
  function renderDiscographySearchResults(data, query, isArtistExact) {
    loadingIndicator.classList.add("hidden");

    let albumsList = [];
    let epsList = [];
    let singlesList = [];
    let compList = [];
    let allList = [];

    // 1. If backend returned categorized discography, use exact clean categories
    if (data && data.discography) {
      albumsList = data.discography.albums || [];
      epsList = data.discography.eps || [];
      singlesList = data.discography.singles || [];
      compList = data.discography.compilations || [];
      allList = data.all_releases || [
        ...albumsList,
        ...compList,
        ...epsList,
        ...singlesList
      ];
    } else {
      const results = (data && data.albums) || (data && data.results) || [];
      allList = results;

      albumsList = results.filter(a => {
        const type = (a.type || a.record_type || "").toLowerCase();
        return type === "album";
      });

      epsList = results.filter(a => {
        const type = (a.type || a.record_type || "").toLowerCase();
        return type === "ep";
      });

      singlesList = results.filter(a => {
        const type = (a.type || a.record_type || "").toLowerCase();
        return type === "single";
      });

      compList = results.filter(a => {
        const type = (a.type || a.record_type || "").toLowerCase();
        return type === "compile" || type === "compilation";
      });
    }

    if (allList.length === 0 && albumsList.length === 0) {
      emptyIndicator.classList.remove("hidden");
      discographyCategoryPills.classList.add("hidden");
      viewSectionCount.textContent = "0 albums found";
      return;
    }

    const isArtistSearch = !!(data.is_artist && data.artist);
    const discographyPayload = {
      is_artist: isArtistSearch,
      artist: isArtistSearch ? data.artist : null,
      all: allList.length > 0 ? allList : albumsList,
      albums: albumsList,
      eps: epsList,
      singles: singlesList,
      compilations: compList
    };

    if (isArtistSearch) {
      const displayArtist = data.artist.name || query;
      viewSectionTitle.textContent = `🎙️ ${displayArtist} — Career Discography`;
    } else {
      viewSectionTitle.textContent = `🔍 Search: "${query}"`;
    }
    currentArtistDiscography = discographyPayload;

    // Update pill count badges & dynamically hide 0-count categories
    const counts = {
      albums: albumsList.length,
      compilations: compList.length,
      eps: epsList.length,
      singles: singlesList.length,
      all: allList.length
    };

    const pillMap = {
      albums: document.getElementById("pillBtnAlbums"),
      compilations: document.getElementById("pillBtnCompilations"),
      eps: document.getElementById("pillBtnEps"),
      singles: document.getElementById("pillBtnSingles"),
      all: document.getElementById("pillBtnAll")
    };

    const countEls = {
      albums: document.getElementById("pillCountAlbums"),
      compilations: document.getElementById("pillCountCompilations"),
      eps: document.getElementById("pillCountEps"),
      singles: document.getElementById("pillCountSingles"),
      all: document.getElementById("pillCountAll")
    };

    for (const [cat, el] of Object.entries(countEls)) {
      if (el) el.textContent = counts[cat] || 0;
    }

    for (const [cat, btn] of Object.entries(pillMap)) {
      if (btn) {
        const count = counts[cat] || 0;
        if (count === 0) {
          btn.classList.add("is-empty");
          btn.style.display = "none";
        } else {
          btn.classList.remove("is-empty");
          btn.style.display = "inline-flex";
        }
      }
    }

    discographyCategoryPills.classList.remove("hidden");

    // 🎯 Discography Gap Radar Integration (Only for verified artist discographies)
    if (data.is_artist && data.artist) {
      const displayArtist = data.artist.name || query;
      let gap = data.gap_analysis;
      if (!gap && albumsList.length > 0) {
        const tot = albumsList.length;
        const own = albumsList.filter(a => a.owned).length;
        const miss = albumsList.filter(a => !a.owned);
        gap = {
          artist: displayArtist,
          total_studio: tot,
          owned_studio: own,
          missing_count: miss.length,
          completion_pct: Math.round((own / tot) * 100),
          is_complete: miss.length === 0 && tot > 0,
          missing_albums: miss
        };
      }
      currentArtistGapData = gap;

      if (gap && gap.total_studio > 0) {
        if (gapBannerArtist) gapBannerArtist.textContent = gap.artist || displayArtist;
        if (gapProgressBar) {
          gapProgressBar.style.width = `${gap.completion_pct}%`;
          gapProgressBar.classList.toggle("complete", gap.is_complete);
        }
        if (gapStatusPill) {
          gapStatusPill.textContent = gap.is_complete ? "🏆 100% Canon Complete" : `${gap.completion_pct}% Complete (${gap.owned_studio}/${gap.total_studio} LPs)`;
          gapStatusPill.classList.toggle("complete", gap.is_complete);
        }
        if (gapBannerSubtext) {
          gapBannerSubtext.textContent = gap.is_complete
            ? `All ${gap.total_studio} Canonical Studio Albums are owned in your local library!`
            : `You own ${gap.owned_studio} of ${gap.total_studio} Canonical Studio Albums (${gap.missing_count} missing from your music drive)`;
        }
        if (btnCompleteCollection) {
          if (gap.is_complete) {
            btnCompleteCollection.classList.add("is-complete");
            if (btnCompleteCollectionText) btnCompleteCollectionText.textContent = "✓ Entire Canon Owned";
            btnCompleteCollection.disabled = true;
          } else {
            btnCompleteCollection.classList.remove("is-complete");
            if (btnCompleteCollectionText) btnCompleteCollectionText.textContent = `Complete Collection (Download ${gap.missing_count} Missing)`;
            btnCompleteCollection.disabled = false;
          }
        }
        if (artistGapBanner) artistGapBanner.classList.remove("hidden");
      } else {
        if (artistGapBanner) artistGapBanner.classList.add("hidden");
      }
    } else {
      currentArtistGapData = null;
      if (artistGapBanner) artistGapBanner.classList.add("hidden");
    }
    
    // Choose default active tab based on user preference
    const preferredFilter = (configData && configData.default_discography_filter) ? configData.default_discography_filter : "albums";
    let initialCat = "albums";
    if (preferredFilter === "all" && allList.length > 0) {
      initialCat = "all";
    } else {
      initialCat = albumsList.length > 0 
        ? "albums" 
        : (compList.length > 0 ? "compilations" : (epsList.length > 0 ? "eps" : "all"));
    }
    filterDiscographyCategory(initialCat);
  }

  // Complete Collection Button Handler
  if (btnCompleteCollection) {
    btnCompleteCollection.addEventListener("click", async () => {
      if (!currentArtistGapData || !currentArtistGapData.missing_albums || currentArtistGapData.missing_albums.length === 0) {
        showToast("All canonical studio albums are already owned!", "info");
        return;
      }
      const missing = currentArtistGapData.missing_albums;
      btnCompleteCollection.disabled = true;
      if (btnCompleteCollectionText) btnCompleteCollectionText.textContent = "Queueing Missing LPs...";

      try {
        const res = await fetch("/api/download/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ albums: missing })
        });
        const d = await res.json();
        showToast(`⚡ Queued all ${missing.length} missing studio albums for background download!`, "success");
        updateQueueUI();
      } catch (err) {
        console.error("Complete collection error:", err);
        showToast("Failed to queue missing albums", "error");
      } finally {
        btnCompleteCollection.disabled = false;
        if (btnCompleteCollectionText) btnCompleteCollectionText.textContent = `Complete Collection (Download ${missing.length} Missing)`;
      }
    });
  }

  async function performSearch(query, isArtistExact = false) {
    const cleanQuery = (query || "").trim();
    if (cleanQuery.length === 0) {
      if (activeSearchAbortController) {
        activeSearchAbortController.abort();
        activeSearchAbortController = null;
      }
      discographyCategoryPills.classList.add("hidden");
      if (librarySearchWrap) librarySearchWrap.classList.add("hidden");
      loadCharts(currentGenre);
      return;
    }

    // Abort any in-flight search fetch so slower previous keystrokes cannot overwrite newer ones
    if (activeSearchAbortController) {
      activeSearchAbortController.abort();
    }
    activeSearchAbortController = new AbortController();
    const abortSignal = activeSearchAbortController.signal;
    const thisSearchSeq = ++currentSearchSequenceId;

    if (btnLibraryRadioLaunch) btnLibraryRadioLaunch.classList.add("hidden");
    if (librarySearchWrap) librarySearchWrap.classList.add("hidden");

    viewSectionTitle.textContent = isArtistExact ? `🎙️ ${cleanQuery} — Career Discography` : `🔍 Search: "${cleanQuery}"`;

    loadingIndicator.classList.remove("hidden");
    emptyIndicator.classList.add("hidden");
    viewSectionCount.textContent = "Searching verified databases...";

    // Check in-memory SEARCH_CACHE for instant rendering
    const cacheKey = `${isArtistExact ? 'artist' : 'q'}:${cleanQuery.toLowerCase()}`;
    if (SEARCH_CACHE.has(cacheKey)) {
      const cachedData = SEARCH_CACHE.get(cacheKey);
      if (thisSearchSeq === currentSearchSequenceId && omniSearchInput.value.trim().toLowerCase() === cleanQuery.toLowerCase()) {
        renderDiscographySearchResults(cachedData, cleanQuery, isArtistExact);
        return;
      }
    }

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(cleanQuery)}`, {
        signal: abortSignal
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // Ensure this response matches the current active search sequence and hasn't been superseded
      if (thisSearchSeq !== currentSearchSequenceId) return;
      if (omniSearchInput.value.trim().toLowerCase() !== cleanQuery.toLowerCase()) return;

      SEARCH_CACHE.set(cacheKey, data);
      renderDiscographySearchResults(data, cleanQuery, isArtistExact);
    } catch (err) {
      if (err.name === "AbortError") {
        return; // Expected cancellation from user typing a newer query
      }
      if (thisSearchSeq !== currentSearchSequenceId) return;
      console.error("Search failed:", err);
      loadingIndicator.classList.add("hidden");
      emptyIndicator.classList.remove("hidden");
    } finally {
      if (thisSearchSeq === currentSearchSequenceId) {
        loadingIndicator.classList.add("hidden");
      }
    }
  }

  function filterDiscographyCategory(category) {
    if (!currentArtistDiscography) return;
    currentCategoryFilter = category;

    const pillBtns = document.querySelectorAll(".cat-pill");
    pillBtns.forEach(btn => {
      if (btn.getAttribute("data-cat") === category) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    let displayAlbums = [];
    let countLabel = "releases";

    if (category === "all") {
      displayAlbums = currentArtistDiscography.all || [];
      countLabel = "total releases";
    } else if (category === "albums") {
      displayAlbums = currentArtistDiscography.albums || [];
      countLabel = "studio albums";
    } else if (category === "compilations") {
      displayAlbums = currentArtistDiscography.compilations || [];
      countLabel = "compilations & live albums";
    } else if (category === "eps") {
      displayAlbums = currentArtistDiscography.eps || [];
      countLabel = "EPs & mini-albums";
    } else if (category === "singles") {
      displayAlbums = currentArtistDiscography.singles || [];
      countLabel = "singles & drops";
    }

    // Safety fallback: if selected category is empty but 'all' has results, show all
    if (displayAlbums.length === 0 && (currentArtistDiscography.all || []).length > 0) {
      displayAlbums = currentArtistDiscography.all;
      countLabel = "matching releases";
    }

    if (currentArtistDiscography.is_artist) {
      const nStudio = (currentArtistDiscography.albums || []).length;
      const nComp = (currentArtistDiscography.compilations || []).length;
      const nEps = (currentArtistDiscography.eps || []).length;
      const nSingles = (currentArtistDiscography.singles || []).length;
      viewSectionCount.innerHTML = `Showing <strong>${displayAlbums.length}</strong> ${countLabel} <span style="opacity: 0.6; margin-left: 6px;">(${nStudio} Studio • ${nComp} Compilations • ${nEps} EPs • ${nSingles} Singles)</span>`;
    } else {
      const qVal = omniSearchInput ? omniSearchInput.value.trim() : "";
      viewSectionCount.innerHTML = `Showing <strong>${displayAlbums.length}</strong> ${countLabel}${qVal ? ` for "${escapeHtml(qVal)}"` : ""}`;
    }

    renderCurrentView(displayAlbums);
  }

  document.querySelectorAll(".cat-pill").forEach(btn => {
    btn.addEventListener("click", () => {
      filterDiscographyCategory(btn.getAttribute("data-cat"));
    });
  });

  omniSearchInput.addEventListener("input", () => {
    const val = omniSearchInput.value.trim();
    if (val.length > 0) {
      searchClearBtn.classList.remove("hidden");
    } else {
      searchClearBtn.classList.add("hidden");
    }

    clearTimeout(searchDebounceTimer);

    if (val.length === 0) {
      if (activeSearchAbortController) {
        activeSearchAbortController.abort();
        activeSearchAbortController = null;
      }
      currentSearchSequenceId++;
      discographyCategoryPills.classList.add("hidden");
      if (artistGapBanner) artistGapBanner.classList.add("hidden");
      if (currentViewType === "library") {
        loadLibrary();
      } else {
        loadCharts(currentGenre);
      }
      return;
    }

    if (val.length < 2) {
      // Don't search single characters to prevent massive slow queries while typing
      return;
    }

    searchDebounceTimer = setTimeout(() => {
      const currentVal = omniSearchInput.value.trim();
      if (currentVal.length >= 2) {
        currentViewType = "search";
        performSearch(currentVal);
      }
    }, 380);
  });

  omniSearchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      clearTimeout(searchDebounceTimer);
      const val = omniSearchInput.value.trim();
      if (val.length >= 2) {
        currentViewType = "search";
        performSearch(val);
      }
    } else if (e.key === "Escape") {
      omniSearchInput.value = "";
      searchClearBtn.click();
      omniSearchInput.blur();
    }
  });

  searchClearBtn.addEventListener("click", () => {
    clearTimeout(searchDebounceTimer);
    if (activeSearchAbortController) {
      activeSearchAbortController.abort();
      activeSearchAbortController = null;
    }
    currentSearchSequenceId++;
    omniSearchInput.value = "";
    searchClearBtn.classList.add("hidden");
    discographyCategoryPills.classList.add("hidden");
    currentArtistDiscography = null;
    if (artistGapBanner) artistGapBanner.classList.add("hidden");
    if (currentViewType === "library") {
      if (librarySearchInput) librarySearchInput.value = "";
      loadLibrary();
    } else {
      loadCharts(currentGenre);
    }
  });

  // Sidebar Static Navigation
  document.querySelectorAll(".station-sidebar .nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      omniSearchInput.value = "";
      searchClearBtn.classList.add("hidden");
      discographyCategoryPills.classList.add("hidden");
      currentArtistDiscography = null;
      if (artistGapBanner) artistGapBanner.classList.add("hidden");

      const navType = btn.getAttribute("data-type");
      const navTarget = btn.getAttribute("data-target");

      if (navType === "genre") {
        loadCharts(navTarget);
      } else if (navType === "special" && navTarget === "library") {
        loadLibrary();
      } else if (navType === "special" && navTarget === "library_radio") {
        startLibraryDjRadio();
      } else if (navType === "special" && navTarget === "surprise") {
        loadSurpriseCrate();
      }
    });
  });

  // =========================================================================
  // LIBRARY DJ RADIO ENGINE
  // =========================================================================
  async function startLibraryDjRadio(showNotification = true) {
    if (navLibraryRadio) navLibraryRadio.classList.add("active");
    if (btnLibraryRadioLaunch) {
      btnLibraryRadioLaunch.disabled = true;
      btnLibraryRadioLaunch.innerHTML = '<span class="radio-pulse-icon">⏳</span><span>Mixing Radio...</span>';
    }

    try {
      const radioLimit = (configData && configData.radio_batch_size) ? configData.radio_batch_size : 60;
      const res = await fetch(`/api/library/radio?limit=${radioLimit}`);
      const data = await res.json();
      const tracks = data.tracks || [];

      if (!tracks || tracks.length === 0) {
        showToast("No downloaded albums found in your music library yet. Download an album to start the radio!", "warn");
        if (navLibraryRadio) navLibraryRadio.classList.remove("active");
        return;
      }

      isLibraryRadioMode = true;
      isFullAlbumMode = true;
      currentAlbumDetails = {
        id: "library_dj_radio",
        title: "Library DJ Radio (All Albums)",
        artist: "Various Artists",
        cover_big: tracks[0].cover_big || tracks[0].cover_small || "",
        cover_small: tracks[0].cover_small || ""
      };
      currentTracklist = tracks;
      currentTrackIndex = 0;

      if (hudRerollRadioBtn) hudRerollRadioBtn.classList.remove("hidden");
      if (dockPillRerollBtn) dockPillRerollBtn.classList.remove("hidden");

      playTrackAtIndex(0, true);
      showPlayerHud();

      if (showNotification) {
        showToast(`📻 Library DJ Radio Started — ${tracks.length} tracks queued across your albums!`, "success");
      }
    } catch (err) {
      console.error("Failed to start library radio:", err);
      showToast("Failed to launch library DJ radio", "error");
      if (navLibraryRadio) navLibraryRadio.classList.remove("active");
    } finally {
      if (btnLibraryRadioLaunch) {
        btnLibraryRadioLaunch.disabled = false;
        btnLibraryRadioLaunch.innerHTML = '<span class="radio-pulse-icon">📻</span><span>Start DJ Radio</span>';
      }
    }
  }

  if (btnLibraryRadioLaunch) {
    btnLibraryRadioLaunch.addEventListener("click", () => {
      startLibraryDjRadio();
    });
  }

  if (hudRerollRadioBtn) {
    hudRerollRadioBtn.addEventListener("click", () => {
      startLibraryDjRadio(false);
      showToast("🔀 Re-rolled Fresh DJ Radio Mix!", "info");
    });
  }

  if (dockPillRerollBtn) {
    dockPillRerollBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      startLibraryDjRadio(false);
      showToast("🔀 Re-rolled Fresh DJ Radio Mix!", "info");
    });
  }

  function filterLocalLibraryUI(q) {
    const term = (q || "").trim().toLowerCase();
    if (!term) {
      if (librarySearchClearBtn) librarySearchClearBtn.classList.add("hidden");
      emptyIndicator.classList.add("hidden");
      viewSectionCount.textContent = `${localLibraryAlbums.length} albums on disk`;
      renderCurrentView(localLibraryAlbums);
      return;
    }

    if (librarySearchClearBtn) librarySearchClearBtn.classList.remove("hidden");
    const matched = localLibraryAlbums.filter(a => 
      (a.title || "").toLowerCase().includes(term) || 
      (a.artist || "").toLowerCase().includes(term)
    );

    viewSectionCount.textContent = `${matched.length} of ${localLibraryAlbums.length} albums matching "${q.trim()}"`;
    if (matched.length === 0) {
      emptyIndicator.classList.remove("hidden");
      albumsGrid.innerHTML = "";
      if (albumsTableBody) albumsTableBody.innerHTML = "";
    } else {
      emptyIndicator.classList.add("hidden");
      renderCurrentView(matched);
    }
  }

  if (librarySearchInput) {
    librarySearchInput.addEventListener("input", (e) => {
      const v = e.target.value;
      if (omniSearchInput) omniSearchInput.value = v;
      filterLocalLibraryUI(v);
    });
  }

  if (librarySearchClearBtn) {
    librarySearchClearBtn.addEventListener("click", () => {
      if (librarySearchInput) librarySearchInput.value = "";
      if (omniSearchInput) omniSearchInput.value = "";
      filterLocalLibraryUI("");
      if (librarySearchInput) librarySearchInput.focus();
    });
  }

  async function loadLibrary(query = "") {
    currentViewType = "library";
    discographyCategoryPills.classList.add("hidden");
    if (btnLibraryRadioLaunch) btnLibraryRadioLaunch.classList.remove("hidden");
    if (librarySearchWrap) {
      librarySearchWrap.classList.remove("hidden");
      if (librarySearchInput && !query) librarySearchInput.value = "";
      if (librarySearchClearBtn && !query) librarySearchClearBtn.classList.add("hidden");
    }
    viewSectionTitle.textContent = "💾 My Local Music Library";

    // 0ms instant display if already scanned in memory
    if (!query && localLibraryAlbums && localLibraryAlbums.length > 0) {
      loadingIndicator.classList.add("hidden");
      emptyIndicator.classList.add("hidden");
      viewSectionCount.textContent = `${localLibraryAlbums.length} albums on disk`;
      renderCurrentView(localLibraryAlbums);
      fetch("/api/library/albums").then(r => r.json()).then(d => {
        if (d && d.albums) {
          localLibraryAlbums = d.albums;
          if (currentViewType === "library" && (!librarySearchInput || !librarySearchInput.value)) {
            viewSectionCount.textContent = `${localLibraryAlbums.length} albums on disk`;
            renderCurrentView(localLibraryAlbums);
          }
        }
      }).catch(() => {});
      return;
    }

    loadingIndicator.classList.remove("hidden");
    emptyIndicator.classList.add("hidden");
    albumsGrid.innerHTML = "";
    if (albumsTableBody) albumsTableBody.innerHTML = "";
    viewSectionCount.textContent = "Scanning music library drive...";

    try {
      const url = query ? `/api/library/albums?q=${encodeURIComponent(query)}` : "/api/library/albums";
      const res = await fetch(url);
      const data = await res.json();
      const albums = (data && data.albums) || [];
      if (!query) {
        localLibraryAlbums = albums;
      }

      loadingIndicator.classList.add("hidden");
      if (albums.length === 0) {
        emptyIndicator.classList.remove("hidden");
        viewSectionCount.textContent = query ? `0 albums matching "${query}"` : "0 albums stored";
        return;
      }

      viewSectionCount.textContent = query ? `${albums.length} of ${localLibraryAlbums.length} albums matching "${query}"` : `${albums.length} albums on disk`;
      renderCurrentView(albums);
    } catch (err) {
      console.error("Failed to load local library:", err);
      loadingIndicator.classList.add("hidden");
      emptyIndicator.classList.remove("hidden");
    }
  }

  // Time Machine Era Shuffle
  if (btnShuffleEra) {
    btnShuffleEra.addEventListener("click", (e) => {
      e.stopPropagation();
      const eras = ["30s_40s", "50s", "60s", "70s", "80s", "90s", "2000s", "2010s", "2020s"];
      const candidates = eras.filter(item => item !== currentGenre);
      const picked = candidates[Math.floor(Math.random() * candidates.length)] || "60s";
      
      document.querySelectorAll(".station-sidebar .nav-item").forEach(b => {
        if (b.getAttribute("data-target") === picked) {
          b.classList.add("active");
        } else {
          b.classList.remove("active");
        }
      });
      omniSearchInput.value = "";
      searchClearBtn.classList.add("hidden");
      discographyCategoryPills.classList.add("hidden");
      showToast(`⏳ Time Machine: Warped to the ${picked.toUpperCase()} Era!`, "info");
      loadCharts(picked, true);
    });
  }

  // Genre Shuffle
  if (btnShuffleGenre) {
    btnShuffleGenre.addEventListener("click", (e) => {
      e.stopPropagation();
      const genres = ["rap", "dance", "rock", "rnb", "metal", "electronic", "indie", "jazz", "classical"];
      const candidates = genres.filter(item => item !== currentGenre);
      const picked = candidates[Math.floor(Math.random() * candidates.length)] || "dance";
      
      document.querySelectorAll(".station-sidebar .nav-item").forEach(b => {
        if (b.getAttribute("data-target") === picked) {
          b.classList.add("active");
        } else {
          b.classList.remove("active");
        }
      });
      omniSearchInput.value = "";
      searchClearBtn.classList.add("hidden");
      discographyCategoryPills.classList.add("hidden");
      showToast(`🎲 Shuffled into ${picked.toUpperCase()} Crate!`, "info");
      loadCharts(picked, true);
    });
  }

  // =========================================================================
  // 6. MODAL TABS SWITCHER
  // =========================================================================
  function switchModalTab(tabName) {
    modalTabBtns.forEach(btn => {
      if (btn.getAttribute("data-tab") === tabName) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    modalPaneTracks.classList.add("hidden");
    if (modalPaneLyrics) modalPaneLyrics.classList.add("hidden");
    modalPaneStory.classList.add("hidden");
    modalPaneSimilar.classList.add("hidden");

    if (tabName === "tracks") {
      modalPaneTracks.classList.remove("hidden");
    } else if (tabName === "lyrics") {
      if (modalPaneLyrics) modalPaneLyrics.classList.remove("hidden");
      if (currentTracklist && currentTrackIndex >= 0 && currentTracklist[currentTrackIndex]) {
        const tr = currentTracklist[currentTrackIndex];
        const art = tr.artist || (currentAlbumDetails && currentAlbumDetails.artist) || "";
        const alb = currentAlbumDetails ? currentAlbumDetails.title : "";
        loadTrackLyrics(art, tr.title, alb, tr.duration);
      }
    } else if (tabName === "story") {
      modalPaneStory.classList.remove("hidden");
    } else if (tabName === "similar") {
      modalPaneSimilar.classList.remove("hidden");
    }
  }

  modalTabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      switchModalTab(btn.getAttribute("data-tab"));
    });
  });

  // =========================================================================
  // 7. ALBUM MODAL & METADATA LOADER
  // =========================================================================
  // 7. ALBUM MODAL & METADATA LOADER
  // =========================================================================
  function renderAlbumModalContent(data, albumId) {
    currentAlbumDetails = data;
    currentTracklist = data.tracks || [];
    isLibraryRadioMode = false;
    if (navLibraryRadio) navLibraryRadio.classList.remove("active");

    modalCoverArt.onerror = () => { modalCoverArt.src = window.FALLBACK_COVER_SVG; };
    modalCoverArt.src = (data.cover_big || data.cover_small || "").trim() || window.FALLBACK_COVER_SVG;
    modalAlbumTitle.textContent = data.title || "Untitled Album";
    modalArtistName.textContent = data.artist || "Unknown Artist";
    const badges = resolveAlbumBadges(data);
    modalYearBadge.textContent = badges.yearText || "📅 —";
    const numTracks = currentTracklist.length;
    let dlBtnText = "Download Album";

    if (badges.fullModalType === "OFFICIAL SINGLE") {
      dlBtnText = "Download Single";
    } else if (badges.fullModalType === "EP / MINI-ALBUM") {
      dlBtnText = "Download EP";
    } else {
      dlBtnText = "Download Album";
    }

    if (modalTypeBadge) modalTypeBadge.textContent = badges.fullModalType;
    
    const isOwned = !!data.owned || String(albumId).startsWith("local_");
    if (isOwned) {
      if (modalDownloadBtnText) modalDownloadBtnText.textContent = "💾 In Library";
      if (modalDownloadAlbumBtn) {
        modalDownloadAlbumBtn.disabled = true;
        modalDownloadAlbumBtn.style.opacity = "0.7";
        modalDownloadAlbumBtn.title = "This album is already stored on your music library drive.";
      }
    } else {
      if (modalDownloadBtnText) modalDownloadBtnText.textContent = dlBtnText;
      if (modalDownloadAlbumBtn) {
        modalDownloadAlbumBtn.disabled = false;
        modalDownloadAlbumBtn.style.opacity = "1";
        modalDownloadAlbumBtn.title = "Download this album to your music library";
      }
    }

    modalTracksCount.textContent = numTracks === 1 ? "🎵 1 Track (Single)" : `🎵 ${numTracks} Tracks`;
    modalTracklistTabCount.textContent = numTracks;
    modalGenreBadge.textContent = (data.genres && data.genres[0]) ? `⚡ ${data.genres[0]}` : "⚡ Studio Album";

    const resolvedLabel = data.label || "Official Studio Release";
    modalLabelBadge.textContent = `🏷️ ${resolvedLabel}`;
    modalBarcodeBadge.textContent = data.barcode && data.barcode !== "—" ? `📦 UPC: ${data.barcode}` : "📦 Verified Catalog";

    storyLabelVal.textContent = resolvedLabel;
    storyYearVal.textContent = data.year || data.release_date || "—";
    storyUpcVal.textContent = data.barcode || "Verified";
    storyTracksVal.textContent = numTracks === 1 ? "1 Track (Single)" : `${numTracks} Tracks`;

    if (data.backstory && data.backstory.length > 20) {
      modalBackstoryText.textContent = data.backstory;
    } else {
      modalBackstoryText.textContent = `${data.title} is a landmark studio album by ${data.artist}. Released under ${resolvedLabel}, featuring ${currentTracklist.length} complete tracks with full dynamic production and songwriting arrangements.`;
    }

    const simList = data.similar_albums || [];
    modalSimilarGrid.innerHTML = "";
    if (simList.length > 0) {
      simList.forEach(sim => {
        const card = document.createElement("div");
        card.className = "similar-card";
        card.title = `${sim.title} by ${sim.artist}`;
        const simCover = (sim.cover_big || "").trim() || window.FALLBACK_COVER_SVG;
        card.innerHTML = `
          <div class="similar-art-wrap">
            <img src="${simCover}" class="similar-art" loading="lazy" />
          </div>
          <div class="similar-card-info">
            <div class="similar-card-title">${sim.title}</div>
            <div class="similar-card-artist">${sim.artist}</div>
            <div class="similar-card-year">${sim.year ? '📅 ' + sim.year : ''}</div>
          </div>
        `;
        const simImg = card.querySelector(".similar-art");
        if (simImg) {
          simImg.addEventListener("error", function() {
            this.onerror = null;
            this.src = window.FALLBACK_COVER_SVG;
          });
        }
        card.addEventListener("click", () => openAlbumModal(sim.id));
        modalSimilarGrid.appendChild(card);
      });
    } else {
      modalSimilarGrid.innerHTML = "<div style='grid-column: 1/-1; padding: 24px; text-align: center; color: #94a3b8;'>No companion albums found for this artist.</div>";
    }

    renderTracklist(currentTracklist);
  }

  // =========================================================================
  // INSPECT SIDE DRAWER (QUICK INTERACTIVE TRACKLIST & AUDITION STATION)
  // =========================================================================
  const inspectDrawer = document.getElementById("inspectDrawer");
  const inspectDrawerBackdrop = document.getElementById("inspectDrawerBackdrop");
  const drawerCloseBtn = document.getElementById("drawerCloseBtn");
  const drawerExpandFullBtn = document.getElementById("drawerExpandFullBtn");
  const drawerCoverImg = document.getElementById("drawerCoverImg");
  const drawerTypeBadge = document.getElementById("drawerTypeBadge");
  const drawerAlbumTitle = document.getElementById("drawerAlbumTitle");
  const drawerArtistName = document.getElementById("drawerArtistName");
  const drawerYear = document.getElementById("drawerYear");
  const drawerTracksCount = document.getElementById("drawerTracksCount");
  const drawerTotalDuration = document.getElementById("drawerTotalDuration");
  const drawerLabel = document.getElementById("drawerLabel");
  const drawerPlayAllAuditionBtn = document.getElementById("drawerPlayAllAuditionBtn");
  const drawerDownloadAlbumBtn = document.getElementById("drawerDownloadAlbumBtn");
  const drawerDownloadBtnText = document.getElementById("drawerDownloadBtnText");
  const drawerTracklistLoading = document.getElementById("drawerTracklistLoading");
  const drawerTracklistContainer = document.getElementById("drawerTracklistContainer");

  let currentInspectAlbum = null;
  let currentInspectTracklist = [];

  function formatDurationMinutes(seconds) {
    if (!seconds || seconds <= 0) return "";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}m ${s < 10 ? '0' : ''}${s}s`;
  }

  function formatTrackDuration(seconds) {
    if (!seconds || seconds <= 0) return "--:--";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function playTrack(track, index, list, isFullAlbum = false) {
    if (list && list.length > 0) {
      currentTracklist = list;
    }
    if (currentInspectAlbum) {
      currentAlbumDetails = currentInspectAlbum;
    }
    playTrackAtIndex(index, isFullAlbum, 0);
  }

  async function downloadAlbum(albumId, artist, title) {
    const alb = currentInspectAlbum || currentAlbumDetails || { id: albumId, artist: artist, title: title };
    const tracksToDl = (alb.tracks && alb.tracks.length > 0) ? alb.tracks : currentTracklist;
    try {
      showToast(`Queueing "${alb.title || title}" (${tracksToDl.length} tracks)...`, "info");
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: alb.id || albumId,
          title: alb.title || title,
          artist: alb.artist || artist,
          cover_big: alb.cover_big || alb.cover_small || "",
          year: alb.year || "",
          tracks: tracksToDl
        })
      });
      showToast(`Queued album "${alb.title || title}" for download`, "success");
      updateQueueUI();
    } catch (err) {
      console.error("Queue download failed:", err);
      showToast("Failed to queue album download", "error");
    }
  }

  async function downloadSingleTrack(trackId, artist, trackTitle, albumTitle) {
    try {
      showToast(`Queueing "${trackTitle}"...`, "info");
      const res = await fetch("/api/download/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: trackId,
          artist: artist,
          title: trackTitle,
          album: albumTitle
        })
      });
      showToast(`Queued "${trackTitle}" for download`, "success");
      updateQueueUI();
    } catch (err) {
      console.error("Queue single track failed:", err);
      showToast("Failed to queue track download", "error");
    }
  }

  function closeInspectDrawer() {
    if (inspectDrawer) inspectDrawer.classList.add("hidden");
    if (inspectDrawerBackdrop) inspectDrawerBackdrop.classList.add("hidden");
  }

  if (drawerCloseBtn) drawerCloseBtn.addEventListener("click", closeInspectDrawer);
  if (inspectDrawerBackdrop) inspectDrawerBackdrop.addEventListener("click", closeInspectDrawer);

  async function openInspectDrawer(albumId) {
    if (!albumId) return;
    if (albumModal && !albumModal.classList.contains("hidden")) {
      albumModal.classList.add("hidden");
    }

    if (inspectDrawerBackdrop) inspectDrawerBackdrop.classList.remove("hidden");
    if (inspectDrawer) inspectDrawer.classList.remove("hidden");

    if (drawerTracklistLoading) drawerTracklistLoading.classList.remove("hidden");
    if (drawerTracklistContainer) drawerTracklistContainer.innerHTML = "";

    try {
      let data = null;
      if (ALBUM_MODAL_CACHE.has(String(albumId))) {
        data = ALBUM_MODAL_CACHE.get(String(albumId));
      } else if (String(albumId).startsWith("local_")) {
        const matchingAlb = currentDisplayedAlbums.find(a => String(a.id) === String(albumId));
        const ownedPath = matchingAlb ? (matchingAlb.owned_path || "") : "";
        const res = await fetch(`/api/library/album-details?path=${encodeURIComponent(ownedPath)}`);
        data = await res.json();
      } else {
        const res = await fetch(`/api/album?id=${encodeURIComponent(albumId)}`);
        data = await res.json();
      }

      if (data) {
        ALBUM_MODAL_CACHE.set(String(albumId), data);
        renderInspectDrawerContent(data, albumId);
      }
    } catch (err) {
      console.error("Failed to load inspect album:", err);
      if (drawerTracklistLoading) drawerTracklistLoading.classList.add("hidden");
      if (drawerTracklistContainer) {
        drawerTracklistContainer.innerHTML = `<div style="padding: 24px; text-align: center; color: #ef4444;">Failed to load tracks.</div>`;
      }
    }
  }

  function renderInspectDrawerContent(data, albumId) {
    currentInspectAlbum = data;
    currentInspectTracklist = data.tracks || [];

    if (drawerTracklistLoading) drawerTracklistLoading.classList.add("hidden");

    const cover = (data.cover_big || data.cover_small || "").trim() || window.FALLBACK_COVER_SVG;
    if (drawerCoverImg) drawerCoverImg.src = cover;
    if (drawerAlbumTitle) drawerAlbumTitle.textContent = data.title || "Untitled Album";
    if (drawerArtistName) drawerArtistName.textContent = data.artist || "Unknown Artist";

    const b = resolveAlbumBadges(data);
    if (drawerTypeBadge) {
      drawerTypeBadge.className = `card-type-badge ${b.typeClass}`;
      drawerTypeBadge.textContent = b.typeLabel;
    }

    if (drawerYear) drawerYear.textContent = b.yearText || "📅 —";
    if (drawerTracksCount) drawerTracksCount.textContent = `🎵 ${currentInspectTracklist.length} Tracks`;

    let totalSec = currentInspectTracklist.reduce((acc, t) => acc + (parseInt(t.duration, 10) || 0), 0);
    if (drawerTotalDuration) drawerTotalDuration.textContent = totalSec > 0 ? `⏱️ ${formatDurationMinutes(totalSec)}` : "⏱️ —";
    if (drawerLabel) drawerLabel.textContent = `🏷️ ${data.label || "Studio Release"}`;

    // Action buttons
    if (drawerExpandFullBtn) {
      drawerExpandFullBtn.onclick = () => {
        closeInspectDrawer();
        openAlbumModal(albumId);
      };
    }

    if (drawerPlayAllAuditionBtn) {
      drawerPlayAllAuditionBtn.onclick = () => {
        if (currentInspectTracklist.length > 0) {
          isFullAlbumMode = false;
          playTrack(currentInspectTracklist[0], 0, currentInspectTracklist, false);
          showToast(`Auditioning "${data.title}"`, "info");
        }
      };
    }

    if (drawerDownloadAlbumBtn) {
      const isOwned = !!data.owned || String(albumId).startsWith("local_");
      if (isOwned) {
        if (drawerDownloadBtnText) drawerDownloadBtnText.textContent = "💾 In Library";
        drawerDownloadAlbumBtn.disabled = true;
        drawerDownloadAlbumBtn.style.opacity = "0.7";
      } else {
        if (drawerDownloadBtnText) drawerDownloadBtnText.textContent = "📥 Download Album";
        drawerDownloadAlbumBtn.disabled = false;
        drawerDownloadAlbumBtn.style.opacity = "1";
        drawerDownloadAlbumBtn.onclick = () => {
          downloadAlbum(albumId, data.artist, data.title);
        };
      }
    }

    // Render Tracklist
    if (!drawerTracklistContainer) return;
    drawerTracklistContainer.innerHTML = "";

    currentInspectTracklist.forEach((track, idx) => {
      const row = document.createElement("div");
      row.className = "drawer-track-row";
      row.dataset.trackIdx = idx;

      const durStr = formatTrackDuration(track.duration);
      const isExplicit = track.explicit ? `<span style="font-size: 9px; background: rgba(239, 68, 68, 0.2); color: #f87171; padding: 1px 4px; border-radius: 3px; font-weight: 800; margin-left: 6px;">E</span>` : "";

      row.innerHTML = `
        <span class="drawer-tr-num">${idx + 1}</span>
        <div class="drawer-tr-info">
          <span class="drawer-tr-title">${track.title || "Track"} ${isExplicit}</span>
          <span class="drawer-tr-dur">${durStr} • Deezer 30s Audition</span>
        </div>
        <div class="drawer-tr-actions">
          <button class="drawer-tr-play-btn" title="Audition 30s Track Preview">▶</button>
          <button class="drawer-tr-dl-btn" title="Download this track">📥</button>
        </div>
      `;

      const playBtn = row.querySelector(".drawer-tr-play-btn");
      if (playBtn) {
        playBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          isFullAlbumMode = false;
          playTrack(track, idx, currentInspectTracklist, false);
        });
      }

      const dlBtn = row.querySelector(".drawer-tr-dl-btn");
      if (dlBtn) {
        dlBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          downloadSingleTrack(track.id, data.artist, track.title, data.title);
        });
      }

      row.addEventListener("click", () => {
        isFullAlbumMode = false;
        playTrack(track, idx, currentInspectTracklist, false);
      });

      drawerTracklistContainer.appendChild(row);
    });
  }

  async function openAlbumModal(albumId) {
    closeInspectDrawer();
    albumModal.classList.remove("hidden");
    switchModalTab("tracks");

    // 0ms INSTANT MODAL RENDER IF IN CACHE
    if (ALBUM_MODAL_CACHE.has(String(albumId))) {
      const cached = ALBUM_MODAL_CACHE.get(String(albumId));
      renderAlbumModalContent(cached, albumId);
      return;
    }

    modalAlbumTitle.textContent = "Loading album...";
    modalArtistName.textContent = "";
    modalTracklist.innerHTML = "<div style='padding: 32px; text-align: center; color: #94a3b8;'>Scanning album tracks & metadata...</div>";
    modalTracklistTabCount.textContent = "0";

    try {
      let data = null;
      if (String(albumId) === "library_dj_radio") {
        data = {
          id: "library_dj_radio",
          title: "Library DJ Radio (Live Mix)",
          artist: (currentTracklist[0] && currentTracklist[0].artist) || "Various Artists",
          cover_big: (currentTracklist[0] && (currentTracklist[0].cover_big || currentTracklist[0].cover_small)) || "",
          cover_small: (currentTracklist[0] && currentTracklist[0].cover_small) || "",
          year: new Date().getFullYear(),
          genres: ["DJ Radio Mix"],
          label: "Local Library Collection",
          owned: true,
          tracks: currentTracklist
        };
      } else if (String(albumId).startsWith("local_")) {
        const matchingAlb = (currentDisplayedAlbums && currentDisplayedAlbums.find(a => String(a.id) === String(albumId)))
          || (localLibraryAlbums && localLibraryAlbums.find(a => String(a.id) === String(albumId)));
        const ownedPath = matchingAlb ? (matchingAlb.owned_path || "") : "";
        const res = await fetch(`/api/library/album-details?path=${encodeURIComponent(ownedPath)}`);
        data = await res.json();
      } else {
        const res = await fetch(`/api/album?id=${encodeURIComponent(albumId)}`);
        data = await res.json();
      }

      if (data) {
        ALBUM_MODAL_CACHE.set(String(albumId), data);
        renderAlbumModalContent(data, albumId);
      }
    } catch (err) {
      console.error("Failed to load album details:", err);
      modalTracklist.innerHTML = "<div style='padding: 24px; text-align: center; color: #ef4444;'>Failed to load tracklist.</div>";
    }
  }

  modalArtistName.addEventListener("click", () => {
    if (currentAlbumDetails && currentAlbumDetails.artist) {
      albumModal.classList.add("hidden");
      omniSearchInput.value = currentAlbumDetails.artist;
      currentViewType = "artist";
      performSearch(currentAlbumDetails.artist, true);
    }
  });

  // Rapid Hover-to-Audition Waveform Generator (SUPERPOWER 3)
  function renderTracklist(tracks) {
    modalTracklist.innerHTML = "";
    tracks.forEach((track, idx) => {
      const row = document.createElement("div");
      row.className = `track-row ${idx === currentTrackIndex ? 'playing' : ''}`;
      row.title = "Click to stream full studio track";

      // 8 dynamic simulated waveform bars for hover scrubbing
      const barsHtml = [45, 80, 60, 95, 70, 85, 50, 65].map(h => `<span class="audition-bar" style="height: ${h}%"></span>`).join("");

      row.innerHTML = `
        <span class="track-num">${track.track_position || (idx + 1)}</span>
        <span class="track-title" title="${track.title}">${track.title}</span>
        <span class="track-artist" title="${track.artist}">${track.artist}</span>
        <span class="track-time">${formatTime(track.duration)}</span>
        <div class="track-actions-cell">
          <div class="track-audition-wrap" title="Hover / click wave to audition track drop instantly" data-index="${idx}">
            <div class="track-audition-bars">${barsHtml}</div>
          </div>
          <button class="btn-lyrics-track" data-index="${idx}" title="View synchronized lyrics">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            <span>Lyrics</span>
          </button>
          <button class="btn-preview-track" data-index="${idx}" title="Listen to 30s quick preview">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <span>Preview</span>
          </button>
          <button class="btn-dl-track" data-index="${idx}" title="Download this track to library">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
        </div>
      `;

      // Single click on track row plays full audio track
      row.addEventListener("click", (e) => {
        if (e.target.closest(".btn-lyrics-track") || e.target.closest(".btn-preview-track") || e.target.closest(".btn-dl-track") || e.target.closest(".track-audition-wrap")) return;
        playTrackAtIndex(idx, true);
      });

      // Rapid Wave Audition Scrubber Click
      const waveScrub = row.querySelector(".track-audition-wrap");
      if (waveScrub) {
        waveScrub.addEventListener("click", (e) => {
          e.stopPropagation();
          const rect = waveScrub.getBoundingClientRect();
          const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          const seekSec = Math.floor(pct * 28);
          playTrackAtIndex(idx, false, seekSec);
        });
      }

      // Click on Lyrics button switches to lyrics tab & fetches track lyrics
      const lyricsBtn = row.querySelector(".btn-lyrics-track");
      if (lyricsBtn) {
        lyricsBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          currentTrackIndex = idx;
          highlightActiveTrack();
          switchModalTab("lyrics");
          const art = track.artist || (currentAlbumDetails && currentAlbumDetails.artist) || "";
          const alb = currentAlbumDetails ? currentAlbumDetails.title : "";
          loadTrackLyrics(art, track.title, alb, track.duration);
        });
      }

      // Click on Preview button plays 30s quick preview
      const prevBtn = row.querySelector(".btn-preview-track");
      if (prevBtn) {
        prevBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          playTrackAtIndex(idx, false);
        });
      }

      // Click on single-track download button
      const dlBtn = row.querySelector(".btn-dl-track");
      if (dlBtn) {
        dlBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (!currentAlbumDetails) return;
          try {
            await fetch("/api/download/track", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                album_id: currentAlbumDetails.id,
                album_title: currentAlbumDetails.title,
                artist: currentAlbumDetails.artist,
                cover_big: currentAlbumDetails.cover_big,
                year: currentAlbumDetails.year,
                track: track
              })
            });
            showToast(`Queued "${track.title}" for download`, "success");
            updateQueueUI();
          } catch (err) {
            showToast(`Failed to queue track: ${err}`, "error");
          }
        });
      }

      modalTracklist.appendChild(row);
    });
  }

  if (modalLyricsHeaderBtn) {
    modalLyricsHeaderBtn.addEventListener("click", () => {
      switchModalTab("lyrics");
      if (currentTracklist && currentTracklist.length > 0) {
        const trIdx = currentTrackIndex >= 0 ? currentTrackIndex : 0;
        const tr = currentTracklist[trIdx];
        const art = tr.artist || (currentAlbumDetails && currentAlbumDetails.artist) || "";
        const alb = currentAlbumDetails ? currentAlbumDetails.title : "";
        loadTrackLyrics(art, tr.title, alb, tr.duration);
      }
    });
  }

  modalPlayFullAlbumBtn.addEventListener("click", () => {
    if (currentTracklist && currentTracklist.length > 0) {
      albumModal.classList.add("hidden");
      playTrackAtIndex(0, true);
    }
  });

  modalDownloadAlbumBtn.addEventListener("click", async () => {
    if (!currentAlbumDetails) return;
    modalDownloadBtnText.textContent = "Queueing...";
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: currentAlbumDetails.id,
          title: currentAlbumDetails.title,
          artist: currentAlbumDetails.artist,
          cover_big: currentAlbumDetails.cover_big,
          year: currentAlbumDetails.year,
          tracks: currentTracklist
        })
      });
      modalDownloadBtnText.textContent = "Queued ✓";
      showToast(`Queued album "${currentAlbumDetails.title}" (${currentTracklist.length} tracks)`, "success");
      setTimeout(() => { modalDownloadBtnText.textContent = "Download Album"; }, 2500);
      updateQueueUI();
    } catch (err) {
      console.error("Queue download failed:", err);
      modalDownloadBtnText.textContent = "Error";
      showToast("Download queueing failed", "error");
      setTimeout(() => { modalDownloadBtnText.textContent = "Download Album"; }, 2000);
    }
  });

  modalCloseBtn.addEventListener("click", () => {
    albumModal.classList.add("hidden");
  });

  albumModal.addEventListener("click", (e) => {
    if (e.target === albumModal) {
      albumModal.classList.add("hidden");
    }
  });

  // =========================================================================
  // 8. SETTINGS & ONBOARDING CONTROLLER
  // =========================================================================
  async function loadConfig() {
    try {
      const res = await fetch("/api/config");
      configData = await res.json();
      if (settingQualitySelect) settingQualitySelect.value = configData.audio_quality || configData.quality || "320k";
      if (settingMusicRoot) settingMusicRoot.value = configData.music_root || "";
      loadConfiguredDrives();
      if (settingFolderStructure) settingFolderStructure.value = configData.folder_structure || "artist_album_year";
      if (settingConcurrencySelect) settingConcurrencySelect.value = String(configData.download_concurrency || 4);
      if (settingSaveLrc) settingSaveLrc.checked = Boolean(configData.save_lrc_lyrics);
      if (settingEmbedCover) settingEmbedCover.checked = configData.embed_cover_art !== false;
      if (settingSaveCoverJpg) settingSaveCoverJpg.checked = configData.save_cover_jpg !== false;
      if (settingCrossfadeDuration) {
        const durVal = String(configData.crossfade_duration !== undefined ? configData.crossfade_duration : 3);
        settingCrossfadeDuration.value = durVal;
        document.querySelectorAll("#crossfadePillGroup .pill-opt-btn").forEach(btn => {
          btn.classList.toggle("active", btn.getAttribute("data-val") === durVal);
        });
      }
      if (settingAutoRescan) settingAutoRescan.checked = configData.auto_rescan_on_download !== false;
      if (settingRadioBatchSize) settingRadioBatchSize.value = String(configData.radio_batch_size || 60);
      if (settingStartupView) settingStartupView.value = configData.default_startup_view || "all";
      if (settingRadioArtistSpacing) settingRadioArtistSpacing.checked = configData.radio_artist_spacing !== false;
      if (settingDefaultDiscographyFilter) settingDefaultDiscographyFilter.value = configData.default_discography_filter || "albums";
      if (settingDiscoveryLimit) settingDiscoveryLimit.value = String(configData.discovery_album_limit !== undefined ? configData.discovery_album_limit : 100);
      if (settingFilterJunk) settingFilterJunk.checked = configData.filter_junk !== false;
      if (settingAutoAdvance) settingAutoAdvance.checked = configData.auto_advance_preview !== false;
      if (settingAutoOpenLyrics) settingAutoOpenLyrics.checked = Boolean(configData.auto_open_lyrics);
      if (settingTrackToasts) settingTrackToasts.checked = configData.show_track_toasts !== false;

      // First-Time Setup Wizard Check (triggers on new PCs / first run)
      if (!configData.first_run_completed && firstRunModal) {
        if (wizardMusicRoot) wizardMusicRoot.value = configData.music_root || "";
        if (wizardQualitySelect) wizardQualitySelect.value = configData.audio_quality || "320k";
        if (wizardFilterJunk) wizardFilterJunk.checked = configData.filter_junk !== false;
        if (wizardAutoAdvance) wizardAutoAdvance.checked = configData.auto_advance_preview !== false;
        firstRunModal.classList.remove("hidden");
      }
    } catch (err) {
      console.error("Failed to load config:", err);
    }
  }

  // Wizard Event Handlers
  if (btnWizardBrowseRoot) {
    btnWizardBrowseRoot.addEventListener("click", async () => {
      try {
        const res = await fetch("/api/browse-folder");
        const data = await res.json();
        if (data.folder) {
          wizardMusicRoot.value = data.folder;
          showToast(`Download folder selected: ${data.folder}`, "info");
        }
      } catch (err) {
        console.error("Folder picker failed:", err);
      }
    });
  }

  if (btnWizardFinish) {
    btnWizardFinish.addEventListener("click", async () => {
      const payload = {
        audio_quality: wizardQualitySelect.value,
        music_root: wizardMusicRoot.value || configData.music_root,
        filter_junk: wizardFilterJunk.checked,
        auto_advance_preview: wizardAutoAdvance.checked,
        first_run_completed: true
      };

      try {
        await fetch("/api/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        configData = { ...configData, ...payload };
        firstRunModal.classList.add("hidden");
        showToast("🎉 Workstation Configured! Welcome to Album Discovery.", "success");
        loadCharts(currentGenre);
      } catch (err) {
        console.error("Failed to save wizard config:", err);
        showToast("Failed to save settings", "error");
      }
    });
  }

  btnSettingsToggle.addEventListener("click", () => {
    loadConfig();
    loadConfiguredDrives();
    settingsModal.classList.remove("hidden");
  });

  settingsCloseBtn.addEventListener("click", () => {
    settingsModal.classList.add("hidden");
  });

  // =========================================================================
  // MULTI-DRIVE MUSIC STORAGE CONTROLLER
  // =========================================================================
  async function loadConfiguredDrives() {
    if (!drivesListContainer) return;
    try {
      const res = await fetch("/api/library/drives");
      if (!res.ok) return;
      const data = await res.json();
      renderConfiguredDrives(data.drives || [], data.download_root);
    } catch (e) {
      console.error("Failed to load configured drives:", e);
    }
  }

  function renderConfiguredDrives(drives, defaultRoot) {
    if (!drivesListContainer) return;
    if (drives.length === 0) {
      drivesListContainer.innerHTML = `<div class="drives-loading-placeholder">No music drives configured. Click Add Drive above.</div>`;
      return;
    }

    drivesListContainer.innerHTML = drives.map(drv => {
      const isDef = drv.is_default || drv.path === defaultRoot;
      const freeTxt = drv.exists 
        ? `<span class="badge-free">${drv.free_gb} GB Free</span> of ${drv.total_gb} GB (${drv.free_pct}%)`
        : `<span style="color: #f87171;">Drive not found or offline</span>`;

      const primaryActionHtml = isDef
        ? `<span class="btn-drive-action primary-badge">⭐ Primary Target</span>`
        : `<button class="btn-drive-action set-primary" data-path="${escapeHtml(drv.path)}" title="Make this drive the default download location">⭐ Set Primary</button>`;

      const removeActionHtml = drives.length > 1
        ? `<button class="btn-drive-action remove-drive" data-path="${escapeHtml(drv.path)}" title="Remove this drive from library scanner">✕</button>`
        : ``;

      return `
        <div class="drive-item-card ${isDef ? 'active-default' : ''}">
          <div class="drive-item-left">
            <span class="drive-item-icon">💽</span>
            <div class="drive-item-details">
              <div class="drive-item-path" title="${escapeHtml(drv.path)}">${escapeHtml(drv.path)}</div>
              <div class="drive-item-stats">${freeTxt}</div>
            </div>
          </div>
          <div class="drive-item-actions">
            ${primaryActionHtml}
            <button class="btn-drive-action open-drive" data-path="${escapeHtml(drv.path)}" title="Open in Windows Explorer">📂</button>
            ${removeActionHtml}
          </div>
        </div>
      `;
    }).join("");

    // Wire action buttons
    drivesListContainer.querySelectorAll(".set-primary").forEach(btn => {
      btn.addEventListener("click", async () => {
        const p = btn.getAttribute("data-path");
        try {
          const res = await fetch("/api/library/drives", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "set_default", path: p })
          });
          const d = await res.json();
          renderConfiguredDrives(d.drives || [], d.download_root);
          showToast(`Primary download drive set to: ${p}`, "success");
        } catch (e) {
          showToast("Failed to set primary drive", "error");
        }
      });
    });

    drivesListContainer.querySelectorAll(".open-drive").forEach(btn => {
      btn.addEventListener("click", async () => {
        const p = btn.getAttribute("data-path");
        try {
          await fetch("/api/open-path", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: p })
          });
        } catch (e) {
          showToast("Could not open drive folder", "error");
        }
      });
    });

    drivesListContainer.querySelectorAll(".remove-drive").forEach(btn => {
      btn.addEventListener("click", async () => {
        const p = btn.getAttribute("data-path");
        if (!confirm(`Remove "${p}" from scanned music paths?`)) return;
        try {
          const res = await fetch("/api/library/drives", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "remove", path: p })
          });
          const d = await res.json();
          renderConfiguredDrives(d.drives || [], d.download_root);
          showToast(`Drive removed: ${p}`, "info");
        } catch (e) {
          showToast("Failed to remove drive", "error");
        }
      });
    });
  }

  if (btnAddMusicDriveBtn) {
    btnAddMusicDriveBtn.addEventListener("click", async () => {
      try {
        const res = await fetch("/api/browse-folder");
        const data = await res.json();
        if (data.folder) {
          const addRes = await fetch("/api/library/drives", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "add", path: data.folder })
          });
          const d = await addRes.json();
          renderConfiguredDrives(d.drives || [], d.download_root);
          showToast(`Music drive added: ${data.folder}`, "success");
        }
      } catch (e) {
        showToast("Failed to add drive", "error");
      }
    });
  }

  document.querySelectorAll("#crossfadePillGroup .pill-opt-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#crossfadePillGroup .pill-opt-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      if (settingCrossfadeDuration) {
        settingCrossfadeDuration.value = btn.getAttribute("data-val");
      }
    });
  });



  if (btnRescanLibraryNow) {
    btnRescanLibraryNow.addEventListener("click", async () => {
      btnRescanLibraryNow.disabled = true;
      btnRescanLibraryNow.innerHTML = "<span>⏳ Scanning Disk...</span>";
      try {
        const res = await fetch("/api/library/status");
        const data = await res.json();
        const total = data.total_owned || (data.albums ? data.albums.length : 0);
        showToast(`✓ Library Re-Indexed: ${total} albums ready`, "success");
        if (currentViewType === "library") {
          loadLibrary();
        }
      } catch (e) {
        showToast("Failed to re-index library", "error");
      } finally {
        btnRescanLibraryNow.disabled = false;
        btnRescanLibraryNow.innerHTML = "<span>🔄 Re-Index</span>";
      }
    });
  }

  if (btnBackfillCoversNow) {
    btnBackfillCoversNow.addEventListener("click", async () => {
      btnBackfillCoversNow.disabled = true;
      btnBackfillCoversNow.innerHTML = "<span>⏳ Repairing...</span>";
      try {
        const res = await fetch("/api/library/backfill-covers");
        const data = await res.json();
        const count = data.backfilled_count || 0;
        showToast(`✓ Cover repair complete: ${count} covers downloaded`, "success");
        if (currentViewType === "library") {
          loadLibrary();
        }
      } catch (e) {
        showToast("Cover repair failed", "error");
      } finally {
        btnBackfillCoversNow.disabled = false;
        btnBackfillCoversNow.innerHTML = "<span>🖼️ Repair Covers</span>";
      }
    });
  }

  btnSaveSettings.addEventListener("click", async () => {
    const payload = {
      audio_quality: settingQualitySelect.value,
      music_root: settingMusicRoot.value,
      folder_structure: settingFolderStructure ? settingFolderStructure.value : "artist_album_year",
      download_concurrency: settingConcurrencySelect ? parseInt(settingConcurrencySelect.value, 10) : 4,
      save_lrc_lyrics: settingSaveLrc ? settingSaveLrc.checked : false,
      embed_cover_art: settingEmbedCover ? settingEmbedCover.checked : true,
      save_cover_jpg: settingSaveCoverJpg ? settingSaveCoverJpg.checked : true,
      crossfade_audio: settingCrossfade ? settingCrossfade.checked : true,
      crossfade_duration: settingCrossfadeDuration ? parseInt(settingCrossfadeDuration.value, 10) : 3,
      auto_rescan_on_download: settingAutoRescan ? settingAutoRescan.checked : true,
      radio_batch_size: settingRadioBatchSize ? parseInt(settingRadioBatchSize.value, 10) : 60,
      default_startup_view: settingStartupView ? settingStartupView.value : "all",
      radio_artist_spacing: settingRadioArtistSpacing ? settingRadioArtistSpacing.checked : true,
      default_discography_filter: settingDefaultDiscographyFilter ? settingDefaultDiscographyFilter.value : "albums",
      discovery_album_limit: settingDiscoveryLimit ? parseInt(settingDiscoveryLimit.value, 10) : 100,
      filter_junk: settingFilterJunk.checked,
      auto_advance_preview: settingAutoAdvance.checked,
      auto_open_lyrics: settingAutoOpenLyrics ? settingAutoOpenLyrics.checked : false,
      show_track_toasts: settingTrackToasts ? settingTrackToasts.checked : true,
      first_run_completed: true
    };

    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      configData = payload;
      TAB_ALBUMS_CACHE.clear();
      settingsModal.classList.add("hidden");
      showToast("Workstation control panel settings saved ✓", "success");
      if (currentViewType === "library") {
        loadLibrary();
      } else {
        loadCharts(currentGenre);
      }
    } catch (err) {
      console.error("Failed to save settings:", err);
      showToast("Failed to save settings", "error");
    }
  });

  btnOpenDownloadsFolder.addEventListener("click", async () => {
    try {
      await fetch("/api/open-folder", { method: "POST" });
    } catch (err) {
      console.error("Failed to open downloads folder:", err);
    }
  });

  // =========================================================================
  // 9. QUEUE DRAWER & LIVE POLLING
  // =========================================================================
  btnQueueToggle.addEventListener("click", () => {
    queueDrawer.classList.toggle("hidden");
    updateQueueUI();
  });

  queueCloseBtn.addEventListener("click", () => {
    queueDrawer.classList.add("hidden");
  });

  if (btnClearQueueHistory) {
    btnClearQueueHistory.addEventListener("click", async () => {
      try {
        await fetch("/api/download/clear-history", { method: "POST" });
        showToast("Cleared completed download history", "info");
        updateQueueUI();
      } catch (err) {}
    });
  }

  if (btnClearActiveQueue) {
    btnClearActiveQueue.addEventListener("click", async () => {
      try {
        await fetch("/api/download/clear-queue", { method: "POST" });
        showToast("Cleared pending download queue", "info");
        updateQueueUI();
      } catch (err) {}
    });
  }

  async function cancelDownloadJob(jobId) {
    try {
      await fetch("/api/download/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId })
      });
      showToast("Cancelled download job", "info");
      updateQueueUI();
    } catch (err) {
      showToast("Failed to cancel job", "error");
    }
  }

  let wasActiveDownloading = false;

  function playQueueCompleteChime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const now = ctx.currentTime;
      const playTone = (freq, start, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.12, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + duration);
      };
      playTone(523.25, now, 0.2);        // C5
      playTone(659.25, now + 0.08, 0.2);  // E5
      playTone(783.99, now + 0.16, 0.25); // G5
      playTone(1046.50, now + 0.24, 0.5); // C6
    } catch (e) {
      // Audio context blocked
    }
  }

  async function updateQueueUI() {
    try {
      const res = await fetch("/api/download/status");
      const data = await res.json();
      const active = data.active;
      const queue = data.queue || [];
      const history = data.history || [];

      let totalActive = queue.length + (active ? 1 : 0);
      if (totalActive > 0) {
        wasActiveDownloading = true;
        queueBadge.textContent = totalActive;
        queueBadge.classList.remove("hidden");
      } else {
        queueBadge.classList.add("hidden");
        if (wasActiveDownloading) {
          wasActiveDownloading = false;
          playQueueCompleteChime();
          showToast("🎉 All album downloads completed successfully!", "success");

          // Clear caches so stale 'Missing' status is immediately purged
          SEARCH_CACHE.clear();
          TAB_ALBUMS_CACHE.clear();

          // Auto-rescan library in background and immediately refresh the active view so badges flip to 'In Library'
          fetch("/api/library/rescan", { method: "POST" })
            .catch(() => {})
            .finally(() => {
              refreshActiveView(false);
            });
        }
      }

      if (!queueListBody) return;
      queueListBody.innerHTML = "";

      if (!active && queue.length === 0 && history.length === 0) {
        queueListBody.innerHTML = `
          <div style="color: #64748b; text-align: center; padding: 40px 10px; font-size: 13px;">
            <div style="font-size: 28px; margin-bottom: 8px;">📦</div>
            Download queue is empty.<br>Click <b>Download Album</b> on any album modal to download!
          </div>
        `;
        return;
      }

      // 1. ACTIVE ALBUM DOWNLOAD WITH LIVE PER-TRACK PROGRESS BAR
      if (active) {
        const activeCard = document.createElement("div");
        activeCard.className = "queue-active-card";
        const trPct = active.current_track_pct || 0;
        const albPct = active.progress_pct || 0;
        const speedText = active.current_track_speed ? ` • ${active.current_track_speed}` : "";
        const etaText = active.current_track_eta ? `ETA: ${active.current_track_eta}` : "";
        const trackTitle = active.current_track_title || "Initializing audio stream...";

        const activeThreads = active.active_threads ? Object.values(active.active_threads) : [];
        let parallelStreamsHtml = "";

        const concurrencyLimit = active.concurrency || (configData && configData.download_concurrency) || (settingConcurrencySelect ? parseInt(settingConcurrencySelect.value, 10) : 4) || 4;
        const displayStreams = activeThreads.length;
        const engineTitle = concurrencyLimit > 1 
          ? `⚡ ${concurrencyLimit}x Parallel Turbo Engine` 
          : `⚡ 1x Sequential Turbo Engine`;
        const streamBadge = `${displayStreams} ${displayStreams === 1 ? 'Stream' : 'Streams'} Active`;

        if (activeThreads.length > 0) {
          parallelStreamsHtml = `
            <div class="parallel-threads-box">
              <div class="parallel-threads-hdr">
                <span class="parallel-title">${engineTitle}</span>
                <span class="parallel-badge">${streamBadge}</span>
              </div>
              <div class="parallel-threads-list">
                ${activeThreads.map(th => `
                  <div class="parallel-thread-item">
                    <div class="track-progress-header">
                      <span class="track-progress-name">🎵 Track ${th.idx}/${active.total_tracks || 1}: ${th.title}</span>
                      <span class="track-progress-stats">${th.pct || 0}%</span>
                    </div>
                    <div class="track-progress-bar-wrap">
                      <div class="track-progress-fill" style="width: ${th.pct || 0}%"></div>
                    </div>
                    <div class="track-progress-sub">
                      <span>${th.speed ? th.speed : 'Downloading audio...'}</span>
                      <span>${th.eta ? 'ETA: ' + th.eta : ''}</span>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        } else {
          parallelStreamsHtml = `
            <!-- Per-Track Progress Bar -->
            <div class="track-progress-box">
              <div class="track-progress-header">
                <span class="track-progress-name">🎵 Track ${active.current_track_idx || 1}/${active.total_tracks || 1}: ${trackTitle}</span>
                <span class="track-progress-stats">${trPct}%</span>
              </div>
              <div class="track-progress-bar-wrap">
                <div class="track-progress-fill" style="width: ${trPct}%"></div>
              </div>
              <div class="track-progress-sub">
                <span>Status: Downloading audio${speedText}</span>
                <span>${etaText}</span>
              </div>
            </div>
          `;
        }

        const activeCover = (active.cover && active.cover.trim()) ? active.cover.trim() : window.FALLBACK_COVER_SVG;
        activeCard.innerHTML = `
          <div class="queue-active-hdr">
            <img src="${activeCover}" class="queue-active-art" onerror="this.onerror=null; this.src=window.FALLBACK_COVER_SVG;" />
            <div class="queue-active-meta">
              <div class="queue-active-title" title="${escapeHtml(active.title)}">${escapeHtml(active.title)}</div>
              <div class="queue-active-artist">${escapeHtml(active.artist)}</div>
            </div>
            <button class="queue-cancel-btn" title="Cancel this download">Cancel</button>
          </div>

          ${parallelStreamsHtml}

          <!-- Overall Album Progress Bar -->
          <div class="album-progress-box">
            <div class="album-progress-header">
              <span>Overall Album Progress</span>
              <span>${active.completed_tracks || 0}/${active.total_tracks || 0} Tracks (${albPct}%)</span>
            </div>
            <div class="album-progress-bar-wrap">
              <div class="album-progress-fill" style="width: ${albPct}%"></div>
            </div>
          </div>
        `;

        const cancelBtn = activeCard.querySelector(".queue-cancel-btn");
        if (cancelBtn) {
          cancelBtn.addEventListener("click", () => cancelDownloadJob(active.id));
        }

        queueListBody.appendChild(activeCard);
      }

      // 2. QUEUE ITEMS WAITING
      if (queue.length > 0) {
        const secTitle = document.createElement("div");
        secTitle.className = "queue-section-title";
        secTitle.textContent = `Waiting in Queue (${queue.length})`;
        queueListBody.appendChild(secTitle);

        queue.forEach((qItem, qIdx) => {
          const itemEl = document.createElement("div");
          itemEl.className = "queue-item";
          const coverSrc = (qItem.cover && qItem.cover.trim()) ? qItem.cover.trim() : window.FALLBACK_COVER_SVG;
          itemEl.innerHTML = `
            <img src="${coverSrc}" class="queue-art" onerror="this.onerror=null; this.src=window.FALLBACK_COVER_SVG;" />
            <div class="queue-info">
              <div class="queue-title" title="${escapeHtml(qItem.title)}">${escapeHtml(qItem.title)}</div>
              <div class="queue-artist">${escapeHtml(qItem.artist)} • ${qItem.total_tracks || 1} tracks</div>
            </div>
            <button class="queue-cancel-btn" title="Remove from queue">✕</button>
          `;
          const cancelBtn = itemEl.querySelector(".queue-cancel-btn");
          if (cancelBtn) {
            cancelBtn.addEventListener("click", () => cancelDownloadJob(qItem.id));
          }
          queueListBody.appendChild(itemEl);
        });
      }

      // 3. RECENT COMPLETED DOWNLOADS
      if (history.length > 0) {
        const histTitle = document.createElement("div");
        histTitle.className = "queue-section-title";
        histTitle.textContent = `Completed (${history.length})`;
        queueListBody.appendChild(histTitle);

        history.slice(-8).reverse().forEach(hItem => {
          const itemEl = document.createElement("div");
          itemEl.className = "queue-item";
          const coverSrc = (hItem.cover && hItem.cover.trim()) ? hItem.cover.trim() : window.FALLBACK_COVER_SVG;
          const statusTag = hItem.status === "failed" 
            ? `<span class="queue-status-tag" style="color: #ef4444; background: rgba(239, 68, 68, 0.15);">Failed</span>` 
            : `<span class="queue-status-tag complete">✓ Complete</span>`;

          itemEl.innerHTML = `
            <img src="${coverSrc}" class="queue-art" onerror="this.onerror=null; this.src=window.FALLBACK_COVER_SVG;" />
            <div class="queue-info">
              <div class="queue-title" title="${escapeHtml(hItem.title)}">${escapeHtml(hItem.title)}</div>
              <div class="queue-artist">${escapeHtml(hItem.artist)} • ${hItem.total_tracks || hItem.completed_tracks || 0} tracks</div>
            </div>
            ${statusTag}
          `;
          queueListBody.appendChild(itemEl);
        });

        // Real-time: Live stamp "In Library" badge on visible cards when downloads complete
        history.filter(h => h.status === "complete").forEach(comp => {
          const compTitle = (comp.title || "").toLowerCase();
          const compArtist = (comp.artist || "").toLowerCase();
          document.querySelectorAll(`.album-card[data-album-id="${comp.id}"], .album-card`).forEach(c => {
            if (c.dataset.albumId === String(comp.id) || (c.dataset.title === compTitle && c.dataset.artist === compArtist)) {
              const coverWrap = c.querySelector(".card-cover-wrap");
              if (coverWrap && !coverWrap.querySelector(".card-owned-badge")) {
                const badge = document.createElement("span");
                badge.className = "card-owned-badge";
                badge.innerHTML = "💾 In Library";
                coverWrap.appendChild(badge);
              }
            }
          });
        });
      }
    } catch (err) {
      // silent poll error
    }
  }

  // Poll queue every 1s when active, 2.5s otherwise
  setInterval(updateQueueUI, 1200);

  // Global Keyboard Shortcuts (Spacebar: Play/Pause, Esc: Close, Arrows: Skip, M: Mute, F5: Reload)
  document.addEventListener("keydown", (e) => {
    // Global Reload (F5 or Ctrl+R) for desktop WebView
    if (e.key === "F5" || (e.ctrlKey && (e.key === "r" || e.key === "R"))) {
      e.preventDefault();
      window.location.reload();
      return;
    }

    const activeEl = document.activeElement;
    const isTyping = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.isContentEditable);
    
    // Global Esc to close any open modal/drawer
    if (e.key === "Escape") {
      if (inspectDrawer && !inspectDrawer.classList.contains("hidden")) {
        closeInspectDrawer();
        e.preventDefault();
        return;
      }
      if (albumModal && !albumModal.classList.contains("hidden")) {
        albumModal.classList.add("hidden");
        e.preventDefault();
        return;
      }
      if (settingsModal && !settingsModal.classList.contains("hidden")) {
        settingsModal.classList.add("hidden");
        e.preventDefault();
        return;
      }
      if (batchDownloadModal && !batchDownloadModal.classList.contains("hidden")) {
        batchDownloadModal.classList.add("hidden");
        e.preventDefault();
        return;
      }
      if (appMonitorModal && !appMonitorModal.classList.contains("hidden")) {
        closeAppMonitor();
        e.preventDefault();
        return;
      }
      if (queueDrawer && !queueDrawer.classList.contains("hidden")) {
        queueDrawer.classList.add("hidden");
        e.preventDefault();
        return;
      }
    }

    if (isTyping) return;

    if (e.code === "Space") {
      e.preventDefault();
      togglePlayPause();
    } else if (e.code === "ArrowRight") {
      e.preventDefault();
      playNextTrack();
    } else if (e.code === "ArrowLeft") {
      e.preventDefault();
      playPrevTrack();
    } else if (e.key === "m" || e.key === "M") {
      e.preventDefault();
      const newMuted = !activeDeck.muted;
      deckA.muted = newMuted;
      deckB.muted = newMuted;
      if (playerVolumeLabel) playerVolumeLabel.textContent = newMuted ? "0%" : `${Math.round(masterVolume * 100)}%`;
      if (playerVolumeSlider) playerVolumeSlider.value = newMuted ? 0 : masterVolume;
      showToast(newMuted ? "Muted 🔇" : "Unmuted 🔊", "info");
    }
  });

  // =========================================================================
  // APP ACTIVITY & RESOURCE MONITOR INSPECTOR LOGIC
  // =========================================================================
  let isMonitorModalOpen = false;
  let monitorPollTimer = null;

  function formatUptime(seconds) {
    if (!seconds || seconds < 0) return "0s";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, function(m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  async function fetchAppMonitorStats() {
    try {
      const res = await fetch("/api/monitor/stats");
      if (!res.ok) return;
      const data = await res.json();
      updateAppMonitorUI(data);
    } catch (e) {
      // Quiet fail on network transitions
    }
  }

  function updateAppMonitorUI(data) {
    if (!data) return;

    // Header Mini-Pill Badge (Consistent decimal width to guarantee zero layout jitter)
    const cpuVal = data.cpu_pct !== undefined ? `${Number(data.cpu_pct).toFixed(1)}%` : "0.0%";
    const ramVal = data.ram_mb !== undefined ? `${Number(data.ram_mb).toFixed(1)} MB` : "0.0 MB";
    if (hdrMonitorCpu) hdrMonitorCpu.textContent = `CPU ${cpuVal}`;
    if (hdrMonitorRam) hdrMonitorRam.textContent = ramVal;

    // Pulse dot color
    const dot = document.querySelector(".monitor-pulse-dot");
    if (dot) {
      if (data.cpu_pct > 65) {
        dot.style.background = "#f59e0b";
        dot.style.boxShadow = "0 0 10px #f59e0b";
      } else {
        dot.style.background = "#10b981";
        dot.style.boxShadow = "0 0 8px #10b981";
      }
    }

    if (!isMonitorModalOpen) return;

    if (monValPid) monValPid.textContent = data.pid || "—";
    if (monValUptime) monValUptime.textContent = formatUptime(data.uptime_seconds);

    // CPU Gauge
    if (monMetricCpu) monMetricCpu.textContent = `${data.cpu_pct}%`;
    if (monBarCpu) monBarCpu.style.width = `${Math.min(100, Math.max(2, data.cpu_pct))}%`;
    if (monCpuHint) {
      monCpuHint.textContent = `${data.cpu_cores || 1} Cores (${data.raw_cpu_pct || 0}% total)`;
    }

    // RAM Gauge
    if (monMetricRam) monMetricRam.textContent = `${data.ram_mb} MB`;
    const ramBarPct = data.sys_ram_total_gb ? Math.min(100, (data.ram_mb / (data.sys_ram_total_gb * 1024)) * 100 * 5) : 15;
    if (monBarRam) monBarRam.style.width = `${Math.max(3, ramBarPct)}%`;
    if (monRamHint) {
      monRamHint.textContent = `System: ${data.sys_ram_used_pct || 0}% of ${data.sys_ram_total_gb || 0} GB`;
    }

    // Threads Gauge
    if (monMetricThreads) monMetricThreads.textContent = String(data.threads || 0);
    if (monBarThreads) monBarThreads.style.width = `${Math.min(100, (data.threads / 25) * 100)}%`;

    // Children / Subprocesses (FFmpeg encoders)
    const encoderCount = data.encoder_count || 0;
    if (monMetricChildren) {
      monMetricChildren.textContent = encoderCount > 0 ? `${encoderCount} Active` : "0 Idle";
    }
    if (monBarChildren) {
      monBarChildren.style.width = encoderCount > 0 ? `${Math.min(100, encoderCount * 35)}%` : "0%";
    }
    if (monChildrenHint) {
      monChildrenHint.textContent = encoderCount > 0 ? `${encoderCount} transcoding active` : "Audio encoders idle";
    }

    // Subsystem 1: Downloader State
    const dl = data.downloader || {};
    if (monDlStatusBadge && monDlBody) {
      if (dl.is_active && dl.active_job) {
        const job = dl.active_job;
        monDlStatusBadge.innerHTML = `<span class="mon-pill-dot"></span>Downloading`;
        monDlStatusBadge.className = "mon-status-pill downloading";

        const streamsCount = job.active_streams_count || Object.keys(job.active_threads || {}).length;
        let streamsSummary = "";
        const threadsObj = job.active_threads || {};
        const threadKeys = Object.keys(threadsObj);
        if (threadKeys.length > 0) {
          streamsSummary = `<div style="margin-top: 8px; font-size: 11px; color: #cbd5e1; display: flex; flex-direction: column; gap: 4px; max-height: 100px; overflow-y: auto; padding-right: 4px;">` +
            threadKeys.map(k => {
              const t = threadsObj[k];
              const speedTxt = t.speed ? ` • ${escapeHtml(t.speed)}` : '';
              return `<div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 3px 6px; border-radius: 4px;">
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500;">⚡ ${escapeHtml(t.title)}</span>
                <span style="color: #38bdf8; font-weight: 700; font-family: var(--font-mono); font-size: 10.5px; flex-shrink: 0; margin-left: 8px;">${t.pct}%${speedTxt}</span>
              </div>`;
            }).join("") +
          `</div>`;
        }

        monDlBody.innerHTML = `
          <div class="mon-sub-row">Album: <strong>${escapeHtml(job.artist)} - ${escapeHtml(job.title)}</strong></div>
          <div class="mon-sub-muted">Progress: ${job.completed_tracks}/${job.total_tracks} tracks (${job.progress_pct}%) • ${streamsCount} streams</div>
          ${streamsSummary}
        `;
      } else {
        monDlStatusBadge.innerHTML = `<span class="mon-pill-dot"></span>Idle`;
        monDlStatusBadge.className = "mon-status-pill idle";
        monDlBody.innerHTML = `
          <div class="mon-sub-row">Queue: <strong>${dl.queue_count || 0} queued</strong></div>
          <div class="mon-sub-muted">No active background tasks</div>
        `;
      }
    }

    // Subsystem 2: Library State
    const lib = data.library || {};
    if (monLibCount) monLibCount.textContent = `${lib.total_owned || 0} Albums`;
    if (monLibPath) monLibPath.textContent = `Root: ${lib.music_root || "Default"}`;

    // Subsystem 3: Database State
    const db = data.database || {};
    if (monDbName) monDbName.textContent = db.name || "discovery.db";
    if (monDbSize) monDbSize.textContent = db.size_str || `${db.size_kb || 0} KB`;

    // Live Activity Stream
    if (monLogConsole) {
      const allEvents = data.recent_events || [];
      const events = consoleClearTs ? allEvents.filter(ev => (ev.ts || 0) > consoleClearTs) : allEvents;
      if (events.length === 0) {
        monLogConsole.innerHTML = `<div class="mon-log-placeholder">Listening for application events...</div>`;
      } else {
        monLogConsole.innerHTML = events.map(ev => {
          const cat = (ev.category || "APP").toLowerCase();
          return `
            <div class="mon-log-entry">
              <span class="mon-log-time">${escapeHtml(ev.time_str)}</span>
              <span class="mon-log-tag ${cat}">${escapeHtml(ev.category)}</span>
              <span class="mon-log-text">${formatLogMessage(ev.message)}</span>
            </div>
          `;
        }).join("");
        monLogConsole.scrollTop = monLogConsole.scrollHeight;
      }
    }
  }

  function formatLogMessage(msg) {
    let text = escapeHtml(msg);
    text = text.replace(/\[CACHE HIT\]/g, '<span class="mon-token-cache">CACHE HIT</span>');
    text = text.replace(/\[REFRESH COMPLETE\]/g, '<span class="mon-token-refresh">REFRESH</span>');
    text = text.replace(/\[LIVE ROTATION\]/g, '<span class="mon-token-refresh">ROTATION</span>');
    text = text.replace(/\[PRE-WARMER\]/g, '<span class="mon-token-cache">PRE-WARM</span>');
    text = text.replace(/\[LIBRARY SCAN\]/g, '<span class="mon-token-http">LIBRARY</span>');
    text = text.replace(/\[HTTP\]/g, '<span class="mon-token-http">HTTP</span>');
    text = text.replace(/\(took\s+([0-9.]+s?)\)/g, '<span class="mon-token-timing">(took $1)</span>');
    text = text.replace(/&quot;(GET|POST|PUT|DELETE)\s+([^&]+)&quot;\s+(200|201|204)/g, '&quot;<span class="mon-token-method">$1</span> <span class="mon-token-url">$2</span>&quot; <span class="mon-token-code ok">$3</span>');
    text = text.replace(/&quot;(GET|POST|PUT|DELETE)\s+([^&]+)&quot;\s+(4[0-9]{2}|5[0-9]{2})/g, '&quot;<span class="mon-token-method">$1</span> <span class="mon-token-url">$2</span>&quot; <span class="mon-token-code err">$3</span>');
    return text;
  }

  let consoleClearTs = 0;
  const svgTrimMemory = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> <span>Trim Memory (Free RAM)</span>`;
  const svgRescan = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> <span>Rescan Library</span>`;
  const svgSpinner = `<svg style="animation: spin 0.8s linear infinite;" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor"/></svg>`;

  function startAppMonitorPolling() {
    fetchAppMonitorStats();
    if (monitorPollTimer) clearInterval(monitorPollTimer);
    const intervalMs = isMonitorModalOpen ? 1500 : 3500;
    monitorPollTimer = setInterval(fetchAppMonitorStats, intervalMs);
  }

  function openAppMonitor() {
    isMonitorModalOpen = true;
    if (appMonitorModal) appMonitorModal.classList.remove("hidden");
    startAppMonitorPolling();
  }

  function closeAppMonitor() {
    isMonitorModalOpen = false;
    if (appMonitorModal) appMonitorModal.classList.add("hidden");
    startAppMonitorPolling();
  }

  async function trimAppMemory() {
    if (!btnMonTrimMemory) return;
    btnMonTrimMemory.disabled = true;
    btnMonTrimMemory.innerHTML = `${svgSpinner} <span>Trimming...</span>`;
    try {
      const res = await fetch("/api/monitor/trim-memory", { method: "POST" });
      const data = await res.json();
      if (data.status === "success") {
        showToast(`Memory trimmed ✓ Freed ${data.freed_mb} MB (RAM: ${data.after_mb} MB)`, "success");
      }
      await fetchAppMonitorStats();
    } catch (e) {
      showToast("Memory trim failed", "error");
    } finally {
      btnMonTrimMemory.disabled = false;
      btnMonTrimMemory.innerHTML = svgTrimMemory;
    }
  }

  async function rescanFromMonitor() {
    if (!btnMonRescanLibrary) return;
    btnMonRescanLibrary.disabled = true;
    btnMonRescanLibrary.innerHTML = `${svgSpinner} <span>Scanning...</span>`;
    try {
      const res = await fetch("/api/library/status");
      const data = await res.json();
      const total = data.total_owned || (data.albums ? data.albums.length : 0);
      showToast(`✓ Library scanned: ${total} albums ready`, "success");
      await fetchAppMonitorStats();
    } catch (e) {
      showToast("Library scan failed", "error");
    } finally {
      btnMonRescanLibrary.disabled = false;
      btnMonRescanLibrary.innerHTML = svgRescan;
    }
  }

  if (btnAppMonitorToggle) {
    btnAppMonitorToggle.addEventListener("click", openAppMonitor);
  }
  if (appMonitorCloseBtn) {
    appMonitorCloseBtn.addEventListener("click", closeAppMonitor);
  }
  if (btnMonClose) {
    btnMonClose.addEventListener("click", closeAppMonitor);
  }
  if (btnMonTrimMemory) {
    btnMonTrimMemory.addEventListener("click", trimAppMemory);
  }
  if (btnMonRescanLibrary) {
    btnMonRescanLibrary.addEventListener("click", rescanFromMonitor);
  }
  if (btnMonClearConsole) {
    btnMonClearConsole.addEventListener("click", () => {
      consoleClearTs = Date.now() / 1000;
      if (monLogConsole) {
        monLogConsole.innerHTML = '<div class="mon-log-placeholder">Console buffer cleared. Listening for new events...</div>';
      }
    });
  }

  // Initialize
  async function initApp() {
    await loadConfig();
    startAppMonitorPolling();

    const startView = (configData && configData.default_startup_view) ? configData.default_startup_view : "all";
    if (startView === "library") {
      document.querySelectorAll(".station-sidebar .nav-item").forEach(b => {
        b.classList.toggle("active", b.getAttribute("data-target") === "library");
      });
      loadLibrary();
    } else if (startView === "surprise") {
      document.querySelectorAll(".station-sidebar .nav-item").forEach(b => {
        b.classList.toggle("active", b.getAttribute("data-target") === "surprise");
      });
      loadSurpriseCrate();
    } else {
      document.querySelectorAll(".station-sidebar .nav-item").forEach(b => {
        b.classList.toggle("active", b.getAttribute("data-target") === startView);
      });
      loadCharts(startView);
    }
  }

  initApp();
});
