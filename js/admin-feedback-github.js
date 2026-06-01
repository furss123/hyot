/**
 * HyoT 관리자 — 의견 게시판 (GitHub, Firebase 미설정 시)
 */
(function () {
  if (window.HyotFirebaseFeedback?.isConfigured?.()) return;

  const cfg = window.HYOT_ADMIN_CONFIG;
  const feedbackCfg = window.HYOT_FEEDBACK_CONFIG;
  if (!cfg || !feedbackCfg) return;

  const STORAGE_TOKEN = "hyot_github_token";

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

  function requireToken() {
    if (!getToken()) {
      throw new Error("GitHub 로그인이 필요합니다. 관리자 로그인 후 다시 시도하세요.");
    }
  }

  function setFeedbackStatus(message, isError = false) {
    if (!els.feedbackStatus) return;
    els.feedbackStatus.textContent = message;
    els.feedbackStatus.classList.toggle("admin-toast--error", isError);
    els.feedbackStatus.hidden = !message;
  }

  function feedbackBranch() {
    return String(cfg.github.branch || "main").trim() || "main";
  }

  function deployBranches() {
    return [feedbackBranch()];
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
    requireToken();
    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: `Bearer ${getToken()}`,
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
    if (Number.isNaN(d.getTime())) return iso || "";
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  }

  function statusLabel(status) {
    if (status === "resolved") return "처리 완료";
    if (status === "hidden") return "숨김";
    return "접수";
  }

  function screenshotMimeFromPath(path) {
    if (String(path).endsWith(".png")) return "image/png";
    if (String(path).endsWith(".webp")) return "image/webp";
    return "image/jpeg";
  }

  async function loadScreenshotInto(img, path) {
    if (!path || !getToken()) return;
    try {
      const ref = encodeURIComponent(feedbackBranch());
      const data = await api(
        `/repos/${cfg.github.owner}/${cfg.github.repo}/contents/${path}?ref=${ref}`
      );
      const b64 = String(data.content || "").replace(/\s/g, "");
      img.src = `data:${screenshotMimeFromPath(path)};base64,${b64}`;
    } catch {
      img.alt = "스크린샷을 불러오지 못했습니다";
    }
  }

  async function deleteRepoFile(path, message) {
    const ref = encodeURIComponent(feedbackBranch());
    const meta = await api(
      `/repos/${cfg.github.owner}/${cfg.github.repo}/contents/${path}?ref=${ref}`
    );
    await api(
      `/repos/${cfg.github.owner}/${cfg.github.repo}/contents/${path}`,
      {
        method: "DELETE",
        body: JSON.stringify({
          message,
          sha: meta.sha,
          branch: feedbackBranch(),
        }),
      }
    );
  }

  function renderFeedbackList() {
    const posts = [...(feedbackData.posts || [])].sort(
      (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
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
      cat.className = `feedback-item__category feedback-item__category--${post.category || "other"}`;
      cat.textContent = categoryMap[post.category] || post.category || "기타";

      const title = document.createElement("strong");
      title.className = "admin-feedback-item__title";
      title.textContent = post.utilityLabel || post.utilityName || post.title || "의견";

      head.append(cat, title);

      const meta = document.createElement("p");
      meta.className = "admin-feedback-item__meta";
      meta.textContent = `${post.author || "익명"} · ${formatDate(post.createdAt)} · ${statusLabel(post.status)}`;

      const body = document.createElement("p");
      body.className = "admin-feedback-item__body";
      body.textContent = post.body || "";

      if (post.utilityLabel || post.utilityName) {
        const target = document.createElement("p");
        target.className = "admin-feedback-item__target";
        target.textContent = post.utilityLabel || post.utilityName;
        li.append(head, target, meta, body);
      } else {
        li.append(head, meta, body);
      }

      if (post.screenshotPath || post.hasScreenshot) {
        const shotWrap = document.createElement("div");
        shotWrap.className = "admin-feedback-item__screenshot";
        const shotImg = document.createElement("img");
        shotImg.className = "admin-feedback-item__screenshot-img";
        shotImg.alt = "첨부 스크린샷";
        shotImg.loading = "lazy";
        shotWrap.appendChild(shotImg);
        li.appendChild(shotWrap);
        if (post.screenshotPath) loadScreenshotInto(shotImg, post.screenshotPath);
      }

      const actions = document.createElement("div");
      actions.className = "admin-feedback-item__actions";

      if (post.status !== "resolved") {
        const resolveBtn = document.createElement("button");
        resolveBtn.type = "button";
        resolveBtn.className = "admin-btn-check";
        resolveBtn.textContent = "처리 완료";
        resolveBtn.addEventListener("click", () => updatePostStatus(post.id, "resolved"));
        actions.appendChild(resolveBtn);
      } else {
        const reopenBtn = document.createElement("button");
        reopenBtn.type = "button";
        reopenBtn.className = "admin-btn-check";
        reopenBtn.textContent = "다시 열기";
        reopenBtn.addEventListener("click", () => updatePostStatus(post.id, "open"));
        actions.appendChild(reopenBtn);
      }

      const hideBtn = document.createElement("button");
      hideBtn.type = "button";
      hideBtn.className = "admin-btn-check";
      hideBtn.textContent = post.status === "hidden" ? "다시 표시" : "숨기기";
      hideBtn.addEventListener("click", () =>
        updatePostStatus(post.id, post.status === "hidden" ? "open" : "hidden")
      );

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "admin-btn-danger admin-btn-danger--sm";
      delBtn.textContent = "삭제";
      delBtn.setAttribute("aria-label", "의견 삭제");
      delBtn.addEventListener("click", () => deletePost(post.id));

      actions.append(hideBtn, delBtn);
      li.appendChild(actions);
      fragment.appendChild(li);
    });

    els.feedbackList.appendChild(fragment);
  }

  async function loadFeedback() {
    if (!getToken()) {
      setFeedbackStatus("GitHub 로그인이 필요합니다.", true);
      return;
    }
    setFeedbackStatus("불러오는 중…");
    try {
      const { json } = await readFeedback(feedbackBranch());
      feedbackData = json;
      if (!Array.isArray(feedbackData.posts)) feedbackData = { posts: [] };
      renderFeedbackList();
      setFeedbackStatus("");
    } catch (err) {
      console.error(err);
      setFeedbackStatus(err.message || "의견 목록을 불러오지 못했습니다.", true);
    }
  }

  async function updatePostStatus(id, status) {
    if (!getToken()) {
      setFeedbackStatus("GitHub 로그인이 필요합니다.", true);
      return;
    }
    try {
      const next = await persistFeedback((json) => {
        const posts = Array.isArray(json.posts) ? [...json.posts] : [];
        const idx = posts.findIndex((p) => p.id === id);
        if (idx === -1) throw new Error("항목을 찾을 수 없습니다.");
        posts[idx] = { ...posts[idx], status };
        return { ...json, posts };
      }, `feedback: update ${id} → ${status}`);
      if (next) feedbackData = next;
      renderFeedbackList();
      setFeedbackStatus("저장되었습니다.");
    } catch (err) {
      setFeedbackStatus(err.message || "저장 실패", true);
    }
  }

  async function deletePost(id) {
    if (!getToken()) {
      setFeedbackStatus("GitHub 로그인이 필요합니다.", true);
      return;
    }
    if (!confirm("이 의견을 삭제하시겠습니까? 삭제 후에는 복구할 수 없습니다.")) return;
    try {
      const target = (feedbackData.posts || []).find((p) => p.id === id);
      const next = await persistFeedback((json) => {
        const posts = (Array.isArray(json.posts) ? json.posts : []).filter((p) => p.id !== id);
        if (posts.length === (json.posts || []).length) {
          throw new Error("항목을 찾을 수 없습니다.");
        }
        return { ...json, posts };
      }, `feedback: delete ${id}`);
      if (target?.screenshotPath) {
        try {
          await deleteRepoFile(target.screenshotPath, `feedback: delete attachment ${id}`);
        } catch {
          /* attachment may already be missing */
        }
      }
      if (next) feedbackData = next;
      renderFeedbackList();
      setFeedbackStatus("삭제되었습니다.");
    } catch (err) {
      setFeedbackStatus(err.message || "삭제 실패", true);
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
