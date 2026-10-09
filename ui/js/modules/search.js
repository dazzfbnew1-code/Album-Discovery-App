/* =============================================================================
   ALBUM DISCOVERY STATION — SEARCH, DISCOGRAPHY & GAP RADAR ENGINE
   Architecture: Self-contained search & radar manager (window.AppSearch)
   Handles: OmniSearch input, AbortController cancellation, Discography categorization,
   Pill filters, and Canon Gap Radar (Complete Collection batch downloader).
   ============================================================================= */
(function() {
  const Bus = window.AppBus;

  // DOM Elements
  const omniSearchInput = document.getElementById("omniSearchInput");
  const searchClearBtn = document.getElementById("searchClearBtn");
  const viewSectionTitle = document.getElementById("viewSectionTitle");
  const viewSectionCount = document.getElementById("viewSectionCount");
  const loadingIndicator = document.getElementById("loadingIndicator");
  const emptyIndicator = document.getElementById("emptyIndicator");
  const discographyCategoryPills = document.getElementById("discographyCategoryPills");
  const librarySearchWrap = document.getElementById("librarySearchWrap");
  const btnLibraryRadioLaunch = document.getElementById("btnLibraryRadioLaunch");

  // Gap Radar Elements
  const artistGapBanner = document.getElementById("artistGapBanner");
  const gapBannerArtist = document.getElementById("gapBannerArtist");
  const gapStatusPill = document.getElementById("gapStatusPill");
  const gapProgressBar = document.getElementById("gapProgressBar");
  const gapBannerSubtext = document.getElementById("gapBannerSubtext");
  const btnCompleteCollection = document.getElementById("btnCompleteCollection");
  const btnCompleteCollectionText = document.getElementById("btnCompleteCollectionText");

  // State
  let searchDebounceTimer = null;
  let activeSearchAbortController = null;
  let currentSearchSequenceId = 0;
  const SEARCH_CACHE = new Map();

  function renderDiscographySearchResults(data, query, isArtistExact) {
    if (loadingIndicator) loadingIndicator.classList.add("hidden");

    let albumsList = [];
    let epsList = [];
    let singlesList = [];
    let compList = [];
    let allList = [];

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

      albumsList = results.filter(a => (a.type || a.record_type || "").toLowerCase() === "album");
      epsList = results.filter(a => (a.type || a.record_type || "").toLowerCase() === "ep");
      singlesList = results.filter(a => (a.type || a.record_type || "").toLowerCase() === "single");
      compList = results.filter(a => {
        const type = (a.type || a.record_type || "").toLowerCase();
        return type === "compile" || type === "compilation";
      });
    }

    if (allList.length === 0 && albumsList.length === 0) {
      if (emptyIndicator) emptyIndicator.classList.remove("hidden");
      if (discographyCategoryPills) discographyCategoryPills.classList.add("hidden");
      if (viewSectionCount) viewSectionCount.textContent = "0 albums found";
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

    if (viewSectionTitle) {
      if (isArtistSearch) {
        const displayArtist = data.artist.name || query;
        viewSectionTitle.textContent = `🎙️ ${displayArtist} — Career Discography`;
      } else {
        viewSectionTitle.textContent = `🔍 Search: "${query}"`;
      }
    }

    Bus.state.currentArtistDiscography = discographyPayload;

    // Category Pill Badges
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

    if (discographyCategoryPills) discographyCategoryPills.classList.remove("hidden");

    // 🎯 Canon Gap Radar
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
      Bus.state.currentArtistGapData = gap;

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
      Bus.state.currentArtistGapData = null;
      if (artistGapBanner) artistGapBanner.classList.add("hidden");
    }
    
    const preferredFilter = (Bus.state.config && Bus.state.config.default_discography_filter) ? Bus.state.config.default_discography_filter : "albums";
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

  function filterDiscographyCategory(category) {
    if (!Bus.state.currentArtistDiscography) return;
    Bus.state.currentCategoryFilter = category;

    const pillBtns = document.querySelectorAll(".cat-pill");
    pillBtns.forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-cat") === category);
    });

    let displayAlbums = [];
    let countLabel = "releases";

    if (category === "all") {
      displayAlbums = Bus.state.currentArtistDiscography.all || [];
      countLabel = "total releases";
    } else if (category === "albums") {
      displayAlbums = Bus.state.currentArtistDiscography.albums || [];
      countLabel = "studio albums";
    } else if (category === "compilations") {
      displayAlbums = Bus.state.currentArtistDiscography.compilations || [];
      countLabel = "compilations & live albums";
    } else if (category === "eps") {
      displayAlbums = Bus.state.currentArtistDiscography.eps || [];
      countLabel = "EPs & mini-albums";
    } else if (category === "singles") {
      displayAlbums = Bus.state.currentArtistDiscography.singles || [];
      countLabel = "singles & drops";
    }

    if (displayAlbums.length === 0 && (Bus.state.currentArtistDiscography.all || []).length > 0) {
      displayAlbums = Bus.state.currentArtistDiscography.all;
      countLabel = "matching releases";
    }

    if (viewSectionCount) {
      if (Bus.state.currentArtistDiscography.is_artist) {
        const nStudio = (Bus.state.currentArtistDiscography.albums || []).length;
        const nComp = (Bus.state.currentArtistDiscography.compilations || []).length;
        const nEps = (Bus.state.currentArtistDiscography.eps || []).length;
        const nSingles = (Bus.state.currentArtistDiscography.singles || []).length;
        viewSectionCount.innerHTML = `Showing <strong>${displayAlbums.length}</strong> ${countLabel} <span style="opacity: 0.6; margin-left: 6px;">(${nStudio} Studio • ${nComp} Compilations • ${nEps} EPs • ${nSingles} Singles)</span>`;
      } else {
        const qVal = omniSearchInput ? omniSearchInput.value.trim() : "";
        viewSectionCount.innerHTML = `Showing <strong>${displayAlbums.length}</strong> ${countLabel}${qVal ? ` for "${Bus.escapeHtml(qVal)}"` : ""}`;
      }
    }

    if (window.AppDiscovery) window.AppDiscovery.renderCurrentView(displayAlbums);
  }

  document.querySelectorAll(".cat-pill").forEach(btn => {
    btn.addEventListener("click", () => filterDiscographyCategory(btn.getAttribute("data-cat")));
  });

  if (btnCompleteCollection) {
    btnCompleteCollection.addEventListener("click", async () => {
      if (!Bus.state.currentArtistGapData || !Bus.state.currentArtistGapData.missing_albums || Bus.state.currentArtistGapData.missing_albums.length === 0) {
        Bus.showToast("All canonical studio albums are already owned!", "info");
        return;
      }
      const missing = Bus.state.currentArtistGapData.missing_albums;
      btnCompleteCollection.disabled = true;
      if (btnCompleteCollectionText) btnCompleteCollectionText.textContent = "Queueing Missing LPs...";

      try {
        const res = await fetch("/api/download/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ albums: missing })
        });
        await res.json();
        Bus.showToast(`⚡ Queued all ${missing.length} missing studio albums for background download!`, "success");
        if (window.AppDownloader) window.AppDownloader.updateQueueUI();
      } catch (err) {
        console.error("Complete collection error:", err);
        Bus.showToast("Failed to queue missing albums", "error");
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
      if (discographyCategoryPills) discographyCategoryPills.classList.add("hidden");
      if (librarySearchWrap) librarySearchWrap.classList.add("hidden");
      if (window.AppDiscovery) window.AppDiscovery.loadCharts(Bus.state.currentGenre);
      return;
    }

    if (activeSearchAbortController) activeSearchAbortController.abort();
    activeSearchAbortController = new AbortController();
    const abortSignal = activeSearchAbortController.signal;
    const thisSearchSeq = ++currentSearchSequenceId;

    if (btnLibraryRadioLaunch) btnLibraryRadioLaunch.classList.add("hidden");
    if (librarySearchWrap) librarySearchWrap.classList.add("hidden");

    if (viewSectionTitle) {
      viewSectionTitle.textContent = isArtistExact ? `🎙️ ${cleanQuery} — Career Discography` : `🔍 Search: "${cleanQuery}"`;
    }

    if (loadingIndicator) loadingIndicator.classList.remove("hidden");
    if (emptyIndicator) emptyIndicator.classList.add("hidden");
    if (viewSectionCount) viewSectionCount.textContent = "Searching verified databases...";

    const cacheKey = `${isArtistExact ? 'artist' : 'q'}:${cleanQuery.toLowerCase()}`;
    if (SEARCH_CACHE.has(cacheKey)) {
      const cachedData = SEARCH_CACHE.get(cacheKey);
      if (thisSearchSeq === currentSearchSequenceId && omniSearchInput.value.trim().toLowerCase() === cleanQuery.toLowerCase()) {
        renderDiscographySearchResults(cachedData, cleanQuery, isArtistExact);
        return;
      }
    }

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(cleanQuery)}`, { signal: abortSignal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (thisSearchSeq !== currentSearchSequenceId) return;
      if (omniSearchInput.value.trim().toLowerCase() !== cleanQuery.toLowerCase()) return;

      SEARCH_CACHE.set(cacheKey, data);
      renderDiscographySearchResults(data, cleanQuery, isArtistExact);
    } catch (err) {
      if (err.name === "AbortError") return;
      if (thisSearchSeq !== currentSearchSequenceId) return;
      console.error("Search failed:", err);
      if (loadingIndicator) loadingIndicator.classList.add("hidden");
      if (emptyIndicator) emptyIndicator.classList.remove("hidden");
    } finally {
      if (thisSearchSeq === currentSearchSequenceId && loadingIndicator) {
        loadingIndicator.classList.add("hidden");
      }
    }
  }

  function resetSearch() {
    clearTimeout(searchDebounceTimer);
    if (activeSearchAbortController) {
      activeSearchAbortController.abort();
      activeSearchAbortController = null;
    }
    currentSearchSequenceId++;
    if (omniSearchInput) omniSearchInput.value = "";
    if (searchClearBtn) searchClearBtn.classList.add("hidden");
    if (discographyCategoryPills) discographyCategoryPills.classList.add("hidden");
    Bus.state.currentArtistDiscography = null;
    if (artistGapBanner) artistGapBanner.classList.add("hidden");
  }

  if (omniSearchInput) {
    omniSearchInput.addEventListener("input", () => {
      const val = omniSearchInput.value.trim();
      if (searchClearBtn) searchClearBtn.classList.toggle("hidden", val.length === 0);

      clearTimeout(searchDebounceTimer);

      if (val.length === 0) {
        resetSearch();
        if (Bus.state.currentViewType === "library" && window.AppLibrary) {
          window.AppLibrary.loadLibrary();
        } else if (window.AppDiscovery) {
          window.AppDiscovery.loadCharts(Bus.state.currentGenre);
        }
        return;
      }

      if (val.length < 2) return;

      searchDebounceTimer = setTimeout(() => {
        const currentVal = omniSearchInput.value.trim();
        if (currentVal.length >= 2) {
          Bus.state.currentViewType = "search";
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
          Bus.state.currentViewType = "search";
          performSearch(val);
        }
      } else if (e.key === "Escape") {
        resetSearch();
        omniSearchInput.blur();
        if (Bus.state.currentViewType === "library" && window.AppLibrary) {
          window.AppLibrary.loadLibrary();
        } else if (window.AppDiscovery) {
          window.AppDiscovery.loadCharts(Bus.state.currentGenre);
        }
      }
    });
  }

  if (searchClearBtn) {
    searchClearBtn.addEventListener("click", () => {
      resetSearch();
      if (Bus.state.currentViewType === "library" && window.AppLibrary) {
        const libInput = document.getElementById("librarySearchInput");
        if (libInput) libInput.value = "";
        window.AppLibrary.loadLibrary();
      } else if (window.AppDiscovery) {
        window.AppDiscovery.loadCharts(Bus.state.currentGenre);
      }
    });
  }

  // Public Interface
  window.AppSearch = {
    performSearch,
    filterDiscographyCategory,
    resetSearch,
    clearSearchCache: (q) => {
      SEARCH_CACHE.delete(`q:${q.toLowerCase()}`);
      SEARCH_CACHE.delete(`artist:${q.toLowerCase()}`);
    },
    clearAllCache: () => SEARCH_CACHE.clear()
  };
})();
