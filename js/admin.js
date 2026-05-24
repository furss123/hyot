/**
 * HyoT의 자료실 — 관리자 패널
 * GitHub API로 data.json 갱신 및 downloads/ 파일 업로드
 */

(function () {
  const STORAGE_TOKEN = "hyot_github_token";
  const STORAGE_USER = "hyot_admin_user";

  const cfg = window.HYOT_ADMIN_CONFIG;
  if (!cfg) {
    console.warn("[HyoT Admin] admin-config.js 가 없습니다.");
    return;
  }

  const els = {
    openBtn: document.getElementById("admin-open-btn"),
    modal: document.getElementById("admin-modal"),
    backdrop: document.querySelector("[data-admin-close]"),
    closeBtn: document.getElementById("admin-close-btn"),
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
    modeNew: document.getElementById("admin-mode-new"),
    modeEdit: document.getElementById("admin-mode-edit"),
    editSelect: document.getElementById("admin-edit-select"),
    editSelectWrap: document.getElementById("admin-edit-select-wrap"),
    name: document.getElementById("admin-name"),
    description: document.getElementById("admin-description"),
    file: document.getElementById("admin-file"),
    fileHint: document.getElementById("admin-file-hint"),
    updatedAt: document.getElementById("admin-updated-at"),
    submitBtn: document.getElementById("admin-submit-btn"),
    deleteBtn: document.getElementById("admin-delete-btn"),
    panelStatus: document.getElementById("admin-panel-status"),
    fileRequired: document.getElementById("admin-file-required"),
  };

  let catalogData = null;
  let isEditMode = false;

  function getToken() {
    return sessionStorage.getItem(STORAGE_TOKEN);
  }

  function isLoggedIn() {
    return Boolean(getToken());
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
    els.updatedAt.value = todayISO();
    els.updatedAt.title = "업로드·저장 시 오늘 날짜로 자동 설정됩니다";
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
        ...(options.body && !(options.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
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
    const body = {
      message,
      content: base64Content,
      branch: cfg.github.branch,
    };
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
      reader.onload = () => {
        const result = reader.result;
        const base64 = String(result).split(",")[1];
        resolve(base64);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function loadCatalog() {
    const { json } = await readRepoFile(cfg.dataPath);
    catalogData = json;
    return json;
  }

  function populateEditSelect() {
    const utilities = catalogData?.utilities || [];
    els.editSelect.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "수정할 항목 선택";
    els.editSelect.append(placeholder);

    utilities.forEach((item) => {
      const opt = document.createElement("option");
      opt.value = item.id;
      opt.textContent = item.name;
      els.editSelect.append(opt);
    });
  }

  function setMode(edit) {
    isEditMode = edit;
    els.modeNew.classList.toggle("admin-mode--active", !edit);
    els.modeEdit.classList.toggle("admin-mode--active", edit);
    els.editSelectWrap.hidden = !edit;
    els.deleteBtn.hidden = !edit;
    els.fileRequired.hidden = edit;
    els.file.required = !edit;

    if (edit) {
      els.fileHint.textContent =
        "새 파일을 선택하지 않으면 기존 파일을 유지합니다.";
    } else {
      els.fileHint.textContent = "ZIP, EXE 등 배포 파일을 선택하세요.";
      els.utilityForm.reset();
      els.editSelect.value = "";
    }
    refreshUpdatedAtField();
  }

  function fillFormFromItem(item) {
    els.name.value = item.name || "";
    els.description.value = item.description || "";
    els.file.value = "";
    refreshUpdatedAtField();
  }

  function showView(loggedIn) {
    els.loginView.hidden = loggedIn;
    els.panelView.hidden = !loggedIn;
    els.openBtn.classList.toggle("admin-btn--active", loggedIn);
    els.openBtn.textContent = loggedIn ? "관리자 ✓" : "관리자";
  }

  function openModal() {
    els.modal.hidden = false;
    document.body.classList.add("admin-modal-open");
    refreshUpdatedAtField();

    if (isLoggedIn()) {
      showView(true);
      const user = sessionStorage.getItem(STORAGE_USER);
      els.userLabel.textContent = user ? `${user} 님` : "관리자";
      loadCatalog()
        .then(() => {
          populateEditSelect();
          setMode(false);
        })
        .catch((err) => setPanelStatus(err.message, true));
    } else {
      showView(false);
      setLoginError("");
    }
  }

  function closeModal() {
    els.modal.hidden = true;
    document.body.classList.remove("admin-modal-open");
  }

  async function handleLogin(e) {
    e.preventDefault();
    setLoginError("");

    const adminId = els.adminId.value.trim();
    const password = els.password.value;
    const token = els.token.value.trim();

    if (!adminId || !password || !token) {
      setLoginError("아이디, 비밀번호, GitHub 토큰을 모두 입력하세요.");
      return;
    }

    try {
      if (adminId !== cfg.adminId) {
        setLoginError("아이디가 올바르지 않습니다.");
        return;
      }

      const hash = await sha256Hex(password);
      if (hash !== cfg.adminPasswordSha256) {
        setLoginError("비밀번호가 올바르지 않습니다.");
        return;
      }

      sessionStorage.setItem(STORAGE_TOKEN, token);
      const user = await verifyToken();
      sessionStorage.setItem(STORAGE_USER, cfg.adminId);

      els.adminId.value = "";
      els.password.value = "";
      els.token.value = "";
      showView(true);
      els.userLabel.textContent = `${cfg.adminId} 님`;
      await loadCatalog();
      populateEditSelect();
      setMode(false);
      setPanelStatus("");
    } catch (err) {
      sessionStorage.removeItem(STORAGE_TOKEN);
      sessionStorage.removeItem(STORAGE_USER);
      setLoginError(err.message || "로그인에 실패했습니다.");
    }
  }

  function handleLogout() {
    sessionStorage.removeItem(STORAGE_TOKEN);
    sessionStorage.removeItem(STORAGE_USER);
    catalogData = null;
    showView(false);
    setPanelStatus("");
    closeModal();
  }

  function getSelectedItem() {
    const id = els.editSelect.value;
    if (!id) return null;
    return catalogData?.utilities?.find((u) => u.id === id) || null;
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
          setPanelStatus("수정할 항목을 선택하세요.", true);
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

        const content = JSON.stringify({ ...json, utilities }, null, 2) + "\n";
        await writeRepoFile(
          cfg.dataPath,
          textToBase64(content),
          sha,
          `update utility: ${name}`
        );
        setPanelStatus(`「${name}」 수정 완료. 사이트 반영까지 1~2분 걸릴 수 있습니다.`);
      } else {
        if (!fileInput) return;

        const uploaded = await uploadDownloadFile(fileInput);
        let id = slugify(fileInput.name);
        if (utilities.some((u) => u.id === id)) {
          id = `${id}-${Date.now().toString(36)}`;
        }

        const entry = {
          id,
          name,
          description,
          updatedAt,
          file: uploaded.path,
          fileName: uploaded.fileName,
          fileSize: uploaded.fileSize,
        };

        utilities.unshift(entry);
        const content = JSON.stringify({ ...json, utilities }, null, 2) + "\n";
        await writeRepoFile(
          cfg.dataPath,
          textToBase64(content),
          sha,
          `add utility: ${name}`
        );
        setPanelStatus(`「${name}」 등록 완료. 사이트 반영까지 1~2분 걸릴 수 있습니다.`);
      }

      await loadCatalog();
      populateEditSelect();
      els.utilityForm.reset();
      refreshUpdatedAtField();
      if (window.HyotApp?.refresh) await window.HyotApp.refresh();
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
    if (!confirm(`「${existing.name}」 항목을 목록에서 삭제할까요?\n(다운로드 파일은 저장소에 남을 수 있습니다.)`)) {
      return;
    }

    setPanelStatus("삭제 중…");
    els.deleteBtn.disabled = true;

    try {
      const { json, sha } = await readRepoFile(cfg.dataPath);
      const utilities = (json.utilities || []).filter((u) => u.id !== existing.id);
      const content = JSON.stringify({ ...json, utilities }, null, 2) + "\n";
      await writeRepoFile(
        cfg.dataPath,
        textToBase64(content),
        sha,
        `remove utility: ${existing.name}`
      );
      setPanelStatus(`「${existing.name}」 삭제 완료.`);
      await loadCatalog();
      populateEditSelect();
      setMode(false);
      if (window.HyotApp?.refresh) await window.HyotApp.refresh();
    } catch (err) {
      setPanelStatus(err.message || "삭제에 실패했습니다.", true);
    } finally {
      els.deleteBtn.disabled = false;
    }
  }

  els.openBtn.addEventListener("click", openModal);
  els.closeBtn.addEventListener("click", closeModal);
  els.backdrop.addEventListener("click", closeModal);
  els.loginForm.addEventListener("submit", handleLogin);
  els.logoutBtn.addEventListener("click", handleLogout);
  els.utilityForm.addEventListener("submit", handleSubmit);
  els.deleteBtn.addEventListener("click", handleDelete);

  els.modeNew.addEventListener("click", () => {
    setMode(false);
    els.utilityForm.reset();
    refreshUpdatedAtField();
  });

  els.modeEdit.addEventListener("click", () => setMode(true));

  els.editSelect.addEventListener("change", () => {
    const item = getSelectedItem();
    if (item) fillFormFromItem(item);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.modal.hidden) closeModal();
  });

  if (isLoggedIn()) {
    els.openBtn.classList.add("admin-btn--active");
    els.openBtn.textContent = "관리자 ✓";
  }
})();
