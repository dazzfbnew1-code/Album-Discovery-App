/* =============================================================================
   ALBUM DISCOVERY STATION — LOCAL LIBRARY, DRIVES & SETTINGS ENGINE
   Architecture: Self-contained library and settings client (window.AppLibrary)
   Handles: Local disk index, Multi-drive music paths, DJ Radio engine,
   Workstation control panel settings, and Onboarding Setup Wizard.
   ============================================================================= */
(function() {
  const Bus = window.AppBus;

  // DOM Elements - Library
  const librarySearchWrap = document.getElementById("librarySearchWrap");
  const librarySearchInput = document.getElementById("librarySearchInput");
  const librarySearchClearBtn = document.getElementById("librarySearchClearBtn");
  const navLibraryRadio = document.getElementById("navLibraryRadio");
  const btnLibraryRadioLaunch = document.getElementById("btnLibraryRadioLaunch");
  const hudRerollRadioBtn = document.getElementById("hudRerollRadioBtn");
  const dockPillRerollBtn = document.getElementById("dockPillRerollBtn");
  const viewSectionTitle = document.getElementById("viewSectionTitle");
  const viewSectionCount = document.getElementById("viewSectionCount");
  const loadingIndicator = document.getElementById("loadingIndicator");
  const emptyIndicator = document.getElementById("emptyIndicator");
  const albumsGrid = document.getElementById("albumsGrid");
  const albumsTableBody = document.getElementById("albumsTableBody");
  const discographyCategoryPills = document.getElementById("discographyCategoryPills");

  // DOM Elements - Settings Modal & Multi-Drive
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

  // DOM Elements - Onboarding Wizard
  const firstRunModal = document.getElementById("firstRunModal");
  const wizardMusicRoot = document.getElementById("wizardMusicRoot");
  const btnWizardBrowseRoot = document.getElementById("btnWizardBrowseRoot");
  const wizardQualitySelect = document.getElementById("wizardQualitySelect");
  const wizardFilterJunk = document.getElementById("wizardFilterJunk");
  const wizardAutoAdvance = document.getElementById("wizardAutoAdvance");
  const btnWizardFinish = document.getElementById("btnWizardFinish");

  // DJ Radio Engine
  async function startLibraryDjRadio(showNotification = true) {
    if (navLibraryRadio) navLibraryRadio.classList.add("active");
    if (btnLibraryRadioLaunch) {
      btnLibraryRadioLaunch.disabled = true;
      btnLibraryRadioLaunch.innerHTML = '<span class="radio-pulse-icon">⏳</span><span>Mixing Radio...</span>';
    }

    try {
      const radioLimit = (Bus.state.config && Bus.state.config.radio_batch_size) ? Bus.state.config.radio_batch_size : 60;
      const res = await fetch(`/api/library/radio?limit=${radioLimit}`);
      const data = await res.json();
      const tracks = data.tracks || [];

      if (!tracks || tracks.length === 0) {
        Bus.showToast("No downloaded albums found in your music library yet. Download an album to start the radio!", "warn");
        if (navLibraryRadio) navLibraryRadio.classList.remove("active");
        return;
      }

      const radioAlbum = {
        id: "library_dj_radio",
        title: "Library DJ Radio (All Albums)",
        artist: "Various Artists",
        cover_big: tracks[0].cover_big || tracks[0].cover_small || "",
        cover_small: tracks[0].cover_small || ""
      };

      if (window.AppPlayer) {
        window.AppPlayer.setRadioMode(true);
        window.AppPlayer.setPlayingAlbum(radioAlbum);
        window.AppPlayer.setPlayingTracklist(tracks);
        window.AppPlayer.playTrackAtIndex(0, true);
        window.AppPlayer.showPlayerHud();
      }

      if (hudRerollRadioBtn) hudRerollRadioBtn.classList.remove("hidden");
      if (dockPillRerollBtn) dockPillRerollBtn.classList.remove("hidden");

      if (showNotification) {
        Bus.showToast(`📻 Library DJ Radio Started — ${tracks.length} tracks queued across your albums!`, "success");
      }
    } catch (err) {
      console.error("Failed to start library radio:", err);
      Bus.showToast("Failed to launch library DJ radio", "error");
      if (navLibraryRadio) navLibraryRadio.classList.remove("active");
    } finally {
      if (btnLibraryRadioLaunch) {
        btnLibraryRadioLaunch.disabled = false;
        btnLibraryRadioLaunch.innerHTML = '<span class="radio-pulse-icon">📻</span><span>Start DJ Radio</span>';
      }
    }
  }

  if (btnLibraryRadioLaunch) btnLibraryRadioLaunch.addEventListener("click", () => startLibraryDjRadio());

  if (hudRerollRadioBtn) {
    hudRerollRadioBtn.addEventListener("click", () => {
      startLibraryDjRadio(false);
      Bus.showToast("🔀 Re-rolled Fresh DJ Radio Mix!", "info");
    });
  }

  if (dockPillRerollBtn) {
    dockPillRerollBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      startLibraryDjRadio(false);
      Bus.showToast("🔀 Re-rolled Fresh DJ Radio Mix!", "info");
    });
  }

  function filterLocalLibraryUI(q) {
    const term = (q || "").trim().toLowerCase();
    const localLibraryAlbums = Bus.state.localLibraryAlbums || [];

    if (!term) {
      if (librarySearchClearBtn) librarySearchClearBtn.classList.add("hidden");
      if (emptyIndicator) emptyIndicator.classList.add("hidden");
      if (viewSectionCount) viewSectionCount.textContent = `${localLibraryAlbums.length} albums on disk`;
      if (window.AppDiscovery) window.AppDiscovery.renderCurrentView(localLibraryAlbums);
      return;
    }

    if (librarySearchClearBtn) librarySearchClearBtn.classList.remove("hidden");
    const matched = localLibraryAlbums.filter(a => 
      (a.title || "").toLowerCase().includes(term) || 
      (a.artist || "").toLowerCase().includes(term)
    );

    if (viewSectionCount) {
      viewSectionCount.textContent = `${matched.length} of ${localLibraryAlbums.length} albums matching "${q.trim()}"`;
    }

    if (matched.length === 0) {
      if (emptyIndicator) emptyIndicator.classList.remove("hidden");
      if (albumsGrid) albumsGrid.innerHTML = "";
      if (albumsTableBody) albumsTableBody.innerHTML = "";
    } else {
      if (emptyIndicator) emptyIndicator.classList.add("hidden");
      if (window.AppDiscovery) window.AppDiscovery.renderCurrentView(matched);
    }
  }

  if (librarySearchInput) {
    librarySearchInput.addEventListener("input", (e) => {
      const v = e.target.value;
      const omni = document.getElementById("omniSearchInput");
      if (omni) omni.value = v;
      filterLocalLibraryUI(v);
    });
  }

  if (librarySearchClearBtn) {
    librarySearchClearBtn.addEventListener("click", () => {
      if (librarySearchInput) librarySearchInput.value = "";
      const omni = document.getElementById("omniSearchInput");
      if (omni) omni.value = "";
      filterLocalLibraryUI("");
      if (librarySearchInput) librarySearchInput.focus();
    });
  }

  async function loadLibrary(query = "") {
    Bus.state.currentViewType = "library";
    if (discographyCategoryPills) discographyCategoryPills.classList.add("hidden");
    if (btnLibraryRadioLaunch) btnLibraryRadioLaunch.classList.remove("hidden");
    if (librarySearchWrap) {
      librarySearchWrap.classList.remove("hidden");
      if (librarySearchInput && !query) librarySearchInput.value = "";
      if (librarySearchClearBtn && !query) librarySearchClearBtn.classList.add("hidden");
    }
    if (viewSectionTitle) viewSectionTitle.textContent = "💾 My Local Music Library";

    // 0ms instant display if already scanned
    if (!query && Bus.state.localLibraryAlbums && Bus.state.localLibraryAlbums.length > 0) {
      if (loadingIndicator) loadingIndicator.classList.add("hidden");
      if (emptyIndicator) emptyIndicator.classList.add("hidden");
      if (viewSectionCount) viewSectionCount.textContent = `${Bus.state.localLibraryAlbums.length} albums on disk`;
      if (window.AppDiscovery) window.AppDiscovery.renderCurrentView(Bus.state.localLibraryAlbums);
      fetch("/api/library/albums").then(r => r.json()).then(d => {
        if (d && d.albums) {
          Bus.state.localLibraryAlbums = d.albums;
          if (Bus.state.currentViewType === "library" && (!librarySearchInput || !librarySearchInput.value)) {
            if (viewSectionCount) viewSectionCount.textContent = `${Bus.state.localLibraryAlbums.length} albums on disk`;
            if (window.AppDiscovery) window.AppDiscovery.renderCurrentView(Bus.state.localLibraryAlbums);
          }
        }
      }).catch(() => {});
      return;
    }

    if (loadingIndicator) loadingIndicator.classList.remove("hidden");
    if (emptyIndicator) emptyIndicator.classList.add("hidden");
    if (albumsGrid) albumsGrid.innerHTML = "";
    if (albumsTableBody) albumsTableBody.innerHTML = "";
    if (viewSectionCount) viewSectionCount.textContent = "Scanning music library drive...";

    try {
      const url = query ? `/api/library/albums?q=${encodeURIComponent(query)}` : "/api/library/albums";
      const res = await fetch(url);
      const data = await res.json();
      const albums = (data && data.albums) || [];
      if (!query) {
        Bus.state.localLibraryAlbums = albums;
      }

      if (loadingIndicator) loadingIndicator.classList.add("hidden");
      if (albums.length === 0) {
        if (emptyIndicator) emptyIndicator.classList.remove("hidden");
        if (viewSectionCount) viewSectionCount.textContent = query ? `0 albums matching "${query}"` : "0 albums stored";
        return;
      }

      if (viewSectionCount) {
        viewSectionCount.textContent = query ? `${albums.length} of ${Bus.state.localLibraryAlbums.length} albums matching "${query}"` : `${albums.length} albums on disk`;
      }
      if (window.AppDiscovery) window.AppDiscovery.renderCurrentView(albums);
    } catch (err) {
      console.error("Failed to load local library:", err);
      if (loadingIndicator) loadingIndicator.classList.add("hidden");
      if (emptyIndicator) emptyIndicator.classList.remove("hidden");
    }
  }

  // Multi-Drive Management
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
        : `<button class="btn-drive-action set-primary" data-path="${Bus.escapeHtml(drv.path)}" title="Make this drive the default download location">⭐ Set Primary</button>`;

      const removeActionHtml = drives.length > 1
        ? `<button class="btn-drive-action remove-drive" data-path="${Bus.escapeHtml(drv.path)}" title="Remove this drive from library scanner">✕</button>`
        : ``;

      return `
        <div class="drive-item-card ${isDef ? 'active-default' : ''}">
          <div class="drive-item-left">
            <span class="drive-item-icon">💽</span>
            <div class="drive-item-details">
              <div class="drive-item-path" title="${Bus.escapeHtml(drv.path)}">${Bus.escapeHtml(drv.path)}</div>
              <div class="drive-item-stats">${freeTxt}</div>
            </div>
          </div>
          <div class="drive-item-actions">
            ${primaryActionHtml}
            <button class="btn-drive-action open-drive" data-path="${Bus.escapeHtml(drv.path)}" title="Open in Windows Explorer">📂</button>
            ${removeActionHtml}
          </div>
        </div>
      `;
    }).join("");

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
          Bus.showToast(`Primary download drive set to: ${p}`, "success");
        } catch (e) {
          Bus.showToast("Failed to set primary drive", "error");
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
          Bus.showToast("Could not open drive folder", "error");
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
          Bus.showToast(`Drive removed: ${p}`, "info");
        } catch (e) {
          Bus.showToast("Failed to remove drive", "error");
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
          Bus.showToast(`Music drive added: ${data.folder}`, "success");
        }
      } catch (e) {
        Bus.showToast("Failed to add drive", "error");
      }
    });
  }

  document.querySelectorAll("#crossfadePillGroup .pill-opt-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#crossfadePillGroup .pill-opt-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      if (settingCrossfadeDuration) settingCrossfadeDuration.value = btn.getAttribute("data-val");
    });
  });

  if (btnRescanLibraryNow) {
    btnRescanLibraryNow.addEventListener("click", async () => {
      btnRescanLibraryNow.disabled = true;
      btnRescanLibraryNow.innerHTML = "<span>⏳ Scanning Disk...</span>";
      try {
        const res = await fetch("/api/library/rescan", { method: "POST" });
        const data = await res.json();
        const total = data.total_owned || (data.albums ? data.albums.length : 0);
        Bus.showToast(`✓ Library Re-Indexed: ${total} albums ready`, "success");
        if (Bus.state.currentViewType === "library") loadLibrary();
      } catch (e) {
        Bus.showToast("Failed to re-index library", "error");
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
        Bus.showToast(`✓ Cover repair complete: ${count} covers downloaded`, "success");
        if (Bus.state.currentViewType === "library") loadLibrary();
      } catch (e) {
        Bus.showToast("Cover repair failed", "error");
      } finally {
        btnBackfillCoversNow.disabled = false;
        btnBackfillCoversNow.innerHTML = "<span>🖼️ Repair Covers</span>";
      }
    });
  }

  // Load and Save Configuration
  async function loadConfig() {
    try {
      const res = await fetch("/api/config");
      const configData = await res.json();
      Bus.state.config = configData;

      if (settingQualitySelect) settingQualitySelect.value = configData.audio_quality || configData.quality || "320k";
      if (settingMusicRoot) settingMusicRoot.value = configData.music_root || "";
      loadConfiguredDrives();
      if (settingFolderStructure) settingFolderStructure.value = configData.folder_structure || "artist_album_year";
      if (settingConcurrencySelect) settingConcurrencySelect.value = String(configData.download_concurrency || 4);
      if (settingSaveLrc) settingSaveLrc.checked = Boolean(configData.save_lrc_lyrics);
      if (settingEmbedCover) settingEmbedCover.checked = configData.embed_cover_art !== false;
      if (settingSaveCoverJpg) settingSaveCoverJpg.checked = configData.save_cover_jpg !== false;
      if (settingCrossfade) settingCrossfade.checked = configData.crossfade_audio !== false;
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

      // Onboarding Wizard check
      if (!configData.first_run_completed && firstRunModal) {
        if (wizardMusicRoot) wizardMusicRoot.value = configData.music_root || "";
        if (wizardQualitySelect) wizardQualitySelect.value = configData.audio_quality || "320k";
        if (wizardFilterJunk) wizardFilterJunk.checked = configData.filter_junk !== false;
        if (wizardAutoAdvance) wizardAutoAdvance.checked = configData.auto_advance_preview !== false;
        firstRunModal.classList.remove("hidden");
      }
      return configData;
    } catch (err) {
      console.error("Failed to load config:", err);
      return {};
    }
  }

  // Wizard Listeners
  if (btnWizardBrowseRoot) {
    btnWizardBrowseRoot.addEventListener("click", async () => {
      try {
        const res = await fetch("/api/browse-folder");
        const data = await res.json();
        if (data.folder && wizardMusicRoot) {
          wizardMusicRoot.value = data.folder;
          Bus.showToast(`Download folder selected: ${data.folder}`, "info");
        }
      } catch (err) {
        console.error("Folder picker failed:", err);
      }
    });
  }

  if (btnWizardFinish) {
    btnWizardFinish.addEventListener("click", async () => {
      const payload = {
        audio_quality: wizardQualitySelect ? wizardQualitySelect.value : "320k",
        music_root: wizardMusicRoot ? wizardMusicRoot.value : "",
        filter_junk: wizardFilterJunk ? wizardFilterJunk.checked : true,
        auto_advance_preview: wizardAutoAdvance ? wizardAutoAdvance.checked : true,
        first_run_completed: true
      };

      try {
        await fetch("/api/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        Bus.state.config = { ...Bus.state.config, ...payload };
        if (firstRunModal) firstRunModal.classList.add("hidden");
        Bus.showToast("🎉 Workstation Configured! Welcome to Album Discovery.", "success");
        if (window.AppDiscovery) window.AppDiscovery.loadCharts(Bus.state.currentGenre);
      } catch (err) {
        console.error("Failed to save wizard config:", err);
        Bus.showToast("Failed to save settings", "error");
      }
    });
  }

  // Settings Save Listener
  if (btnSaveSettings) {
    btnSaveSettings.addEventListener("click", async () => {
      const payload = {
        audio_quality: settingQualitySelect ? settingQualitySelect.value : "320k",
        music_root: settingMusicRoot ? settingMusicRoot.value : "",
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
        filter_junk: settingFilterJunk ? settingFilterJunk.checked : true,
        auto_advance_preview: settingAutoAdvance ? settingAutoAdvance.checked : true,
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
        Bus.state.config = payload;
        if (window.AppDiscovery) window.AppDiscovery.clearTabCache();
        if (settingsModal) settingsModal.classList.add("hidden");
        Bus.showToast("Workstation control panel settings saved ✓", "success");
        if (Bus.state.currentViewType === "library") {
          loadLibrary();
        } else if (window.AppDiscovery) {
          window.AppDiscovery.loadCharts(Bus.state.currentGenre);
        }
      } catch (err) {
        console.error("Failed to save settings:", err);
        Bus.showToast("Failed to save settings", "error");
      }
    });
  }

  if (btnSettingsToggle) {
    btnSettingsToggle.addEventListener("click", () => {
      loadConfig();
      loadConfiguredDrives();
      if (settingsModal) settingsModal.classList.remove("hidden");
    });
  }

  if (settingsCloseBtn) {
    settingsCloseBtn.addEventListener("click", () => {
      if (settingsModal) settingsModal.classList.add("hidden");
    });
  }

  if (btnOpenDownloadsFolder) {
    btnOpenDownloadsFolder.addEventListener("click", async () => {
      try {
        await fetch("/api/open-folder", { method: "POST" });
      } catch (err) {
        console.error("Failed to open downloads folder:", err);
      }
    });
  }

  // Public Interface
  window.AppLibrary = {
    loadLibrary,
    filterLocalLibraryUI,
    startLibraryDjRadio,
    loadConfig,
    loadConfiguredDrives
  };
})();
