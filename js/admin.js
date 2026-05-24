/**
 * HyoT 관리자 — 최소 기능: 목록 · 등록 · 수정 · 삭제
 */

(function () {
  const STORAGE_TOKEN = "hyot_github_token";
  const STORAGE_SESSION = "hyot_admin_session";

  const cfg = window.HYOT_ADMIN_CONFIG;
  const secrets = window.HYOT_ADMIN_SECRETS;

  if (!cfg) return;

  const $ = (id) => document.getElementById(id);

  const els = {
    loginView: $("admin-login-view"),
    panelView: $("admin-panel-view"),
    loginForm: $("admin-login-form"),
    loginError: $("admin-login-error"),
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
    file: $("admin-file"),
    submitBtn: $("admin-submit-btn"),
    deleteBtn: $("admin-delete-btn"),
  };

  let catalogData = null;
  let selectedId = null;

  const isEdit = () => Boolean(selectedId);
  const getItem = () =>
    catalogData?.utilities?.find((u) => u.id === selectedId) ?? null;

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

  function todayISO() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 10);
  }

  function formatDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso || "";
    return new Intl.DateTimeFormat("ko-KR", {
      month: "short",
      day: "numeric",
    }).format(d);
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

  function isLoggedIn() {
    return sessionStorage.getItem(STORAGE_SESSION) === "1" && getToken();
  }

  async function api(path, options = {}) {
    const res = await fetch(`https://api.github.com${path}`, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${getToken()}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    if (!res.ok) {
      let msg = `오류 ${res.status}`;
      try {
        const j = await res.json();
        msg = j.message || msg;
      } catch {
        /* ignore */
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

  async function writeJson(json, sha, message) {
    const body = {
      message,
      content: btoa(
        String.fromCharCode(...new TextEncoder().encode(JSON.stringify(json, null, 2) + "\n"))
      ),
      branch: cfg.github.branch,
      sha,
    };
    await api(
      `/repos/${cfg.github.owner}/${cfg.github.repo}/contents/${cfg.dataPath}`,
      { method: "PUT", body: JSON.stringify(body) }
    );
  }

  async function uploadFile(file) {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
    const path = `${cfg.downloadsPath}/${safe}`;
    let sha = null;
    try {
      const ref = encodeURIComponent(cfg.github.branch);
      const ex = await api(
        `/repos/${cfg.github.owner}/${cfg.github.repo}/contents/${path}?ref=${ref}`
      );
      sha = ex.sha;
    } catch {
      /* new */
    }
    const b64 = await new Promise((ok, no) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).split(",")[1]);
      r.onerror = () => no(r.error);
      r.readAsDataURL(file);
    });
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
    return {
      path,
      fileName: file.name,
      fileSize: formatSize(file.size),
    };
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

  function onFilePick() {
    const f = els.file.files[0];
    els.fileDisplay.textContent = f ? f.name : isEdit() ? els.fileDisplay.textContent : "파일 선택";
  }

  async function load() {
    const { json } = await readJson();
    catalogData = json;
    renderList();
  }

  async function onLogin(e) {
    e.preventDefault();
    els.loginError.textContent = "";

    if (!secrets?.adminId) {
      els.loginError.textContent = "관리자 설정이 없습니다.";
      return;
    }

    const id = $("admin-id").value.trim();
    const pw = $("admin-password").value;
    const token = $("admin-token").value.trim();

    try {
      if (id !== secrets.adminId) throw new Error("아이디가 올바르지 않습니다.");
      if ((await sha256Hex(pw)) !== secrets.adminPasswordSha256) {
        throw new Error("비밀번호가 올바르지 않습니다.");
      }

      sessionStorage.setItem(STORAGE_TOKEN, token);
      const user = await api("/user");
      const repo = await api(`/repos/${cfg.github.owner}/${cfg.github.repo}`);
      if (!repo.permissions?.push && !repo.permissions?.admin) {
        throw new Error("저장소 쓰기 권한이 있는 토큰이 필요합니다.");
      }

      sessionStorage.setItem(STORAGE_SESSION, "1");
      els.loginView.hidden = true;
      els.panelView.hidden = false;
      $("admin-login-form").reset();
      await load();
      pickNew();
    } catch (err) {
      sessionStorage.removeItem(STORAGE_TOKEN);
      sessionStorage.removeItem(STORAGE_SESSION);
      els.loginError.textContent = err.message;
    }
  }

  function logout() {
    sessionStorage.clear();
    selectedId = null;
    catalogData = null;
    els.panelView.hidden = true;
    els.loginView.hidden = false;
    toast("");
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
    if (file && file.size > 50 * 1024 * 1024) {
      toast("50MB 이하만 업로드할 수 있습니다.", true);
      return;
    }

    els.submitBtn.disabled = true;
    toast("저장 중…");

    try {
      const { json, sha } = await readJson();
      const list = [...(json.utilities || [])];
      const updatedAt = todayISO();

      if (isEdit()) {
        const cur = getItem();
        let filePath = cur.file;
        let fileName = cur.fileName || "";
        let fileSize = cur.fileSize || "";
        if (file) {
          const up = await uploadFile(file);
          filePath = up.path;
          fileName = up.fileName;
          fileSize = up.fileSize;
        }
        const i = list.findIndex((u) => u.id === cur.id);
        list[i] = { ...cur, name, description: desc, updatedAt, file: filePath, fileName, fileSize };
        await writeJson({ ...json, utilities: list }, sha, `update: ${name}`);
        selectedId = cur.id;
        toast(`「${name}」 저장됨 · 1~2분 후 사이트 반영`);
      } else {
        const up = await uploadFile(file);
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
        await writeJson({ ...json, utilities: list }, sha, `add: ${name}`);
        selectedId = id;
        toast(`「${name}」 등록됨 · 1~2분 후 사이트 반영`);
      }

      await load();
      if (selectedId) pickItem(selectedId);
      else pickNew();
    } catch (err) {
      toast(err.message, true);
    } finally {
      els.submitBtn.disabled = false;
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

  els.loginForm.addEventListener("submit", onLogin);
  els.logoutBtn.addEventListener("click", logout);
  els.newBtn.addEventListener("click", pickNew);
  els.form.addEventListener("submit", onSave);
  els.deleteBtn.addEventListener("click", onDelete);
  els.file.addEventListener("change", onFilePick);

  if (isLoggedIn()) {
    els.loginView.hidden = true;
    els.panelView.hidden = false;
    load().then(() => pickNew()).catch((err) => {
      logout();
      els.loginError.textContent = err.message;
      els.loginView.hidden = false;
    });
  } else if (!secrets?.adminId) {
    els.loginError.textContent = "배포 Secrets를 확인하세요.";
  }
})();
