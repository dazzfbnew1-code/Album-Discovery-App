/* =============================================================================
   ALBUM DISCOVERY STATION — CORE EVENT BUS & SHARED UTILITIES
   Architecture: Lightweight event bus (window.AppBus) coordinating modules
   without circular import locks or global variable clutter.
   ============================================================================= */
(function() {
  const events = {};

  const AppBus = {
    // Event Subscription & Dispatch
    on(event, handler) {
      if (!events[event]) events[event] = [];
      events[event].push(handler);
    },
    off(event, handler) {
      if (!events[event]) return;
      events[event] = events[event].filter(h => h !== handler);
    },
    emit(event, data) {
      if (!events[event]) return;
      events[event].forEach(h => {
        try {
          h(data);
        } catch (e) {
          console.error(`[AppBus Error on ${event}]`, e);
        }
      });
    },

    // Global Shared State
    state: {
      config: {},
      currentGenre: "all",
      currentViewType: "genre", // 'genre' | 'special' | 'artist' | 'flow' | 'search' | 'library'
      currentFullCollection: [],
      currentDisplayedAlbums: [],
      localLibraryAlbums: [],
      currentArtistDiscography: null,
      currentCategoryFilter: "all",
      currentArtistGapData: null,
      isLibraryRadioMode: false,
      isFullAlbumMode: false
    },

    // Global Constants
    FALLBACK_COVER_SVG: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSczMDAnIGhlaWdodD0nMzAwJyB2aWV3Qm94PScwIDAgMzAwIDMwMCc+PHJlY3Qgd2lkdGg9JzMwMCcgaGVpZ2h0PSczMDAnIGZpbGw9JyMxMDE1MjQnLz48Y2lyY2xlIGN4PScxNTAnIGN5PScxNTAnIHI9JzEwMCcgZmlsbD0nIzBiMGUxOCcgc3Ryb2tlPScjOGI1Y2Y2JyBzdHJva2Utd2lkdGg9JzYnLz48Y2lyY2xlIGN4PScxNTAnIGN5PScxNTAnIHI9JzM2JyBmaWxsPScjOGI1Y2Y2Jy8+PGNpcmNsZSBjeD0nMTUwJyBjeT0nMTUwJyByPScxMicgZmlsbD0nIzEwMTUyNCcvPjwvc3ZnPg==',

    ERA_TITLES: {
      "all": "🔥 Top Landmark Studio Albums",
      "top_singles": "⚡ Top Singles & Chart Hits",
      "pop": "✨ Trending Pop & Hot Hits",
      "30s_40s": "🎺 30s & 40s Swing & Big Band Masters",
      "50s": "🎙️ 50s Rock 'n' Roll & Golden Era",
      "60s": "🎸 60s Psychedelic & Classic Rock",
      "70s": "🕺 70s Classic Rock, Funk & Disco",
      "80s": "📼 80s Synthwave & New Wave",
      "90s": "📻 90s Grunge & Golden Era Hip-Hop",
      "2000s": "💿 2000s R&B, Nu-Metal & Pop",
      "2010s": "🎧 2010s Modern EDM & Indie",
      "2020s": "✨ 2020s Current Wave & Trending",
      "rap": "🎤 Rap & Hip-Hop Essentials",
      "dance": "🎧 Dance & Electronic Anthems",
      "rock": "🎸 Rock & Alternative Classics",
      "rnb": "🎷 R&B & Soul Masterpieces",
      "metal": "⚡ Heavy Metal & Hard Rock",
      "electronic": "🎹 Ambient & Electronic Gems",
      "indie": "🌿 Indie & Alternative Hits",
      "jazz": "🎺 Jazz & Blues Heritage",
      "classical": "🎻 Classical & Cinematic Masters"
    },

    // Helper: HTML Escaping
    escapeHtml(str) {
      if (!str) return "";
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    },

    // Helper: Toast Notifications
    showToast(message, type = "info") {
      const toastContainer = document.getElementById("appToastContainer");
      if (!toastContainer) return;
      const toast = document.createElement("div");
      toast.className = `app-toast ${type}`;
      const icon = type === "success" ? "✓" : (type === "error" ? "⚠️" : (type === "warning" ? "⚠️" : (type === "flow" ? "🌊" : "🎵")));
      toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-msg">${message}</span>
      `;
      toastContainer.appendChild(toast);
      requestAnimationFrame(() => toast.classList.add("show"));
      setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 400);
      }, 3200);
    },

    // Helper: Time Formatters
    formatTime(sec) {
      if (!sec || isNaN(sec)) return "0:00";
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return `${m}:${s < 10 ? '0' : ''}${s}`;
    },

    formatDurationMinutes(seconds) {
      if (!seconds || seconds <= 0) return "";
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${m}m ${s < 10 ? '0' : ''}${s}s`;
    },

    formatTrackDuration(seconds) {
      if (!seconds || seconds <= 0) return "--:--";
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${m}:${s < 10 ? '0' : ''}${s}`;
    },

    formatUptime(seconds) {
      if (!seconds || seconds < 0) return "0s";
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      if (h > 0) return `${h}h ${m}m ${s}s`;
      if (m > 0) return `${m}m ${s}s`;
      return `${s}s`;
    }
  };

  window.AppBus = AppBus;
  window.FALLBACK_COVER_SVG = AppBus.FALLBACK_COVER_SVG;
})();
