// ==========================================================================
// ALBUM MODAL & TRACKLIST MODULE WITH PLAY ALBUM & FAVORITES
// ==========================================================================

export function initModal({ onPlayAlbum, onPlayTrack, onDownloadAlbum, onDownloadTrack, onToggleFavorite, onOpenArtist, esc, fmtTime }) {
  const modal = document.getElementById("albumModal");
  const tracklistEl = document.getElementById("modalTracklist");
  const coverEl = document.getElementById("modalAlbumCover");
  const titleEl = document.getElementById("modalAlbumTitle");
  const artistEl = document.getElementById("modalArtistName");
  const yearEl = document.getElementById("modalYear");
  const genreEl = document.getElementById("modalGenre");
  const trackCountEl = document.getElementById("modalTrackCount");
  const labelEl = document.getElementById("modalLabel");
  const playAllBtn = document.getElementById("modalPlayAllBtn");
  const dlAlbumBtn = document.getElementById("modalDownloadAlbumBtn");
  const closeBtn = document.getElementById("closeModalBtn");

  let currentAlbumData = null;

  async function open(albumId) {
    if (!modal) return;
    modal.style.display = "grid";
    if (tracklistEl) {
      tracklistEl.innerHTML = `<div style="padding:28px;text-align:center;color:var(--text-muted);">Loading full album tracklist & previews...</div>`;
    }

    try {
      const res = await fetch(`/api/album?id=${encodeURIComponent(albumId)}`);
      const album = await res.json();
      if (!album || album.error) {
        if (tracklistEl) tracklistEl.innerHTML = `<div style="padding:24px;text-align:center;color:var(--danger);">Could not load album details.</div>`;
        return;
      }

      currentAlbumData = album;

      if (coverEl) coverEl.src = album.cover_big || album.cover_small || "";
      if (titleEl) titleEl.textContent = album.title;
      if (artistEl) artistEl.textContent = album.artist;
      if (yearEl) yearEl.textContent = album.year ? `📅 ${album.year}` : "Album";
      if (genreEl) genreEl.textContent = album.genre_label || "Music";
      if (trackCountEl) trackCountEl.textContent = `${album.track_count || album.tracks?.length || 0} Tracks`;
      if (labelEl) labelEl.textContent = album.label ? `Record Label: ${album.label}` : "";

      if (playAllBtn) {
        playAllBtn.onclick = () => {
          if (onPlayAlbum && currentAlbumData) {
            onPlayAlbum(currentAlbumData);
          }
        };
      }

      if (dlAlbumBtn) {
        dlAlbumBtn.onclick = () => {
          if (onDownloadAlbum && currentAlbumData) {
            onDownloadAlbum(currentAlbumData);
          }
        };
      }

      if (artistEl) {
        artistEl.onclick = () => {
          close();
          if (onOpenArtist && album.artist_id) onOpenArtist(album.artist_id);
        };
      }

      renderTracks(album);
    } catch (err) {
      if (tracklistEl) tracklistEl.innerHTML = `<div style="padding:24px;text-align:center;color:var(--danger);">Failed to load tracklist.</div>`;
    }
  }

  function renderTracks(album) {
    if (!tracklistEl) return;
    const tracks = album.tracks || [];
    if (!tracks.length) {
      tracklistEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);">No tracks available for this album.</div>`;
      return;
    }

    tracklistEl.innerHTML = tracks.map((tr, idx) => `
      <div class="track-row" data-track-id="${esc(tr.id)}" data-track-idx="${idx}">
        <span class="tr-num">${tr.track_position || idx + 1}</span>
        <button class="tr-play-btn" data-track-idx="${idx}" title="Play Track Preview">▶</button>
        <div class="tr-title-wrap">
          <div class="tr-title">${esc(tr.title)}</div>
          <div class="tr-artist">${esc(tr.artist || album.artist)}</div>
        </div>
        <span class="tr-dur">${fmtTime(tr.duration)}</span>
        <div class="tr-dl-btn">
          <button data-track-idx="${idx}" title="Download this single track">📥 Track</button>
        </div>
      </div>
    `).join("");

    tracklistEl.querySelectorAll(".tr-play-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.trackIdx);
        if (onPlayTrack && currentAlbumData) {
          onPlayTrack(currentAlbumData.tracks[idx], currentAlbumData.tracks, idx, currentAlbumData);
        }
      });
    });

    tracklistEl.querySelectorAll(".tr-dl-btn button").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.trackIdx);
        if (onDownloadTrack && currentAlbumData) {
          onDownloadTrack(currentAlbumData, idx);
        }
      });
    });
  }

  function updatePlayingHighlight(activeTrackId, isPlaying) {
    if (!tracklistEl) return;
    tracklistEl.querySelectorAll(".track-row").forEach(row => {
      const isCur = String(row.dataset.trackId) === String(activeTrackId);
      row.classList.toggle("playing", isCur && isPlaying);
      const playBtn = row.querySelector(".tr-play-btn");
      if (playBtn) playBtn.textContent = (isCur && isPlaying) ? "⏸" : "▶";
    });
  }

  function close() {
    if (modal) modal.style.display = "none";
  }

  if (closeBtn) closeBtn.addEventListener("click", close);
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) close();
    });
  }

  return { open, close, updatePlayingHighlight, getCurrentAlbum: () => currentAlbumData };
}
