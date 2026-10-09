/* =============================================================================
   ALBUM DISCOVERY STATION — DUAL-DECK AUDIO PLAYER & LYRICS ENGINE
   Architecture: Self-contained playback engine (window.AppPlayer)
   Supports: Gapless playback, DJ crossfade, synchronized lyrics, MediaSession.
   ============================================================================= */
(function() {
  const Bus = window.AppBus;

  // DOM Elements
  const smartHud = document.getElementById("smartPlayerHud");
  const playerCoverImg = document.getElementById("playerCoverImg");
  const playerTrackTitle = document.getElementById("playerTrackTitle");
  const playerArtistName = document.getElementById("playerArtistName");
  const hudAlbumTitle = document.getElementById("hudAlbumTitle");
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
  const hudShuffleBtn = document.getElementById("hudShuffleBtn");
  const hudRepeatBtn = document.getElementById("hudRepeatBtn");
  const repeatOneBadge = document.getElementById("repeatOneBadge");
  const hudQualityPill = document.getElementById("hudQualityPill");
  const volMuteBtn = document.getElementById("volMuteBtn");
  const volIconHigh = document.getElementById("volIconHigh");
  const volIconMuted = document.getElementById("volIconMuted");
  const playerVolumeSlider = document.getElementById("playerVolumeSlider");
  const playerVolumeLabel = document.getElementById("playerVolumeLabel");
  const hudLyricsBtn = document.getElementById("hudLyricsBtn");
  const hudDismissBtn = document.getElementById("hudDismissBtn");

  // Mini Dock Pill Elements
  const btnHeaderPlayerToggle = document.getElementById("btnHeaderPlayerToggle");
  const playerDockPill = document.getElementById("playerDockPill");
  const dockPillCover = document.getElementById("dockPillCover");
  const dockPillTitle = document.getElementById("dockPillTitle");
  const dockPillArtist = document.getElementById("dockPillArtist");
  const dockPillPlayPauseBtn = document.getElementById("dockPillPlayPauseBtn");
  const dockPillPlayIcon = document.getElementById("dockPillPlayIcon");
  const dockPillPauseIcon = document.getElementById("dockPillPauseIcon");
  const dockPillLyricsBtn = document.getElementById("dockPillLyricsBtn");
  const dockPillRerollBtn = document.getElementById("dockPillRerollBtn");
  const dockPillExpandBtn = document.getElementById("dockPillExpandBtn");
  const dockPillStopBtn = document.getElementById("dockPillStopBtn");
  const hudRerollRadioBtn = document.getElementById("hudRerollRadioBtn");

  // Lyrics Elements
  const lyricsTrackTitle = document.getElementById("lyricsTrackTitle");
  const modalLyricsBody = document.getElementById("modalLyricsBody");
  const btnRefreshLyrics = document.getElementById("btnRefreshLyrics");

  // Dual Decks
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

  // Master Volume & State
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
  let previousVolume = masterVolume;
  let isMuted = false;

  let isShuffle = localStorage.getItem("discovery_player_shuffle") === "true";
  let repeatMode = localStorage.getItem("discovery_player_repeat") || "off"; // "off" | "all" | "one"

  // Playback State
  let playingAlbumDetails = null;
  let playingTracklist = [];
  let playingTrackIndex = -1;
  let isPlaying = false;
  let isFullAlbumMode = false;
  let isLibraryRadioMode = false;
  let isCrossfading = false;
  let crossfadeInterval = null;
  let preloadedTrackIndex = -1;
  let isFetchingMoreRadioTracks = false;

  // Lyrics State
  let currentLyrics = null;
  let parsedSyncedLyrics = [];

  function cancelCrossfade() {
    if (crossfadeInterval) {
      clearInterval(crossfadeInterval);
      crossfadeInterval = null;
    }
    isCrossfading = false;
  }

  function showPlayerHud() {
    if (smartHud) smartHud.classList.remove("stealth");
    if (playerDockPill) playerDockPill.classList.add("hidden");
    if (btnHeaderPlayerToggle) btnHeaderPlayerToggle.classList.add("active");
  }

  function minimizePlayerHud() {
    if (smartHud) smartHud.classList.add("stealth");
    if (btnHeaderPlayerToggle) btnHeaderPlayerToggle.classList.remove("active");
    if (activeDeck.src || isPlaying || (playingTracklist && playingTracklist.length > 0)) {
      if (playerDockPill) playerDockPill.classList.remove("hidden");
    }
  }

  function stopPlayerHud() {
    cancelCrossfade();
    if (smartHud) smartHud.classList.add("stealth");
    if (playerDockPill) playerDockPill.classList.add("hidden");
    if (btnHeaderPlayerToggle) btnHeaderPlayerToggle.classList.remove("active");
    activeDeck.pause();
    activeDeck.src = "";
    standbyDeck.pause();
    standbyDeck.src = "";
    isPlaying = false;
    updatePlayPauseState(false);
    highlightActiveTrack();
    Bus.emit("playback:state", { isPlaying: false });
  }

  function togglePlayerHud() {
    if (smartHud && smartHud.classList.contains("stealth")) {
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
    const artist = track.artist || (playingAlbumDetails && playingAlbumDetails.artist) || "Unknown Artist";
    if (isFullAlbumMode) {
      return `/api/stream/proxy?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(track.title)}`;
    }
    return track.preview || "";
  }

  function preloadNextTrack() {
    if (!playingTracklist || playingTrackIndex < 0 || playingTrackIndex + 1 >= playingTracklist.length) return;
    const nextIndex = playingTrackIndex + 1;
    const nextTrack = playingTracklist[nextIndex];
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

    // Approaching end of radio queue: trigger auto-fetch
    if (isLibraryRadioMode && playingTrackIndex >= playingTracklist.length - 4 && !isFetchingMoreRadioTracks) {
      fetchMoreRadioTracks();
    }
  }

  let lastLyricsTrack = null;

  function parseLrc(lrcText) {
    if (!lrcText) return [];
    const rawLines = lrcText.split(/\r?\n/);
    const result = [];
    const timeTagReg = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

    for (const rawLine of rawLines) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;

      const timestamps = [];
      let match;
      timeTagReg.lastIndex = 0;

      while ((match = timeTagReg.exec(trimmed)) !== null) {
        const min = parseInt(match[1], 10);
        const sec = parseInt(match[2], 10);
        const msStr = match[3] || "0";
        const ms = parseFloat("0." + msStr.padEnd(3, "0"));
        timestamps.push(min * 60 + sec + ms);
      }

      if (timestamps.length > 0) {
        const cleanText = trimmed.replace(timeTagReg, "").trim();
        for (const t of timestamps) {
          if (cleanText) {
            result.push({ time: t, text: cleanText, isBreak: false });
          } else {
            result.push({ time: t, text: "♪", isBreak: true });
          }
        }
      }
    }

    result.sort((a, b) => a.time - b.time);
    return result;
  }

  async function loadTrackLyrics(artist, title, album = "", duration = 0, force = false, filePath = "") {
    if (!lyricsTrackTitle || !modalLyricsBody) return;
    lastLyricsTrack = { artist, title, album, duration, filePath };

    lyricsTrackTitle.textContent = `${artist} — ${title}`;
    modalLyricsBody.innerHTML = "<div class='lyrics-placeholder'><div class='lyrics-spin-icon'>⏳</div> Fetching verified lyrics...</div>";
    
    try {
      const qParams = new URLSearchParams({
        artist: artist || "",
        title: title || "",
        album: album || "",
        duration: duration || 0,
        force: force ? "1" : "0",
        path: filePath || ""
      });

      const res = await fetch(`/api/lyrics?${qParams.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      currentLyrics = data;

      if (data.instrumental) {
        parsedSyncedLyrics = [];
        modalLyricsBody.innerHTML = `
          <div class="lyrics-placeholder instrumental-card">
            <span style="font-size: 28px; display: block; margin-bottom: 8px;">🎷</span>
            <strong>Verified Instrumental Track</strong>
            <p style="margin-top: 6px; font-size: 13px; color: var(--text-muted);">This recording contains no vocal lyrics.</p>
          </div>`;
      } else if (data.synced && data.synced.trim()) {
        parsedSyncedLyrics = parseLrc(data.synced);
        if (parsedSyncedLyrics.length > 0) {
          modalLyricsBody.innerHTML = parsedSyncedLyrics.map((line, idx) => `
            <div class="synced-line ${line.isBreak ? 'synced-break' : ''}" data-idx="${idx}" data-time="${line.time}">${Bus.escapeHtml(line.text)}</div>
          `).join("");

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
          renderPlainLyrics(data.plain);
        } else {
          showEmptyLyrics();
        }
      } else if (data.plain && data.plain.trim()) {
        parsedSyncedLyrics = [];
        renderPlainLyrics(data.plain);
      } else {
        parsedSyncedLyrics = [];
        showEmptyLyrics();
      }
    } catch (e) {
      parsedSyncedLyrics = [];
      modalLyricsBody.innerHTML = `
        <div class="lyrics-placeholder error-lyrics">
          <p>⚠️ Unable to load lyrics right now.</p>
          <button class="btn-retry-inline" id="btnRetryLyricsInline" style="margin-top: 10px;">Retry</button>
        </div>`;
      const retryBtn = document.getElementById("btnRetryLyricsInline");
      if (retryBtn) {
        retryBtn.addEventListener("click", () => loadTrackLyrics(artist, title, album, duration, true, filePath));
      }
    }
  }

  function renderPlainLyrics(plainText) {
    if (!modalLyricsBody) return;
    const verses = plainText.split(/\r?\n\r?\n+/);
    modalLyricsBody.innerHTML = `
      <div class="plain-lyrics-container">
        ${verses.map(verse => {
          const lines = verse.split(/\r?\n/);
          return `<div class="lyrics-verse">${lines.map(l => `<p class="lyrics-line">${Bus.escapeHtml(l)}</p>`).join("")}</div>`;
        }).join("")}
      </div>`;
  }

  function showEmptyLyrics() {
    if (!modalLyricsBody) return;
    modalLyricsBody.innerHTML = `
      <div class="lyrics-placeholder">
        <p>No verified lyrics found for this track.</p>
        <p style="font-size: 12px; margin-top: 6px; color: var(--text-muted);">Try clicking "Reload Lyrics" above to retry cloud resolution.</p>
      </div>`;
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

      const lines = modalLyricsBody.querySelectorAll(".synced-line");
      if (activeIdx >= 0) {
        const activeItem = parsedSyncedLyrics[activeIdx];
        const nextItem = parsedSyncedLyrics[activeIdx + 1];

        // De-emphasize active highlight if this line finished or is an instrumental break
        const lineDuration = nextItem ? (nextItem.time - activeItem.time) : 8.0;
        const isFarPast = (curTime - activeItem.time) > Math.min(lineDuration, 9.0);

        lines.forEach((l, idx) => {
          if (idx === activeIdx && !isFarPast && !activeItem.isBreak) {
            if (!l.classList.contains("active")) {
              l.classList.add("active");
              l.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          } else {
            l.classList.remove("active");
          }
        });
      } else {
        lines.forEach(l => l.classList.remove("active"));
      }
    }
  }

  function updatePlayerTrackUi(track, index) {
    if (!track) return;
    const artist = track.artist || (playingAlbumDetails && playingAlbumDetails.artist) || "Unknown Artist";
    const albumTitle = isLibraryRadioMode ? (track.album || "Library DJ Radio") : (track.album || (playingAlbumDetails && playingAlbumDetails.title) || "Album Discovery");
    const coverArt = (track.cover_big || track.cover_small || (playingAlbumDetails && (playingAlbumDetails.cover_big || playingAlbumDetails.cover_small))) || Bus.FALLBACK_COVER_SVG;
    const totalTracks = (playingTracklist && playingTracklist.length > 0) ? playingTracklist.length : 1;
    const trackNumStr = `${index + 1}/${totalTracks}`;

    showPlayerHud();
    if (playerCoverImg) playerCoverImg.src = coverArt;
    if (playerArtistName) {
      playerArtistName.textContent = artist;
      playerArtistName.title = `${artist} — ${albumTitle}`;
    }
    if (playerTrackTitle) {
      playerTrackTitle.textContent = track.title || "Unknown Track";
      playerTrackTitle.title = track.title || "Unknown Track";
    }
    if (currentTimeLabel) currentTimeLabel.textContent = Bus.formatTime(0);
    if (playerScrubFill) playerScrubFill.style.width = "0%";
    if (durationTimeLabel) {
      durationTimeLabel.textContent = isFullAlbumMode ? (track.duration ? Bus.formatTime(track.duration) : "0:00") : "0:30";
    }
    
    if (hudAlbumTitle) {
      hudAlbumTitle.textContent = albumTitle.toUpperCase();
      hudAlbumTitle.title = albumTitle;
    }

    if (hudQualityPill) {
      if (isLibraryRadioMode) {
        hudQualityPill.textContent = `DJ RADIO • ${trackNumStr}`;
        hudQualityPill.className = "hud-quality-pill radio";
      } else if (track.local_path || track.is_local) {
        hudQualityPill.textContent = `320K MASTER • ${trackNumStr}`;
        hudQualityPill.className = "hud-quality-pill master";
      } else if (isFullAlbumMode) {
        hudQualityPill.textContent = `STUDIO • ${trackNumStr}`;
        hudQualityPill.className = "hud-quality-pill";
      } else {
        hudQualityPill.textContent = `30S PREVIEW • ${trackNumStr}`;
        hudQualityPill.className = "hud-quality-pill";
      }
    }

    if (dockPillCover) dockPillCover.src = coverArt;
    if (dockPillTitle) {
      dockPillTitle.textContent = track.title || "Unknown Track";
      dockPillTitle.title = track.title || "Unknown Track";
    }
    if (dockPillArtist) {
      dockPillArtist.textContent = `${artist} — ${albumTitle}`;
      dockPillArtist.title = `${artist} — ${albumTitle}`;
    }

    if (hudRerollRadioBtn) hudRerollRadioBtn.classList.toggle("hidden", !isLibraryRadioMode);
    if (dockPillRerollBtn) dockPillRerollBtn.classList.toggle("hidden", !isLibraryRadioMode);

    highlightActiveTrack();
    updateMediaSession(track, artist, albumTitle, coverArt);
    const localPath = track.local_path || (track.stream_url && track.stream_url.includes("local?path=") ? decodeURIComponent(track.stream_url.split("local?path=")[1]) : "");
    loadTrackLyrics(artist, track.title, albumTitle, track.duration, false, localPath);

    if (Bus.state.config && Bus.state.config.show_track_toasts !== false && !isLibraryRadioMode) {
      Bus.showToast(`▶ Now Playing: "${track.title}" • ${artist}`, "info");
    }

    if (Bus.state.config && Bus.state.config.auto_open_lyrics) {
      openLyricsForCurrentTrack();
    }

    Bus.emit("track:changed", { track, index, artist, albumTitle });
  }

  function triggerSeamlessTransition(crossfadeSec) {
    if (isCrossfading) return;
    const nextIndex = playingTrackIndex + 1;
    if (!playingTracklist || nextIndex >= playingTracklist.length) return;

    const nextTrack = playingTracklist[nextIndex];
    const nextUrl = getTrackPlayUrl(nextTrack);
    if (!nextUrl) return;

    isCrossfading = true;

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
      activeDeck = incomingDeck;
      standbyDeck = outgoingDeck;
      playingTrackIndex = nextIndex;
      updatePlayerTrackUi(nextTrack, nextIndex);
      updatePlayPauseState(true);

      if (crossfadeSec <= 0.3) {
        outgoingDeck.pause();
        outgoingDeck.currentTime = 0;
        outgoingDeck.volume = masterVolume;
        activeDeck.volume = masterVolume;
        isCrossfading = false;
        preloadNextTrack();
        return;
      }

      const fadeMs = crossfadeSec * 1000;
      const stepMs = 40;
      const totalSteps = Math.max(1, Math.round(fadeMs / stepMs));
      let currentStep = 0;

      if (crossfadeInterval) clearInterval(crossfadeInterval);
      crossfadeInterval = setInterval(() => {
        currentStep++;
        const progress = Math.min(1, currentStep / totalSteps);
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
    if (!playingTracklist || index < 0 || index >= playingTracklist.length) return;
    
    cancelCrossfade();
    playingTrackIndex = index;
    isFullAlbumMode = fullAlbum;
    Bus.state.isFullAlbumMode = fullAlbum;
    const track = playingTracklist[index];
    const targetUrl = getTrackPlayUrl(track);

    updatePlayerTrackUi(track, index);

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

  function fallbackToPreview(track, startTime = 0) {
    if (track.preview) {
      if (playerTrackTitle) playerTrackTitle.textContent = track.title;
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
      } else if (playingTracklist.length > 0) {
        playTrackAtIndex(playingTrackIndex >= 0 ? playingTrackIndex : 0, isFullAlbumMode);
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
    isPlaying = playing;
    if (playing) {
      if (smartHud) smartHud.classList.add("playing");
      if (hudPlayIcon) hudPlayIcon.classList.add("hidden");
      if (hudPauseIcon) hudPauseIcon.classList.remove("hidden");
      if (playerDockPill) {
        playerDockPill.classList.add("playing");
        if (dockPillPlayIcon) dockPillPlayIcon.classList.add("hidden");
        if (dockPillPauseIcon) dockPillPauseIcon.classList.remove("hidden");
      }
    } else {
      if (smartHud) smartHud.classList.remove("playing");
      if (hudPlayIcon) hudPlayIcon.classList.remove("hidden");
      if (hudPauseIcon) hudPauseIcon.classList.add("hidden");
      if (playerDockPill) {
        playerDockPill.classList.remove("playing");
        if (dockPillPlayIcon) dockPillPlayIcon.classList.remove("hidden");
        if (dockPillPauseIcon) dockPillPauseIcon.classList.add("hidden");
      }
    }
    Bus.emit("playback:state", { isPlaying: playing });
  }

  function playNextTrack(isAutoAdvancement = false) {
    if (isLibraryRadioMode && playingTrackIndex >= playingTracklist.length - 3 && !isFetchingMoreRadioTracks) {
      fetchMoreRadioTracks();
    }
    if (!playingTracklist || playingTracklist.length === 0) return;

    if (isAutoAdvancement && repeatMode === "one" && playingTrackIndex >= 0) {
      playTrackAtIndex(playingTrackIndex, isFullAlbumMode);
      return;
    }

    if (isShuffle && playingTracklist.length > 1) {
      let nextIdx = Math.floor(Math.random() * playingTracklist.length);
      let attempts = 0;
      while (nextIdx === playingTrackIndex && attempts < 10) {
        nextIdx = Math.floor(Math.random() * playingTracklist.length);
        attempts++;
      }
      playTrackAtIndex(nextIdx, isFullAlbumMode);
      return;
    }

    if (playingTrackIndex + 1 < playingTracklist.length) {
      playTrackAtIndex(playingTrackIndex + 1, isFullAlbumMode);
    } else if (repeatMode === "all" || isFullAlbumMode || isLibraryRadioMode) {
      playTrackAtIndex(0, isFullAlbumMode);
    }
  }

  async function fetchMoreRadioTracks() {
    if (isFetchingMoreRadioTracks) return;
    isFetchingMoreRadioTracks = true;
    try {
      const res = await fetch("/api/library/radio?limit=30");
      const data = await res.json();
      if (data && data.status === "ok" && Array.isArray(data.tracks)) {
        const existingPaths = new Set(playingTracklist.map(t => t.local_path || t.id));
        const fresh = data.tracks.filter(t => !existingPaths.has(t.local_path || t.id));
        if (fresh.length > 0) {
          playingTracklist.push(...fresh);
        }
      }
    } catch (e) {
      console.warn("Could not fetch more radio tracks:", e);
    } finally {
      isFetchingMoreRadioTracks = false;
    }
  }

  function playPrevTrack() {
    if (playingTrackIndex - 1 >= 0) {
      playTrackAtIndex(playingTrackIndex - 1, isFullAlbumMode);
    } else if (playingTracklist.length > 0) {
      playTrackAtIndex(playingTracklist.length - 1, isFullAlbumMode);
    }
  }

  function highlightActiveTrack() {
    const isModalPlayingThisAlbum = window.AppDiscovery && window.AppDiscovery.isViewingAlbum(playingAlbumDetails);
    document.querySelectorAll("#modalTracklist .track-row").forEach((el, idx) => {
      if (isModalPlayingThisAlbum && idx === playingTrackIndex) {
        el.classList.add("playing");
      } else {
        el.classList.remove("playing");
      }
    });

    const isDrawerPlayingThisAlbum = window.AppDiscovery && window.AppDiscovery.isDrawerViewingAlbum(playingAlbumDetails);
    document.querySelectorAll(".drawer-track-row").forEach((el) => {
      const idx = parseInt(el.dataset.trackIdx, 10);
      if (isDrawerPlayingThisAlbum && idx === playingTrackIndex) {
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
    if (playerScrubFill) playerScrubFill.style.width = `${pct}%`;
    if (currentTimeLabel) currentTimeLabel.textContent = Bus.formatTime(cur);
    if (durationTimeLabel) durationTimeLabel.textContent = Bus.formatTime(dur);

    syncLyricsToTime(cur);

    if (isCrossfading) return;
    const nextIndex = playingTrackIndex + 1;
    const hasNext = playingTracklist && (nextIndex < playingTracklist.length);
    if (!hasNext) {
      if (isLibraryRadioMode && !isFetchingMoreRadioTracks) {
        fetchMoreRadioTracks();
      }
      return;
    }

    const crossfadeEnabled = (Bus.state.config && Bus.state.config.crossfade_audio !== false);
    let crossfadeSec = crossfadeEnabled 
      ? (Bus.state.config.crossfade_duration !== undefined ? Number(Bus.state.config.crossfade_duration) : 3) 
      : 0;
    
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
    if (isFullAlbumMode || isLibraryRadioMode || (Bus.state.config && Bus.state.config.auto_advance_preview !== false)) {
      playNextTrack(true);
    } else {
      pauseTrack();
    }
  }

  function onDeckLoadedMetadata(deck) {
    if (deck === activeDeck && deck.duration && !isNaN(deck.duration)) {
      if (durationTimeLabel) durationTimeLabel.textContent = Bus.formatTime(deck.duration);
    }
  }

  [deckA, deckB].forEach(deck => {
    deck.addEventListener("loadedmetadata", () => onDeckLoadedMetadata(deck));
    deck.addEventListener("timeupdate", () => onDeckTimeUpdate(deck));
    deck.addEventListener("ended", () => onDeckEnded(deck));
    deck.addEventListener("error", (e) => console.warn("Audio deck error:", e));
  });

  if (playerScrubBar) {
    playerScrubBar.addEventListener("click", (e) => {
      if (!activeDeck.duration) return;
      cancelCrossfade();
      const rect = playerScrubBar.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      activeDeck.currentTime = pos * activeDeck.duration;
    });
  }

  function toggleMute() {
    if (!isMuted) {
      previousVolume = masterVolume > 0 ? masterVolume : (parseFloat(playerVolumeSlider ? playerVolumeSlider.value : 1) || 1.0);
      isMuted = true;
      masterVolume = 0;
      activeDeck.volume = 0;
      if (standbyDeck) standbyDeck.volume = 0;
      if (playerVolumeSlider) playerVolumeSlider.value = 0;
      if (playerVolumeLabel) playerVolumeLabel.textContent = "0%";
      if (volIconHigh) volIconHigh.classList.add("hidden");
      if (volIconMuted) volIconMuted.classList.remove("hidden");
      if (volMuteBtn) {
        volMuteBtn.classList.add("muted");
        volMuteBtn.title = "Unmute Audio (Restores Prior Volume)";
      }
    } else {
      isMuted = false;
      masterVolume = previousVolume > 0 ? previousVolume : 1.0;
      activeDeck.volume = masterVolume;
      if (standbyDeck) standbyDeck.volume = masterVolume;
      if (playerVolumeSlider) playerVolumeSlider.value = masterVolume;
      if (playerVolumeLabel) playerVolumeLabel.textContent = `${Math.round(masterVolume * 100)}%`;
      if (volIconHigh) volIconHigh.classList.remove("hidden");
      if (volIconMuted) volIconMuted.classList.add("hidden");
      if (volMuteBtn) {
        volMuteBtn.classList.remove("muted");
        volMuteBtn.title = "Mute Audio";
      }
    }
  }

  if (volMuteBtn) volMuteBtn.addEventListener("click", toggleMute);

  if (playerVolumeSlider) {
    playerVolumeSlider.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      masterVolume = val;
      if (val > 0 && isMuted) {
        isMuted = false;
        if (volIconHigh) volIconHigh.classList.remove("hidden");
        if (volIconMuted) volIconMuted.classList.add("hidden");
        if (volMuteBtn) {
          volMuteBtn.classList.remove("muted");
          volMuteBtn.title = "Mute Audio";
        }
      } else if (val === 0 && !isMuted) {
        isMuted = true;
        if (volIconHigh) volIconHigh.classList.add("hidden");
        if (volIconMuted) volIconMuted.classList.remove("hidden");
        if (volMuteBtn) {
          volMuteBtn.classList.add("muted");
          volMuteBtn.title = "Unmute Audio";
        }
      }
      if (!isCrossfading) {
        activeDeck.volume = val;
      }
      if (playerVolumeLabel) playerVolumeLabel.textContent = `${Math.round(val * 100)}%`;
      localStorage.setItem("discovery_player_vol", val);
    });
  }

  if (hudShuffleBtn) {
    hudShuffleBtn.classList.toggle("active", isShuffle);
    hudShuffleBtn.title = isShuffle ? "Shuffle: Enabled (Click to Disable)" : "Shuffle: Disabled (Click to Enable)";
    hudShuffleBtn.addEventListener("click", () => {
      isShuffle = !isShuffle;
      hudShuffleBtn.classList.toggle("active", isShuffle);
      hudShuffleBtn.title = isShuffle ? "Shuffle: Enabled (Click to Disable)" : "Shuffle: Disabled (Click to Enable)";
      localStorage.setItem("discovery_player_shuffle", isShuffle);
      Bus.showToast(isShuffle ? "🔀 Shuffle Mode Enabled" : "➡️ Shuffle Mode Disabled", "info");
    });
  }

  function syncRepeatUi() {
    if (!hudRepeatBtn) return;
    if (repeatMode === "one") {
      hudRepeatBtn.classList.add("active");
      if (repeatOneBadge) repeatOneBadge.classList.remove("hidden");
      hudRepeatBtn.title = "Repeat: Current Track (Click to Turn Off)";
    } else if (repeatMode === "all") {
      hudRepeatBtn.classList.add("active");
      if (repeatOneBadge) repeatOneBadge.classList.add("hidden");
      hudRepeatBtn.title = "Repeat: All Tracks (Click for Repeat One)";
    } else {
      hudRepeatBtn.classList.remove("active");
      if (repeatOneBadge) repeatOneBadge.classList.add("hidden");
      hudRepeatBtn.title = "Repeat: Off (Click for Repeat All)";
    }
  }
  syncRepeatUi();

  if (hudRepeatBtn) {
    hudRepeatBtn.addEventListener("click", () => {
      if (repeatMode === "off") {
        repeatMode = "all";
        Bus.showToast("🔁 Repeat: All Tracks", "info");
      } else if (repeatMode === "all") {
        repeatMode = "one";
        Bus.showToast("🔂 Repeat: Current Track", "info");
      } else {
        repeatMode = "off";
        Bus.showToast("➡️ Repeat: Off", "info");
      }
      localStorage.setItem("discovery_player_repeat", repeatMode);
      syncRepeatUi();
    });
  }

  if (playPauseBtn) playPauseBtn.addEventListener("click", togglePlayPause);
  if (stopBtn) stopBtn.addEventListener("click", stopPlayerHud);
  if (hudDismissBtn) hudDismissBtn.addEventListener("click", minimizePlayerHud);
  if (nextTrackBtn) nextTrackBtn.addEventListener("click", () => playNextTrack(false));
  if (prevTrackBtn) prevTrackBtn.addEventListener("click", playPrevTrack);

  function openLyricsForCurrentTrack() {
    if (!playingTracklist || playingTrackIndex < 0 || !playingTracklist[playingTrackIndex]) return;
    const tr = playingTracklist[playingTrackIndex];
    const art = tr.artist || (playingAlbumDetails && playingAlbumDetails.artist) || "Unknown Artist";
    const alb = isLibraryRadioMode ? (tr.album || "Library DJ Radio") : (tr.album || (playingAlbumDetails ? playingAlbumDetails.title : "Album Discovery"));
    const cov = (tr.cover_big || tr.cover_small || (playingAlbumDetails && (playingAlbumDetails.cover_big || playingAlbumDetails.cover_small))) || Bus.FALLBACK_COVER_SVG;

    const albumModal = document.getElementById("albumModal");
    if (albumModal) albumModal.classList.remove("hidden");
    if (window.AppDiscovery) window.AppDiscovery.switchModalTab("lyrics");

    const modalCoverArt = document.getElementById("modalCoverArt");
    const modalAlbumTitle = document.getElementById("modalAlbumTitle");
    const modalArtistName = document.getElementById("modalArtistName");
    const modalTracksCount = document.getElementById("modalTracksCount");
    const modalTracklistTabCount = document.getElementById("modalTracklistTabCount");
    const modalYearBadge = document.getElementById("modalYearBadge");
    const modalTypeBadge = document.getElementById("modalTypeBadge");

    if (modalCoverArt) {
      modalCoverArt.onerror = () => { modalCoverArt.src = Bus.FALLBACK_COVER_SVG; };
      modalCoverArt.src = cov;
    }
    if (modalAlbumTitle) modalAlbumTitle.textContent = alb;
    if (modalArtistName) modalArtistName.textContent = art;
    if (modalTracksCount) modalTracksCount.textContent = isLibraryRadioMode ? `📻 DJ Radio (${playingTracklist.length} Tracks)` : `🎵 ${playingTracklist.length} Tracks`;
    if (modalTracklistTabCount) modalTracklistTabCount.textContent = playingTracklist.length;
    if (modalYearBadge) modalYearBadge.textContent = tr.year ? `📅 ${tr.year}` : (isLibraryRadioMode ? "📻 Live Mix" : "📅 Studio Album");
    if (modalTypeBadge) modalTypeBadge.textContent = isLibraryRadioMode ? "LIBRARY DJ RADIO" : "STUDIO ALBUM";

    if (window.AppDiscovery) window.AppDiscovery.renderTracklist(playingTracklist);
    const localPath = tr.local_path || (tr.stream_url && tr.stream_url.includes("local?path=") ? decodeURIComponent(tr.stream_url.split("local?path=")[1]) : "");
    loadTrackLyrics(art, tr.title, alb, tr.duration, false, localPath);
  }

  if (btnRefreshLyrics) {
    btnRefreshLyrics.addEventListener("click", () => {
      if (lastLyricsTrack && lastLyricsTrack.title) {
        btnRefreshLyrics.textContent = "⏳ Reloading...";
        btnRefreshLyrics.disabled = true;
        loadTrackLyrics(
          lastLyricsTrack.artist,
          lastLyricsTrack.title,
          lastLyricsTrack.album,
          lastLyricsTrack.duration,
          true,
          lastLyricsTrack.filePath
        ).finally(() => {
          btnRefreshLyrics.textContent = "🔄 Reload Lyrics";
          btnRefreshLyrics.disabled = false;
        });
      }
    });
  }

  if (hudLyricsBtn) hudLyricsBtn.addEventListener("click", openLyricsForCurrentTrack);
  if (btnHeaderPlayerToggle) btnHeaderPlayerToggle.addEventListener("click", togglePlayerHud);
  if (dockPillLyricsBtn) dockPillLyricsBtn.addEventListener("click", (e) => { e.stopPropagation(); openLyricsForCurrentTrack(); });
  if (dockPillExpandBtn) dockPillExpandBtn.addEventListener("click", (e) => { e.stopPropagation(); showPlayerHud(); });
  if (dockPillPlayPauseBtn) dockPillPlayPauseBtn.addEventListener("click", (e) => { e.stopPropagation(); togglePlayPause(); });
  if (dockPillStopBtn) dockPillStopBtn.addEventListener("click", (e) => { e.stopPropagation(); stopPlayerHud(); });
  if (playerDockPill) {
    playerDockPill.addEventListener("click", (e) => {
      if (!e.target.closest("button")) showPlayerHud();
    });
  }

  function playTrack(track, index, list, isFullAlbum = false) {
    isLibraryRadioMode = false;
    const navLibraryRadio = document.getElementById("navLibraryRadio");
    if (navLibraryRadio) navLibraryRadio.classList.remove("active");
    if (list && list.length > 0) {
      playingTracklist = list;
    }
    if (window.AppDiscovery && window.AppDiscovery.getCurrentInspectAlbum()) {
      playingAlbumDetails = window.AppDiscovery.getCurrentInspectAlbum();
    }
    playTrackAtIndex(index, isFullAlbum, 0);
  }

  // Public Interface
  window.AppPlayer = {
    playTrackAtIndex,
    playTrack,
    togglePlayPause,
    pauseTrack,
    playNextTrack,
    playPrevTrack,
    showPlayerHud,
    minimizePlayerHud,
    stopPlayerHud,
    togglePlayerHud,
    openLyricsForCurrentTrack,
    loadTrackLyrics,
    highlightActiveTrack,
    getPlayingTrack: () => (playingTracklist && playingTrackIndex >= 0 ? playingTracklist[playingTrackIndex] : null),
    getPlayingAlbum: () => playingAlbumDetails,
    getPlayingTracklist: () => playingTracklist,
    getPlayingTrackIndex: () => playingTrackIndex,
    isPlaying: () => isPlaying,
    setPlayingTracklist: (list) => { playingTracklist = list; },
    setPlayingAlbum: (album) => { playingAlbumDetails = album; },
    setRadioMode: (mode) => { isLibraryRadioMode = mode; Bus.state.isLibraryRadioMode = mode; }
  };
})();
