// ==========================================================================
// DOWNLOAD QUEUE MODULE — Multi-Album Queue Drawer & Polling
// ==========================================================================

export function initQueue({ esc }) {
  const drawer = document.getElementById("queueDrawer");
  const drawerBtn = document.getElementById("queueDrawerBtn");
  const closeBtn = document.getElementById("closeDrawerBtn");
  const badge = document.getElementById("queueBadge");
  const activeCard = document.getElementById("activeDownloadCard");
  const activeTitle = document.getElementById("activeDlTitle");
  const activeArtist = document.getElementById("activeDlArtist");
  const activeBar = document.getElementById("activeDlBar");
  const activePercent = document.getElementById("activeDlPercent");
  const activeTrack = document.getElementById("activeDlTrack");
  const queuedList = document.getElementById("queuedJobsList");
  const historyList = document.getElementById("historyJobsList");

  async function queueAlbum(album) {
    if (!album) return;
    try {
      const res = await fetch('/api/download/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ album_id: album.id, album_data: album })
      });
      const data = await res.json();
      if (data.ok) {
        openDrawer();
        pollStatus();
      }
    } catch (err) {
      alert("Failed to queue album for download.");
    }
  }

  async function pollStatus() {
    try {
      const res = await fetch('/api/download/status');
      const data = await res.json();
      const active = data.active;
      const queued = data.queued || [];
      const history = data.history || [];

      const total = (active ? 1 : 0) + queued.length;
      if (badge) {
        badge.textContent = total;
        badge.style.display = total > 0 ? "inline-block" : "none";
      }

      if (activeCard) {
        if (active) {
          activeCard.style.display = "block";
          if (activeTitle) activeTitle.textContent = active.title;
          if (activeArtist) activeArtist.textContent = active.artist;
          if (activeBar) activeBar.style.width = `${active.progress_percent || 0}%`;
          if (activePercent) activePercent.textContent = `${active.progress_percent || 0}%`;
          if (activeTrack) activeTrack.textContent = `Track ${active.current_track_idx || 1} / ${active.total_tracks || 1} · ${active.current_track_title || ''}`;
        } else {
          activeCard.style.display = "none";
        }
      }

      if (queuedList) {
        queuedList.innerHTML = queued.length ? queued.map(j => `
          <div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:12px;">
            <strong>${esc(j.title)}</strong> · ${esc(j.artist)}
          </div>
        `).join("") : `<div style="color:var(--text-muted);font-size:12px;">No pending jobs.</div>`;
      }

      if (historyList) {
        historyList.innerHTML = history.length ? history.slice(0, 8).map(j => `
          <div style="padding:6px 0;font-size:11px;color:${j.status === 'completed' ? 'var(--success)' : 'var(--danger)'};">
            ${j.status === 'completed' ? '✓' : '✗'} ${esc(j.title)} (${esc(j.artist)})
          </div>
        `).join("") : `<div style="color:var(--text-muted);font-size:12px;">No recent downloads.</div>`;
      }
    } catch (err) {}
  }

  function openDrawer() {
    if (drawer) drawer.classList.add("open");
  }

  function closeDrawer() {
    if (drawer) drawer.classList.remove("open");
  }

  if (drawerBtn) drawerBtn.addEventListener("click", openDrawer);
  if (closeBtn) closeBtn.addEventListener("click", closeDrawer);

  setInterval(pollStatus, 2500);
  pollStatus();

  return { queueAlbum, openDrawer, closeDrawer, pollStatus };
}
