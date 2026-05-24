/**
 * HyoT — 의견 게시판 (개선·버그 제보)
 */
(function () {
  const cfg = window.HYOT_FEEDBACK_CONFIG;
  if (!cfg) return;

  const gh = cfg.github;
  const token = window.HYOT_FEEDBACK_TOKEN;
  const COOLDOWN_KEY = "hyot_feedback_last_submit";

  const platforms = window.HYOT_PLATFORMS || {};
  const PLATFORMS = platforms.list || [];
  const { migrateUtility, getPlatformFile, hasExternalLink, isValidUtility } = platforms;

  const els = {
    form: document.getElementById("feedback-form"),
    list: document.getElementById("feedback-list"),
    empty: document.getElementById("feedback-empty"),
    status: document.getElementById("feedback-status"),
    utility: document.getElementById("feedback-utility"),
    category: document.getElementById("feedback-category"),
    body: document.getElementById("feedback-body"),
    author: document.getElementById("feedback-author"),
    submit: document.getElementById("feedback-submit"),
    githubHint: document.getElementById("feedback-github-hint"),
    githubLink: document.getElementById("feedback-github-link"),
  };

  if (!els.form) return;

  const categoryMap = Object.fromEntries(
    (cfg.categories || []).map((c) => [c.id, c.label])
  );

  /** @type {Map<string, { utilityId: string, utilityName: string, platformId: string, platformLabel: string, fileName: string, utilityLabel: string }>} */
  const utilityTargets = new Map();

  function setStatus(message, isError = false) {
    if (!els.status) return;
    els.status.textContent = message;
    els.status.classList.toggle("feedback-status--error", isError);
    els.status.hidden = !message;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  }

  function deployBranches() {
    const primary = String(gh.branch || "main").trim() || "main";
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

  async function api(path, options = {}, authToken = token) {
    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
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
    const data = await api(
      `/repos/${gh.owner}/${gh.repo}/contents/${cfg.dataPath}?ref=${ref}`,
      {},
      token || undefined
    );
    const text = new TextDecoder().decode(
      Uint8Array.from(atob(data.content.replace(/\s/g, "")), (c) => c.charCodeAt(0))
    );
    const json = JSON.parse(text);
    return { json, sha: data.sha };
  }

  async function writeFeedback(json, sha, message, branch, authToken) {
    const text = JSON.stringify(json, null, 2) + "\n";
    const body = {
      message,
      content: uint8ToBase64(new TextEncoder().encode(text)),
      branch,
      sha,
    };
    await api(
      `/repos/${gh.owner}/${gh.repo}/contents/${cfg.dataPath}`,
      { method: "PUT", body: JSON.stringify(body) },
      authToken
    );
  }

  function isShaConflict(err) {
    return /does not match|sha was supplied|409|Conflict/i.test(String(err?.message || err));
  }

  async function persistNewPost(post) {
    if (!token) throw new Error("NO_TOKEN");
    const branches = deployBranches();
    for (const branch of branches) {
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const { json, sha } = await readFeedback(branch);
          const posts = Array.isArray(json.posts) ? json.posts : [];
          posts.unshift(post);
          await writeFeedback({ posts }, sha, `feedback: ${post.title}`, branch, token);
          break;
        } catch (err) {
          if (!isShaConflict(err) || attempt === 3) throw err;
          await new Promise((r) => setTimeout(r, 120 * (attempt + 1)));
        }
      }
    }
  }

  function buildGithubIssueUrl(post) {
    const label = categoryMap[post.category] || post.category;
    const title = encodeURIComponent(`[${label}] ${post.title}`);
    const body = encodeURIComponent(
      [
        `**대상 프로그램:** ${post.utilityLabel || post.utilityName || "-"}`,
        `**분류:** ${label}`,
        `**작성자:** ${post.author}`,
        "",
        post.body,
        "",
        "---",
        "_HyoT 자료실 의견 게시판에서 전송됨_",
      ].join("\n")
    );
    return `https://github.com/${gh.owner}/${gh.repo}/issues/new?title=${title}&body=${body}&labels=feedback`;
  }

  function buildUtilityTargets(utilities = []) {
    utilityTargets.clear();
    if (!els.utility) return;

    const fragment = document.createDocumentFragment();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "관련 프로그램·파일을 선택하세요";
    fragment.appendChild(placeholder);

    utilities.forEach((item) => {
      let added = false;
      PLATFORMS.forEach((p) => {
        const pf = getPlatformFile?.(item, p.id);
        if (!pf) return;
        added = true;
        const key = `${item.id}|${p.id}`;
        const fileName = pf.fileName || pf.file.split("/").pop() || "";
        const utilityLabel = `${item.name} — ${p.label} (${fileName})`;
        utilityTargets.set(key, {
          utilityId: item.id,
          utilityName: item.name,
          platformId: p.id,
          platformLabel: p.label,
          fileName,
          utilityLabel,
        });
        const opt = document.createElement("option");
        opt.value = key;
        opt.textContent = utilityLabel;
        fragment.appendChild(opt);
      });

      if (!added && hasExternalLink?.(item)) {
        const key = `${item.id}|link`;
        const linkLabel = item.linkLabel || "바로가기";
        const utilityLabel = `${item.name} — ${linkLabel}`;
        utilityTargets.set(key, {
          utilityId: item.id,
          utilityName: item.name,
          platformId: "link",
          platformLabel: linkLabel,
          fileName: "",
          utilityLabel,
        });
        const opt = document.createElement("option");
        opt.value = key;
        opt.textContent = utilityLabel;
        fragment.appendChild(opt);
      }
    });

    els.utility.replaceChildren(fragment);
    const hasOptions = utilityTargets.size > 0;
    els.utility.disabled = !hasOptions;
    if (els.submit) els.submit.disabled = !hasOptions;

    if (!hasOptions) {
      setStatus("등록된 프로그램·파일이 없어 의견을 남길 수 없습니다.", true);
    }
  }

  async function loadCatalog() {
    if (!migrateUtility || !isValidUtility) {
      buildUtilityTargets([]);
      return;
    }
    try {
      const res = await fetch(cfg.catalogPath || "data/data.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const utilities = (data.utilities || []).map(migrateUtility).filter(isValidUtility);
      buildUtilityTargets(utilities);
    } catch (err) {
      console.error("[HyoT feedback catalog]", err);
      buildUtilityTargets([]);
      setStatus("프로그램 목록을 불러오지 못했습니다.", true);
    }
  }

  function updateSubmitMode() {
    const canDirect = Boolean(token);
    if (els.githubHint) els.githubHint.hidden = canDirect;
    if (els.submit) {
      els.submit.textContent = canDirect ? "의견 등록" : "GitHub으로 등록하기";
    }
  }

  function renderPosts(posts) {
    if (!els.list) return;
    const openPosts = posts.filter((p) => p.status !== "hidden");
    els.list.replaceChildren();

    if (!openPosts.length) {
      if (els.empty) els.empty.hidden = false;
      return;
    }

    if (els.empty) els.empty.hidden = true;

    const fragment = document.createDocumentFragment();
    openPosts.forEach((post) => {
      const li = document.createElement("li");
      li.className = "feedback-item";
      if (post.status === "resolved") li.classList.add("feedback-item--resolved");

      const cat = document.createElement("span");
      cat.className = `feedback-item__category feedback-item__category--${post.category}`;
      cat.textContent = categoryMap[post.category] || post.category;

      const heading = document.createElement("h3");
      heading.className = "feedback-item__title";
      heading.textContent = post.utilityLabel || post.utilityName || post.title || "의견";

      const meta = document.createElement("p");
      meta.className = "feedback-item__meta";
      const statusLabel = post.status === "resolved" ? " · 처리 완료" : "";
      meta.textContent = `${post.author || "익명"} · ${formatDate(post.createdAt)}${statusLabel}`;

      const body = document.createElement("p");
      body.className = "feedback-item__body";
      body.textContent = post.body;

      li.append(cat, heading, meta, body);
      fragment.appendChild(li);
    });

    els.list.appendChild(fragment);
  }

  async function loadPosts() {
    try {
      const res = await fetch(cfg.dataPath, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const posts = Array.isArray(data.posts) ? data.posts : [];
      posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      renderPosts(posts);
    } catch (err) {
      console.error("[HyoT feedback]", err);
      setStatus("의견 목록을 불러오지 못했습니다.", true);
    }
  }

  function validateForm() {
    const utilityKey = els.utility?.value || "";
    const target = utilityTargets.get(utilityKey);
    if (!target) {
      setStatus("관련 프로그램·파일을 선택해 주세요.", true);
      els.utility?.focus();
      return null;
    }

    const title = els.title.value.trim();
    const body = els.body.value.trim();
    const author = els.author.value.trim() || "익명";

    if (title.length < 2) {
      setStatus("제목을 2자 이상 입력해 주세요.", true);
      els.title.focus();
      return null;
    }
    if (body.length < 10) {
      setStatus("내용을 10자 이상 입력해 주세요.", true);
      els.body.focus();
      return null;
    }
    if (title.length > cfg.limits.titleMax) {
      setStatus(`제목은 ${cfg.limits.titleMax}자 이하로 입력해 주세요.`, true);
      return null;
    }
    if (body.length > cfg.limits.bodyMax) {
      setStatus(`내용은 ${cfg.limits.bodyMax}자 이하로 입력해 주세요.`, true);
      return null;
    }
    if (author.length > cfg.limits.authorMax) {
      setStatus(`이름은 ${cfg.limits.authorMax}자 이하로 입력해 주세요.`, true);
      return null;
    }

    return {
      id: `fb-${Date.now()}`,
      category: els.category.value,
      utilityId: target.utilityId,
      utilityName: target.utilityName,
      platformId: target.platformId,
      platformLabel: target.platformLabel,
      fileName: target.fileName,
      utilityLabel: target.utilityLabel,
      title,
      body,
      author,
      createdAt: new Date().toISOString(),
      status: "open",
    };
  }

  async function onSubmit(event) {
    event.preventDefault();
    setStatus("");

    const last = Number(sessionStorage.getItem(COOLDOWN_KEY) || 0);
    if (Date.now() - last < cfg.limits.submitCooldownMs) {
      setStatus("잠시 후 다시 등록해 주세요. (1분 간격)", true);
      return;
    }

    const post = validateForm();
    if (!post) return;

    els.submit.disabled = true;

    try {
      if (token) {
        await persistNewPost(post);
        sessionStorage.setItem(COOLDOWN_KEY, String(Date.now()));
        els.form.reset();
        setStatus("의견이 등록되었습니다. 감사합니다!");
        await loadPosts();
      } else {
        const url = buildGithubIssueUrl(post);
        if (els.githubLink) els.githubLink.href = url;
        window.open(url, "_blank", "noopener,noreferrer");
        setStatus(
          "GitHub 이슈 작성 페이지가 열렸습니다. 로그인 후 제출하면 관리자가 확인합니다.",
          false
        );
      }
    } catch (err) {
      console.error("[HyoT feedback submit]", err);
      if (String(err.message) === "NO_TOKEN") {
        const url = buildGithubIssueUrl(post);
        window.open(url, "_blank", "noopener,noreferrer");
        setStatus("GitHub으로 등록 페이지를 열었습니다.", false);
      } else {
        setStatus("등록에 실패했습니다. 잠시 후 다시 시도해 주세요.", true);
      }
    } finally {
      els.submit.disabled = false;
    }
  }

  updateSubmitMode();
  els.form.addEventListener("submit", onSubmit);
  loadCatalog();
  loadPosts();
})();
