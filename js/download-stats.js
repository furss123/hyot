/**
 * HyoT — 다운로드 횟수 집계 (Cloudflare Worker → data/download-stats.json)
 */
(function () {
  const fbCfg = window.HYOT_FEEDBACK_CONFIG;
  const relayUrl = String(fbCfg?.relayUrl || "").trim();

  function isReady() {
    return Boolean(relayUrl);
  }

  function normalizeId(id) {
    const safe = String(id || "")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 64);
    return safe || null;
  }

  function normalizePlatform(platform) {
    const p = String(platform || "windows").toLowerCase();
    return p === "android" ? "android" : "windows";
  }

  async function recordHit(utilityId, platform) {
    const id = normalizeId(utilityId);
    if (!id || !isReady()) return false;
    try {
      const res = await fetch(relayUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "download_hit",
          utility_id: id,
          platform: normalizePlatform(platform),
        }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      return Boolean(data?.ok);
    } catch {
      return false;
    }
  }

  window.HyotDownloadStats = {
    isReady,
    recordHit,
  };
})();
