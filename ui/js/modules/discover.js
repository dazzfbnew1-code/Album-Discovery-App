// ==========================================================================
// DISCOVER MODULE — Instant-Loading Top 50 Albums Grid
// ==========================================================================

function esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function initDiscover({ onOpenModal, onQuickDownload }) {
  const grid = document.getElementById("albumsGrid");
  const countLabel = document.getElementById("albumCountLabel");
  const viewTitle = document.getElementById("discoverViewTitle");

  let downloadedSet = new Set();

  async function loadDownloadedIds() {
    try {
      const res = await fetch("/api/downloaded-ids");
      const data = await res.json();
      downloadedSet = new Set(data.downloaded_ids || []);
    } catch (e) {}
  }

  function renderSkeletons() {
    if (!grid) return;
    grid.innerHTML = Array(18).fill(0).map(() => `
      <div class="album-card skeleton-card">
        <div class="album-cover-wrap skeleton-box"></div>
        <div class="album-card-body">
          <div class="skeleton-line" style="width:75%;height:14px;margin-bottom:6px;"></div>
          <div class="skeleton-line" style="width:50%;height:12px;margin-bottom:10px;"></div>
          <div class="album-card-footer">
            <div class="skeleton-line" style="width:30%;height:10px;"></div>
            <div class="skeleton-line" style="width:18px;height:18px;border-radius:4px;"></div>
          </div>
        </div>
      </div>
    `).join("");
  }

  async function loadCharts(genre = "all") {
    if (viewTitle) {
      viewTitle.textContent = genre === "all" ? "🔥 Top 100 Albums" : `Top ${genre.toUpperCase()} Albums`;
    }
    
    renderSkeletons();

    try {
      loadDownloadedIds();
      const res = await fetch(`/api/charts?genre=${encodeURIComponent(genre)}&limit=100`);
      const data = await res.json();
      const albums = data.albums || [];
      if (countLabel) countLabel.textContent = `${albums.length} Albums`;
      renderGrid(albums);
    } catch (err) {
      console.error("[DISCOVER ERROR]", err);
      if (grid) grid.innerHTML = `<div style="grid-column:1/-1;padding:60px 20px;text-align:center;color:var(--danger);font-size:14px;">Failed to load albums.</div>`;
    }
  }

  function renderGrid(albums) {
    if (!grid) return;
    if (!albums || !albums.length) {
      grid.innerHTML = `<div style="grid-column:1/-1;padding:60px 20px;text-align:center;color:var(--text-muted);font-size:14px;">No albums found.</div>`;
      return;
    }

    grid.innerHTML = albums.map(alb => {
      const cover = alb.cover_big || alb.cover_small || "";
      const year = alb.year || (alb.release_date || "").slice(0, 4) || "";
      const isDownloaded = downloadedSet.has(String(alb.id));

      return `
        <article class="album-card" data-id="${esc(alb.id)}" data-artist-id="${esc(alb.artist_id)}">
          <div class="album-cover-wrap">
            <img class="album-cover-img" src="${cover}" alt="${esc(alb.title)}" loading="lazy">
            ${year ? `<span class="card-badge-year">📅 ${esc(year)}</span>` : ""}
            ${isDownloaded ? `<span class="card-badge-dl">✓ Downloaded</span>` : ""}
          </div>
          <div class="album-card-body">
            <div class="album-title" title="${esc(alb.title)}">${esc(alb.title)}</div>
            <div class="album-artist" title="${esc(alb.artist)}">${esc(alb.artist)}</div>
            <div class="album-card-footer">
              <span class="card-tracks-label">${alb.track_count ? `${alb.track_count} tracks` : "Album"}</span>
              <button class="card-dl-btn" title="Download Album" data-dl-id="${esc(alb.id)}">📥</button>
            </div>
          </div>
        </article>
      `;
    }).join("");

    grid.querySelectorAll(".album-card").forEach(card => {
      card.addEventListener("click", (e) => {
        if (e.target.closest(".card-dl-btn")) return;
        if (onOpenModal) onOpenModal(card.dataset.id);
      });
    });

    grid.querySelectorAll(".card-dl-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (onQuickDownload) onQuickDownload(btn.dataset.dlId);
      });
    });
  }

  return { loadCharts, renderGrid, refreshDownloaded: loadDownloadedIds };
}
