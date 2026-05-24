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
  } = window.HYOT_PLATFORMS || { list: [] };

  /** 브라우저에서 GitHub Contents API 업로드 시도 상한 (50MB 초과는 직접 등록) */
  const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

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
    fileDisplay: $("admin-file-display"),
    form: $("admin-utility-form"),
    name: $("admin-name"),
    description: $("admin-description"),
    updatedAt: $("admin-updated-at"),
    file: $("admin-file"),
    fileManual: $("admin-file-manual"),
    fileManualWrap: $("admin-file-manual-wrap"),
    filePath: $("admin-file-path"),
    submitBtn: $("admin-submit-btn"),
    deleteBtn: $("admin-delete-btn"),
    platformStatus: $("admin-platform-status"),
    platformRadios: () =>
      document.querySelectorAll('input[name="admin-platform"]'),
  };

  let catalogData = null;
  let selectedId = null;
  let saveProgressValue = 0;

  const isEdit = () => Boolean(selectedId);

  function mapSegment(start, end, inner0to100) {
    return start + (inner0to100 / 100) * (end - start);
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
    const checked = document.querySelector('input[name="admin-platform"]:checked');
    return checked?.value === "android" ? "android" : "windows";
  }

  function getPlatformMeta(platformId) {
    return PLATFORMS.find((p) => p.id === platformId);
  }

  function syncFileAccept() {
    const meta = getPlatformMeta(getSelectedPlatform());
    if (els.file && meta?.accept) els.file.accept = meta.accept;
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
      const pf = getPlatformFile(item, p.id);
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
        ? `${p.label}: ${pf.fileName || pf.file.split("/").pop()}${pf.fileSize ? ` (${pf.fileSize})` : ""}`
        : `${p.label}: 미등록`;
      row.append(icon, text);
      box.append(row);
    });
  }

  function buildUtilityPayload(base, { name, description, updatedAt, windows, android }) {
    const out = {
      id: base.id,
      name,
      description,
      updatedAt,
    };
    if (windows) out.windows = windows;
    if (android) out.android = android;
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
          "파일이 너무 커서 브라우저 업로드가 불가합니다. 「저장소에 파일을 직접 올렸음」을 체크하고 경로로 등록하세요.";
      } else if (res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504) {
        msg =
          "GitHub 서버가 요청을 처리하지 못했습니다. 잠시 후 다시 시도하거나 파일 크기를 줄여 다시 업로드하세요.";
      }
      throw new Error(msg);
    }
    return res.status === 204 ? null : res.json();
  }

  async function readJson() {
    const ref = encodeURIComponent(cfg.github.branch);
    const data = await api(
      `/repos/${cfg.github.owner}/${cfg.github.repo}/contents/${cfg.dataPath}?ref=${ref}`
    );
    const text = new TextDecoder().decode(
      Uint8Array.from(atob(data.content.replace(/\s/g, "")), (c) => c.charCodeAt(0))
    );
    return { json: JSON.parse(text), sha: data.sha };
  }

  function uint8ToBase64(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  async function writeJson(json, sha, message) {
    const text = JSON.stringify(json, null, 2) + "\n";
    const body = {
      message,
      content: uint8ToBase64(new TextEncoder().encode(text)),
      branch: cfg.github.branch,
      sha,
    };
    await api(
      `/repos/${cfg.github.owner}/${cfg.github.repo}/contents/${cfg.dataPath}`,
      { method: "PUT", body: JSON.stringify(body) }
    );
  }

  function repoPath() {
    return `/repos/${cfg.github.owner}/${cfg.github.repo}`;
  }

  function normalizeDownloadPath(input) {
    let path = String(input || "").trim().replace(/^\/+/, "");
    if (!path) return "";
    if (!path.startsWith(`${cfg.downloadsPath}/`)) {
      path = path.replace(/^downloads\/?/i, "");
      path = `${cfg.downloadsPath}/${path}`;
    }
    return path;
  }

  async function verifyDownloadFile(path) {
    const ref = encodeURIComponent(cfg.github.branch);
    const data = await api(
      `${repoPath()}/contents/${path}?ref=${ref}`
    );
    if (data.type && data.type !== "file") {
      throw new Error("파일 경로가 올바르지 않습니다. downloads/ 아래 파일을 지정하세요.");
    }
    return {
      path,
      fileName: path.split("/").pop() || path,
      fileSize: typeof data.size === "number" ? formatSize(data.size) : "",
    };
  }

  async function uploadFileContents(file, onSegmentProgress) {
    const report = (inner) => onSegmentProgress?.(inner);
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
    const path = `${cfg.downloadsPath}/${safe}`;
    let sha = null;

    report(0);
    try {
      const ref = encodeURIComponent(cfg.github.branch);
      const ex = await api(
        `/repos/${cfg.github.owner}/${cfg.github.repo}/contents/${path}?ref=${ref}`
      );
      sha = ex.sha;
    } catch {
      /* new */
    }
    report(12);

    const b64 = await new Promise((ok, no) => {
      const r = new FileReader();
      r.onprogress = (e) => {
        if (e.lengthComputable) {
          report(12 + (e.loaded / e.total) * 48);
        }
      };
      r.onload = () => {
        report(62);
        ok(String(r.result).split(",")[1]);
      };
      r.onerror = () => no(r.error);
      r.readAsDataURL(file);
    });

    report(68);
    await api(
      `/repos/${cfg.github.owner}/${cfg.github.repo}/contents/${path}`,
      {
        method: "PUT",
        body: JSON.stringify({
          message: `upload: ${safe}`,
          content: b64,
          branch: cfg.github.branch,
          ...(sha ? { sha } : {}),
        }),
      }
    );
    report(100);
    return {
      path,
      fileName: file.name,
      fileSize: formatSize(file.size),
    };
  }

  async function uploadFile(file, onSegmentProgress) {
    return uploadFileContents(file, onSegmentProgress);
  }

  function useManualFile() {
    return Boolean(els.fileManual?.checked);
  }

  function toggleManualFileUI() {
    const manual = useManualFile();
    if (els.fileManualWrap) els.fileManualWrap.hidden = !manual;
    if (els.filePath) els.filePath.required = manual && !isEdit();
    if (els.file) els.file.required = !manual && !isEdit();
    if (manual) {
      els.file.value = "";
      els.fileDisplay.textContent = "직접 등록 모드 — 파일 선택 안 함";
    } else if (!isEdit()) {
      els.fileDisplay.textContent = "파일 선택";
    }
  }

  function currentPlatformFileLabel(item) {
    const pf = getPlatformFile(item, getSelectedPlatform());
    const fname = pf?.fileName || pf?.file?.split("/").pop() || "";
    const platform = getPlatformMeta(getSelectedPlatform())?.label || "";
    return fname
      ? `${platform} 현재: ${fname} — 클릭하여 교체`
      : `${platform}용 파일 선택`;
  }

  function updateEditorUI() {
    const item = getItem();
    const platformLabel = getPlatformMeta(getSelectedPlatform())?.label || "플랫폼";
    if (item) {
      els.editorBadge.textContent = `수정 · ${item.name}`;
      els.editorBadge.classList.add("admin-editor__badge--edit");
      els.deleteBtn.hidden = false;
      els.fileRequired.hidden = true;
      els.file.required = false;
      els.fileDisplay.textContent = currentPlatformFileLabel(item);
    } else {
      els.editorBadge.textContent = "새 자료";
      els.editorBadge.classList.remove("admin-editor__badge--edit");
      els.deleteBtn.hidden = true;
      els.fileRequired.hidden = false;
      els.file.required = !useManualFile();
      els.fileDisplay.textContent = `${platformLabel}용 파일 선택`;
    }
    if (els.fileManual) els.fileManual.checked = false;
    if (els.filePath) els.filePath.value = "";
    toggleManualFileUI();
    syncFileAccept();
    updatePlatformStatus();
    refreshUpdatedAtField();
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
      btn.innerHTML = `<span class="admin-list__name">${escapeHtml(item.name)}</span><span class="admin-list__meta">${formatDate(item.updatedAt)}</span><span class="admin-list__platforms">${platformBadgesHtml(migrated)}</span>`;
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
    els.file.value = "";
    updateEditorUI();
    renderList();
    els.form.scrollIntoView({ behavior: "smooth", block: "nearest" });
    els.name.focus();
  }

  function pickNew() {
    selectedId = null;
    els.form.reset();
    updateEditorUI();
    renderList();
    els.name.focus();
    toast("");
  }

  function rejectOversizedFile(file) {
    if (!file || file.size <= MAX_UPLOAD_BYTES) return false;
    els.file.value = "";
    if (els.fileManual) els.fileManual.checked = true;
    if (els.filePath) {
      els.filePath.value = `${cfg.downloadsPath}/${file.name}`;
    }
    toggleManualFileUI();
    toast(
      "50MB 초과 파일은 브라우저 업로드가 불가합니다. 저장소에 직접 올린 뒤 경로로 등록하세요.",
      true
    );
    return true;
  }

  function onFilePick() {
    const f = els.file.files[0];
    if (f) {
      if (rejectOversizedFile(f)) return;
      els.fileDisplay.textContent = `${f.name} (${formatSize(f.size)})`;
      return;
    }
    const item = getItem();
    if (item) {
      els.fileDisplay.textContent = currentPlatformFileLabel(item);
    } else {
      const platformLabel = getPlatformMeta(getSelectedPlatform())?.label || "플랫폼";
      els.fileDisplay.textContent = `${platformLabel}용 파일 선택`;
    }
  }

  function onPlatformChange() {
    syncFileAccept();
    els.file.value = "";
    updateEditorUI();
  }

  async function load() {
    const { json } = await readJson();
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
    const file = els.file.files[0];

    if (!name || !desc) {
      toast("이름과 설명을 입력하세요.", true);
      return;
    }
    const manual = useManualFile();
    const manualPath = normalizeDownloadPath(els.filePath?.value);

    if (!isEdit() && !file && !manual) {
      toast("파일을 선택하거나 「저장소에 직접 올렸음」을 체크하세요.", true);
      return;
    }
    if (manual && !manualPath) {
      toast("downloads/ 아래 파일 경로를 입력하세요.", true);
      return;
    }
    if (!manual && file && file.size > MAX_UPLOAD_BYTES) {
      toast("50MB 이하 파일만 브라우저에서 업로드할 수 있습니다.", true);
      return;
    }
    if (manual && file) {
      toast("직접 등록 모드에서는 파일 선택을 해제하세요.", true);
      return;
    }

    const progress = beginSaveProgress();
    toast("");
    let goToMain = false;

    try {
      progress.set(5);
      const { json } = await readJson();
      progress.set(12);
      const list = [...(json.utilities || []).map(migrateUtility)];
      const updatedAt = nowISO();
      let nextId = selectedId;

      const platformId = getSelectedPlatform();
      const platformLabel = getPlatformMeta(platformId)?.label || platformId;

      if (isEdit()) {
        const cur = migrateUtility(getItem());
        let windows = getPlatformFile(cur, "windows");
        let android = getPlatformFile(cur, "android");

        if (file || manual) {
          const up = manual
            ? await (async () => {
                progress.set(35);
                const verified = await verifyDownloadFile(manualPath);
                progress.set(70);
                return verified;
              })()
            : await uploadFile(file, (inner) => {
                progress.set(mapSegment(12, 72, inner));
              });
          const platformData = {
            file: up.path,
            fileName: up.fileName,
            fileSize: up.fileSize,
          };
          if (platformId === "windows") windows = platformData;
          else android = platformData;
        } else {
          progress.set(40);
        }

        const i = list.findIndex((u) => u.id === cur.id);
        list[i] = buildUtilityPayload(cur, {
          name,
          description: desc,
          updatedAt,
          windows,
          android,
        });
        nextId = cur.id;
        toast(`「${name}」 저장됨 (${platformLabel}) · 1~2분 후 사이트 반영`);
      } else if (manual) {
        progress.set(35);
        const up = await verifyDownloadFile(manualPath);
        progress.set(70);
        let id = up.fileName
          .replace(/\.[^.]+$/, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 48) || `item-${Date.now()}`;
        if (list.some((u) => u.id === id)) id += `-${Date.now().toString(36)}`;

        const platformData = {
          file: up.path,
          fileName: up.fileName,
          fileSize: up.fileSize,
        };
        list.unshift(
          buildUtilityPayload(
            { id },
            {
              name,
              description: desc,
              updatedAt,
              windows: platformId === "windows" ? platformData : null,
              android: platformId === "android" ? platformData : null,
            }
          )
        );
        nextId = id;
        toast(`「${name}」 등록됨 (${platformLabel}) · 1~2분 후 사이트 반영`);
      } else {
        const up = await uploadFile(file, (inner) => {
          progress.set(mapSegment(12, 72, inner));
        });
        let id = file.name
          .replace(/\.[^.]+$/, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 48) || `item-${Date.now()}`;
        if (list.some((u) => u.id === id)) id += `-${Date.now().toString(36)}`;

        const platformData = {
          file: up.path,
          fileName: up.fileName,
          fileSize: up.fileSize,
        };
        list.unshift(
          buildUtilityPayload(
            { id },
            {
              name,
              description: desc,
              updatedAt,
              windows: platformId === "windows" ? platformData : null,
              android: platformId === "android" ? platformData : null,
            }
          )
        );
        nextId = id;
        toast(`「${name}」 등록됨 (${platformLabel}) · 1~2분 후 사이트 반영`);
      }

      progress.set(78);
      const { sha } = await readJson();
      await writeJson(
        { ...json, utilities: list },
        sha,
        isEdit() ? `update: ${name}` : `add: ${name}`
      );
      progress.set(90);
      selectedId = nextId;

      progress.complete();
      await new Promise((r) => setTimeout(r, 400));
      goToMain = true;
      window.location.assign("./");
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
      const { json, sha } = await readJson();
      const remoteList = (json.utilities || []).filter((u) => u.id !== id);
      await writeJson({ ...json, utilities: remoteList }, sha, `remove: ${name}`);
      catalogData = {
        ...json,
        utilities: remoteList.map(migrateUtility),
      };
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
  els.file.addEventListener("change", onFilePick);
  els.fileManual?.addEventListener("change", toggleManualFileUI);
  document.querySelectorAll('input[name="admin-platform"]').forEach((radio) => {
    radio.addEventListener("change", onPlatformChange);
  });

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
