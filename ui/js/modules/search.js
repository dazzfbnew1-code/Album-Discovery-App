// ==========================================================================
// SEARCH MODULE — Clean Debounced Album Search
// ==========================================================================

export function initSearch({ onPerformSearch, onClearSearch }) {
  const searchInput = document.getElementById("searchInput");
  const clearBtn = document.getElementById("searchClearBtn");

  let debounceTimer = null;

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const q = e.target.value.trim();
      if (clearBtn) clearBtn.style.display = q ? "block" : "none";

      clearTimeout(debounceTimer);
      if (!q) {
        if (onClearSearch) onClearSearch();
        return;
      }

      debounceTimer = setTimeout(() => {
        if (onPerformSearch) onPerformSearch(q);
      }, 350);
    });

    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        searchInput.value = "";
        if (clearBtn) clearBtn.style.display = "none";
        if (onClearSearch) onClearSearch();
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      clearBtn.style.display = "none";
      if (onClearSearch) onClearSearch();
      if (searchInput) searchInput.focus();
    });
  }
}
