/**
 * HyoT 관리자 — 목록 · 등록 · 수정 · 삭제
 */

(function () {
  const STORAGE_TOKEN = "hyot_github_token";
  const STORAGE_SESSION = "hyot_admin_session";

  const LS_REMEMBER = "hyot_remember_credentials";
  const LS_AUTO_LOGIN = "hyot_auto_login";
  const LS_SAVED_ID = "hyot_saved_id";
  const LS_SAVED_PW = "hyot_saved_pw";
  const LS_SAVED_TOKEN = "hyot_saved_token";

  const cfg = window.HYOT_ADMIN_CONFIG;
  const secrets = window.HYOT_ADMIN_SECRETS;
  const {
    list: PLATFORMS,
    migrateUtility,
    getPlatformFile,
    getRawPlatformFile,
    isRepoDownloadPath,
    normalizeRepoDownloadPath,
    hasPlatformDownload,
  } = window.HYOT_PLATFORMS || { list: [] };
  const MAX_ICON_BYTES = 2 * 1024 * 1024;
  const MAX_DOWNLOAD_BYTES = 95 * 1024 * 1024;
  const ICON_ACCEPT_RE = /\.(png|svg|webp|jpe?g|ico)$/i;
  const DOWNLOAD_ACCEPT_RE = /\.(exe|msi|zip|7z)$/i;

  if (!cfg) return;

  const $ = (id) => document.getElementById(id);

  const els = {
    loginView: $("admin-login-view"),
    panelView: $("admin-panel-view"),
    loginForm: $("admin-login-form"),
    loginError: $("admin-login-error"),
    loginSubmit: $("admin-login-submit"),
    remember: $("admin-remember"),
    autoLogin: $("admin-auto-login"),
    panelStatus: $("admin-panel-status"),
    newBtn: $("admin-new-btn"),
    logoutBtn: $("admin-logout-btn"),
    itemList: $("admin-item-list"),
    listEmpty: $("admin-list-empty"),
    editorBadge: $("admin-editor-badge"),
    fileRequired: $("admin-file-required"),
    form: $("admin-utility-form"),
    name: $("admin-name"),
    description: $("admin-description"),
    updatedAt: $("admin-updated-at"),
    downloadFile: $("admin-download-file"),
    downloadDisplay: $("admin-download-display"),
    downloadCurrent: $("admin-download-current"),
    downloadFileName: $("admin-download-filename"),
    downloadFileSize: $("admin-download-filesize"),
    downloadManual: $("admin-download-manual"),
    downloadPath: $("admin-download-path"),
    downloadPathWrap: $("admin-download-path-wrap"),
    icon: $("admin-icon"),
    iconDisplay: $("admin-icon-display"),
    iconPreview: $("admin-icon-preview"),
    iconPreviewEmpty: $("admin-icon-preview-empty"),
    submitBtn: $("admin-submit-btn"),
    deleteBtn: $("admin-delete-btn"),
    platformStatus: $("admin-platform-status"),
  };

  let catalogData = null;
  let downloadStatsById = {};
  let selectedId = null;
  let saveProgressValue = 0;

  const isEdit = () => Boolean(selectedId);

  function mapSegment(start, end, inner0to100) {
    return start + (inner0to100 / 100) * (end - start);
  }

  function redirectToMainAfterSave() {
    const url = new URL("index.html", window.location.href);
    url.searchParams.set("saved", "1");
    window.location.replace(url.href);
  }

  function beginSaveProgress() {
    const btn = els.submitBtn;
    const label = btn.querySelector(".btn-save-progress__label");
    const defaultLabel = btn.dataset.defaultLabel || "저장";
    saveProgressValue = 0;
    btn.classList.add("is-saving");
    btn.disabled = true;

    const set = (pct) => {
      const next = Math.min(100, Math.max(saveProgressValue, Math.round(pct)));
      if (next < 1) return set(1);
      saveProgressValue = next;
      btn.style.setProperty("--save-progress", `${next}%`);
      if (label) label.textContent = `${next}%`;
    };

    const end = () => {
      btn.classList.remove("is-saving");
      btn.style.removeProperty("--save-progress");
      btn.disabled = false;
      if (label) label.textContent = defaultLabel;
      saveProgressValue = 0;
    };

    set(1);
    return { set, end, complete: () => set(100) };
  }
  const getItem = () => {
    const raw = catalogData?.utilities?.find((u) => u.id === selectedId) ?? null;
    return raw ? migrateUtility(raw) : null;
  };

  function getSelectedPlatform() {
    return "windows";
  }

  function getPlatformMeta(platformId) {
    return PLATFORMS.find((p) => p.id === platformId);
  }

  function platformFileSummary(pf) {
    if (!pf) return "";
    const name = pf.fileName || "다운로드";
    const size = pf.fileSize ? ` (${pf.fileSize})` : "";
    const file = String(pf.file || "").trim();
    if (!hasPlatformDownload(pf)) {
      return `${name}${size} · 파일 없음`;
    }
    const label = isRepoDownloadPath(file) ? "GitHub" : "외부 링크";
    return `${name}${size} · ${label}`;
  }

  function resetDownloadFields() {
    if (els.downloadFile) els.downloadFile.value = "";
    if (els.downloadDisplay) {
      els.downloadDisplay.textContent = "실행 파일 선택 (exe · msi · zip · 7z)";
    }
    if (els.downloadManual) els.downloadManual.checked = false;
    if (els.downloadPath) els.downloadPath.value = "";
    updateDownloadManualUI();
  }

  function updateDownloadManualUI() {
    const manual = Boolean(els.downloadManual?.checked);
    if (els.downloadPathWrap) els.downloadPathWrap.hidden = !manual;
    if (els.downloadFile?.closest(".admin-file-btn")) {
      els.downloadFile.closest(".admin-file-btn").hidden = manual;
    }
  }

  function syncDownloadFieldsFromItem(item) {
    resetDownloadFields();
    const pf = item ? getRawPlatformFile(item, getSelectedPlatform()) : null;
    if (els.downloadCurrent) {
      if (pf && hasPlatformDownload(pf)) {
        els.downloadCurrent.hidden = false;
        els.downloadCurrent.innerHTML = `등록됨: <code>${escapeHtml(pf.file)}</code>`;
      } else {
        els.downloadCurrent.hidden = true;
        els.downloadCurrent.textContent = "";
      }
    }
    if (els.downloadFileName) {
      els.downloadFileName.value = pf?.fileName || (pf?.file ? pf.file.split("/").pop() : "") || "";
    }
    if (els.downloadFileSize) els.downloadFileSize.value = pf?.fileSize || "";
    if (pf && isRepoDownloadPath(pf.file) && els.downloadPath) {
      els.downloadPath.value = pf.file;
    }
  }

  function readDownloadMetaFields(fallbackName = "다운로드") {
    return {
      fileName: els.downloadFileName?.value?.trim() || fallbackName,
      fileSize: els.downloadFileSize?.value?.trim() || "",
    };
  }

  function buildPlatformDataFromManualPath() {
    const path = normalizeRepoDownloadPath(els.downloadPath?.value?.trim() || "");
    const meta = readDownloadMetaFields(path.split("/").pop() || "다운로드");
    return { file: path, ...meta };
  }

  /** 표시명·용량만 바뀐 경우 기존 경로 유지 */
  function resolvePlatformMetaOnly(item) {
    const pf = item ? getRawPlatformFile(item, getSelectedPlatform()) : null;
    if (!pf || !hasPlatformDownload(pf)) return null;
    const meta = readDownloadMetaFields(pf.fileName || "다운로드");
    const nameSame = meta.fileName === String(pf.fileName || "").trim();
    const sizeSame = meta.fileSize === String(pf.fileSize || "").trim();
    if (nameSame && sizeSame) return null;
    return { file: pf.file, ...meta };
  }

  function slugFromFileName(fileName) {
    return (
      String(fileName)
        .replace(/\.[^.]+$/, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 48) || `item-${Date.now()}`
    );
  }

  function platformBadgesHtml(item) {
    return PLATFORMS.map((p) => {
      const on = getPlatformFile(item, p.id) ? " admin-platform-badge--on" : "";
      return `<span class="admin-platform-badge admin-platform-badge--${p.id}${on}" title="${escapeHtml(p.label)}">${escapeHtml(p.shortLabel)}</span>`;
    }).join("");
  }

  function updatePlatformStatus() {
    const box = els.platformStatus;
    if (!box) return;
    const item = getItem();
    if (!item) {
      box.hidden = true;
      box.replaceChildren();
      return;
    }
    box.hidden = false;
    box.replaceChildren();
    PLATFORMS.forEach((p) => {
      const pf = getRawPlatformFile(item, p.id);
      const row = document.createElement("p");
      row.className = `admin-platform-status__row${pf ? "" : " admin-platform-status__row--empty"}`;
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("class", "admin-platform-status__icon");
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("aria-hidden", "true");
      if (p.id === "windows") {
        icon.innerHTML =
          '<path fill="currentColor" d="M3 5.5 10.5 4.4V12H3V5.5Zm0 7.5h7.5v7.6L3 19.5V13Zm9.5-8.3L21 3.9v7.6h-8.5V4.7Zm0 9.3H21v7.6l-8.5-1.5V14Z"/>';
      } else {
        icon.innerHTML =
          '<path fill="currentColor" d="M8.2 3c.4 1.1.9 2.1 1.6 3.1-.9.3-1.8.8-2.5 1.4C6.4 5.8 5.5 4.5 5 3h3.2ZM16 3c-.5 1.5-1.4 2.8-2.3 3.9-.7-.6-1.6-1.1-2.5-1.4.7-1 1.2-2 1.6-3.1H16ZM7 8.2c1.2-.2 2.4-.2 3.6 0 1.2.2 2.3.6 3.4 1.2-1 .8-2.2 1.3-3.4 1.6-1.2.3-2.4.3-3.6 0-1.2-.3-2.4-.8-3.4-1.6 1.1-.6 2.2-1 3.4-1.2Zm-2.1 3.4c1 .9 2.2 1.5 3.5 1.8v5.1c-1.2-.4-2.2-1-3-1.9-.9-.9-1.5-2-1.8-3.2.5-.6 1-1.1 1.3-1.8Zm10.2 1.8c-.3 1.2-.9 2.3-1.8 3.2-.8.9-1.8 1.5-3 1.9v-5.1c1.3-.3 2.5-.9 3.5-1.8.3.7.8 1.2 1.3 1.8ZM12 14.8c1.2-.4 2.2-1 3-1.9.5 1.4.5 2.9 0 4.3-.8.4-1.7.6-2.6.7-.9.1-1.8.1-2.7 0-.9-.1-1.8-.3-2.6-.7-.5-1.4-.5-2.9 0-4.3.8.9 1.8 1.5 3 1.9Z"/>';
      }
      const text = document.createElement("span");
      text.textContent = pf
        ? `${p.label}: ${platformFileSummary(pf)}`
        : `${p.label}: 미등록`;
      row.append(icon, text);
      box.append(row);
    });
  }

  function buildUtilityPayload(base, { name, description, updatedAt, windows, icon, iconUpdatedAt }) {
    const out = {
      id: base.id,
      name,
      description,
      updatedAt,
    };
    if (windows) out.windows = windows;
    const iconPath = icon != null && icon !== "" ? icon : base?.icon;
    if (iconPath) out.icon = iconPath;
    if (iconUpdatedAt) out.iconUpdatedAt = iconUpdatedAt;
    else if (base?.iconUpdatedAt) out.iconUpdatedAt = base.iconUpdatedAt;
    return out;
  }

  function setView(mode) {
    const showPanel = mode === "panel";
    els.loginView.hidden = showPanel;
    els.panelView.hidden = !showPanel;
    els.loginView.classList.toggle("is-hidden", showPanel);
    els.panelView.classList.toggle("is-hidden", !showPanel);
  }

  function toast(msg, isError = false) {
    if (!msg) {
      els.panelStatus.hidden = true;
      els.panelStatus.textContent = "";
      return;
    }
    els.panelStatus.hidden = false;
    els.panelStatus.textContent = msg;
    els.panelStatus.classList.toggle("admin-toast--error", isError);
  }

  function encodeSecret(text) {
    return btoa(String.fromCharCode(...new TextEncoder().encode(text)));
  }

  function decodeSecret(encoded) {
    const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function saveCredentials(id, password, token) {
    localStorage.setItem(LS_SAVED_ID, id);
    localStorage.setItem(LS_SAVED_PW, encodeSecret(password));
    localStorage.setItem(LS_SAVED_TOKEN, token);
    localStorage.setItem(LS_REMEMBER, "1");
  }

  function clearSavedCredentials() {
    localStorage.removeItem(LS_SAVED_ID);
    localStorage.removeItem(LS_SAVED_PW);
    localStorage.removeItem(LS_SAVED_TOKEN);
    localStorage.removeItem(LS_REMEMBER);
  }

  function loadSavedCredentials() {
    if (localStorage.getItem(LS_REMEMBER) !== "1") return null;
    const id = localStorage.getItem(LS_SAVED_ID);
    const pw = localStorage.getItem(LS_SAVED_PW);
    const token = localStorage.getItem(LS_SAVED_TOKEN);
    if (!id || !pw || !token) return null;
    try {
      return { id, password: decodeSecret(pw), token };
    } catch {
      return null;
    }
  }

  function fillLoginForm(creds) {
    if (!creds) return;
    $("admin-id").value = creds.id;
    $("admin-password").value = creds.password;
    $("admin-token").value = creds.token;
  }

  function applyRememberPreferences() {
    const remember = localStorage.getItem(LS_REMEMBER) === "1";
    const auto = localStorage.getItem(LS_AUTO_LOGIN) === "1";
    els.remember.checked = remember;
    els.autoLogin.checked = auto;
    if (remember) fillLoginForm(loadSavedCredentials());
  }

  function persistLoginPreferences(id, password, token) {
    if (els.remember.checked) {
      saveCredentials(id, password, token);
    } else {
      clearSavedCredentials();
    }
    localStorage.setItem(LS_AUTO_LOGIN, els.autoLogin.checked ? "1" : "0");
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function formatDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso || "";
    return new Intl.DateTimeFormat("ko-KR", {
      month: "short",
      day: "numeric",
    }).format(d);
  }

  function formatDateTime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso || "";
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  }

  function refreshUpdatedAtField() {
    if (!els.updatedAt) return;
    const item = getItem();
    if (item?.updatedAt) {
      els.updatedAt.value = formatDateTime(item.updatedAt);
      return;
    }
    els.updatedAt.value = "저장 시 자동 설정";
  }

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(text)
    );
    return [...new Uint8Array(buf)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function getToken() {
    return sessionStorage.getItem(STORAGE_TOKEN);
  }

  function setLoginMessage(msg, isOk = false) {
    els.loginError.textContent = msg;
    els.loginError.classList.toggle("admin-error--ok", Boolean(isOk && msg));
  }

  async function verifyRepoToken(token) {
    const userRes = await githubRequest("/user", token);
    if (!userRes.ok) {
      let msg = `오류 ${userRes.status}`;
      try {
        const j = await userRes.json();
        msg = j.message || msg;
      } catch {
        /* ignore */
      }
      throw new Error(`토큰이 유효하지 않습니다. ${msg}`);
    }

    const scopesRaw = userRes.headers.get("X-OAuth-Scopes") || "";
    const scopes = scopesRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const user = await userRes.json();

    const repoRes = await githubRequest(
      `/repos/${cfg.github.owner}/${cfg.github.repo}`,
      token
    );
    if (!repoRes.ok) {
      let msg = `오류 ${repoRes.status}`;
      try {
        const j = await repoRes.json();
        msg = j.message || msg;
      } catch {
        /* ignore */
      }
      throw new Error(`저장소 접근 실패: ${msg}`);
    }
    const repo = await repoRes.json();
    const canPush = Boolean(repo.permissions?.push || repo.permissions?.admin);
    const hasRepoScope =
      scopes.includes("repo") || scopes.includes("public_repo");

    return {
      username: user.login,
      scopes,
      scopeLabel: scopes.length ? scopes.join(", ") : "Fine-grained",
      canPush,
      hasRepoScope,
      repoName: repo.full_name,
    };
  }

  function formatTokenCheck(result) {
    if (result.canPush) {
      return `권한 확인 완료 · ${result.username} · ${result.repoName} push 가능 · scope: ${result.scopeLabel}`;
    }
    if (result.scopes.length && !result.hasRepoScope) {
      return `repo/public_repo 권한이 없습니다. scope: ${result.scopeLabel}`;
    }
    return `${result.repoName}에 push 권한이 없습니다. scope: ${result.scopeLabel}`;
  }

  async function onVerifyToken() {
    const token = $("admin-token").value.trim();
    const btn = $("admin-verify-token");
    if (!token) {
      setLoginMessage("GitHub 토큰을 입력한 뒤 확인하세요.");
      return;
    }

    btn.disabled = true;
    setLoginMessage("권한 확인 중…");

    try {
      const result = await verifyRepoToken(token);
      setLoginMessage(formatTokenCheck(result), result.canPush);
    } catch (err) {
      setLoginMessage(err.message);
    } finally {
      btn.disabled = false;
    }
  }

  function isLoggedIn() {
    return sessionStorage.getItem(STORAGE_SESSION) === "1" && Boolean(getToken());
  }

  async function githubRequest(path, token, options = {}) {
    return fetch(`https://api.github.com${path}`, {
      cache: "no-store",
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
    });
  }

  async function api(path, options = {}) {
    const res = await githubRequest(path, getToken(), options);
    if (!res.ok) {
      let msg = `오류 ${res.status}`;
      try {
        const j = await res.json();
        msg = j.message || msg;
      } catch {
        /* ignore */
      }
      if (/too large/i.test(msg)) {
        msg =
          "파일이 너무 커서 브라우저 업로드가 불가합니다. Git LFS로 올린 뒤 「Git·LFS로 직접 올림」과 저장소 경로를 입력하세요.";
      } else if (res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504) {
        msg =
          "GitHub 서버가 요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.";
      }
      throw new Error(msg);
    }
    return res.status === 204 ? null : res.json();
  }

  function deployBranches() {
    const primary = String(cfg.github.branch || "main").trim() || "main";
    return [...new Set([primary, "gh-pages"])];
  }

  async function readRepoJson(path, branch = cfg.github.branch) {
    const ref = encodeURIComponent(branch);
    const data = await api(
      `/repos/${cfg.github.owner}/${cfg.github.repo}/contents/${path}?ref=${ref}`
    );
    const text = new TextDecoder().decode(
      Uint8Array.from(atob(data.content.replace(/\s/g, "")), (c) => c.charCodeAt(0))
    );
    return { json: JSON.parse(text), sha: data.sha };
  }

  async function readJson(branch = cfg.github.branch) {
    return readRepoJson(cfg.dataPath, branch);
  }

  function notifyMainCatalogSync(catalog) {
    window.HYOT_CATALOG_SYNC?.notifyCatalogUpdated?.(catalog);
  }

  function isNotFoundError(err) {
    return /오류\s*404|not\s*found/i.test(String(err?.message || err));
  }

  async function loadDownloadStats() {
    const path = cfg.downloadStatsPath || "data/download-stats.json";
    try {
      const { json } = await readRepoJson(path);
      return json?.byId && typeof json.byId === "object" ? json.byId : {};
    } catch (err) {
      if (isNotFoundError(err)) return {};
      console.warn("[HyoT admin] download stats:", err);
      return {};
    }
  }

  function getDownloadStatsRow(itemId) {
    return downloadStatsById[itemId] || null;
  }

  function formatDownloadCount(n) {
    return new Intl.NumberFormat("ko-KR").format(Math.max(0, Number(n) || 0));
  }

  function downloadStatsTitle(row) {
    const total = row?.total ?? 0;
    if (!row) return `다운로드 ${formatDownloadCount(total)}회`;
    const parts = [];
    if (row.windows) parts.push(`Windows ${formatDownloadCount(row.windows)}`);
    const detail = parts.length ? parts.join(" · ") : "플랫폼별 기록 없음";
    return `다운로드 ${formatDownloadCount(total)}회 (${detail})`;
  }

  function uint8ToBase64(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  async function writeJson(json, sha, message, branch = cfg.github.branch) {
    const text = JSON.stringify(json, null, 2) + "\n";
    const body = {
      message,
      content: uint8ToBase64(new TextEncoder().encode(text)),
      branch,
      sha,
    };
    await api(
      `/repos/${cfg.github.owner}/${cfg.github.repo}/contents/${cfg.dataPath}`,
      { method: "PUT", body: JSON.stringify(body) }
    );
  }

  function isShaConflictError(err) {
    const msg = String(err?.message || err);
    return /does not match|sha was supplied|409|Conflict/i.test(msg);
  }

  /** 최신 SHA를 읽어 저장. 동시 수정·자동 push 등으로 SHA가 바뀌면 재시도 */
  async function persistCatalogChange(mutator, message, maxAttempts = 5) {
    let lastErr;
    let saved = null;
    const branches = deployBranches();
    for (const branch of branches) {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          let json;
          let sha;
          try {
            ({ json, sha } = await readRepoJson(cfg.dataPath, branch));
          } catch (err) {
            if (!isNotFoundError(err)) throw err;
            json = saved || catalogData || { utilities: [] };
            sha = null;
          }
          const next = saved && branch !== cfg.github.branch ? saved : mutator(json);
          await writeJson(next, sha, message, branch);
          if (!saved) saved = next;
          break;
        } catch (err) {
          lastErr = err;
          if (!isShaConflictError(err) || attempt === maxAttempts - 1) throw err;
          await new Promise((r) => setTimeout(r, 120 * (attempt + 1)));
        }
      }
    }
    if (!saved && lastErr) throw lastErr;
    if (saved) notifyMainCatalogSync(saved);
    return saved;
  }

  function repoPath() {
    return `/repos/${cfg.github.owner}/${cfg.github.repo}`;
  }

  function iconExtFromName(name) {
    const ext = String(name).split(".").pop().toLowerCase();
    if (ext === "jpeg") return "jpg";
    return ext;
  }

  function buildIconStoragePath(fileName, utilityId) {
    if (!ICON_ACCEPT_RE.test(fileName)) {
      throw new Error("아이콘은 png, svg, webp, jpg, ico 파일만 사용할 수 있습니다.");
    }
    const safeId =
      String(utilityId)
        .replace(/[^a-z0-9-]/g, "")
        .slice(0, 48) || `item-${Date.now()}`;
    const ext = iconExtFromName(fileName);
    const stamp = Date.now().toString(36);
    return `${cfg.iconsPath || "assets/icons"}/${safeId}-${stamp}.${ext}`;
  }

  async function deleteRepoFile(path, message) {
    for (const branch of deployBranches()) {
      try {
        const ref = encodeURIComponent(branch);
        const ex = await api(`${repoPath()}/contents/${path}?ref=${ref}`);
        if (!ex?.sha) continue;
        await api(`${repoPath()}/contents/${path}`, {
          method: "DELETE",
          body: JSON.stringify({
            message: branch === cfg.github.branch ? message : `${message} (${branch})`,
            sha: ex.sha,
            branch,
          }),
        });
      } catch {
        /* 파일 없음 또는 이미 삭제됨 */
      }
    }
  }

  async function fileToBase64(file, onProgress) {
    return new Promise((ok, no) => {
      const r = new FileReader();
      r.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(e.loaded / e.total);
        }
      };
      r.onload = () => ok(String(r.result).split(",")[1]);
      r.onerror = () => no(r.error);
      r.readAsDataURL(file);
    });
  }

  async function putBinaryOnBranches(path, base64Content, message) {
    for (const branch of deployBranches()) {
      let sha = null;
      try {
        const ref = encodeURIComponent(branch);
        const ex = await api(`${repoPath()}/contents/${path}?ref=${ref}`);
        sha = ex.sha;
      } catch {
        /* new file on branch */
      }
      await api(`${repoPath()}/contents/${path}`, {
        method: "PUT",
        body: JSON.stringify({
          message: branch === cfg.github.branch ? message : `${message} (${branch})`,
          content: base64Content,
          branch,
          ...(sha ? { sha } : {}),
        }),
      });
    }
  }

  async function uploadIconFile(file, utilityId) {
    if (file.size > MAX_ICON_BYTES) {
      throw new Error("아이콘은 2MB 이하만 업로드할 수 있습니다.");
    }
    const path = buildIconStoragePath(file.name, utilityId);
    const b64 = await fileToBase64(file);
    await putBinaryOnBranches(path, b64, `icon: ${path.split("/").pop()}`);
    return { path };
  }

  function buildDownloadStoragePath(fileName, utilityId) {
    if (!DOWNLOAD_ACCEPT_RE.test(fileName)) {
      throw new Error("다운로드 파일은 exe, msi, zip, 7z 만 업로드할 수 있습니다.");
    }
    const safeId =
      String(utilityId)
        .replace(/[^a-z0-9-]/g, "")
        .slice(0, 48) || `item-${Date.now()}`;
    const base = (cfg.downloadsPath || "downloads").replace(/\/$/, "");
    const stamp = Date.now().toString(36);
    const ext = fileName.split(".").pop().toLowerCase();
    const safeBase = fileName
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64);
    const leaf = safeBase ? `${safeBase}-${stamp}.${ext}` : `${safeId}-${stamp}.${ext}`;
    return `${base}/${leaf}`;
  }

  async function putDownloadOnMain(path, base64Content, message) {
    const branch = String(cfg.github.branch || "main").trim() || "main";
    let sha = null;
    try {
      const ref = encodeURIComponent(branch);
      const ex = await api(`${repoPath()}/contents/${path}?ref=${ref}`);
      sha = ex.sha;
    } catch {
      /* new file */
    }
    await api(`${repoPath()}/contents/${path}`, {
      method: "PUT",
      body: JSON.stringify({
        message,
        content: base64Content,
        branch,
        ...(sha ? { sha } : {}),
      }),
    });
  }

  async function uploadDownloadFile(file, utilityId, onProgress) {
    if (file.size > MAX_DOWNLOAD_BYTES) {
      throw new Error(
        `파일이 너무 큽니다 (${formatSize(file.size)}). 95MB 이하만 브라우저 업로드가 가능합니다. Git LFS로 올린 뒤 「직접 올림」을 사용하세요.`
      );
    }
    const path = buildDownloadStoragePath(file.name, utilityId);
    const b64 = await fileToBase64(file, onProgress);
    await putDownloadOnMain(path, b64, `download: ${path.split("/").pop()}`);
    return {
      path,
      fileName: file.name,
      fileSize: formatSize(file.size),
    };
  }

  async function resolveWindowsForSave({ item, utilityId, progress }) {
    const picked = els.downloadFile?.files?.[0];
    const manual = Boolean(els.downloadManual?.checked);

    if (manual) {
      const pathRaw = els.downloadPath?.value?.trim() || "";
      if (!pathRaw) {
        throw new Error("저장소 경로를 입력하세요. (예: downloads/MyApp-1.0.0.exe)");
      }
      return buildPlatformDataFromManualPath();
    }

    if (picked) {
      progress?.set?.(40);
      const uploaded = await uploadDownloadFile(picked, utilityId, (ratio) => {
        progress?.set?.(40 + ratio * 35);
      });
      progress?.set?.(78);
      const previous = item ? getRawPlatformFile(item, "windows")?.file : null;
      if (previous && isRepoDownloadPath(previous) && previous !== uploaded.path) {
        await deleteRepoFile(previous, `remove old download: ${previous.split("/").pop()}`);
      }
      if (els.downloadFileName && !els.downloadFileName.value.trim()) {
        els.downloadFileName.value = uploaded.fileName;
      }
      if (els.downloadFileSize && !els.downloadFileSize.value.trim()) {
        els.downloadFileSize.value = uploaded.fileSize;
      }
      return {
        file: uploaded.path,
        fileName: els.downloadFileName?.value?.trim() || uploaded.fileName,
        fileSize: els.downloadFileSize?.value?.trim() || uploaded.fileSize,
      };
    }

    if (item) return resolvePlatformMetaOnly(item);
    return null;
  }

  async function resolveIconForSave({ base, utilityId }) {
    const iconFile = els.icon?.files?.[0];
    if (!iconFile) return { path: base?.icon || null, changed: false };
    const previous = base?.icon || null;
    const { path } = await uploadIconFile(iconFile, utilityId);
    if (previous && previous !== path) {
      await deleteRepoFile(previous, `remove old icon: ${previous.split("/").pop()}`);
    }
    return { path, changed: true };
  }

  function iconPreviewSrc(path, item) {
    if (!path) return "";
    if (path.startsWith("blob:")) return path;
    const bustItem = item || (path && getItem()?.icon === path ? getItem() : { icon: path });
    return window.HYOT_PLATFORMS?.utilityIconSrc?.(bustItem) || path;
  }

  function updateIconPreview(path, item) {
    if (!els.iconPreview) return;
    if (path) {
      const bust = iconPreviewSrc(path, item);
      els.iconPreview.src = bust;
      els.iconPreview.hidden = false;
      if (els.iconPreviewEmpty) els.iconPreviewEmpty.hidden = true;
    } else {
      els.iconPreview.removeAttribute("src");
      els.iconPreview.hidden = true;
      if (els.iconPreviewEmpty) els.iconPreviewEmpty.hidden = false;
    }
  }

  function resetIconFields() {
    if (els.icon) els.icon.value = "";
    if (els.iconDisplay) els.iconDisplay.textContent = "아이콘 이미지 업로드";
    updateIconPreview(null);
  }

  function onIconPick() {
    const f = els.icon?.files?.[0];
    if (!f) return;
    if (!ICON_ACCEPT_RE.test(f.name)) {
      els.icon.value = "";
      toast("아이콘은 png, svg, webp, jpg, ico만 사용할 수 있습니다.", true);
      return;
    }
    if (f.size > MAX_ICON_BYTES) {
      els.icon.value = "";
      toast("아이콘은 2MB 이하만 업로드할 수 있습니다.", true);
      return;
    }
    if (els.iconDisplay) els.iconDisplay.textContent = f.name;
    updateIconPreview(URL.createObjectURL(f));
  }

  function updateEditorUI() {
    const item = getItem();

    if (item) {
      els.editorBadge.textContent = `수정 · ${item.name}`;
      els.editorBadge.classList.add("admin-editor__badge--edit");
      els.deleteBtn.hidden = false;
    } else {
      els.editorBadge.textContent = "새 자료";
      els.editorBadge.classList.remove("admin-editor__badge--edit");
      els.deleteBtn.hidden = true;
      updateIconPreview(null);
    }
    if (els.fileRequired) els.fileRequired.hidden = true;

    syncDownloadFieldsFromItem(item);
    updatePlatformStatus();
    refreshUpdatedAtField();
    if (item?.icon) updateIconPreview(item.icon, item);
    else if (!els.icon?.files?.[0]) updateIconPreview(null);
  }

  function renderList() {
    const items = catalogData?.utilities || [];
    els.itemList.replaceChildren();
    els.listEmpty.style.display = items.length ? "none" : "block";

    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = "admin-list__row";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "admin-list__item";
      if (item.id === selectedId) btn.classList.add("admin-list__item--on");

      const migrated = migrateUtility(item);
      const statsRow = getDownloadStatsRow(item.id);
      const dlTotal = statsRow?.total ?? 0;

      const top = document.createElement("div");
      top.className = "admin-list__top";

      const nameEl = document.createElement("span");
      nameEl.className = "admin-list__name";
      nameEl.textContent = item.name;

      const dlEl = document.createElement("span");
      dlEl.className = "admin-list__dl";
      dlEl.title = downloadStatsTitle(statsRow);
      const dlNum = document.createElement("span");
      dlNum.className = "admin-list__dl-num";
      dlNum.textContent = formatDownloadCount(dlTotal);
      const dlUnit = document.createElement("span");
      dlUnit.className = "admin-list__dl-unit";
      dlUnit.textContent = "회";
      dlEl.append(dlNum, dlUnit);

      top.append(nameEl, dlEl);

      const metaEl = document.createElement("span");
      metaEl.className = "admin-list__meta";
      metaEl.textContent = formatDate(item.updatedAt);

      const platformsEl = document.createElement("span");
      platformsEl.className = "admin-list__platforms";
      platformsEl.innerHTML = platformBadgesHtml(migrated);

      btn.append(top, metaEl, platformsEl);
      btn.addEventListener("click", () => pickItem(item.id));

      const del = document.createElement("button");
      del.type = "button";
      del.className = "admin-list__delete";
      del.textContent = "삭제";
      del.setAttribute("aria-label", `「${item.name}」 삭제`);
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteUtility(item.id);
      });

      li.append(btn, del);
      els.itemList.append(li);
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function pickItem(id) {
    const item = catalogData.utilities.find((u) => u.id === id);
    if (!item) return;
    selectedId = id;
    els.name.value = item.name;
    els.description.value = item.description;
    updateEditorUI();
    renderList();
    els.form.scrollIntoView({ behavior: "smooth", block: "nearest" });
    els.name.focus();
  }

  function pickNew() {
    selectedId = null;
    els.form.reset();
    resetIconFields();
    updateEditorUI();
    renderList();
    els.name.focus();
    toast("");
  }

  async function load() {
    const [{ json }, stats] = await Promise.all([readJson(), loadDownloadStats()]);
    downloadStatsById = stats;
    catalogData = {
      ...json,
      utilities: (json.utilities || []).map(migrateUtility),
    };
    renderList();
  }

  async function openPanel() {
    setView("panel");
    await load();
    pickNew();
    toast("");
  }

  function clearSession() {
    sessionStorage.removeItem(STORAGE_TOKEN);
    sessionStorage.removeItem(STORAGE_SESSION);
  }

  async function performLogin(id, password, token, { silent = false } = {}) {
    if (!secrets?.adminId) {
      throw new Error("관리자 설정이 없습니다.");
    }

    if (id !== secrets.adminId) throw new Error("아이디가 올바르지 않습니다.");
    if ((await sha256Hex(password)) !== secrets.adminPasswordSha256) {
      throw new Error("비밀번호가 올바르지 않습니다.");
    }

    sessionStorage.setItem(STORAGE_TOKEN, token);
    const access = await verifyRepoToken(token);
    if (!access.canPush) {
      throw new Error(
        access.scopes.length && !access.hasRepoScope
          ? "토큰에 repo 또는 public_repo 권한이 필요합니다."
          : `${access.repoName} 저장소에 push 권한이 없습니다.`
      );
    }

    sessionStorage.setItem(STORAGE_SESSION, "1");
    setLoginMessage(formatTokenCheck(access), true);
    persistLoginPreferences(id, password, token);

    if (!silent) {
      $("admin-password").value = "";
    }

    await openPanel();
  }

  async function onLogin(e) {
    e.preventDefault();
    setLoginMessage("");

    const id = $("admin-id").value.trim();
    const pw = $("admin-password").value;
    const token = $("admin-token").value.trim();

    if (!id || !pw || !token) {
      setLoginMessage("모든 항목을 입력하세요.");
      return;
    }

    els.loginForm.classList.add("is-busy");
    els.loginSubmit.disabled = true;

    try {
      await performLogin(id, pw, token);
    } catch (err) {
      clearSession();
      setView("login");
      setLoginMessage(err.message);
    } finally {
      els.loginForm.classList.remove("is-busy");
      els.loginSubmit.disabled = false;
    }
  }

  function logout() {
    clearSession();
    selectedId = null;
    catalogData = null;
    setView("login");
    toast("");
    applyRememberPreferences();
  }

  async function onSave(e) {
    e.preventDefault();
    const name = els.name.value.trim();
    const desc = els.description.value.trim();
    if (!name || !desc) {
      toast("이름과 설명을 입력하세요.", true);
      return;
    }
    const editItem = isEdit() ? migrateUtility(getItem()) : null;

    const progress = beginSaveProgress();
    toast("");
    let goToMain = false;

    try {
      progress.set(5);
      const { json } = await readJson();
      progress.set(20);
      const list = [...(json.utilities || []).map(migrateUtility)];
      const updatedAt = nowISO();
      let nextId = selectedId;

      const platformLabel = getPlatformMeta("windows")?.label || "Windows";

      if (isEdit()) {
        const cur = migrateUtility(getItem());
        let windows = getRawPlatformFile(cur, "windows");

        const windowsNext = await resolveWindowsForSave({
          item: cur,
          utilityId: cur.id,
          progress,
        });
        if (windowsNext) windows = windowsNext;

        progress.set(50);
        const iconResult = await resolveIconForSave({ base: cur, utilityId: cur.id });

        const i = list.findIndex((u) => u.id === cur.id);
        list[i] = buildUtilityPayload(cur, {
          name,
          description: desc,
          updatedAt,
          windows,
          icon: iconResult.path,
          ...(iconResult.changed ? { iconUpdatedAt: updatedAt } : {}),
        });
        nextId = cur.id;
      } else {
        progress.set(35);
        let id = slugFromFileName(els.downloadFileName?.value?.trim() || name);
        if (list.some((u) => u.id === id)) id += `-${Date.now().toString(36)}`;

        const windowsNew = await resolveWindowsForSave({ item: null, utilityId: id, progress });
        const iconResult = await resolveIconForSave({ base: {}, utilityId: id });

        list.unshift(
          buildUtilityPayload(
            { id },
            {
              name,
              description: desc,
              updatedAt,
              windows: windowsNew,
              icon: iconResult.path,
              ...(iconResult.changed ? { iconUpdatedAt: updatedAt } : {}),
            }
          )
        );
        nextId = id;
      }

      progress.set(78);
      const listToSave = list;
      const savedCatalog = await persistCatalogChange(
        (fresh) => ({ ...fresh, utilities: listToSave }),
        isEdit() ? `update: ${name}` : `add: ${name}`
      );
      progress.set(90);
      selectedId = nextId;
      if (savedCatalog) {
        catalogData = {
          ...savedCatalog,
          utilities: savedCatalog.utilities.map(migrateUtility),
        };
        renderList();
      }

      const actionLabel = isEdit() ? "저장" : "등록";
      toast(`「${name}」 ${actionLabel} 완료 (${platformLabel}). 메인에 반영되었습니다.`);
      progress.complete();
      await new Promise((r) => setTimeout(r, 550));
      goToMain = true;
      redirectToMainAfterSave();
    } catch (err) {
      toast(err.message, true);
    } finally {
      if (!goToMain) progress.end();
    }
  }

  function applyLocalCatalog(utilities) {
    catalogData = {
      ...catalogData,
      utilities: utilities.map(migrateUtility),
    };
    renderList();
  }

  async function deleteUtility(id) {
    const cur = catalogData?.utilities?.find((u) => u.id === id);
    if (!cur) return;
    if (!confirm("정말 삭제하시겠습니까?")) return;

    const name = cur.name;
    const snapshot = catalogData.utilities.map((u) => ({ ...u }));
    const nextList = catalogData.utilities.filter((u) => u.id !== id);

    applyLocalCatalog(nextList);
    if (selectedId === id) pickNew();

    try {
      const next = await persistCatalogChange(
        (json) => ({
          ...json,
          utilities: (json.utilities || []).filter((u) => u.id !== id),
        }),
        `remove: ${name}`
      );
      catalogData = {
        ...catalogData,
        utilities: next.utilities.map(migrateUtility),
      };
      renderList();
      toast(`「${name}」 삭제됨`);
    } catch (err) {
      applyLocalCatalog(snapshot);
      if (selectedId === id) pickItem(id);
      toast(err.message, true);
    }
  }

  async function onDelete() {
    const cur = getItem();
    if (!cur) return;
    await deleteUtility(cur.id);
  }

  els.remember.addEventListener("change", () => {
    if (!els.remember.checked) {
      els.autoLogin.checked = false;
      clearSavedCredentials();
      localStorage.setItem(LS_AUTO_LOGIN, "0");
    }
  });

  els.autoLogin.addEventListener("change", () => {
    if (els.autoLogin.checked) els.remember.checked = true;
  });

  els.loginForm.addEventListener("submit", onLogin);
  $("admin-verify-token").addEventListener("click", onVerifyToken);
  els.logoutBtn.addEventListener("click", logout);
  els.newBtn.addEventListener("click", pickNew);
  els.form.addEventListener("submit", onSave);
  els.deleteBtn.addEventListener("click", onDelete);
  els.icon?.addEventListener("change", onIconPick);
  els.downloadFile?.addEventListener("change", onDownloadPick);
  els.downloadManual?.addEventListener("change", updateDownloadManualUI);

  function onDownloadPick() {
    const f = els.downloadFile?.files?.[0];
    if (!f) return;
    if (!DOWNLOAD_ACCEPT_RE.test(f.name)) {
      els.downloadFile.value = "";
      toast("다운로드 파일은 exe, msi, zip, 7z 만 사용할 수 있습니다.", true);
      return;
    }
    if (f.size > MAX_DOWNLOAD_BYTES) {
      els.downloadFile.value = "";
      toast(
        `${formatSize(f.size)} 파일은 브라우저 업로드 한도(95MB)를 초과합니다. Git LFS 후 「직접 올림」을 사용하세요.`,
        true
      );
      return;
    }
    if (els.downloadDisplay) els.downloadDisplay.textContent = `${f.name} (${formatSize(f.size)})`;
    if (els.downloadFileName && !els.downloadFileName.value.trim()) {
      els.downloadFileName.value = f.name;
    }
    if (els.downloadFileSize && !els.downloadFileSize.value.trim()) {
      els.downloadFileSize.value = formatSize(f.size);
    }
    if (els.downloadManual) els.downloadManual.checked = false;
    updateDownloadManualUI();
  }
  async function init() {
    applyRememberPreferences();
    setView("login");

    if (!secrets?.adminId) {
      els.loginError.textContent = "배포 Secrets를 확인하세요.";
      return;
    }

    if (isLoggedIn()) {
      try {
        await openPanel();
        return;
      } catch {
        clearSession();
      }
    }

    const auto = localStorage.getItem(LS_AUTO_LOGIN) === "1";
    const saved = loadSavedCredentials();

    if (auto && saved) {
      fillLoginForm(saved);
      els.loginError.textContent = "자동 로그인 중…";
      els.loginForm.classList.add("is-busy");
      try {
        await performLogin(saved.id, saved.password, saved.token, {
          silent: true,
        });
        els.loginError.textContent = "";
      } catch (err) {
        clearSession();
        setView("login");
        els.loginError.textContent = err.message;
      } finally {
        els.loginForm.classList.remove("is-busy");
      }
    }
  }

  init();
})();
