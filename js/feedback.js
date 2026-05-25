/**
 * HyoT — 의견 게시판 (등록만 공개, 목록은 관리자 전용)
 */
(function () {
  const cfg = window.HYOT_FEEDBACK_CONFIG;
  const fb = window.HyotFirebaseFeedback;
  const relay = window.HyotFeedbackRelay;
  const ghBackend = window.HyotFeedbackGithub;
  if (!cfg) return;

  const COOLDOWN_KEY = "hyot_feedback_last_submit";

  const platforms = window.HYOT_PLATFORMS || {};
  const PLATFORMS = platforms.list || [];
  const { migrateUtility, getPlatformFile, hasExternalLink, isValidUtility } = platforms;

  const els = {
    cta: document.getElementById("feedback-cta"),
    compose: document.getElementById("feedback-compose"),
    openBtn: document.getElementById("feedback-open-btn"),
    closeBtn: document.getElementById("feedback-close-btn"),
    form: document.getElementById("feedback-form"),
    status: document.getElementById("feedback-status"),
    utility: document.getElementById("feedback-utility"),
    category: document.getElementById("feedback-category"),
    body: document.getElementById("feedback-body"),
    submit: document.getElementById("feedback-submit"),
    screenshot: document.getElementById("feedback-screenshot"),
    screenshotPreview: document.getElementById("feedback-screenshot-preview"),
    screenshotImg: document.getElementById("feedback-screenshot-img"),
    screenshotClear: document.getElementById("feedback-screenshot-clear"),
    readyHint: document.getElementById("feedback-ready-hint"),
    setupHint: document.getElementById("feedback-setup-hint"),
  };

  if (!els.form) return;

  let boardReady = false;
  let useGithub = false;
  let useRelay = false;
  let pendingScreenshot = null;

  const categoryMap = Object.fromEntries(
    (cfg.categories || []).map((c) => [c.id, c.label])
  );

  const utilityTargets = new Map();

  function setStatus(message, isError = false) {
    if (!els.status) return;
    els.status.textContent = message;
    els.status.classList.toggle("feedback-status--error", isError);
    els.status.hidden = !message;
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
    if (els.openBtn) els.openBtn.disabled = !boardReady;
  }

  function isComposeOpen() {
    return els.compose && !els.compose.hidden;
  }

  function openCompose(options = {}) {
    if (!els.compose || !els.cta) return;
    els.compose.hidden = false;
    els.cta.hidden = true;
    if (els.openBtn) {
      els.openBtn.setAttribute("aria-expanded", "true");
    }
    if (options.focus !== false) {
      requestAnimationFrame(() => {
        const target = els.utility && !els.utility.disabled ? els.utility : els.body;
        target?.focus();
      });
    }
    if (options.scroll !== false) {
      els.compose.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function closeCompose() {
    if (!els.compose || !els.cta) return;
    els.compose.hidden = true;
    els.cta.hidden = false;
    if (els.openBtn) {
      els.openBtn.setAttribute("aria-expanded", "false");
      els.openBtn.focus();
    }
    if (location.hash === "#feedback-write") {
      history.replaceState(null, "", `${location.pathname}${location.search}`);
    }
  }

  function maybeOpenComposeFromHash() {
    if (location.hash === "#feedback-write") {
      openCompose({ scroll: true });
    }
  }

  function clearScreenshotPreview() {
    pendingScreenshot = null;
    if (els.screenshot) els.screenshot.value = "";
    if (els.screenshotImg) els.screenshotImg.removeAttribute("src");
    if (els.screenshotPreview) els.screenshotPreview.hidden = true;
  }

  function showScreenshotPreview(dataUrl) {
    if (!els.screenshotPreview || !els.screenshotImg) return;
    els.screenshotImg.src = dataUrl;
    els.screenshotPreview.hidden = false;
  }

  function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("image_load_failed"));
      };
      img.src = url;
    });
  }

  function canvasToJpegBlob(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("encode_failed"))),
        "image/jpeg",
        quality
      );
    });
  }

  async function compressScreenshot(file) {
    const maxInput = cfg.limits.screenshotMaxInputBytes || 2 * 1024 * 1024;
    const maxOut = cfg.limits.screenshotMaxOutputBytes || 420000;
    const maxDim = cfg.limits.screenshotMaxDimension || 1280;
    let quality = cfg.limits.screenshotQuality ?? 0.82;

    if (!file.type.startsWith("image/")) {
      throw new Error("이미지 파일만 첨부할 수 있습니다.");
    }
    if (file.size > maxInput) {
      throw new Error("스크린샷은 2MB 이하로 선택해 주세요.");
    }

    const img = await loadImageFromFile(file);
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    const scale = Math.min(1, maxDim / Math.max(w, h));
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_unavailable");
    ctx.drawImage(img, 0, 0, w, h);

    let blob = await canvasToJpegBlob(canvas, quality);
    while (blob.size > maxOut && quality > 0.45) {
      quality -= 0.08;
      blob = await canvasToJpegBlob(canvas, quality);
    }
    if (blob.size > maxOut) {
      throw new Error("스크린샷이 너무 큽니다. 더 작은 이미지를 선택해 주세요.");
    }

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("read_failed"));
      reader.readAsDataURL(blob);
    });

    const base64 = String(dataUrl).split(",")[1] || "";
    return {
      screenshotMime: "image/jpeg",
      screenshotBase64: base64,
      previewDataUrl: dataUrl,
      screenshotBytes: blob.size,
    };
  }

  async function onScreenshotChange() {
    const file = els.screenshot?.files?.[0];
    if (!file) {
      clearScreenshotPreview();
      return;
    }
    try {
      setStatus("스크린샷 처리 중…");
      pendingScreenshot = await compressScreenshot(file);
      showScreenshotPreview(pendingScreenshot.previewDataUrl);
      setStatus("");
    } catch (err) {
      clearScreenshotPreview();
      setStatus(err.message || "스크린샷을 처리하지 못했습니다.", true);
    }
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
      const data = window.HYOT_CATALOG_SYNC
        ? await window.HYOT_CATALOG_SYNC.fetchCatalog({ cacheBust: Date.now() })
        : await (async () => {
            const res = await fetch(cfg.catalogPath || "data/data.json", { cache: "no-store" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
          })();
      const utilities = (data.utilities || []).map(migrateUtility).filter(isValidUtility);
      buildUtilityTargets(utilities);
    } catch (err) {
      console.error("[HyoT feedback catalog]", err);
      buildUtilityTargets([]);
      setStatus("프로그램 목록을 불러오지 못했습니다.", true);
    }
  }

  window.HYOT_CATALOG_SYNC?.subscribeCatalogUpdates?.(loadCatalog);

  function validateForm() {
    const utilityKey = els.utility?.value || "";
    const target = utilityTargets.get(utilityKey);
    if (!target) {
      setStatus("관련 프로그램·파일을 선택해 주세요.", true);
      els.utility?.focus();
      return null;
    }

    const body = els.body.value.trim();
    const author = "익명";
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
    const post = {
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
      visibility: "admin",
    };

    if (pendingScreenshot?.screenshotBase64) {
      post.screenshotMime = pendingScreenshot.screenshotMime;
      post.screenshotBase64 = pendingScreenshot.screenshotBase64;
      post.hasScreenshot = true;
    }

    return post;
  }

  async function onSubmit(event) {
    event.preventDefault();
    setStatus("");

    if (!boardReady) {
      setStatus("게시판이 아직 연결되지 않았습니다. 관리자에게 문의해 주세요.", true);
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
      if (useRelay) await relay.submitFeedback(post);
      else if (useGithub) await ghBackend.submitFeedback(post);
      else await fb.addPost(post);
      sessionStorage.setItem(COOLDOWN_KEY, String(Date.now()));
      els.form.reset();
      clearScreenshotPreview();
      await loadCatalog();
      setStatus("의견이 등록되었습니다. 관리자가 확인합니다. 감사합니다!");
    } catch (err) {
      console.error("[HyoT feedback submit]", err);
      const code = err?.code || "";
      if (code === "permission-denied") {
        setStatus("등록이 거부되었습니다. Firestore 보안 규칙을 확인해 주세요.", true);
      } else {
        setStatus(err.message || "등록에 실패했습니다. 잠시 후 다시 시도해 주세요.", true);
      }
    } finally {
      refreshSubmitButton();
    }
  }

  async function boot() {
    if (fb?.isConfigured?.()) {
      try {
        await fb.init();
        boardReady = true;
        useGithub = false;
        updateSubmitMode();
        return;
      } catch (err) {
        console.warn("[HyoT feedback] Firebase init failed:", err);
      }
    }

    if (relay?.isReady?.()) {
      boardReady = true;
      useRelay = true;
      updateSubmitMode();
      return;
    }

    if (ghBackend?.canSubmit?.()) {
      boardReady = true;
      useGithub = true;
      updateSubmitMode();
      return;
    }

    boardReady = false;
    updateSubmitMode();
    setStatus(
      "게시판 연결이 필요합니다. Firebase 또는 피드백 릴레이(Cloudflare Worker) 설정을 완료해 주세요.",
      true
    );
  }

  updateSubmitMode();
  els.form.addEventListener("submit", onSubmit);
  els.screenshot?.addEventListener("change", onScreenshotChange);
  els.screenshotClear?.addEventListener("click", clearScreenshotPreview);
  els.openBtn?.addEventListener("click", () => openCompose());
  els.closeBtn?.addEventListener("click", closeCompose);
  window.addEventListener("hashchange", maybeOpenComposeFromHash);
  loadCatalog();
  boot().then(() => maybeOpenComposeFromHash());
})();
