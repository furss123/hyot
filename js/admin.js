/**
 * HyoT의 자료실 — 관리자 페이지 (admin.html)
 */

(function () {
  const STORAGE_TOKEN = "hyot_github_token";
  const STORAGE_USER = "hyot_admin_user";
  const STORAGE_SESSION = "hyot_admin_session";

  const cfg = window.HYOT_ADMIN_CONFIG;
  const secrets = window.HYOT_ADMIN_SECRETS;

  if (!cfg) {
    console.warn("[HyoT Admin] admin-config.js 가 없습니다.");
    return;
  }

  const els = {
    loginView: document.getElementById("admin-login-view"),
    panelView: document.getElementById("admin-panel-view"),
    loginForm: document.getElementById("admin-login-form"),
    adminId: document.getElementById("admin-id"),
    password: document.getElementById("admin-password"),
    token: document.getElementById("admin-token"),
    loginError: document.getElementById("admin-login-error"),
    logoutBtn: document.getElementById("admin-logout-btn"),
    userLabel: document.getElementById("admin-user-label"),
    utilityForm: document.getElementById("admin-utility-form"),
    newBtn: document.getElementById("admin-new-btn"),
    itemList: document.getElementById("admin-item-list"),
    listCount: document.getElementById("admin-list-count"),
    listEmpty: document.getElementById("admin-list-empty"),
    formTitle: document.getElementById("admin-form-title"),
    formSubtitle: document.getElementById("admin-form-subtitle"),
    name: document.getElementById("admin-name"),
    description: document.getElementById("admin-description"),
    descCount: document.getElementById("admin-desc-count"),
    file: document.getElementById("admin-file"),
    dropzone: document.getElementById("admin-dropzone"),
    dropzoneText: document.getElementById("admin-dropzone-text"),
    fileHint: document.getElementById("admin-file-hint"),
    currentFile: document.getElementById("admin-current-file"),
    updatedAt: document.getElementById("admin-updated-at"),
    submitBtn: document.getElementById("admin-submit-btn"),
    deleteBtn: document.getElementById("admin-delete-btn"),
    panelStatus: document.getElementById("admin-panel-status"),
    fileRequired: document.getElementById("admin-file-required"),
  };

  let catalogData = null;
  let selectedId = null;
  let isEditMode = false;

  function getAuth() {
    if (!secrets?.adminId || !secrets?.adminPasswordSha256) return null;
    return secrets;
  }

  function getToken() {
    return sessionStorage.getItem(STORAGE_TOKEN);
  }

  function isLoggedIn() {
    return sessionStorage.getItem(STORAGE_SESSION) === "1" && Boolean(getToken());
  }

  function setPanelStatus(msg, isError = false) {
    els.panelStatus.textContent = msg || "";
    els.panelStatus.classList.toggle("admin-status--error", isError);
  }

  function setLoginError(msg) {
    els.loginError.textContent = msg || "";
  }

  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(text)
    );
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function todayISO() {
    const d = new Date();
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60 * 1000);
    return local.toISOString().slice(0, 10);
  }

  function formatDateKo(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date);
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function slugify(text) {
    const base = String(text)
      .trim()
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
    return base || `item-${Date.now()}`;
  }

  function sanitizeDownloadName(name) {
    return name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  }

  function refreshUpdatedAtField() {
    els.updatedAt.textContent = formatDateKo(todayISO());
  }

  function updateDescCount() {
    const len = els.description.value.length;
    els.descCount.textContent = `${len} / 200`;
  }

  function updateFileUI(file) {
    if (file) {
      els.dropzoneText.textContent = file.name;
      els.fileHint.textContent = formatFileSize(file.size);
    } else if (isEditMode && getSelectedItem()) {
      const item = getSelectedItem();
      els.dropzoneText.textContent = "새 파일로 교체하려면 선택하세요";
      els.fileHint.textContent = "선택하지 않으면 기존 파일 유지";
    } else {
      els.dropzoneText.textContent = "클릭하거나 파일을 끌어다 놓으세요";
      els.fileHint.textContent = "ZIP, EXE 등 (최대 50MB)";
    }
  }

  function showCurrentFile(item) {
    if (!item) {
      els.currentFile.hidden = true;
      return;
    }
    const parts = [];
    if (item.fileName || item.file) parts.push(item.fileName || item.file);
    if (item.fileSize) parts.push(item.fileSize);
    if (item.updatedAt) parts.push(`업데이트 ${formatDateKo(item.updatedAt)}`);
    els.currentFile.textContent = `현재 파일: ${parts.join(" · ")}`;
    els.currentFile.hidden = false;
  }

  async function githubApi(path, options = {}) {
    const token = getToken();
    if (!token) throw new Error("로그인이 필요합니다.");

    const res = await fetch(`https://api.github.com${path}`, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });

    if (!res.ok) {
      let detail = "";
      try {
        const err = await res.json();
        detail = err.message || JSON.stringify(err);
      } catch {
        detail = await res.text();
      }
      throw new Error(detail || `GitHub API 오류 (${res.status})`);
    }

    if (res.status === 204) return null;
    return res.json();
  }

  async function verifyToken() {
    const user = await githubApi("/user");
    const repo = await githubApi(
      `/repos/${cfg.github.owner}/${cfg.github.repo}`
    );
    if (!repo.permissions?.push && !repo.permissions?.admin) {
      throw new Error("이 저장소에 쓰기 권한이 있는 토큰이 아닙니다.");
    }
    return user;
  }

  async function readRepoFile(path) {
    const ref = encodeURIComponent(cfg.github.branch);
    const data = await githubApi(
      `/repos/${cfg.github.owner}/${cfg.github.repo}/contents/${path}?ref=${ref}`
    );
    const binary = atob(data.content.replace(/\s/g, ""));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const text = new TextDecoder("utf-8").decode(bytes);
    return { text, sha: data.sha, json: JSON.parse(text) };
  }

  async function writeRepoFile(path, base64Content, sha, message) {
    const body = { message, content: base64Content, branch: cfg.github.branch };
    if (sha) body.sha = sha;
    await githubApi(
      `/repos/${cfg.github.owner}/${cfg.github.repo}/contents/${path}`,
      { method: "PUT", body: JSON.stringify(body) }
    );
  }

  function textToBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    return btoa(binary);
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function loadCatalog() {
    const { json } = await readRepoFile(cfg.dataPath);
    catalogData = json;
    return json;
  }

  function getSelectedItem() {
    if (!selectedId) return null;
    return catalogData?.utilities?.find((u) => u.id === selectedId) || null;
  }

  function renderItemList() {
    const utilities = catalogData?.utilities || [];
    els.itemList.replaceChildren();
    els.listCount.textContent =
      utilities.length > 0 ? `총 ${utilities.length}개` : "";
    els.listEmpty.hidden = utilities.length > 0;

    utilities.forEach((item) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "admin-item";
      btn.dataset.id = item.id;
      if (item.id === selectedId) btn.classList.add("admin-item--active");

      const name = document.createElement("span");
      name.className = "admin-item__name";
      name.textContent = item.name;

      const meta = document.createElement("span");
      meta.className = "admin-item__meta";
      const metaParts = [formatDateKo(item.updatedAt)];
      if (item.fileSize) metaParts.push(item.fileSize);
      meta.textContent = metaParts.join(" · ");

      btn.append(name, meta);
      btn.addEventListener("click", () => selectItem(item.id));
      li.append(btn);
      els.itemList.append(li);
    });
  }

  function selectItem(id) {
    const item = catalogData?.utilities?.find((u) => u.id === id);
    if (!item) return;
    selectedId = id;
    isEditMode = true;
    els.formTitle.textContent = "자료 수정";
    els.formSubtitle.textContent = "내용을 수정한 뒤 저장하세요.";
    els.deleteBtn.hidden = false;
    els.fileRequired.hidden = true;
    els.file.required = false;
    fillFormFromItem(item);
    renderItemList();
  }

  function startNewItem() {
    selectedId = null;
    isEditMode = false;
    els.formTitle.textContent = "새 자료 등록";
    els.formSubtitle.textContent = "필수 항목을 입력하고 파일을 업로드하세요.";
    els.deleteBtn.hidden = true;
    els.fileRequired.hidden = false;
    els.file.required = true;
    els.utilityForm.reset();
    els.currentFile.hidden = true;
    updateDescCount();
    refreshUpdatedAtField();
    updateFileUI(null);
    renderItemList();
    els.name.focus();
  }

  function fillFormFromItem(item) {
    els.name.value = item.name || "";
    els.description.value = item.description || "";
    els.file.value = "";
    updateDescCount();
    refreshUpdatedAtField();
    showCurrentFile(item);
    updateFileUI(null);
  }

  function showView(loggedIn) {
    els.loginView.hidden = loggedIn;
    els.panelView.hidden = !loggedIn;
  }

  async function initDashboard() {
    const user = sessionStorage.getItem(STORAGE_USER) || "관리자";
    els.userLabel.textContent = `${user} 님`;
    showView(true);
    await loadCatalog();
    startNewItem();
    setPanelStatus("");
  }

  async function handleLogin(e) {
    e.preventDefault();
    setLoginError("");

    const auth = getAuth();
    if (!auth) {
      setLoginError(
        "관리자 인증이 설정되지 않았습니다. 저장소 Secrets를 확인하세요."
      );
      return;
    }

    const adminId = els.adminId.value.trim();
    const password = els.password.value;
    const token = els.token.value.trim();

    if (!adminId || !password || !token) {
      setLoginError("아이디, 비밀번호, GitHub 토큰을 모두 입력하세요.");
      return;
    }

    try {
      if (adminId !== auth.adminId) {
        setLoginError("아이디가 올바르지 않습니다.");
        return;
      }
      const hash = await sha256Hex(password);
      if (hash !== auth.adminPasswordSha256) {
        setLoginError("비밀번호가 올바르지 않습니다.");
        return;
      }

      sessionStorage.setItem(STORAGE_TOKEN, token);
      await verifyToken();
      sessionStorage.setItem(STORAGE_USER, auth.adminId);
      sessionStorage.setItem(STORAGE_SESSION, "1");

      els.adminId.value = "";
      els.password.value = "";
      els.token.value = "";

      await initDashboard();
    } catch (err) {
      sessionStorage.removeItem(STORAGE_TOKEN);
      sessionStorage.removeItem(STORAGE_USER);
      sessionStorage.removeItem(STORAGE_SESSION);
      setLoginError(err.message || "로그인에 실패했습니다.");
    }
  }

  function handleLogout() {
    sessionStorage.removeItem(STORAGE_TOKEN);
    sessionStorage.removeItem(STORAGE_USER);
    sessionStorage.removeItem(STORAGE_SESSION);
    catalogData = null;
    selectedId = null;
    showView(false);
    setPanelStatus("");
    els.loginForm.reset();
  }

  async function uploadDownloadFile(file) {
    const safeName = sanitizeDownloadName(file.name);
    const path = `${cfg.downloadsPath}/${safeName}`;
    let sha = null;
    try {
      const existing = await readRepoFile(path);
      sha = existing.sha;
    } catch {
      /* 새 파일 */
    }
    const base64 = await fileToBase64(file);
    await writeRepoFile(
      path,
      base64,
      sha,
      sha ? `update file: ${safeName}` : `upload: ${safeName}`
    );
    return { path, fileName: file.name, fileSize: formatFileSize(file.size) };
  }

  function assignFile(file) {
    if (!file) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    els.file.files = dt.files;
    updateFileUI(file);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setPanelStatus("저장 중…");

    const name = els.name.value.trim();
    const description = els.description.value.trim();
    const fileInput = els.file.files[0];
    const updatedAt = todayISO();

    if (!name || !description) {
      setPanelStatus("이름과 설명을 입력하세요.", true);
      return;
    }

    if (!isEditMode && !fileInput) {
      setPanelStatus("새 등록 시 파일을 선택하세요.", true);
      return;
    }

    if (fileInput && fileInput.size > 50 * 1024 * 1024) {
      setPanelStatus("50MB 이하 파일만 업로드할 수 있습니다.", true);
      return;
    }

    els.submitBtn.disabled = true;

    try {
      const { json, sha } = await readRepoFile(cfg.dataPath);
      const utilities = [...(json.utilities || [])];

      if (isEditMode) {
        const existing = getSelectedItem();
        if (!existing) {
          setPanelStatus("왼쪽 목록에서 수정할 항목을 선택하세요.", true);
          return;
        }

        let filePath = existing.file;
        let fileName = existing.fileName || "";
        let fileSize = existing.fileSize || "";

        if (fileInput) {
          const uploaded = await uploadDownloadFile(fileInput);
          filePath = uploaded.path;
          fileName = uploaded.fileName;
          fileSize = uploaded.fileSize;
        }

        const idx = utilities.findIndex((u) => u.id === existing.id);
        utilities[idx] = {
          ...existing,
          name,
          description,
          updatedAt,
          file: filePath,
          fileName,
          fileSize,
        };

        await writeRepoFile(
          cfg.dataPath,
          textToBase64(JSON.stringify({ ...json, utilities }, null, 2) + "\n"),
          sha,
          `update utility: ${name}`
        );
        setPanelStatus(`「${name}」 수정 완료. 사이트 반영까지 1~2분 걸릴 수 있습니다.`);
        selectedId = existing.id;
      } else {
        const uploaded = await uploadDownloadFile(fileInput);
        let id = slugify(fileInput.name);
        if (utilities.some((u) => u.id === id)) {
          id = `${id}-${Date.now().toString(36)}`;
        }

        utilities.unshift({
          id,
          name,
          description,
          updatedAt,
          file: uploaded.path,
          fileName: uploaded.fileName,
          fileSize: uploaded.fileSize,
        });

        await writeRepoFile(
          cfg.dataPath,
          textToBase64(JSON.stringify({ ...json, utilities }, null, 2) + "\n"),
          sha,
          `add utility: ${name}`
        );
        setPanelStatus(`「${name}」 등록 완료. 사이트 반영까지 1~2분 걸릴 수 있습니다.`);
        selectedId = id;
        isEditMode = true;
      }

      await loadCatalog();
      renderItemList();
      if (selectedId) selectItem(selectedId);
      else startNewItem();
    } catch (err) {
      setPanelStatus(err.message || "저장에 실패했습니다.", true);
    } finally {
      els.submitBtn.disabled = false;
    }
  }

  async function handleDelete() {
    const existing = getSelectedItem();
    if (!existing) {
      setPanelStatus("삭제할 항목을 선택하세요.", true);
      return;
    }
    if (
      !confirm(
        `「${existing.name}」 항목을 목록에서 삭제할까요?\n(다운로드 파일은 저장소에 남을 수 있습니다.)`
      )
    ) {
      return;
    }

    setPanelStatus("삭제 중…");
    els.deleteBtn.disabled = true;

    try {
      const { json, sha } = await readRepoFile(cfg.dataPath);
      const utilities = (json.utilities || []).filter(
        (u) => u.id !== existing.id
      );
      await writeRepoFile(
        cfg.dataPath,
        textToBase64(JSON.stringify({ ...json, utilities }, null, 2) + "\n"),
        sha,
        `remove utility: ${existing.name}`
      );
      setPanelStatus(`「${existing.name}」 삭제 완료.`);
      await loadCatalog();
      startNewItem();
    } catch (err) {
      setPanelStatus(err.message || "삭제에 실패했습니다.", true);
    } finally {
      els.deleteBtn.disabled = false;
    }
  }

  els.loginForm.addEventListener("submit", handleLogin);
  els.logoutBtn.addEventListener("click", handleLogout);
  els.utilityForm.addEventListener("submit", handleSubmit);
  els.deleteBtn.addEventListener("click", handleDelete);
  els.newBtn.addEventListener("click", startNewItem);
  els.description.addEventListener("input", updateDescCount);

  els.file.addEventListener("change", () => {
    updateFileUI(els.file.files[0] || null);
  });

  els.dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    els.dropzone.classList.add("admin-dropzone--drag");
  });

  els.dropzone.addEventListener("dragleave", () => {
    els.dropzone.classList.remove("admin-dropzone--drag");
  });

  els.dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    els.dropzone.classList.remove("admin-dropzone--drag");
    const file = e.dataTransfer?.files?.[0];
    if (file) assignFile(file);
  });

  if (isLoggedIn()) {
    initDashboard().catch((err) => {
      handleLogout();
      setLoginError(err.message);
    });
  } else if (!getAuth()) {
    setLoginError(
      "배포 환경에서 관리자 Secrets가 설정되지 않았습니다. README의 설정 안내를 참고하세요."
    );
  }
})();
