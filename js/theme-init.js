/** FOUC 방지 — theme.js 로드 전 적용 */
(function () {
  var m = "system";
  try {
    m = localStorage.getItem("hyot_theme") || "system";
  } catch (e) {}
  if (m !== "system" && m !== "light" && m !== "dark") m = "system";
  var resolved =
    m === "light" ? "light" : m === "dark" ? "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  var root = document.documentElement;
  root.setAttribute("data-theme", m);
  root.setAttribute("data-resolved-theme", resolved);
  root.style.colorScheme = resolved;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "light" ? "#eceef5" : "#0c0f1a");
})();
