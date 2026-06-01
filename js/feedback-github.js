/**
 * HyoT — 의견 게시판 GitHub 백엔드 (Firebase 미설정 시 폴백)
 */
(function () {
  const cfg = window.HYOT_FEEDBACK_CONFIG;
  if (!cfg?.github) return;

  const gh = cfg.github;
  const token =
    window.HYOT_FEEDBACK_TOKEN ||
    (window.HYOT_FEEDBACK_TOKEN_B64 && typeof atob !== "undefined"
      ? atob(window.HYOT_FEEDBACK_TOKEN_B64)
      : null);
  const ingestKey = window.HYOT_FEEDBACK_INGEST_KEY;

  function deployBranches() {
    const primary = String(gh.branch || "main").trim() || "main";
    return [primary];
  }

  function uint8ToBase64(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  async function api(path, options = {}) {
    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`https://api.github.com${path}`, { ...options, headers });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const err = await res.json();
        if (err?.message) msg = err.message;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    return res.status === 204 ? null : res.json();
  }

  async function readFeedback(branch = gh.branch) {
    const ref = encodeURIComponent(branch);
    const data = await api(`/repos/${gh.owner}/${gh.repo}/contents/${cfg.dataPath}?ref=${ref}`);
    const text = new TextDecoder().decode(
      Uint8Array.from(atob(data.content.replace(/\s/g, "")), (c) => c.charCodeAt(0))
    );
    return { json: JSON.parse(text), sha: data.sha };
  }

  async function writeFeedback(json, sha, message, branch) {
    const text = JSON.stringify(json, null, 2) + "\n";
    await api(
      `/repos/${gh.owner}/${gh.repo}/contents/${cfg.dataPath}`,
      {
        method: "PUT",
        body: JSON.stringify({
          message,
          content: uint8ToBase64(new TextEncoder().encode(text)),
          branch,
          sha,
        }),
      }
    );
  }

  function isShaConflict(err) {
    return /does not match|sha was supplied|409|Conflict/i.test(String(err?.message || err));
  }

  async function persistNewPost(post) {
    if (!token) throw new Error("NO_TOKEN");
    for (const branch of deployBranches()) {
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const { json, sha } = await readFeedback(branch);
          const posts = Array.isArray(json.posts) ? json.posts : [];
          posts.unshift(post);
          await writeFeedback({ posts }, sha, `feedback: ${post.title}`, branch);
          break;
        } catch (err) {
          if (!isShaConflict(err) || attempt === 3) throw err;
          await new Promise((r) => setTimeout(r, 120 * (attempt + 1)));
        }
      }
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function submitViaWorkflowDispatch(post) {
    if (!ingestKey || !token) throw new Error("NOT_CONFIGURED");
    const res = await fetch(
      `https://api.github.com/repos/${gh.owner}/${gh.repo}/actions/workflows/feedback-ingest.yml/dispatches`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ref: gh.branch || "main",
          inputs: { payload_json: JSON.stringify(post), ingest_key: ingestKey },
        }),
      }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async function submitViaDispatch(post) {
    const res = await fetch(`https://api.github.com/repos/${gh.owner}/${gh.repo}/dispatches`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ event_type: "hyot_feedback_submit", client_payload: post }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async function pollForPost(postId, timeoutMs = 90000) {
    const deadline = Date.now() + timeoutMs;
    const branch = gh.branch || "main";
    while (Date.now() < deadline) {
      try {
        const { json } = await readFeedback(branch);
        const posts = Array.isArray(json.posts) ? json.posts : [];
        if (posts.some((p) => p.id === postId)) return true;
      } catch {
        /* retry */
      }
      await sleep(2500);
    }
    throw new Error("POLL_TIMEOUT");
  }

  async function listPosts() {
    return [];
  }

  async function submitFeedback(post) {
    if (!token) throw new Error("NOT_CONFIGURED");
    try {
      await persistNewPost(post);
      return;
    } catch (err) {
      console.warn("[HyoT feedback/github] direct save failed:", err);
      if (/401|Bad credentials/i.test(String(err?.message))) throw err;
    }
    if (ingestKey) {
      try {
        await submitViaWorkflowDispatch(post);
        await pollForPost(post.id);
        return;
      } catch (err) {
        console.warn("[HyoT feedback/github] workflow failed:", err);
        if (/401|Bad credentials/i.test(String(err?.message))) throw err;
      }
    }
    await submitViaDispatch(post);
    await pollForPost(post.id);
  }

  async function probeToken() {
    if (!token) return false;
    try {
      const res = await fetch("https://api.github.com/user", {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          Authorization: `Bearer ${token}`,
        },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  window.HyotFeedbackGithub = {
    isAvailable: () => Boolean(token),
    canSubmit: () => Boolean(token),
    probeToken,
    listPosts,
    submitFeedback,
  };
})();
