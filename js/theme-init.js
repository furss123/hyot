/** FOUC 방지 — theme.js 로드 전 적용 */
(function () {
  var mode = "system";
  try {
    mode = localStorage.getItem("hyot_theme") || "system";
  } catch (e) {}
  if (mode !== "system" && mode !== "light" && mode !== "dark") mode = "system";

  var resolved =
    mode === "light" ? "light" : mode === "dark" ? "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

  var root = document.documentElement;
  root.setAttribute("data-theme", mode);
  root.setAttribute("data-resolved-theme", resolved);
  root.style.colorScheme = mode === "system" ? "light dark" : resolved;

  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "light" ? "#eceef5" : "#0c0f1a");
})();
