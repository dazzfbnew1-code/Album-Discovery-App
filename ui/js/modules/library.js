// ==========================================================================
// MY MUSIC LIBRARY MODULE — Clean, Card-Based Local Drive Viewer
// ==========================================================================

export function initLibrary({ esc, onSearchArtist }) {
  const container = document.getElementById("libraryContainer");
  const subTitle = document.getElementById("librarySubTitle");
  const searchInput = document.getElementById("libSearchInput");
  let fullLibraryData = [];

  async function loadLibrary() {
    if (container) {
      container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted);">Loading your music library...</div>`;
    }

    try {
      const res = await fetch('/api/library');
      const data = await res.json();

      if (data.status === 'disabled') {
        if (container) {
          container.innerHTML = `
            <div style="padding:40px;text-align:center;color:var(--text-muted);">
              <h3>📁 My Music Drive View is Currently Disabled</h3>
              <p style="margin-top:8px;font-size:13px;">Enable this in <strong>Settings (⚙️)</strong> by selecting your Music Drive folder.</p>
            </div>
          `;
        }
        return;
      }

      if (data.status === 'not_found') {
        if (container) {
          container.innerHTML = `
            <div style="padding:40px;text-align:center;color:var(--warning);">
              Music folder (${esc(data.root)}) not found. Please verify your drive letter in Settings.
            </div>
          `;
        }
        return;
      }

      fullLibraryData = data.artists || [];

      if (subTitle) {
        subTitle.textContent = `${data.artist_count || 0} Artists · ${data.total_albums || 0} Albums on ${data.root}`;
      }

      renderLibraryCards(fullLibraryData);

    } catch (err) {
      if (container) container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--danger);">Failed to load library.</div>`;
    }
  }

  function renderLibraryCards(artists) {
    if (!container) return;

    if (!artists.length) {
      container.innerHTML = `<div style="padding:30px;text-align:center;color:var(--text-muted);">No matching artists found in your library.</div>`;
      return;
    }

    container.innerHTML = `
      <div class="library-grid">
        ${artists.map(a => `
          <div class="lib-artist-card">
            <div class="lib-artist-header">
              <div class="lib-artist-name">${esc(a.artist)}</div>
              <span class="lib-count-badge">${a.album_count} Albums</span>
            </div>
            <div class="lib-albums-list">
              ${a.albums.map(alb => `
                <div class="lib-album-item" title="${esc(alb)}">
                  <span class="lib-album-icon">💿</span>
                  <span class="lib-album-title">${esc(alb)}</span>
                </div>
              `).join("")}
            </div>
            <button class="lib-artist-search-btn" data-artist="${esc(a.artist)}">
              🔍 Explore More Albums by ${esc(a.artist)}
            </button>
          </div>
        `).join("")}
      </div>
    `;

    container.querySelectorAll(".lib-artist-search-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        if (onSearchArtist) onSearchArtist(btn.dataset.artist);
      });
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const q = e.target.value.trim().toLowerCase();
      if (!q) {
        renderLibraryCards(fullLibraryData);
      } else {
        const filtered = fullLibraryData.filter(a =>
          a.artist.toLowerCase().includes(q) ||
          a.albums.some(alb => alb.toLowerCase().includes(q))
        );
        renderLibraryCards(filtered);
      }
    });
  }

  return { loadLibrary };
}
