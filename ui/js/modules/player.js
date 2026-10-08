// ==========================================================================
// AUDIO ENGINE MODULE — Play, Pause, Stop, Scrub & Visualizer
// ==========================================================================

export function initPlayer({ onTrackChange, onQueueDownload }) {
  const audio = document.getElementById("audioPlayer");
  const playPauseBtn = document.getElementById("ctrlPlayPauseBtn");
  const stopBtn = document.getElementById("ctrlStopBtn");
  const nextBtn = document.getElementById("ctrlNextBtn");
  const prevBtn = document.getElementById("ctrlPrevBtn");
  const autoAdvBtn = document.getElementById("ctrlAutoAdvBtn");
  const scrubBarWrap = document.getElementById("scrubBarWrap");
  const scrubBarFill = document.getElementById("scrubBarFill");
  const curTimeEl = document.getElementById("playerCurTime");
  const totalTimeEl = document.getElementById("playerTotalTime");
  const visualizerBars = document.getElementById("visualizerBars");
  const volSlider = document.getElementById("volSlider");
  const volMuteBtn = document.getElementById("volMuteBtn");
  const quickDlBtn = document.getElementById("playerQuickDownloadBtn");

  const state = {
    activePlaylist: [],
    playlistIndex: 0,
    currentAlbum: null,
    isPlaying: false,
    autoAdvance: true
  };

  const fmtTime = (sec) => {
    if (isNaN(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  audio.addEventListener("timeupdate", () => {
    const cur = audio.currentTime;
    const dur = audio.duration || 30;
    if (curTimeEl) curTimeEl.textContent = fmtTime(cur);
    if (totalTimeEl) totalTimeEl.textContent = fmtTime(dur);
    if (scrubBarFill) scrubBarFill.style.width = `${(cur / dur) * 100}%`;
  });

  audio.addEventListener("ended", () => {
    if (state.autoAdvance && state.activePlaylist.length > 0) {
      playNext();
    } else {
      stop();
    }
  });

  audio.addEventListener("play", () => {
    state.isPlaying = true;
    if (playPauseBtn) playPauseBtn.textContent = "⏸";
    if (visualizerBars) visualizerBars.classList.add("playing");
    if (onTrackChange) onTrackChange(state);
  });

  audio.addEventListener("pause", () => {
    state.isPlaying = false;
    if (playPauseBtn) playPauseBtn.textContent = "▶";
    if (visualizerBars) visualizerBars.classList.remove("playing");
    if (onTrackChange) onTrackChange(state);
  });

  function playTrack(track, playlist = [], index = 0, albumContext = null) {
    if (!track || !track.preview) {
      alert("No audio preview clip available for this track.");
      return;
    }

    state.activePlaylist = playlist.length ? playlist : [track];
    state.playlistIndex = index;
    state.currentAlbum = albumContext || state.currentAlbum;

    const titleEl = document.getElementById("playerTrackTitle");
    const artistEl = document.getElementById("playerArtistAlbum");
    const artEl = document.getElementById("playerArt");

    if (titleEl) titleEl.textContent = track.title;
    if (artistEl) artistEl.textContent = `${track.artist} · ${state.currentAlbum?.title || ""}`;
    
    const artUrl = state.currentAlbum?.cover_small || state.currentAlbum?.cover_big || track.cover || "";
    if (artEl && artUrl) artEl.src = artUrl;

    if (quickDlBtn) {
      quickDlBtn.style.display = "inline-flex";
      quickDlBtn.onclick = () => {
        if (state.currentAlbum && onQueueDownload) onQueueDownload(state.currentAlbum);
      };
    }

    audio.src = track.preview;
    audio.play().catch(e => console.log("Playback error:", e));
  }

  function togglePlayPause() {
    if (!audio.src) {
      if (state.currentAlbum && state.currentAlbum.tracks?.length) {
        playAlbum(state.currentAlbum);
      }
      return;
    }
    if (audio.paused) audio.play();
    else audio.pause();
  }

  function stop() {
    audio.pause();
    audio.currentTime = 0;
    state.isPlaying = false;
    if (playPauseBtn) playPauseBtn.textContent = "▶";
    if (visualizerBars) visualizerBars.classList.remove("playing");
    if (scrubBarFill) scrubBarFill.style.width = "0%";
    if (curTimeEl) curTimeEl.textContent = "0:00";
    if (onTrackChange) onTrackChange(state);
  }

  function playNext() {
    if (!state.activePlaylist.length) return;
    let nextIdx = state.playlistIndex + 1;
    if (nextIdx >= state.activePlaylist.length) nextIdx = 0;
    playTrack(state.activePlaylist[nextIdx], state.activePlaylist, nextIdx, state.currentAlbum);
  }

  function playPrev() {
    if (!state.activePlaylist.length) return;
    let prevIdx = state.playlistIndex - 1;
    if (prevIdx < 0) prevIdx = state.activePlaylist.length - 1;
    playTrack(state.activePlaylist[prevIdx], state.activePlaylist, prevIdx, state.currentAlbum);
  }

  function playAlbum(album) {
    if (!album || !album.tracks || !album.tracks.length) return;
    const playable = album.tracks.filter(t => t.preview);
    if (!playable.length) {
      alert("No preview streams available for this album.");
      return;
    }
    playTrack(playable[0], playable, 0, album);
  }

  // Event Listeners
  if (playPauseBtn) playPauseBtn.addEventListener("click", togglePlayPause);
  if (stopBtn) stopBtn.addEventListener("click", stop);
  if (nextBtn) nextBtn.addEventListener("click", playNext);
  if (prevBtn) prevBtn.addEventListener("click", playPrev);

  if (autoAdvBtn) {
    autoAdvBtn.addEventListener("click", () => {
      state.autoAdvance = !state.autoAdvance;
      autoAdvBtn.classList.toggle("toggle-active", state.autoAdvance);
    });
  }

  if (scrubBarWrap) {
    scrubBarWrap.addEventListener("click", (e) => {
      const rect = scrubBarWrap.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      if (audio.duration) audio.currentTime = pos * audio.duration;
    });
  }

  if (volSlider) {
    volSlider.addEventListener("input", (e) => {
      audio.volume = parseFloat(e.target.value);
    });
  }

  if (volMuteBtn) {
    volMuteBtn.addEventListener("click", () => {
      audio.muted = !audio.muted;
      volMuteBtn.textContent = audio.muted ? "🔇" : "🔊";
    });
  }

  return {
    state,
    playTrack,
    playAlbum,
    togglePlayPause,
    stop,
    playNext,
    playPrev
  };
}
