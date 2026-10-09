/* =============================================================================
   ALBUM DISCOVERY STATION — MASTER FRONTEND CONTROLLER
   Architecture: Lightweight modular orchestrator coordinating focused subsystems:
   - modules/bus.js        (Core event bus, shared state & formatters)
   - modules/player.js     (Dual-deck audio engine, crossfade, synced lyrics)
   - modules/downloader.js (Download queue, progress meters, batch downloader)
   - modules/discovery.js  (Charts, grid/list layout, pagination, modal, drawer)
   - modules/search.js     (OmniSearch input, discography filters, gap radar)
   - modules/library.js    (Multi-drive storage, local scan, settings, wizard)
   - modules/telemetry.js  (System monitor, CPU/RAM telemetry, event logs)
   ============================================================================= */
document.addEventListener("DOMContentLoaded", () => {
  const Bus = window.AppBus;

  // Global Universal Modal Observer (Guarantees zero player overlap whenever ANY modal is opened)
  const appModalBackdrops = document.querySelectorAll(".modal-backdrop");
  function syncBodyModalState() {
    const isAnyModalActive = Array.from(appModalBackdrops).some(m => !m.classList.contains("hidden"));
    document.body.classList.toggle("modal-open", isAnyModalActive);
  }
  const bodyModalObserver = new MutationObserver(syncBodyModalState);
  appModalBackdrops.forEach(m => {
    bodyModalObserver.observe(m, { attributes: true, attributeFilter: ["class"] });
  });
  syncBodyModalState();

  // Sidebar Static Navigation
  document.querySelectorAll(".station-sidebar .nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      if (window.AppSearch) window.AppSearch.resetSearch();

      const navType = btn.getAttribute("data-type");
      const navTarget = btn.getAttribute("data-target");

      if (navType === "genre" && window.AppDiscovery) {
        window.AppDiscovery.loadCharts(navTarget);
      } else if (navType === "special" && navTarget === "library" && window.AppLibrary) {
        window.AppLibrary.loadLibrary();
      } else if (navType === "special" && navTarget === "library_radio" && window.AppLibrary) {
        window.AppLibrary.startLibraryDjRadio();
      } else if (navType === "special" && navTarget === "surprise" && window.AppDiscovery) {
        window.AppDiscovery.loadSurpriseCrate();
      }
    });
  });

  // Time Machine Era Shuffle
  const btnShuffleEra = document.getElementById("btnShuffleEra");
  if (btnShuffleEra) {
    btnShuffleEra.addEventListener("click", (e) => {
      e.stopPropagation();
      const eras = ["30s_40s", "50s", "60s", "70s", "80s", "90s", "2000s", "2010s", "2020s"];
      const currentGenre = Bus.state.currentGenre || "all";
      const candidates = eras.filter(item => item !== currentGenre);
      const picked = candidates[Math.floor(Math.random() * candidates.length)] || "60s";
      
      document.querySelectorAll(".station-sidebar .nav-item").forEach(b => {
        b.classList.toggle("active", b.getAttribute("data-target") === picked);
      });
      if (window.AppSearch) window.AppSearch.resetSearch();
      Bus.showToast(`⏳ Time Machine: Warped to the ${picked.toUpperCase()} Era!`, "info");
      if (window.AppDiscovery) window.AppDiscovery.loadCharts(picked, true);
    });
  }

  // Genre Shuffle
  const btnShuffleGenre = document.getElementById("btnShuffleGenre");
  if (btnShuffleGenre) {
    btnShuffleGenre.addEventListener("click", (e) => {
      e.stopPropagation();
      const genres = ["rap", "dance", "rock", "rnb", "metal", "electronic", "indie", "jazz", "classical"];
      const currentGenre = Bus.state.currentGenre || "all";
      const candidates = genres.filter(item => item !== currentGenre);
      const picked = candidates[Math.floor(Math.random() * candidates.length)] || "dance";
      
      document.querySelectorAll(".station-sidebar .nav-item").forEach(b => {
        b.classList.toggle("active", b.getAttribute("data-target") === picked);
      });
      if (window.AppSearch) window.AppSearch.resetSearch();
      Bus.showToast(`🎲 Shuffled into ${picked.toUpperCase()} Crate!`, "info");
      if (window.AppDiscovery) window.AppDiscovery.loadCharts(picked, true);
    });
  }

  // Global Keyboard Shortcuts
  document.addEventListener("keydown", (e) => {
    // Global Reload (F5 or Ctrl+R)
    if (e.key === "F5" || (e.ctrlKey && (e.key === "r" || e.key === "R"))) {
      e.preventDefault();
      window.location.reload();
      return;
    }

    const activeEl = document.activeElement;
    const isTyping = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.isContentEditable);
    
    // Global Escape Handler
    if (e.key === "Escape") {
      const inspectDrawer = document.getElementById("inspectDrawer");
      const albumModal = document.getElementById("albumModal");
      const settingsModal = document.getElementById("settingsModal");
      const batchDownloadModal = document.getElementById("batchDownloadModal");
      const appMonitorModal = document.getElementById("appMonitorModal");
      const queueDrawer = document.getElementById("queueDrawer");

      if (inspectDrawer && !inspectDrawer.classList.contains("hidden")) {
        if (window.AppDiscovery) window.AppDiscovery.closeInspectDrawer();
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
        if (window.AppTelemetry) window.AppTelemetry.closeAppMonitor();
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
      if (window.AppPlayer) window.AppPlayer.togglePlayPause();
    } else if (e.code === "ArrowRight") {
      e.preventDefault();
      if (window.AppPlayer) window.AppPlayer.playNextTrack();
    } else if (e.code === "ArrowLeft") {
      e.preventDefault();
      if (window.AppPlayer) window.AppPlayer.playPrevTrack();
    } else if (e.key === "m" || e.key === "M") {
      e.preventDefault();
      const muteBtn = document.getElementById("volMuteBtn");
      if (muteBtn) muteBtn.click();
    }
  });

  // App Initialization Sequence
  async function initApp() {
    let config = {};
    if (window.AppLibrary) {
      config = await window.AppLibrary.loadConfig();
    }
    if (window.AppTelemetry) {
      window.AppTelemetry.startAppMonitorPolling();
    }

    const startView = (config && config.default_startup_view) ? config.default_startup_view : "all";
    if (startView === "library" && window.AppLibrary) {
      document.querySelectorAll(".station-sidebar .nav-item").forEach(b => {
        b.classList.toggle("active", b.getAttribute("data-target") === "library");
      });
      window.AppLibrary.loadLibrary();
    } else if (startView === "surprise" && window.AppDiscovery) {
      document.querySelectorAll(".station-sidebar .nav-item").forEach(b => {
        b.classList.toggle("active", b.getAttribute("data-target") === "surprise");
      });
      window.AppDiscovery.loadSurpriseCrate();
    } else if (window.AppDiscovery) {
      document.querySelectorAll(".station-sidebar .nav-item").forEach(b => {
        b.classList.toggle("active", b.getAttribute("data-target") === startView);
      });
      window.AppDiscovery.loadCharts(startView);
    }
  }

  initApp();
});
