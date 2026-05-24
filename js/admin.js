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

  const MAX_CONTENTS_BYTES = 25 * 1024 * 1024;
  /** GitHub Git Blob API 단일 파일 상한 */
  const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

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
    submitBtn: $("admin-submit-btn"),
    deleteBtn: $("admin-delete-btn"),
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
  const getItem = () =>
    catalogData?.utilities?.find((u) => u.id === selectedId) ?? null;

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
      if (res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504) {
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

  async function fileToBase64(file, onRatio) {
    const buffer = await new Promise((ok, no) => {
      const reader = new FileReader();
      reader.onprogress = (e) => {
        if (e.lengthComputable && onRatio) onRatio(e.loaded / e.total);
      };
      reader.onload = () => ok(reader.result);
      reader.onerror = () => no(reader.error);
      reader.readAsArrayBuffer(file);
    });
    return uint8ToBase64(new Uint8Array(buffer));
  }

  async function uploadFileGit(file, onSegmentProgress) {
    const report = (inner) => onSegmentProgress?.(inner);
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
    const path = `${cfg.downloadsPath}/${safe}`;
    const branch = cfg.github.branch;

    report(2);
    const b64 = await fileToBase64(file, (ratio) => report(2 + ratio * 38));
    report(42);

    const blob = await api(`${repoPath()}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content: b64, encoding: "base64" }),
    });
    report(52);

    const ref = await api(
      `${repoPath()}/git/ref/heads/${encodeURIComponent(branch)}`
    );
    const parentSha = ref.object.sha;
    report(58);

    const parent = await api(`${repoPath()}/git/commits/${parentSha}`);
    report(64);

    const tree = await api(`${repoPath()}/git/trees`, {
      method: "POST",
      body: JSON.stringify({
        base_tree: parent.tree.sha,
        tree: [{ path, mode: "100644", type: "blob", sha: blob.sha }],
      }),
    });
    report(76);

    const commit = await api(`${repoPath()}/git/commits`, {
      method: "POST",
      body: JSON.stringify({
        message: `upload: ${safe}`,
        tree: tree.sha,
        parents: [parentSha],
      }),
    });
    report(88);

    await api(`${repoPath()}/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha }),
    });
    report(100);

    return {
      path,
      fileName: file.name,
      fileSize: formatSize(file.size),
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
    if (file.size > MAX_CONTENTS_BYTES) {
      return uploadFileGit(file, onSegmentProgress);
    }
    return uploadFileContents(file, onSegmentProgress);
  }

  function updateEditorUI() {
    const item = getItem();
    if (item) {
      els.editorBadge.textContent = `수정 · ${item.name}`;
      els.editorBadge.classList.add("admin-editor__badge--edit");
      els.deleteBtn.hidden = false;
      els.fileRequired.hidden = true;
      els.file.required = false;
      const fname = item.fileName || item.file?.split("/").pop() || "";
      els.fileDisplay.textContent = fname
        ? `현재: ${fname} — 클릭하여 교체`
        : "파일 선택";
    } else {
      els.editorBadge.textContent = "새 자료";
      els.editorBadge.classList.remove("admin-editor__badge--edit");
      els.deleteBtn.hidden = true;
      els.fileRequired.hidden = false;
      els.file.required = true;
      els.fileDisplay.textContent = "파일 선택";
    }
    refreshUpdatedAtField();
  }

  function renderList() {
    const items = catalogData?.utilities || [];
    els.itemList.replaceChildren();
    els.listEmpty.style.display = items.length ? "none" : "block";

    items.forEach((item) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "admin-list__item";
      if (item.id === selectedId) btn.classList.add("admin-list__item--on");

      btn.innerHTML = `<span class="admin-list__name">${escapeHtml(item.name)}</span><span class="admin-list__meta">${formatDate(item.updatedAt)}${item.fileSize ? " · " + escapeHtml(item.fileSize) : ""}</span>`;
      btn.addEventListener("click", () => pickItem(item.id));
      li.append(btn);
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
    toast("100MB 이하 파일만 등록할 수 있습니다.", true);
    onFilePick();
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
      const fname = item.fileName || item.file?.split("/").pop() || "";
      els.fileDisplay.textContent = fname
        ? `현재: ${fname} — 클릭하여 교체`
        : "파일 선택";
    } else {
      els.fileDisplay.textContent = "파일 선택";
    }
  }

  async function load() {
    const { json } = await readJson();
    catalogData = json;
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
    if (!isEdit() && !file) {
      toast("파일을 선택하세요.", true);
      return;
    }
    if (file && file.size > MAX_UPLOAD_BYTES) {
      toast("100MB 이하 파일만 등록할 수 있습니다.", true);
      return;
    }

    const progress = beginSaveProgress();
    toast("");
    let goToMain = false;

    try {
      progress.set(5);
      const { json } = await readJson();
      progress.set(12);
      const list = [...(json.utilities || [])];
      const updatedAt = nowISO();
      let nextId = selectedId;

      if (isEdit()) {
        const cur = getItem();
        let filePath = cur.file;
        let fileName = cur.fileName || "";
        let fileSize = cur.fileSize || "";
        if (file) {
          const up = await uploadFile(file, (inner) => {
            progress.set(mapSegment(12, 72, inner));
          });
          filePath = up.path;
          fileName = up.fileName;
          fileSize = up.fileSize;
        } else {
          progress.set(40);
        }
        const i = list.findIndex((u) => u.id === cur.id);
        list[i] = {
          ...cur,
          name,
          description: desc,
          updatedAt,
          file: filePath,
          fileName,
          fileSize,
        };
        nextId = cur.id;
        toast(`「${name}」 저장됨 · 1~2분 후 사이트 반영`);
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

        list.unshift({
          id,
          name,
          description: desc,
          updatedAt,
          file: up.path,
          fileName: up.fileName,
          fileSize: up.fileSize,
        });
        nextId = id;
        toast(`「${name}」 등록됨 · 1~2분 후 사이트 반영`);
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

  async function onDelete() {
    const cur = getItem();
    if (!cur || !confirm(`「${cur.name}」을(를) 삭제할까요?`)) return;

    els.deleteBtn.disabled = true;
    toast("삭제 중…");

    try {
      const { json, sha } = await readJson();
      const list = (json.utilities || []).filter((u) => u.id !== cur.id);
      await writeJson({ ...json, utilities: list }, sha, `remove: ${cur.name}`);
      toast(`「${cur.name}」 삭제됨`);
      await load();
      pickNew();
    } catch (err) {
      toast(err.message, true);
    } finally {
      els.deleteBtn.disabled = false;
    }
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
