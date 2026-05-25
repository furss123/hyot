/**
 * HyoT — data.json 로드·캐시 무효화·관리자↔메인 탭 연동
 */
(function () {
  const LS_REVISION = "hyot_catalog_revision";
  const DATA_PATH = "data/data.json";
  const gh = window.HYOT_ADMIN_CONFIG?.github || {
    owner: "furss123",
    repo: "hyot",
    branch: "main",
  };

  function isLiveSite() {
    const host = location.hostname.toLowerCase();
    return host === "furss123.github.io" || host.endsWith(".github.io");
  }

  function remoteCatalogUrl(cacheBust) {
    const branch = String(gh.branch || "main").trim() || "main";
    const base = `https://raw.githubusercontent.com/${gh.owner}/${gh.repo}/${branch}/${DATA_PATH}`;
    return cacheBust ? `${base}?v=${encodeURIComponent(cacheBust)}` : base;
  }

  function localCatalogUrl(cacheBust) {
    return cacheBust ? `${DATA_PATH}?v=${encodeURIComponent(cacheBust)}` : DATA_PATH;
  }

  function resolveCatalogUrl(cacheBust) {
    return isLiveSite() ? remoteCatalogUrl(cacheBust) : localCatalogUrl(cacheBust);
  }

  function catalogRevision(catalog) {
    const utils = catalog?.utilities;
    if (!Array.isArray(utils) || !utils.length) return String(Date.now());
    let max = 0;
    for (const u of utils) {
      const t = new Date(u?.updatedAt || 0).getTime();
      if (t > max) max = t;
    }
    return String(max || Date.now());
  }

  async function fetchCatalog(options = {}) {
    const bust = options.cacheBust ?? Date.now();
    const urls = isLiveSite()
      ? [remoteCatalogUrl(bust), localCatalogUrl(bust)]
      : [localCatalogUrl(bust), remoteCatalogUrl(bust)];
    let lastErr;
    for (const url of urls) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          lastErr = new Error(`HTTP ${res.status}`);
          continue;
        }
        return await res.json();
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("catalog_fetch_failed");
  }

  function notifyCatalogUpdated(catalogOrMeta) {
    const revision =
      typeof catalogOrMeta === "object" && catalogOrMeta?.utilities
        ? catalogRevision(catalogOrMeta)
        : String(catalogOrMeta?.revision || catalogOrMeta?.updatedAt || Date.now());
    const payload = { revision, at: Date.now() };
    try {
      localStorage.setItem(LS_REVISION, JSON.stringify(payload));
    } catch {
      /* private mode */
    }
    window.dispatchEvent(new CustomEvent("hyot-catalog-updated", { detail: payload }));
  }

  function subscribeCatalogUpdates(handler) {
    if (typeof handler !== "function") return;
    const run = () => handler();
    window.addEventListener("storage", (e) => {
      if (e.key === LS_REVISION) run();
    });
    window.addEventListener("hyot-catalog-updated", run);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") run();
    });
  }

  window.HYOT_CATALOG_SYNC = {
    DATA_PATH,
    isLiveSite,
    resolveCatalogUrl,
    fetchCatalog,
    catalogRevision,
    notifyCatalogUpdated,
    subscribeCatalogUpdates,
  };
})();
