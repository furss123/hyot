/**
 * HyoT — 의견 게시판 Cloudflare Worker 릴레이
 */
(function () {
  const cfg = window.HYOT_FEEDBACK_CONFIG;
  if (!cfg) return;

  const relayUrl = String(cfg.relayUrl || "").trim();
  const ingestKey = window.HYOT_FEEDBACK_INGEST_KEY;

  function isReady() {
    return Boolean(relayUrl && ingestKey);
  }

  async function listPosts() {
    return [];
  }

  async function submitFeedback(post) {
    const res = await fetch(relayUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ingest_key: ingestKey, post }),
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const err = await res.json();
        if (err?.error) msg = err.error;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    const data = await res.json();
    if (!data?.ok) throw new Error(data?.error || "submit_failed");
  }

  window.HyotFeedbackRelay = {
    isReady,
    listPosts,
    submitFeedback,
  };
})();
