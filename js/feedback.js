/**
 * HyoT — 의견 게시판 (Firebase Firestore)
 */
(function () {
  const cfg = window.HYOT_FEEDBACK_CONFIG;
  const fb = window.HyotFirebaseFeedback;
  if (!cfg || !fb) return;

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
    readyHint: document.getElementById("feedback-ready-hint"),
    setupHint: document.getElementById("feedback-setup-hint"),
  };

  if (!els.form) return;

  let boardReady = false;

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

  function refreshSubmitButton(hasOptions = utilityTargets.size > 0) {
    if (!els.submit) return;
    els.submit.disabled = !hasOptions || !boardReady;
  }

  function updateSubmitMode() {
    if (els.readyHint) els.readyHint.hidden = !boardReady;
    if (els.setupHint) els.setupHint.hidden = boardReady;
    if (els.submit) els.submit.textContent = "의견 등록";
    refreshSubmitButton();
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
    refreshSubmitButton(hasOptions);

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
    if (!boardReady) return;
    try {
      const posts = await fb.listPosts();
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

    const body = els.body.value.trim();
    const author = els.author.value.trim() || "익명";
    const category = els.category.value;
    const categoryLabel = categoryMap[category] || category;
    const title = `[${categoryLabel}] ${target.utilityLabel}`;

    if (body.length < 10) {
      setStatus("내용을 10자 이상 입력해 주세요.", true);
      els.body.focus();
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
      category,
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

    if (!boardReady) {
      setStatus("게시판이 아직 연결되지 않았습니다. docs/feedback-firebase-setup.md 를 참고해 주세요.", true);
      return;
    }

    const last = Number(sessionStorage.getItem(COOLDOWN_KEY) || 0);
    if (Date.now() - last < cfg.limits.submitCooldownMs) {
      setStatus("잠시 후 다시 등록해 주세요. (1분 간격)", true);
      return;
    }

    const post = validateForm();
    if (!post) return;

    els.submit.disabled = true;

    try {
      setStatus("등록 중입니다… 잠시만 기다려 주세요.");
      await fb.addPost(post);
      sessionStorage.setItem(COOLDOWN_KEY, String(Date.now()));
      els.form.reset();
      await loadCatalog();
      setStatus("의견이 등록되었습니다. 감사합니다!");
      await loadPosts();
    } catch (err) {
      console.error("[HyoT feedback submit]", err);
      const code = err?.code || "";
      if (code === "permission-denied") {
        setStatus("등록이 거부되었습니다. Firestore 보안 규칙을 확인해 주세요.", true);
      } else {
        setStatus("등록에 실패했습니다. 잠시 후 다시 시도해 주세요.", true);
      }
    } finally {
      refreshSubmitButton();
    }
  }

  async function boot() {
    if (!fb.isConfigured()) {
      boardReady = false;
      updateSubmitMode();
      setStatus("게시판 연결 설정이 필요합니다. (Firebase)", true);
      return;
    }

    try {
      await fb.init();
      boardReady = true;
      updateSubmitMode();
      await loadPosts();
    } catch (err) {
      console.error("[HyoT feedback boot]", err);
      boardReady = false;
      updateSubmitMode();
      setStatus("게시판을 불러오지 못했습니다.", true);
    }
  }

  updateSubmitMode();
  els.form.addEventListener("submit", onSubmit);
  loadCatalog();
  boot();
})();
