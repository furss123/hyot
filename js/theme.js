/**
 * HyoT — 테마 (시스템 / 라이트 / 다크)
 */
(function () {
  const STORAGE_KEY = "hyot_theme";
  const VALID = new Set(["system", "light", "dark"]);
  const META_COLORS = { light: "#eceef5", dark: "#0c0f1a" };
  const DARK_MQ = window.matchMedia("(prefers-color-scheme: dark)");

  function normalize(mode) {
    return VALID.has(mode) ? mode : "system";
  }

  function getStored() {
    return normalize(localStorage.getItem(STORAGE_KEY) || "system");
  }

  function getSystemTheme() {
    return DARK_MQ.matches ? "dark" : "light";
  }

  /** 화면에 실제로 보여 줄 테마 */
  function getEffectiveTheme(mode) {
    const value = normalize(mode);
    if (value === "light") return "light";
    if (value === "dark") return "dark";
    return getSystemTheme();
  }

  function updateMetaThemeColor(resolved) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", META_COLORS[resolved] || META_COLORS.dark);
  }

  function applyToDocument(mode) {
    const value = normalize(mode);
    const resolved = getEffectiveTheme(value);
    const root = document.documentElement;

    root.setAttribute("data-theme", value);
    root.setAttribute("data-resolved-theme", resolved);
    root.style.colorScheme = value === "system" ? "light dark" : resolved;

    updateMetaThemeColor(resolved);
    return { value, resolved };
  }

  function applyTheme(mode) {
    const { value } = applyToDocument(mode);
    localStorage.setItem(STORAGE_KEY, value);
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

  function onSystemPreferenceChange() {
    if (getStored() !== "system") return;
    applyToDocument("system");
  }

  function watchSystemPreference() {
    if (typeof DARK_MQ.addEventListener === "function") {
      DARK_MQ.addEventListener("change", onSystemPreferenceChange);
      return;
    }
    if (typeof DARK_MQ.addListener === "function") {
      DARK_MQ.addListener(onSystemPreferenceChange);
    }
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
  }

  watchSystemPreference();
  applyTheme(getStored());

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindControls);
  } else {
    bindControls();
  }

  window.HyotTheme = {
    apply: applyTheme,
    get: getStored,
    getEffective: () => getEffectiveTheme(getStored()),
    refreshSystem: onSystemPreferenceChange,
  };
})();
