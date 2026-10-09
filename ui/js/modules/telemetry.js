/* =============================================================================
   ALBUM DISCOVERY STATION — TELEMETRY & HARDWARE RESOURCE MONITOR
   Architecture: Self-contained system telemetry engine (window.AppTelemetry)
   Handles: Live CPU/RAM gauges, encoder subprocess tracking, memory trimming,
   and real-time activity event stream console.
   ============================================================================= */
(function() {
  const Bus = window.AppBus;

  // Header Elements
  const btnAppMonitorToggle = document.getElementById("btnAppMonitorToggle");
  const hdrMonitorCpu = document.getElementById("hdrMonitorCpu");
  const hdrMonitorRam = document.getElementById("hdrMonitorRam");

  // Modal Elements
  const appMonitorModal = document.getElementById("appMonitorModal");
  const appMonitorCloseBtn = document.getElementById("appMonitorCloseBtn");
  const btnMonClose = document.getElementById("btnMonClose");
  const btnMonTrimMemory = document.getElementById("btnMonTrimMemory");
  const btnMonRescanLibrary = document.getElementById("btnMonRescanLibrary");
  const monValPid = document.getElementById("monValPid");
  const monValUptime = document.getElementById("monValUptime");
  const monMetricCpu = document.getElementById("monMetricCpu");
  const monBarCpu = document.getElementById("monBarCpu");
  const monCpuHint = document.getElementById("monCpuHint");
  const monMetricRam = document.getElementById("monMetricRam");
  const monBarRam = document.getElementById("monBarRam");
  const monRamHint = document.getElementById("monRamHint");
  const monMetricThreads = document.getElementById("monMetricThreads");
  const monBarThreads = document.getElementById("monBarThreads");
  const monMetricChildren = document.getElementById("monMetricChildren");
  const monBarChildren = document.getElementById("monBarChildren");
  const monChildrenHint = document.getElementById("monChildrenHint");
  const monDlStatusBadge = document.getElementById("monDlStatusBadge");
  const monDlBody = document.getElementById("monDlBody");
  const monLibCount = document.getElementById("monLibCount");
  const monLibPath = document.getElementById("monLibPath");
  const monDbDiscoverySize = document.getElementById("monDbDiscoverySize");
  const monDbLibrarySize = document.getElementById("monDbLibrarySize");
  const monDbLyricsSize = document.getElementById("monDbLyricsSize");
  const monLogConsole = document.getElementById("monLogConsole");
  const btnMonClearConsole = document.getElementById("btnMonClearConsole");

  let isMonitorModalOpen = false;
  let monitorPollTimer = null;
  let consoleClearTs = 0;

  const svgTrimMemory = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> <span>Trim Memory (Free RAM)</span>`;
  const svgRescan = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> <span>Rescan Library</span>`;
  const svgSpinner = `<svg style="animation: spin 0.8s linear infinite;" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor"/></svg>`;

  function formatLogMessage(msg) {
    let text = Bus.escapeHtml(msg);
    text = text.replace(/\[CACHE HIT\]/g, '<span class="mon-token-cache">CACHE HIT</span>');
    text = text.replace(/\[REFRESH COMPLETE\]/g, '<span class="mon-token-refresh">REFRESH</span>');
    text = text.replace(/\[LIVE ROTATION\]/g, '<span class="mon-token-refresh">ROTATION</span>');
    text = text.replace(/\[PRE-WARMER\]/g, '<span class="mon-token-cache">PRE-WARM</span>');
    text = text.replace(/\[LIBRARY SCAN\]/g, '<span class="mon-token-http">LIBRARY</span>');
    text = text.replace(/\[HTTP\]/g, '<span class="mon-token-http">HTTP</span>');
    text = text.replace(/\(took\s+([0-9.]+s?)\)/g, '<span class="mon-token-timing">(took $1)</span>');
    text = text.replace(/&quot;(GET|POST|PUT|DELETE)\s+([^&]+)&quot;\s+(200|201|204)/g, '&quot;<span class="mon-token-method">$1</span> <span class="mon-token-url">$2</span>&quot; <span class="mon-token-code ok">$3</span>');
    text = text.replace(/&quot;(GET|POST|PUT|DELETE)\s+([^&]+)&quot;\s+(4[0-9]{2}|5[0-9]{2})/g, '&quot;<span class="mon-token-method">$1</span> <span class="mon-token-url">$2</span>&quot; <span class="mon-token-code err">$3</span>');
    return text;
  }

  async function fetchAppMonitorStats() {
    try {
      const res = await fetch("/api/monitor/stats");
      if (!res.ok) return;
      const data = await res.json();
      updateAppMonitorUI(data);
    } catch (e) {
      // Quiet fail on network transitions
    }
  }

  function updateAppMonitorUI(data) {
    if (!data) return;

    const cpuVal = data.cpu_pct !== undefined ? `${Number(data.cpu_pct).toFixed(1)}%` : "0.0%";
    const ramVal = data.ram_mb !== undefined ? `${Number(data.ram_mb).toFixed(1)} MB` : "0.0 MB";
    if (hdrMonitorCpu) hdrMonitorCpu.textContent = `CPU ${cpuVal}`;
    if (hdrMonitorRam) hdrMonitorRam.textContent = ramVal;

    const dot = document.querySelector(".monitor-pulse-dot");
    if (dot) {
      if (data.cpu_pct > 65) {
        dot.style.background = "#f59e0b";
        dot.style.boxShadow = "0 0 10px #f59e0b";
      } else {
        dot.style.background = "#10b981";
        dot.style.boxShadow = "0 0 8px #10b981";
      }
    }

    if (!isMonitorModalOpen) return;

    if (monValPid) monValPid.textContent = data.pid || "—";
    if (monValUptime) monValUptime.textContent = Bus.formatUptime(data.uptime_seconds);

    // CPU Gauge
    if (monMetricCpu) monMetricCpu.textContent = `${data.cpu_pct}%`;
    if (monBarCpu) monBarCpu.style.width = `${Math.min(100, Math.max(2, data.cpu_pct))}%`;
    if (monCpuHint) {
      monCpuHint.textContent = `${data.cpu_cores || 1} Cores (${data.raw_cpu_pct || 0}% total)`;
    }

    // RAM Gauge
    if (monMetricRam) monMetricRam.textContent = `${data.ram_mb} MB`;
    const ramBarPct = data.sys_ram_total_gb ? Math.min(100, (data.ram_mb / (data.sys_ram_total_gb * 1024)) * 100 * 5) : 15;
    if (monBarRam) monBarRam.style.width = `${Math.max(3, ramBarPct)}%`;
    if (monRamHint) {
      monRamHint.textContent = `System: ${data.sys_ram_used_pct || 0}% of ${data.sys_ram_total_gb || 0} GB`;
    }

    // Threads Gauge
    if (monMetricThreads) monMetricThreads.textContent = String(data.threads || 0);
    if (monBarThreads) monBarThreads.style.width = `${Math.min(100, (data.threads / 25) * 100)}%`;

    // Children / Transcoding Subprocesses
    const encoderCount = data.encoder_count || 0;
    if (monMetricChildren) {
      monMetricChildren.textContent = encoderCount > 0 ? `${encoderCount} Active` : "0 Idle";
    }
    if (monBarChildren) {
      monBarChildren.style.width = encoderCount > 0 ? `${Math.min(100, encoderCount * 35)}%` : "0%";
    }
    if (monChildrenHint) {
      monChildrenHint.textContent = encoderCount > 0 ? `${encoderCount} transcoding active` : "Audio encoders idle";
    }

    // Subsystem 1: Downloader State
    const dl = data.downloader || {};
    const isDlActive = Boolean((dl.is_active && dl.active_job) || encoderCount > 0);
    if (monDlStatusBadge && monDlBody) {
      if (isDlActive) {
        const job = dl.active_job || {
          artist: "FFmpeg Engine",
          title: "Audio Stream Extraction",
          completed_tracks: 0,
          total_tracks: encoderCount,
          progress_pct: 50,
          active_streams_count: encoderCount,
          active_threads: {}
        };
        const statusLabel = job.artist === "FFmpeg Engine" || (encoderCount > 0 && !dl.active_job) ? "Transcoding" : "Downloading";
        monDlStatusBadge.innerHTML = `<span class="mon-pill-dot"></span>${statusLabel}`;
        monDlStatusBadge.className = "mon-status-pill downloading";

        const streamsCount = job.active_streams_count || Object.keys(job.active_threads || {}).length;
        let streamsSummary = "";
        const threadsObj = job.active_threads || {};
        const threadKeys = Object.keys(threadsObj);
        if (threadKeys.length > 0) {
          streamsSummary = `<div style="margin-top: 8px; font-size: 11px; color: #cbd5e1; display: flex; flex-direction: column; gap: 4px; max-height: 100px; overflow-y: auto; padding-right: 4px;">` +
            threadKeys.map(k => {
              const t = threadsObj[k];
              const speedTxt = t.speed ? ` • ${Bus.escapeHtml(t.speed)}` : '';
              return `<div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 3px 6px; border-radius: 4px;">
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500;">⚡ ${Bus.escapeHtml(t.title)}</span>
                <span style="color: #38bdf8; font-weight: 700; font-family: var(--font-mono); font-size: 10.5px; flex-shrink: 0; margin-left: 8px;">${t.pct}%${speedTxt}</span>
              </div>`;
            }).join("") +
          `</div>`;
        }

        monDlBody.innerHTML = `
          <div class="mon-sub-row">Album: <strong>${Bus.escapeHtml(job.artist)} - ${Bus.escapeHtml(job.title)}</strong></div>
          <div class="mon-sub-muted">Progress: ${job.completed_tracks}/${job.total_tracks} tracks (${job.progress_pct}%) • ${streamsCount} streams</div>
          ${streamsSummary}
        `;
      } else {
        monDlStatusBadge.innerHTML = `<span class="mon-pill-dot"></span>Idle`;
        monDlStatusBadge.className = "mon-status-pill idle";
        monDlBody.innerHTML = `
          <div class="mon-sub-row">Queue: <strong>${dl.queue_count || 0} queued</strong></div>
          <div class="mon-sub-muted">No active background tasks</div>
        `;
      }
    }

    // Subsystem 2: Library State
    const lib = data.library || {};
    if (monLibCount) monLibCount.textContent = `${lib.total_owned || 0} Albums`;
    if (monLibPath) monLibPath.textContent = `Root: ${lib.music_root || "Default"}`;

    // Subsystem 3: Database State
    const db = data.database || {};
    if (monDbDiscoverySize) monDbDiscoverySize.textContent = db.app_size || "0 KB";
    if (monDbLibrarySize) monDbLibrarySize.textContent = db.library_size || "0 KB";
    if (monDbLyricsSize) monDbLyricsSize.textContent = db.lyrics_size || "0 KB";

    // Live Activity Stream
    if (monLogConsole) {
      const allEvents = data.recent_events || [];
      const events = consoleClearTs ? allEvents.filter(ev => (ev.ts || 0) > consoleClearTs) : allEvents;
      if (events.length === 0) {
        monLogConsole.innerHTML = `<div class="mon-log-placeholder">Listening for application events...</div>`;
      } else {
        monLogConsole.innerHTML = events.map(ev => {
          const cat = (ev.category || "APP").toLowerCase();
          return `
            <div class="mon-log-entry">
              <span class="mon-log-time">${Bus.escapeHtml(ev.time_str)}</span>
              <span class="mon-log-tag ${cat}">${Bus.escapeHtml(ev.category)}</span>
              <span class="mon-log-text">${formatLogMessage(ev.message)}</span>
            </div>
          `;
        }).join("");
        monLogConsole.scrollTop = monLogConsole.scrollHeight;
      }
    }
  }

  function startAppMonitorPolling() {
    fetchAppMonitorStats();
    if (monitorPollTimer) clearInterval(monitorPollTimer);
    const intervalMs = isMonitorModalOpen ? 1500 : 3500;
    monitorPollTimer = setInterval(fetchAppMonitorStats, intervalMs);
  }

  function openAppMonitor() {
    isMonitorModalOpen = true;
    if (appMonitorModal) appMonitorModal.classList.remove("hidden");
    startAppMonitorPolling();
  }

  function closeAppMonitor() {
    isMonitorModalOpen = false;
    if (appMonitorModal) appMonitorModal.classList.add("hidden");
    startAppMonitorPolling();
  }

  async function trimAppMemory() {
    if (!btnMonTrimMemory) return;
    btnMonTrimMemory.disabled = true;
    btnMonTrimMemory.innerHTML = `${svgSpinner} <span>Trimming...</span>`;
    try {
      const res = await fetch("/api/monitor/trim-memory", { method: "POST" });
      const data = await res.json();
      if (data.status === "success") {
        Bus.showToast(`Memory trimmed ✓ Freed ${data.freed_mb} MB (RAM: ${data.after_mb} MB)`, "success");
      }
      await fetchAppMonitorStats();
    } catch (e) {
      Bus.showToast("Memory trim failed", "error");
    } finally {
      btnMonTrimMemory.disabled = false;
      btnMonTrimMemory.innerHTML = svgTrimMemory;
    }
  }

  async function rescanFromMonitor() {
    if (!btnMonRescanLibrary) return;
    btnMonRescanLibrary.disabled = true;
    btnMonRescanLibrary.innerHTML = `${svgSpinner} <span>Scanning...</span>`;
    try {
      const res = await fetch("/api/library/rescan", { method: "POST" });
      const data = await res.json();
      const total = data.total_owned || (data.albums ? data.albums.length : 0);
      Bus.showToast(`✓ Library scanned: ${total} albums ready`, "success");
      await fetchAppMonitorStats();
    } catch (e) {
      Bus.showToast("Library scan failed", "error");
    } finally {
      btnMonRescanLibrary.disabled = false;
      btnMonRescanLibrary.innerHTML = svgRescan;
    }
  }

  if (btnAppMonitorToggle) btnAppMonitorToggle.addEventListener("click", openAppMonitor);
  if (appMonitorCloseBtn) appMonitorCloseBtn.addEventListener("click", closeAppMonitor);
  if (btnMonClose) btnMonClose.addEventListener("click", closeAppMonitor);
  if (btnMonTrimMemory) btnMonTrimMemory.addEventListener("click", trimAppMemory);
  if (btnMonRescanLibrary) btnMonRescanLibrary.addEventListener("click", rescanFromMonitor);

  if (btnMonClearConsole) {
    btnMonClearConsole.addEventListener("click", () => {
      consoleClearTs = Date.now() / 1000;
      if (monLogConsole) {
        monLogConsole.innerHTML = '<div class="mon-log-placeholder">Console buffer cleared. Listening for new events...</div>';
      }
    });
  }

  // Public Interface
  window.AppTelemetry = {
    startAppMonitorPolling,
    openAppMonitor,
    closeAppMonitor,
    fetchAppMonitorStats,
    trimAppMemory,
    rescanFromMonitor
  };
})();
