/**
 * HyoT 愿由ъ옄 ???섍껄 寃뚯떆??愿由? */
(function () {
  if (window.HyotFirebaseFeedback?.isConfigured?.()) return;

  const cfg = window.HYOT_ADMIN_CONFIG;
  const feedbackCfg = window.HYOT_FEEDBACK_CONFIG;
  if (!cfg || !feedbackCfg) return;

  const STORAGE_TOKEN = "hyot_github_token";
  const $ = (id) => document.getElementById(id);

  const els = {
    tabCatalog: document.querySelector('[data-admin-tab="catalog"]'),
    tabFeedback: document.querySelector('[data-admin-tab="feedback"]'),
    catalogView: document.getElementById("admin-catalog-view"),
    feedbackView: document.getElementById("admin-feedback-view"),
    feedbackList: document.getElementById("admin-feedback-list"),
    feedbackEmpty: document.getElementById("admin-feedback-empty"),
    feedbackStatus: document.getElementById("admin-feedback-status"),
  };

  if (!els.feedbackView) return;

  const authPanel = document.getElementById("admin-feedback-auth");
  const listWrap = document.getElementById("admin-feedback-list-wrap");
  if (authPanel) authPanel.hidden = true;
  if (listWrap) listWrap.hidden = false;

  const categoryMap = Object.fromEntries(
    (feedbackCfg.categories || []).map((c) => [c.id, c.label])
  );

  let feedbackData = { posts: [] };

  function getToken() {
    return sessionStorage.getItem(STORAGE_TOKEN) || "";
  }

  function setFeedbackStatus(message, isError = false) {
    if (!els.feedbackStatus) return;
    els.feedbackStatus.textContent = message;
    els.feedbackStatus.classList.toggle("admin-toast--error", isError);
    els.feedbackStatus.hidden = !message;
  }

  function deployBranches() {
    const primary = String(cfg.github.branch || "main").trim() || "main";
    return [...new Set([primary, "gh-pages"])];
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
    const token = getToken();
    if (!token) throw new Error("濡쒓렇?몄씠 ?꾩슂?⑸땲??");
    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    };
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

  async function readFeedback(branch) {
    const ref = encodeURIComponent(branch);
    const data = await api(
      `/repos/${cfg.github.owner}/${cfg.github.repo}/contents/${feedbackCfg.dataPath}?ref=${ref}`
    );
    const text = new TextDecoder().decode(
      Uint8Array.from(atob(data.content.replace(/\s/g, "")), (c) => c.charCodeAt(0))
    );
    return { json: JSON.parse(text), sha: data.sha };
  }

  async function writeFeedback(json, sha, message, branch) {
    const text = JSON.stringify(json, null, 2) + "\n";
    const body = {
      message,
      content: uint8ToBase64(new TextEncoder().encode(text)),
      branch,
      sha,
    };
    await api(
      `/repos/${cfg.github.owner}/${cfg.github.repo}/contents/${feedbackCfg.dataPath}`,
      { method: "PUT", body: JSON.stringify(body) }
    );
  }

  function isShaConflict(err) {
    return /does not match|sha was supplied|409|Conflict/i.test(String(err?.message || err));
  }

  async function persistFeedback(mutator, message) {
    const branches = deployBranches();
    let nextForUi = null;
    for (const branch of branches) {
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const { json, sha } = await readFeedback(branch);
          const next = mutator(json);
          await writeFeedback(next, sha, message, branch);
          if (branch === cfg.github.branch) nextForUi = next;
          break;
        } catch (err) {
          if (!isShaConflict(err) || attempt === 4) throw err;
          await new Promise((r) => setTimeout(r, 120 * (attempt + 1)));
        }
      }
    }
    return nextForUi;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  }

  function renderFeedbackList() {
    const posts = [...(feedbackData.posts || [])].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    els.feedbackList.replaceChildren();

    if (!posts.length) {
      els.feedbackEmpty.hidden = false;
      return;
    }
    els.feedbackEmpty.hidden = true;

    const fragment = document.createDocumentFragment();
    posts.forEach((post) => {
      const li = document.createElement("li");
      li.className = "admin-feedback-item";
      if (post.status === "resolved") li.classList.add("admin-feedback-item--resolved");
      if (post.status === "hidden") li.classList.add("admin-feedback-item--hidden");

      const head = document.createElement("div");
      head.className = "admin-feedback-item__head";

      const cat = document.createElement("span");
      cat.className = `feedback-item__category feedback-item__category--${post.category}`;
      cat.textContent = categoryMap[post.category] || post.category;

      const title = document.createElement("strong");
      title.className = "admin-feedback-item__title";
      title.textContent = post.utilityLabel || post.utilityName || post.title || "?섍껄";

      head.append(cat, title);

      const meta = document.createElement("p");
      meta.className = "admin-feedback-item__meta";
      const status =
        post.status === "resolved"
          ? "泥섎━ ?꾨즺"
          : post.status === "hidden"
            ? "?④?"
            : "?묒닔";
      meta.textContent = `${post.author || "?듬챸"} 쨌 ${formatDate(post.createdAt)} 쨌 ${status}`;

      const body = document.createElement("p");
      body.className = "admin-feedback-item__body";
      body.textContent = post.body;

      if (post.utilityLabel || post.utilityName) {
        const target = document.createElement("p");
        target.className = "admin-feedback-item__target";
        target.textContent = post.utilityLabel || post.utilityName;
        li.append(head, target, meta, body);
      } else {
        li.append(head, meta, body);
      }

      const actions = document.createElement("div");
      actions.className = "admin-feedback-item__actions";

      if (post.status !== "resolved") {
        const resolveBtn = document.createElement("button");
        resolveBtn.type = "button";
        resolveBtn.className = "admin-btn-check";
        resolveBtn.textContent = "泥섎━ ?꾨즺";
        resolveBtn.addEventListener("click", () => updatePostStatus(post.id, "resolved"));
        actions.appendChild(resolveBtn);
      } else {
        const reopenBtn = document.createElement("button");
        reopenBtn.type = "button";
        reopenBtn.className = "admin-btn-check";
        reopenBtn.textContent = "?ㅼ떆 ?닿린";
        reopenBtn.addEventListener("click", () => updatePostStatus(post.id, "open"));
        actions.appendChild(reopenBtn);
      }

      const hideBtn = document.createElement("button");
      hideBtn.type = "button";
      hideBtn.className = "admin-btn-check";
      hideBtn.textContent = post.status === "hidden" ? "?ㅼ떆 ?쒖떆" : "?④린湲?;
      hideBtn.addEventListener("click", () =>
        updatePostStatus(post.id, post.status === "hidden" ? "open" : "hidden")
      );

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "admin-btn-danger admin-btn-danger--sm";
      delBtn.textContent = "??젣";
      delBtn.addEventListener("click", () => deletePost(post.id));

      actions.append(hideBtn, delBtn);
      li.appendChild(actions);
      fragment.appendChild(li);
    });

    els.feedbackList.appendChild(fragment);
  }

  async function loadFeedback() {
    setFeedbackStatus("遺덈윭?ㅻ뒗 以묅?);
    try {
      const res = await fetch(feedbackCfg.dataPath, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      feedbackData = await res.json();
      if (!Array.isArray(feedbackData.posts)) feedbackData = { posts: [] };
      renderFeedbackList();
      setFeedbackStatus("");
    } catch (err) {
      console.error(err);
      setFeedbackStatus("?섍껄 紐⑸줉??遺덈윭?ㅼ? 紐삵뻽?듬땲??", true);
    }
  }

  async function updatePostStatus(id, status) {
    if (!getToken()) return;
    try {
      feedbackData = await persistFeedback((json) => {
        const posts = Array.isArray(json.posts) ? json.posts : [];
        const idx = posts.findIndex((p) => p.id === id);
        if (idx === -1) throw new Error("??ぉ??李얠쓣 ???놁뒿?덈떎.");
        posts[idx] = { ...posts[idx], status };
        return { posts };
      }, `feedback: update ${id} ??${status}`);
      renderFeedbackList();
      setFeedbackStatus("??λ릺?덉뒿?덈떎.");
    } catch (err) {
      setFeedbackStatus(err.message || "????ㅽ뙣", true);
    }
  }

  async function deletePost(id) {
    if (!confirm("???섍껄????젣?섏떆寃좎뒿?덇퉴?")) return;
    try {
      feedbackData = await persistFeedback((json) => {
        const posts = (Array.isArray(json.posts) ? json.posts : []).filter((p) => p.id !== id);
        return { posts };
      }, `feedback: delete ${id}`);
      renderFeedbackList();
      setFeedbackStatus("??젣?섏뿀?듬땲??");
    } catch (err) {
      setFeedbackStatus(err.message || "??젣 ?ㅽ뙣", true);
    }
  }

  function switchTab(tab) {
    const isFeedback = tab === "feedback";
    const newBtn = document.getElementById("admin-new-btn");
    if (newBtn) newBtn.hidden = isFeedback;
    els.catalogView.hidden = isFeedback;
    els.catalogView.classList.toggle("is-hidden", isFeedback);
    els.feedbackView.hidden = !isFeedback;
    els.feedbackView.classList.toggle("is-hidden", !isFeedback);
    els.tabCatalog?.classList.toggle("is-active", !isFeedback);
    els.tabFeedback?.classList.toggle("is-active", isFeedback);
    if (isFeedback) loadFeedback();
  }

  els.tabCatalog?.addEventListener("click", () => switchTab("catalog"));
  els.tabFeedback?.addEventListener("click", () => switchTab("feedback"));

  window.HyotAdminFeedback = { reload: loadFeedback, switchTab };
})();
