/* =============================================================================
   ALBUM DISCOVERY STATION — DOWNLOAD MANAGER & QUEUE DRAWER
   Architecture: Self-contained download client (window.AppDownloader)
   Handles: Background queue polling, batch album download modal, parallel stream trackers, audio chime.
   ============================================================================= */
(function() {
  const Bus = window.AppBus;

  // DOM Elements
  const btnQueueToggle = document.getElementById("btnQueueToggle");
  const queueDrawer = document.getElementById("queueDrawer");
  const queueCloseBtn = document.getElementById("queueCloseBtn");
  const queueListBody = document.getElementById("queueListBody");
  const queueBadge = document.getElementById("queueBadge");
  const btnClearQueueHistory = document.getElementById("btnClearQueueHistory");
  const btnClearActiveQueue = document.getElementById("btnClearActiveQueue");

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

  let wasActiveDownloading = false;

  function toggleQueueDrawer() {
    if (queueDrawer) {
      queueDrawer.classList.toggle("hidden");
      updateQueueUI();
    }
  }

  function closeQueueDrawer() {
    if (queueDrawer) queueDrawer.classList.add("hidden");
  }

  if (btnQueueToggle) btnQueueToggle.addEventListener("click", toggleQueueDrawer);
  if (queueCloseBtn) queueCloseBtn.addEventListener("click", closeQueueDrawer);

  if (btnClearQueueHistory) {
    btnClearQueueHistory.addEventListener("click", async () => {
      try {
        await fetch("/api/download/clear-history", { method: "POST" });
        Bus.showToast("Cleared completed download history", "info");
        updateQueueUI();
      } catch (err) {}
    });
  }

  if (btnClearActiveQueue) {
    btnClearActiveQueue.addEventListener("click", async () => {
      try {
        await fetch("/api/download/clear-queue", { method: "POST" });
        Bus.showToast("Cleared pending download queue", "info");
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
      Bus.showToast("Cancelled download job", "info");
      updateQueueUI();
    } catch (err) {
      Bus.showToast("Failed to cancel job", "error");
    }
  }

  async function downloadAlbum(albumId, artist, title, tracks = []) {
    const alb = (window.AppDiscovery && window.AppDiscovery.getCurrentInspectAlbum()) || { id: albumId, artist, title };
    const tracksToDl = (tracks && tracks.length > 0) ? tracks : (alb.tracks || []);
    try {
      Bus.showToast(`Queueing "${alb.title || title}" (${tracksToDl.length} tracks)...`, "info");
      await fetch("/api/download", {
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
      Bus.showToast(`Queued album "${alb.title || title}" for download`, "success");
      updateQueueUI();
    } catch (err) {
      console.error("Queue download failed:", err);
      Bus.showToast("Failed to queue album download", "error");
    }
  }

  async function downloadSingleTrack(trackId, artist, trackTitle, albumTitle) {
    try {
      Bus.showToast(`Queueing "${trackTitle}"...`, "info");
      await fetch("/api/download/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: trackId,
          artist: artist,
          title: trackTitle,
          album: albumTitle
        })
      });
      Bus.showToast(`Queued "${trackTitle}" for download`, "success");
      updateQueueUI();
    } catch (err) {
      console.error("Queue single track failed:", err);
      Bus.showToast("Failed to queue track download", "error");
    }
  }

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

  function openBatchDownloadModal() {
    const currentDisplayedAlbums = Bus.state.currentDisplayedAlbums || [];
    if (currentDisplayedAlbums.length === 0) {
      Bus.showToast("No albums in current view to download", "info");
      return;
    }

    const isStudioTab = Bus.state.currentCategoryFilter === "albums";
    const isArtist = Bus.state.currentArtistDiscography !== null;
    const omniSearchInput = document.getElementById("omniSearchInput");
    const artistName = Bus.state.currentArtistDiscography 
      ? (Bus.state.currentArtistDiscography.artist?.name || (omniSearchInput ? omniSearchInput.value : "")) 
      : "";

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
          <img src="${alb.cover_small || alb.cover_big || Bus.FALLBACK_COVER_SVG}" class="batch-row-art" onerror="this.onerror=null; this.src=window.FALLBACK_COVER_SVG;" />
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

  if (btnBatchDownload) btnBatchDownload.addEventListener("click", openBatchDownloadModal);
  if (batchModalCloseBtn) batchModalCloseBtn.addEventListener("click", () => batchDownloadModal.classList.add("hidden"));
  if (btnCancelBatch) btnCancelBatch.addEventListener("click", () => batchDownloadModal.classList.add("hidden"));

  if (btnConfirmBatch) {
    btnConfirmBatch.addEventListener("click", async () => {
      if (!batchAlbumsList) return;
      const chks = batchAlbumsList.querySelectorAll(".batch-album-chk:checked");
      const currentDisplayedAlbums = Bus.state.currentDisplayedAlbums || [];
      const selectedAlbums = Array.from(chks).map(c => {
        const idx = parseInt(c.getAttribute("data-index"), 10);
        return currentDisplayedAlbums[idx];
      }).filter(a => a && !a.owned);

      if (selectedAlbums.length === 0) {
        Bus.showToast("All selected albums are already in your local library.", "info");
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
        Bus.showToast(`Queued ${data.count || selectedAlbums.length} albums to download queue!`, "success");
        updateQueueUI();
      } catch (err) {
        console.error("Batch download error:", err);
        Bus.showToast("Failed to queue batch download", "error");
      } finally {
        btnConfirmBatch.disabled = false;
        if (btnConfirmBatchText) btnConfirmBatchText.textContent = `Start Downloading (${selectedAlbums.length} Albums)`;
      }
    });
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
        if (queueBadge) {
          queueBadge.textContent = totalActive;
          queueBadge.classList.remove("hidden");
        }
      } else {
        if (queueBadge) queueBadge.classList.add("hidden");
        if (wasActiveDownloading) {
          wasActiveDownloading = false;
          playQueueCompleteChime();
          Bus.showToast("🎉 All album downloads completed successfully!", "success");

          // Rescan library and refresh active view
          fetch("/api/library/rescan", { method: "POST" })
            .catch(() => {})
            .finally(() => {
              if (window.AppDiscovery) window.AppDiscovery.refreshActiveView(false);
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

      // 1. ACTIVE DOWNLOAD
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

        const concurrencyLimit = active.concurrency || (Bus.state.config && Bus.state.config.download_concurrency) || 4;
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

        const activeCover = (active.cover && active.cover.trim()) ? active.cover.trim() : Bus.FALLBACK_COVER_SVG;
        activeCard.innerHTML = `
          <div class="queue-active-hdr">
            <img src="${activeCover}" class="queue-active-art" onerror="this.onerror=null; this.src=window.FALLBACK_COVER_SVG;" />
            <div class="queue-active-meta">
              <div class="queue-active-title" title="${Bus.escapeHtml(active.title)}">${Bus.escapeHtml(active.title)}</div>
              <div class="queue-active-artist">${Bus.escapeHtml(active.artist)}</div>
            </div>
            <button class="queue-cancel-btn" title="Cancel this download">Cancel</button>
          </div>

          ${parallelStreamsHtml}

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
        if (cancelBtn) cancelBtn.addEventListener("click", () => cancelDownloadJob(active.id));
        queueListBody.appendChild(activeCard);
      }

      // 2. WAITING QUEUE
      if (queue.length > 0) {
        const secTitle = document.createElement("div");
        secTitle.className = "queue-section-title";
        secTitle.textContent = `Waiting in Queue (${queue.length})`;
        queueListBody.appendChild(secTitle);

        queue.forEach(qItem => {
          const itemEl = document.createElement("div");
          itemEl.className = "queue-item";
          const coverSrc = (qItem.cover && qItem.cover.trim()) ? qItem.cover.trim() : Bus.FALLBACK_COVER_SVG;
          itemEl.innerHTML = `
            <img src="${coverSrc}" class="queue-art" onerror="this.onerror=null; this.src=window.FALLBACK_COVER_SVG;" />
            <div class="queue-info">
              <div class="queue-title" title="${Bus.escapeHtml(qItem.title)}">${Bus.escapeHtml(qItem.title)}</div>
              <div class="queue-artist">${Bus.escapeHtml(qItem.artist)} • ${qItem.total_tracks || 1} tracks</div>
            </div>
            <button class="queue-cancel-btn" title="Remove from queue">✕</button>
          `;
          const cancelBtn = itemEl.querySelector(".queue-cancel-btn");
          if (cancelBtn) cancelBtn.addEventListener("click", () => cancelDownloadJob(qItem.id));
          queueListBody.appendChild(itemEl);
        });
      }

      // 3. COMPLETED RECENT HISTORY
      if (history.length > 0) {
        const histTitle = document.createElement("div");
        histTitle.className = "queue-section-title";
        histTitle.textContent = `Completed (${history.length})`;
        queueListBody.appendChild(histTitle);

        history.slice(-8).reverse().forEach(hItem => {
          const itemEl = document.createElement("div");
          itemEl.className = "queue-item";
          const coverSrc = (hItem.cover && hItem.cover.trim()) ? hItem.cover.trim() : Bus.FALLBACK_COVER_SVG;
          const statusTag = hItem.status === "failed" 
            ? `<span class="queue-status-tag" style="color: #ef4444; background: rgba(239, 68, 68, 0.15);">Failed</span>` 
            : `<span class="queue-status-tag complete">✓ Complete</span>`;

          itemEl.innerHTML = `
            <img src="${coverSrc}" class="queue-art" onerror="this.onerror=null; this.src=window.FALLBACK_COVER_SVG;" />
            <div class="queue-info">
              <div class="queue-title" title="${Bus.escapeHtml(hItem.title)}">${Bus.escapeHtml(hItem.title)}</div>
              <div class="queue-artist">${Bus.escapeHtml(hItem.artist)} • ${hItem.total_tracks || hItem.completed_tracks || 0} tracks</div>
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
      // silent polling error
    }
  }

  // Poll queue every 1.2 seconds
  setInterval(updateQueueUI, 1200);

  // Public Interface
  window.AppDownloader = {
    openBatchDownloadModal,
    downloadAlbum,
    downloadSingleTrack,
    updateQueueUI,
    toggleQueueDrawer,
    closeQueueDrawer
  };
})();
