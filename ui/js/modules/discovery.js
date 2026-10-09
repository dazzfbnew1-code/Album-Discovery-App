/* =============================================================================
   ALBUM DISCOVERY STATION — CATALOG DISCOVERY & ALBUM INSPECTOR
   Architecture: Self-contained discovery view manager (window.AppDiscovery)
   Handles: Era & Genre charts, Surprise Crate, Discovery Flow, Grid/List rendering,
   Pagination, Album Modal with Tracklist & Lyrics, and Quick Audition Side Drawer.
   ============================================================================= */
(function() {
  const Bus = window.AppBus;

  // DOM Elements
  const albumsGrid = document.getElementById("albumsGrid");
  const albumsListContainer = document.getElementById("albumsListContainer");
  const albumsTableBody = document.getElementById("albumsTableBody");
  const viewSectionTitle = document.getElementById("viewSectionTitle");
  const viewSectionCount = document.getElementById("viewSectionCount");
  const loadingIndicator = document.getElementById("loadingIndicator");
  const emptyIndicator = document.getElementById("emptyIndicator");
  const btnRefreshView = document.getElementById("btnRefreshView");
  const discographyCategoryPills = document.getElementById("discographyCategoryPills");
  const librarySearchWrap = document.getElementById("librarySearchWrap");
  const btnLibraryRadioLaunch = document.getElementById("btnLibraryRadioLaunch");

  // View Layout Buttons
  const btnViewGrid = document.getElementById("btnViewGrid");
  const btnViewList = document.getElementById("btnViewList");
  let currentViewLayout = "grid";

  // Pagination Elements & State
  const paginationBar = document.getElementById("paginationBar");
  const paginationSummary = document.getElementById("paginationSummary");
  const paginationNumbers = document.getElementById("paginationNumbers");
  const btnPrevPage = document.getElementById("btnPrevPage");
  const btnNextPage = document.getElementById("btnNextPage");
  const selectPageSize = document.getElementById("selectPageSize");
  let currentPage = 1;
  let currentPageSize = 50;

  // In-Memory Caches
  const TAB_ALBUMS_CACHE = new Map();
  const ALBUM_MODAL_CACHE = new Map();

  // Inspect Side Drawer Elements
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

  // Modal Panes & Tabs
  const modalTabBtns = document.querySelectorAll(".modal-tab-btn");
  const modalPaneTracks = document.getElementById("modalPaneTracks");
  const modalPaneLyrics = document.getElementById("modalPaneLyrics");
  const modalPaneStory = document.getElementById("modalPaneStory");
  const modalPaneSimilar = document.getElementById("modalPaneSimilar");
  const storyLabelVal = document.getElementById("storyLabelVal");
  const storyYearVal = document.getElementById("storyYearVal");
  const storyUpcVal = document.getElementById("storyUpcVal");
  const storyTracksVal = document.getElementById("storyTracksVal");
  const modalBackstoryText = document.getElementById("modalBackstoryText");
  const modalSimilarGrid = document.getElementById("modalSimilarGrid");

  let modalAlbumDetails = null;
  let modalTracklistData = [];

  // View Layout Switching
  if (btnViewGrid && btnViewList) {
    btnViewGrid.addEventListener("click", () => {
      currentViewLayout = "grid";
      btnViewGrid.classList.add("active");
      btnViewList.classList.remove("active");
      if (albumsGrid) albumsGrid.classList.remove("hidden");
      if (albumsListContainer) albumsListContainer.classList.add("hidden");
      renderCurrentView(Bus.state.currentDisplayedAlbums);
    });
    btnViewList.addEventListener("click", () => {
      currentViewLayout = "list";
      btnViewList.classList.add("active");
      btnViewGrid.classList.remove("active");
      if (albumsGrid) albumsGrid.classList.add("hidden");
      if (albumsListContainer) albumsListContainer.classList.remove("hidden");
      renderCurrentView(Bus.state.currentDisplayedAlbums);
    });
  }

  function resolveAlbumBadges(album) {
    if (!album) return { yearText: "", typeLabel: "💿 Studio LP", typeClass: "badge-type-album", tracksText: "" };
    const titleLow = (album.title || "").toLowerCase();
    const rawType = (album.type || album.record_type || "").toLowerCase();
    const trackCount = parseInt(album.track_count || (album.tracks ? album.tracks.length : 0) || 0, 10);
    const albumIdStr = String(album.id || "");
    
    let typeLabel = "💿 Studio LP";
    let typeClass = "badge-type-album";
    let fullModalType = "STUDIO ALBUM";
    
    let inComp = false;
    let inEp = false;
    let inStudio = false;
    if (Bus.state.currentArtistDiscography) {
      inComp = (Bus.state.currentArtistDiscography.compilations || []).some(c => String(c.id) === albumIdStr);
      inEp = (Bus.state.currentArtistDiscography.eps || []).some(e => String(e.id) === albumIdStr);
      inStudio = (Bus.state.currentArtistDiscography.albums || []).some(a => String(a.id) === albumIdStr);
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

    let yearText = "";
    if (album.year && String(album.year).trim().length >= 4) {
      yearText = `📅 ${String(album.year).trim().substring(0, 4)}`;
    } else if (album.release_date && String(album.release_date).trim().length >= 4) {
      yearText = `📅 ${String(album.release_date).trim().substring(0, 4)}`;
    } else {
      const m = (album.title || "").match(/\b(19\d\d|20\d\d)\b/);
      if (m) yearText = `📅 ${m[1]}`;
    }

    const tracksText = trackCount > 0 ? (trackCount === 1 ? "1 Track" : `${trackCount} Tracks`) : "";

    return { yearText, typeLabel, typeClass, fullModalType, tracksText };
  }

  function goToPage(pageNum) {
    const isAll = currentPageSize === "all";
    const currentFullCollection = Bus.state.currentFullCollection || [];
    const size = isAll ? currentFullCollection.length : (typeof currentPageSize === "number" ? currentPageSize : 50);
    const totalPages = isAll ? 1 : Math.max(1, Math.ceil(currentFullCollection.length / (size || 1)));
    currentPage = Math.max(1, Math.min(pageNum, totalPages));
    renderCurrentView(currentFullCollection, false);
    const mainArea = document.querySelector(".station-main");
    if (mainArea) mainArea.scrollTo({ top: 0, behavior: "smooth" });
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
      if (currentPage > 3) paginationNumbers.appendChild(createEllipsis());

      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let p = start; p <= end; p++) {
        paginationNumbers.appendChild(createPageBtn(p));
      }

      if (currentPage < totalPages - 2) paginationNumbers.appendChild(createEllipsis());
      paginationNumbers.appendChild(createPageBtn(totalPages));
    }
  }

  if (btnPrevPage) btnPrevPage.addEventListener("click", () => { if (currentPage > 1) goToPage(currentPage - 1); });
  if (btnNextPage) btnNextPage.addEventListener("click", () => {
    const isAll = currentPageSize === "all";
    const currentFullCollection = Bus.state.currentFullCollection || [];
    const size = isAll ? currentFullCollection.length : (typeof currentPageSize === "number" ? currentPageSize : 50);
    const totalPages = isAll ? 1 : Math.max(1, Math.ceil(currentFullCollection.length / (size || 1)));
    if (currentPage < totalPages) goToPage(currentPage + 1);
  });

  if (selectPageSize) {
    selectPageSize.addEventListener("change", (e) => {
      const val = e.target.value;
      currentPageSize = val === "all" ? "all" : parseInt(val, 10);
      currentPage = 1;
      renderCurrentView(Bus.state.currentFullCollection, true);
    });
  }

  function renderCurrentView(albums, resetPage = true) {
    if (resetPage) currentPage = 1;
    Bus.state.currentFullCollection = albums || [];

    const totalItems = Bus.state.currentFullCollection.length;
    const isAll = currentPageSize === "all";
    const size = isAll ? totalItems : (typeof currentPageSize === "number" ? currentPageSize : 50);
    const totalPages = isAll ? 1 : Math.max(1, Math.ceil(totalItems / (size || 1)));
    currentPage = Math.max(1, Math.min(currentPage, totalPages));

    let pageSlice = Bus.state.currentFullCollection;
    if (!isAll && size > 0) {
      const startIdx = (currentPage - 1) * size;
      const endIdx = Math.min(startIdx + size, totalItems);
      pageSlice = Bus.state.currentFullCollection.slice(startIdx, endIdx);
    }

    Bus.state.currentDisplayedAlbums = pageSlice;

    // Dynamic Batch Download button text and visibility
    const unownedAlbums = Bus.state.currentFullCollection.filter(a => !a.owned);
    const showBatchBtn = Bus.state.currentViewType !== "library" && unownedAlbums.length > 0;
    const btnBatchDownload = document.getElementById("btnBatchDownload");
    const btnBatchDownloadText = document.getElementById("btnBatchDownloadText");

    if (btnBatchDownloadText) {
      if (Bus.state.currentCategoryFilter === "albums") {
        btnBatchDownloadText.textContent = `📥 Download Studio Albums (${unownedAlbums.length})`;
      } else if (Bus.state.currentCategoryFilter === "eps") {
        btnBatchDownloadText.textContent = `📥 Download EPs & Mini-Albums (${unownedAlbums.length})`;
      } else if (Bus.state.currentCategoryFilter === "singles") {
        btnBatchDownloadText.textContent = `📥 Download Singles (${unownedAlbums.length})`;
      } else if (Bus.state.currentCategoryFilter === "compilations") {
        btnBatchDownloadText.textContent = `📥 Download Compilations (${unownedAlbums.length})`;
      } else {
        btnBatchDownloadText.textContent = `📥 Download All (${unownedAlbums.length})`;
      }
    }
    if (btnBatchDownload) {
      btnBatchDownload.classList.toggle("hidden", !showBatchBtn);
    }

    if (currentViewLayout === "list") {
      renderAlbumList(Bus.state.currentDisplayedAlbums);
    } else {
      renderAlbumGrid(Bus.state.currentDisplayedAlbums);
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
      const cover = (album.cover_big || album.cover_small || "").trim() || Bus.FALLBACK_COVER_SVG;

      const ownedBadge = album.owned 
        ? `<span class="card-owned-badge">💾 In Library</span>` 
        : (Bus.state.currentArtistDiscography && Bus.state.currentArtistDiscography.is_artist ? `<span class="card-owned-badge badge-type-missing">⏳ Missing</span>` : "");
      
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
        if (Bus.state.currentViewType === "library" || String(album.id).startsWith("local_")) {
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
      const cover = (album.cover_small || album.cover_big || "").trim() || Bus.FALLBACK_COVER_SVG;
      const yearText = b.yearText.replace("📅", "").trim() || "—";
      const trackCount = parseInt(album.track_count || (album.tracks ? album.tracks.length : 0) || 0, 10);
      const tracksDisplay = trackCount > 0 ? `${trackCount} tracks` : "—";
      
      const variantsCount = (album.variants || []).length;
      const variantHtml = variantsCount > 0 
        ? `<span class="variant-chip" title="Collapsed variants: ${album.variants.map(v => v.title).join(', ')}">+ ${variantsCount} Variant${variantsCount > 1 ? 's' : ''}</span>`
        : "";

      const ownedListBadge = album.owned
        ? `<span class="card-owned-badge" style="position: static; font-size: 10px; margin-left: 6px; padding: 2px 6px;">💾 In Library</span>`
        : (Bus.state.currentArtistDiscography && Bus.state.currentArtistDiscography.is_artist ? `<span class="card-owned-badge badge-type-missing" style="position: static; font-size: 10px; margin-left: 6px; padding: 2px 6px;">⏳ Missing</span>` : "");

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
        if (Bus.state.currentViewType === "library" || String(album.id).startsWith("local_")) {
          openAlbumModal(album.id);
        } else {
          openInspectDrawer(album.id);
        }
      });
      albumsTableBody.appendChild(tr);
    });
  }

  async function loadCharts(genre, forceRefresh = false) {
    Bus.state.currentGenre = genre;
    Bus.state.currentViewType = "genre";
    if (discographyCategoryPills) discographyCategoryPills.classList.add("hidden");
    if (btnLibraryRadioLaunch) btnLibraryRadioLaunch.classList.add("hidden");
    if (librarySearchWrap) librarySearchWrap.classList.add("hidden");

    if (viewSectionTitle) viewSectionTitle.textContent = Bus.ERA_TITLES[genre] || `${genre.toUpperCase()} Albums`;

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
        if (loadingIndicator) loadingIndicator.classList.add("hidden");
        if (emptyIndicator) emptyIndicator.classList.add("hidden");
        if (btnRefreshView) btnRefreshView.classList.remove("spinning");
        const labelSuffix = (genre === "top_singles") ? "chart singles & hits" : "landmark albums";
        if (viewSectionCount) viewSectionCount.textContent = `${Number(cachedAlbums.length).toLocaleString()} ${labelSuffix}`;
        renderCurrentView(cachedAlbums, true);
        if (cachedAlbums.length >= 800) return;
      }
    }

    if (!albumsGrid.children || albumsGrid.children.length === 0) {
      if (loadingIndicator) loadingIndicator.classList.remove("hidden");
      if (emptyIndicator) emptyIndicator.classList.add("hidden");
      albumsGrid.innerHTML = "";
      if (viewSectionCount) viewSectionCount.textContent = forceRefresh ? "Refreshing live charts..." : "Scanning era...";
    }

    if (btnRefreshView && forceRefresh) btnRefreshView.classList.add("spinning");

    try {
      const parsedLimit = Number(Bus.state.config && Bus.state.config.discovery_album_limit !== undefined ? Bus.state.config.discovery_album_limit : 0);
      const rawLimit = isNaN(parsedLimit) ? 0 : parsedLimit;
      const discLimit = (rawLimit === 100) ? 0 : rawLimit;
      const url = `/api/charts?genre=${encodeURIComponent(genre)}&limit=${discLimit}${forceRefresh ? '&refresh=1' : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      
      let albums = [];
      if (Array.isArray(data)) albums = data;
      else if (data && Array.isArray(data.albums)) albums = data.albums;
      else if (data && data.albums && Array.isArray(data.albums.albums)) albums = data.albums.albums;

      if (loadingIndicator) loadingIndicator.classList.add("hidden");
      if (btnRefreshView) btnRefreshView.classList.remove("spinning");

      if (!albums || albums.length === 0) {
        if (!albumsGrid.children || albumsGrid.children.length === 0) {
          if (emptyIndicator) emptyIndicator.classList.remove("hidden");
          if (viewSectionCount) viewSectionCount.textContent = "0 albums";
        }
        return;
      }

      TAB_ALBUMS_CACHE.set(genre, albums);
      try {
        sessionStorage.setItem("tab_cache_" + genre, JSON.stringify(albums.slice(0, 250)));
      } catch (e) {}
      const labelSuffix = (genre === "top_singles") ? "chart singles & hits" : "landmark albums";
      if (viewSectionCount) viewSectionCount.textContent = `${Number(albums.length).toLocaleString()} ${labelSuffix}`;
      renderCurrentView(albums);
    } catch (err) {
      console.error("Failed to load charts:", err);
      if (loadingIndicator) loadingIndicator.classList.add("hidden");
      if (btnRefreshView) btnRefreshView.classList.remove("spinning");
      if (emptyIndicator) emptyIndicator.classList.remove("hidden");
    }
  }

  async function loadSurpriseCrate(forceRefresh = false) {
    Bus.state.currentViewType = "special";
    if (discographyCategoryPills) discographyCategoryPills.classList.add("hidden");
    if (librarySearchWrap) librarySearchWrap.classList.add("hidden");
    if (viewSectionTitle) viewSectionTitle.textContent = "🎲 Surprise Discovery Crate";

    if (!forceRefresh && TAB_ALBUMS_CACHE.has("surprise")) {
      const cached = TAB_ALBUMS_CACHE.get("surprise");
      if (loadingIndicator) loadingIndicator.classList.add("hidden");
      if (emptyIndicator) emptyIndicator.classList.add("hidden");
      if (viewSectionCount) viewSectionCount.textContent = `${cached.length} surprise gems`;
      renderCurrentView(cached);
      return;
    }

    if (loadingIndicator) loadingIndicator.classList.remove("hidden");
    if (emptyIndicator) emptyIndicator.classList.add("hidden");
    albumsGrid.innerHTML = "";
    if (albumsTableBody) albumsTableBody.innerHTML = "";
    if (viewSectionCount) viewSectionCount.textContent = "Rolling masterworks across genres...";

    try {
      const parsedLimit = Number(Bus.state.config && Bus.state.config.discovery_album_limit !== undefined ? Bus.state.config.discovery_album_limit : 60);
      const discLimit = isNaN(parsedLimit) ? 60 : parsedLimit;
      const res = await fetch(`/api/discovery/surprise?limit=${discLimit}`);
      const data = await res.json();
      const albums = (data && data.albums) || [];

      if (loadingIndicator) loadingIndicator.classList.add("hidden");
      if (albums.length === 0) {
        if (emptyIndicator) emptyIndicator.classList.remove("hidden");
        if (viewSectionCount) viewSectionCount.textContent = "0 albums";
        return;
      }

      TAB_ALBUMS_CACHE.set("surprise", albums);
      if (viewSectionCount) viewSectionCount.textContent = `${albums.length} surprise gems`;
      renderCurrentView(albums);
    } catch (err) {
      console.error("Failed to load surprise crate:", err);
      if (loadingIndicator) loadingIndicator.classList.add("hidden");
      if (emptyIndicator) emptyIndicator.classList.remove("hidden");
    }
  }

  async function startAlbumFlow(albumId, artistName, genre = "") {
    Bus.state.currentViewType = "flow";
    if (albumModal) albumModal.classList.add("hidden");
    if (discographyCategoryPills) discographyCategoryPills.classList.add("hidden");
    if (librarySearchWrap) librarySearchWrap.classList.add("hidden");
    if (loadingIndicator) loadingIndicator.classList.remove("hidden");
    if (emptyIndicator) emptyIndicator.classList.add("hidden");
    albumsGrid.innerHTML = "";
    if (albumsTableBody) albumsTableBody.innerHTML = "";
    if (viewSectionTitle) viewSectionTitle.textContent = `🌊 Discovery Flow: ${artistName}`;
    if (viewSectionCount) viewSectionCount.textContent = "Synthesizing connected masterworks & rare gems...";
    Bus.showToast(`Generating dynamic flow for "${artistName}"`, "flow");

    try {
      const res = await fetch(`/api/discovery/flow?id=${encodeURIComponent(albumId)}&artist=${encodeURIComponent(artistName)}&genre=${encodeURIComponent(genre)}`);
      const data = await res.json();
      const albums = (data && data.albums) || [];

      if (loadingIndicator) loadingIndicator.classList.add("hidden");
      if (albums.length === 0) {
        if (emptyIndicator) emptyIndicator.classList.remove("hidden");
        if (viewSectionCount) viewSectionCount.textContent = "0 albums found in flow";
        return;
      }

      if (viewSectionCount) viewSectionCount.textContent = `${albums.length} connected records`;
      renderCurrentView(albums);
    } catch (err) {
      console.error("Discovery flow failed:", err);
      if (loadingIndicator) loadingIndicator.classList.add("hidden");
      if (emptyIndicator) emptyIndicator.classList.remove("hidden");
    }
  }

  if (modalStartFlowBtn) {
    modalStartFlowBtn.addEventListener("click", () => {
      if (modalAlbumDetails && modalAlbumDetails.artist) {
        const genre = (modalAlbumDetails.genres && modalAlbumDetails.genres[0]) || "";
        startAlbumFlow(modalAlbumDetails.id, modalAlbumDetails.artist, genre);
      }
    });
  }

  // Inspect Drawer
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
        const matchingAlb = (Bus.state.currentDisplayedAlbums || []).find(a => String(a.id) === String(albumId));
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

    const cover = (data.cover_big || data.cover_small || "").trim() || Bus.FALLBACK_COVER_SVG;
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
    if (drawerTotalDuration) drawerTotalDuration.textContent = totalSec > 0 ? `⏱️ ${Bus.formatDurationMinutes(totalSec)}` : "⏱️ —";
    if (drawerLabel) drawerLabel.textContent = `🏷️ ${data.label || "Studio Release"}`;

    if (drawerExpandFullBtn) {
      drawerExpandFullBtn.onclick = () => {
        closeInspectDrawer();
        openAlbumModal(albumId);
      };
    }

    if (drawerPlayAllAuditionBtn) {
      drawerPlayAllAuditionBtn.onclick = () => {
        if (currentInspectTracklist.length > 0 && window.AppPlayer) {
          window.AppPlayer.playTrack(currentInspectTracklist[0], 0, currentInspectTracklist, false);
          Bus.showToast(`Auditioning "${data.title}"`, "info");
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
          if (window.AppDownloader) window.AppDownloader.downloadAlbum(albumId, data.artist, data.title, currentInspectTracklist);
        };
      }
    }

    if (!drawerTracklistContainer) return;
    drawerTracklistContainer.innerHTML = "";

    currentInspectTracklist.forEach((track, idx) => {
      const row = document.createElement("div");
      row.className = "drawer-track-row";
      row.dataset.trackIdx = idx;

      const durStr = Bus.formatTrackDuration(track.duration);
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
          if (window.AppPlayer) window.AppPlayer.playTrack(track, idx, currentInspectTracklist, false);
        });
      }

      const dlBtn = row.querySelector(".drawer-tr-dl-btn");
      if (dlBtn) {
        dlBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (window.AppDownloader) window.AppDownloader.downloadSingleTrack(track.id, data.artist, track.title, data.title);
        });
      }

      row.addEventListener("click", () => {
        if (window.AppPlayer) window.AppPlayer.playTrack(track, idx, currentInspectTracklist, false);
      });

      drawerTracklistContainer.appendChild(row);
    });
  }

  // Album Modal
  function switchModalTab(tabName) {
    modalTabBtns.forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === tabName);
    });

    if (modalPaneTracks) modalPaneTracks.classList.add("hidden");
    if (modalPaneLyrics) modalPaneLyrics.classList.add("hidden");
    if (modalPaneStory) modalPaneStory.classList.add("hidden");
    if (modalPaneSimilar) modalPaneSimilar.classList.add("hidden");

    if (tabName === "tracks") {
      if (modalPaneTracks) modalPaneTracks.classList.remove("hidden");
    } else if (tabName === "lyrics") {
      if (modalPaneLyrics) modalPaneLyrics.classList.remove("hidden");
      const playingAlb = window.AppPlayer ? window.AppPlayer.getPlayingAlbum() : null;
      const isPlayingThis = modalAlbumDetails && playingAlb && String(modalAlbumDetails.id) === String(playingAlb.id);
      const tracksToUse = isPlayingThis && window.AppPlayer ? window.AppPlayer.getPlayingTracklist() : modalTracklistData;
      const trIdx = (isPlayingThis && window.AppPlayer) ? window.AppPlayer.getPlayingTrackIndex() : 0;
      if (tracksToUse && tracksToUse.length > 0 && tracksToUse[trIdx] && window.AppPlayer) {
        const tr = tracksToUse[trIdx];
        const art = tr.artist || (modalAlbumDetails && modalAlbumDetails.artist) || "";
        const alb = tr.album || (modalAlbumDetails ? modalAlbumDetails.title : "");
        window.AppPlayer.loadTrackLyrics(art, tr.title, alb, tr.duration);
      }
    } else if (tabName === "story") {
      if (modalPaneStory) modalPaneStory.classList.remove("hidden");
    } else if (tabName === "similar") {
      if (modalPaneSimilar) modalPaneSimilar.classList.remove("hidden");
    }
  }

  modalTabBtns.forEach(btn => {
    btn.addEventListener("click", () => switchModalTab(btn.getAttribute("data-tab")));
  });

  function renderAlbumModalContent(data, albumId) {
    modalAlbumDetails = data;
    modalTracklistData = data.tracks || [];

    if (modalCoverArt) {
      modalCoverArt.onerror = () => { modalCoverArt.src = Bus.FALLBACK_COVER_SVG; };
      modalCoverArt.src = (data.cover_big || data.cover_small || "").trim() || Bus.FALLBACK_COVER_SVG;
    }
    if (modalAlbumTitle) modalAlbumTitle.textContent = data.title || "Untitled Album";
    if (modalArtistName) modalArtistName.textContent = data.artist || "Unknown Artist";
    const badges = resolveAlbumBadges(data);
    if (modalYearBadge) modalYearBadge.textContent = badges.yearText || "📅 —";
    const numTracks = modalTracklistData.length;
    let dlBtnText = badges.fullModalType === "OFFICIAL SINGLE" ? "Download Single" : (badges.fullModalType === "EP / MINI-ALBUM" ? "Download EP" : "Download Album");

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

    if (modalTracksCount) modalTracksCount.textContent = numTracks === 1 ? "🎵 1 Track (Single)" : `🎵 ${numTracks} Tracks`;
    if (modalTracklistTabCount) modalTracklistTabCount.textContent = numTracks;
    if (modalGenreBadge) modalGenreBadge.textContent = (data.genres && data.genres[0]) ? `⚡ ${data.genres[0]}` : "⚡ Studio Album";

    const resolvedLabel = data.label || "Official Studio Release";
    if (modalLabelBadge) modalLabelBadge.textContent = `🏷️ ${resolvedLabel}`;
    if (modalBarcodeBadge) modalBarcodeBadge.textContent = data.barcode && data.barcode !== "—" ? `📦 UPC: ${data.barcode}` : "📦 Verified Catalog";

    if (storyLabelVal) storyLabelVal.textContent = resolvedLabel;
    if (storyYearVal) storyYearVal.textContent = data.year || data.release_date || "—";
    if (storyUpcVal) storyUpcVal.textContent = data.barcode || "Verified";
    if (storyTracksVal) storyTracksVal.textContent = numTracks === 1 ? "1 Track (Single)" : `${numTracks} Tracks`;

    if (modalBackstoryText) {
      if (data.backstory && data.backstory.length > 20) {
        modalBackstoryText.textContent = data.backstory;
      } else {
        modalBackstoryText.textContent = `${data.title} is a landmark studio album by ${data.artist}. Released under ${resolvedLabel}, featuring ${modalTracklistData.length} complete tracks with full dynamic production and songwriting arrangements.`;
      }
    }

    const simList = data.similar_albums || [];
    if (modalSimilarGrid) {
      modalSimilarGrid.innerHTML = "";
      if (simList.length > 0) {
        simList.forEach(sim => {
          const card = document.createElement("div");
          card.className = "similar-card";
          card.title = `${sim.title} by ${sim.artist}`;
          const simCover = (sim.cover_big || "").trim() || Bus.FALLBACK_COVER_SVG;
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
              this.src = Bus.FALLBACK_COVER_SVG;
            });
          }
          card.addEventListener("click", () => openAlbumModal(sim.id));
          modalSimilarGrid.appendChild(card);
        });
      } else {
        modalSimilarGrid.innerHTML = "<div style='grid-column: 1/-1; padding: 24px; text-align: center; color: #94a3b8;'>No companion albums found for this artist.</div>";
      }
    }

    renderTracklist(modalTracklistData);
  }

  async function openAlbumModal(albumId) {
    closeInspectDrawer();
    if (albumModal) albumModal.classList.remove("hidden");
    switchModalTab("tracks");

    if (ALBUM_MODAL_CACHE.has(String(albumId))) {
      const cached = ALBUM_MODAL_CACHE.get(String(albumId));
      renderAlbumModalContent(cached, albumId);
      return;
    }

    if (modalAlbumTitle) modalAlbumTitle.textContent = "Loading album...";
    if (modalArtistName) modalArtistName.textContent = "";
    if (modalTracklist) modalTracklist.innerHTML = "<div style='padding: 32px; text-align: center; color: #94a3b8;'>Scanning album tracks & metadata...</div>";
    if (modalTracklistTabCount) modalTracklistTabCount.textContent = "0";

    try {
      let data = null;
      if (String(albumId) === "library_dj_radio") {
        const curList = window.AppPlayer ? window.AppPlayer.getPlayingTracklist() : [];
        data = {
          id: "library_dj_radio",
          title: "Library DJ Radio (Live Mix)",
          artist: (curList[0] && curList[0].artist) || "Various Artists",
          cover_big: (curList[0] && (curList[0].cover_big || curList[0].cover_small)) || "",
          cover_small: (curList[0] && curList[0].cover_small) || "",
          year: new Date().getFullYear(),
          genres: ["DJ Radio Mix"],
          label: "Local Library Collection",
          owned: true,
          tracks: curList
        };
      } else if (String(albumId).startsWith("local_")) {
        const matchingAlb = ((Bus.state.currentDisplayedAlbums || []).find(a => String(a.id) === String(albumId)))
          || ((Bus.state.localLibraryAlbums || []).find(a => String(a.id) === String(albumId)));
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
      if (modalTracklist) modalTracklist.innerHTML = "<div style='padding: 24px; text-align: center; color: #ef4444;'>Failed to load tracklist.</div>";
    }
  }

  function renderTracklist(tracks) {
    if (!modalTracklist) return;
    modalTracklist.innerHTML = "";
    const playingAlb = window.AppPlayer ? window.AppPlayer.getPlayingAlbum() : null;
    const playingIdx = window.AppPlayer ? window.AppPlayer.getPlayingTrackIndex() : -1;
    const isModalPlayingThisAlbum = modalAlbumDetails && playingAlb && 
      (String(modalAlbumDetails.id) === String(playingAlb.id) || 
       (modalAlbumDetails.title && modalAlbumDetails.title.toLowerCase() === (playingAlb.title || "").toLowerCase()));

    tracks.forEach((track, idx) => {
      const row = document.createElement("div");
      row.className = `track-row ${(isModalPlayingThisAlbum && idx === playingIdx) ? 'playing' : ''}`;
      row.title = "Click to stream full studio track";

      const barsHtml = [45, 80, 60, 95, 70, 85, 50, 65].map(h => `<span class="audition-bar" style="height: ${h}%"></span>`).join("");

      row.innerHTML = `
        <span class="track-num">${track.track_position || (idx + 1)}</span>
        <span class="track-title" title="${track.title}">${track.title}</span>
        <span class="track-artist" title="${track.artist}">${track.artist}</span>
        <span class="track-time">${Bus.formatTime(track.duration)}</span>
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

      row.addEventListener("click", (e) => {
        if (e.target.closest(".btn-lyrics-track") || e.target.closest(".btn-preview-track") || e.target.closest(".btn-dl-track") || e.target.closest(".track-audition-wrap")) return;
        if (window.AppPlayer) {
          window.AppPlayer.setRadioMode(false);
          const navRadio = document.getElementById("navLibraryRadio");
          if (navRadio) navRadio.classList.remove("active");
          window.AppPlayer.setPlayingTracklist(modalTracklistData);
          window.AppPlayer.setPlayingAlbum(modalAlbumDetails);
          window.AppPlayer.playTrackAtIndex(idx, true);
        }
      });

      const waveScrub = row.querySelector(".track-audition-wrap");
      if (waveScrub) {
        waveScrub.addEventListener("click", (e) => {
          e.stopPropagation();
          const rect = waveScrub.getBoundingClientRect();
          const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          const seekSec = Math.floor(pct * 28);
          if (window.AppPlayer) {
            window.AppPlayer.setRadioMode(false);
            const navRadio = document.getElementById("navLibraryRadio");
            if (navRadio) navRadio.classList.remove("active");
            window.AppPlayer.setPlayingTracklist(modalTracklistData);
            window.AppPlayer.setPlayingAlbum(modalAlbumDetails);
            window.AppPlayer.playTrackAtIndex(idx, false, seekSec);
          }
        });
      }

      const lyricsBtn = row.querySelector(".btn-lyrics-track");
      if (lyricsBtn) {
        lyricsBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          switchModalTab("lyrics");
          const art = track.artist || (modalAlbumDetails && modalAlbumDetails.artist) || "";
          const alb = track.album || (modalAlbumDetails ? modalAlbumDetails.title : "");
          if (window.AppPlayer) window.AppPlayer.loadTrackLyrics(art, track.title, alb, track.duration);
        });
      }

      const prevBtn = row.querySelector(".btn-preview-track");
      if (prevBtn) {
        prevBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (window.AppPlayer) {
            window.AppPlayer.setRadioMode(false);
            const navRadio = document.getElementById("navLibraryRadio");
            if (navRadio) navRadio.classList.remove("active");
            window.AppPlayer.setPlayingTracklist(modalTracklistData);
            window.AppPlayer.setPlayingAlbum(modalAlbumDetails);
            window.AppPlayer.playTrackAtIndex(idx, false);
          }
        });
      }

      const dlBtn = row.querySelector(".btn-dl-track");
      if (dlBtn) {
        dlBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (!modalAlbumDetails) return;
          try {
            await fetch("/api/download/track", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                album_id: modalAlbumDetails.id,
                album_title: modalAlbumDetails.title,
                artist: modalAlbumDetails.artist,
                cover_big: modalAlbumDetails.cover_big,
                year: modalAlbumDetails.year,
                track: track
              })
            });
            Bus.showToast(`Queued "${track.title}" for download`, "success");
            if (window.AppDownloader) window.AppDownloader.updateQueueUI();
          } catch (err) {
            Bus.showToast(`Failed to queue track: ${err}`, "error");
          }
        });
      }

      modalTracklist.appendChild(row);
    });
  }

  if (modalArtistName) {
    modalArtistName.addEventListener("click", () => {
      if (modalAlbumDetails && modalAlbumDetails.artist) {
        if (albumModal) albumModal.classList.add("hidden");
        const omni = document.getElementById("omniSearchInput");
        if (omni) omni.value = modalAlbumDetails.artist;
        Bus.state.currentViewType = "artist";
        if (window.AppSearch) window.AppSearch.performSearch(modalAlbumDetails.artist, true);
      }
    });
  }

  if (modalLyricsHeaderBtn) {
    modalLyricsHeaderBtn.addEventListener("click", () => {
      switchModalTab("lyrics");
      const tracksToUse = modalTracklistData;
      if (tracksToUse && tracksToUse.length > 0 && window.AppPlayer) {
        const playingAlb = window.AppPlayer.getPlayingAlbum();
        const isPlayingThis = modalAlbumDetails && playingAlb && String(modalAlbumDetails.id) === String(playingAlb.id);
        const trIdx = isPlayingThis ? window.AppPlayer.getPlayingTrackIndex() : 0;
        const tr = tracksToUse[trIdx >= 0 ? trIdx : 0];
        const art = tr.artist || (modalAlbumDetails && modalAlbumDetails.artist) || "";
        const alb = tr.album || (modalAlbumDetails ? modalAlbumDetails.title : "");
        window.AppPlayer.loadTrackLyrics(art, tr.title, alb, tr.duration);
      }
    });
  }

  if (modalPlayFullAlbumBtn) {
    modalPlayFullAlbumBtn.addEventListener("click", () => {
      if (modalTracklistData && modalTracklistData.length > 0 && window.AppPlayer) {
        window.AppPlayer.setRadioMode(false);
        const navRadio = document.getElementById("navLibraryRadio");
        if (navRadio) navRadio.classList.remove("active");
        window.AppPlayer.setPlayingTracklist(modalTracklistData);
        window.AppPlayer.setPlayingAlbum(modalAlbumDetails);
        if (albumModal) albumModal.classList.add("hidden");
        window.AppPlayer.playTrackAtIndex(0, true);
      }
    });
  }

  if (modalDownloadAlbumBtn) {
    modalDownloadAlbumBtn.addEventListener("click", async () => {
      if (!modalAlbumDetails) return;
      if (modalDownloadBtnText) modalDownloadBtnText.textContent = "Queueing...";
      try {
        await fetch("/api/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: modalAlbumDetails.id,
            title: modalAlbumDetails.title,
            artist: modalAlbumDetails.artist,
            cover_big: modalAlbumDetails.cover_big,
            year: modalAlbumDetails.year,
            tracks: modalTracklistData
          })
        });
        if (modalDownloadBtnText) modalDownloadBtnText.textContent = "Queued ✓";
        Bus.showToast(`Queued album "${modalAlbumDetails.title}" (${modalTracklistData.length} tracks)`, "success");
        setTimeout(() => { if (modalDownloadBtnText) modalDownloadBtnText.textContent = "Download Album"; }, 2500);
        if (window.AppDownloader) window.AppDownloader.updateQueueUI();
      } catch (err) {
        console.error("Queue download failed:", err);
        if (modalDownloadBtnText) modalDownloadBtnText.textContent = "Error";
        Bus.showToast("Download queueing failed", "error");
        setTimeout(() => { if (modalDownloadBtnText) modalDownloadBtnText.textContent = "Download Album"; }, 2000);
      }
    });
  }

  if (modalCloseBtn) modalCloseBtn.addEventListener("click", () => { if (albumModal) albumModal.classList.add("hidden"); });
  if (albumModal) {
    albumModal.addEventListener("click", (e) => {
      if (e.target === albumModal) albumModal.classList.add("hidden");
    });
  }

  function refreshActiveView(forceLive = false) {
    const omni = document.getElementById("omniSearchInput");
    if (Bus.state.currentArtistDiscography || Bus.state.currentViewType === "artist" || Bus.state.currentViewType === "search") {
      const q = omni ? omni.value.trim() : "";
      if (q && window.AppSearch) {
        window.AppSearch.clearSearchCache(q);
        window.AppSearch.performSearch(q, Bus.state.currentArtistDiscography !== null);
      }
    } else if (Bus.state.currentViewType === "library" && window.AppLibrary) {
      Bus.state.localLibraryAlbums = [];
      window.AppLibrary.loadLibrary();
    } else if (Bus.state.currentViewType === "genre") {
      TAB_ALBUMS_CACHE.delete(Bus.state.currentGenre);
      loadCharts(Bus.state.currentGenre, forceLive);
    } else if (Bus.state.currentViewType === "special") {
      TAB_ALBUMS_CACHE.delete("surprise");
      loadSurpriseCrate(forceLive);
    }
  }

  if (btnRefreshView) {
    btnRefreshView.addEventListener("click", () => {
      TAB_ALBUMS_CACHE.clear();
      if (window.AppSearch) window.AppSearch.clearAllCache();
      btnRefreshView.classList.add("spinning");
      Bus.showToast("Refreshing library status and releases...", "info");
      fetch("/api/library/rescan", { method: "POST" })
        .catch(() => {})
        .finally(() => {
          btnRefreshView.classList.remove("spinning");
          refreshActiveView(true);
        });
    });
  }

  // Public Interface
  window.AppDiscovery = {
    loadCharts,
    loadSurpriseCrate,
    startAlbumFlow,
    renderCurrentView,
    renderAlbumGrid,
    renderAlbumList,
    openAlbumModal,
    openInspectDrawer,
    closeInspectDrawer,
    switchModalTab,
    renderTracklist,
    resolveAlbumBadges,
    refreshActiveView,
    goToPage,
    getCurrentInspectAlbum: () => currentInspectAlbum,
    isViewingAlbum: (alb) => modalAlbumDetails && alb && (String(modalAlbumDetails.id) === String(alb.id) || (modalAlbumDetails.title && modalAlbumDetails.title.toLowerCase() === (alb.title || "").toLowerCase())),
    isDrawerViewingAlbum: (alb) => currentInspectAlbum && alb && (String(currentInspectAlbum.id) === String(alb.id) || (currentInspectAlbum.title && currentInspectAlbum.title.toLowerCase() === (alb.title || "").toLowerCase())),
    clearTabCache: () => TAB_ALBUMS_CACHE.clear()
  };
})();
