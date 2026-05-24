/**
 * HyoT — 테마 (시스템 / 라이트 / 다크)
 */
(function () {
  const STORAGE_KEY = "hyot_theme";
  const VALID = new Set(["system", "light", "dark"]);
  const META_COLORS = { light: "#eceef5", dark: "#0c0f1a" };

  function normalize(mode) {
    return VALID.has(mode) ? mode : "system";
  }

  function getStored() {
    return normalize(localStorage.getItem(STORAGE_KEY) || "system");
  }

  function systemPrefersDark() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function resolvedTheme(mode) {
    if (mode === "light") return "light";
    if (mode === "dark") return "dark";
    return systemPrefersDark() ? "dark" : "light";
  }

  function updateMetaThemeColor(mode) {
    const resolved = resolvedTheme(mode);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", META_COLORS[resolved]);
  }

  function applyResolved(mode) {
    const resolved = resolvedTheme(mode);
    document.documentElement.dataset.resolvedTheme = resolved;
    document.documentElement.style.colorScheme = resolved;
  }

  function applyTheme(mode) {
    const value = normalize(mode);
    document.documentElement.dataset.theme = value;
    localStorage.setItem(STORAGE_KEY, value);
    applyResolved(value);
    updateMetaThemeColor(value);
    syncControls(value);
  }

  function syncControls(mode) {
    const root = document.querySelector("[data-theme-switch]");
    if (!root) return;
    root.querySelectorAll("[data-theme-value]").forEach((btn) => {
      const active = btn.getAttribute("data-theme-value") === mode;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function bindControls() {
    const root = document.querySelector("[data-theme-switch]");
    if (!root || root.dataset.bound === "1") return;
    root.dataset.bound = "1";

    root.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-theme-value]");
      if (!btn || !root.contains(btn)) return;
      applyTheme(btn.getAttribute("data-theme-value"));
    });

    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (getStored() === "system") {
        applyResolved("system");
        updateMetaThemeColor("system");
      }
    });
  }

  applyTheme(getStored());

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindControls);
  } else {
    bindControls();
  }

  window.HyotTheme = { apply: applyTheme, get: getStored };
})();
