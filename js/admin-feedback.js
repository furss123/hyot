/**
 * HyoT 관리자 — 의견 게시판 (Firebase)
 */
(function () {
  const feedbackCfg = window.HYOT_FEEDBACK_CONFIG;
  const fb = window.HyotFirebaseFeedback;
  if (!feedbackCfg || !fb) return;
  if (!fb.isConfigured()) return;

  const els = {
    tabCatalog: document.querySelector('[data-admin-tab="catalog"]'),
    tabFeedback: document.querySelector('[data-admin-tab="feedback"]'),
    catalogView: document.getElementById("admin-catalog-view"),
    feedbackView: document.getElementById("admin-feedback-view"),
    feedbackList: document.getElementById("admin-feedback-list"),
    feedbackEmpty: document.getElementById("admin-feedback-empty"),
    feedbackStatus: document.getElementById("admin-feedback-status"),
    authPanel: document.getElementById("admin-feedback-auth"),
    authForm: document.getElementById("admin-feedback-auth-form"),
    authEmail: document.getElementById("admin-feedback-email"),
    authPassword: document.getElementById("admin-feedback-password"),
    authSignOut: document.getElementById("admin-feedback-signout"),
    listWrap: document.getElementById("admin-feedback-list-wrap"),
  };

  if (!els.feedbackView) return;

  const categoryMap = Object.fromEntries(
    (feedbackCfg.categories || []).map((c) => [c.id, c.label])
  );

  let feedbackData = { posts: [] };
  let firebaseReady = false;

  function setFeedbackStatus(message, isError = false) {
    if (!els.feedbackStatus) return;
    els.feedbackStatus.textContent = message;
    els.feedbackStatus.classList.toggle("admin-toast--error", isError);
    els.feedbackStatus.hidden = !message;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  }

  function updateAuthUi() {
    const authed = fb.isAdmin();
    if (els.authPanel) els.authPanel.hidden = authed;
    if (els.listWrap) els.listWrap.hidden = !authed;
    if (els.authSignOut) els.authSignOut.hidden = !authed;
  }

  function renderFeedbackList() {
    const posts = [...(feedbackData.posts || [])].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
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
      cat.className = `feedback-item__category feedback-item__category--${post.category}`;
      cat.textContent = categoryMap[post.category] || post.category;

      const title = document.createElement("strong");
      title.className = "admin-feedback-item__title";
      title.textContent = post.utilityLabel || post.utilityName || post.title || "의견";

      head.append(cat, title);

      const meta = document.createElement("p");
      meta.className = "admin-feedback-item__meta";
      const status =
        post.status === "resolved"
          ? "처리 완료"
          : post.status === "hidden"
            ? "숨김"
            : "접수";
      meta.textContent = `${post.author || "익명"} · ${formatDate(post.createdAt)} · ${status}`;

      const body = document.createElement("p");
      body.className = "admin-feedback-item__body";
      body.textContent = post.body;

      if (post.utilityLabel || post.utilityName) {
        const target = document.createElement("p");
        target.className = "admin-feedback-item__target";
        target.textContent = post.utilityLabel || post.utilityName;
        li.append(head, target, meta, body);
      } else {
        li.append(head, meta, body);
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
      delBtn.addEventListener("click", () => deletePost(post.id));

      actions.append(hideBtn, delBtn);
      li.appendChild(actions);
      fragment.appendChild(li);
    });

    els.feedbackList.appendChild(fragment);
  }

  async function loadFeedback() {
    if (!firebaseReady) {
      setFeedbackStatus("Firebase 설정이 필요합니다.", true);
      return;
    }
    if (!fb.isAdmin()) {
      updateAuthUi();
      return;
    }

    setFeedbackStatus("불러오는 중…");
    try {
      const posts = await fb.listPosts({ includeHidden: true });
      feedbackData = { posts };
      renderFeedbackList();
      setFeedbackStatus("");
    } catch (err) {
      console.error(err);
      setFeedbackStatus("의견 목록을 불러오지 못했습니다.", true);
    }
  }

  async function updatePostStatus(id, status) {
    if (!fb.isAdmin()) return;
    try {
      await fb.updatePost(id, { status });
      await loadFeedback();
      setFeedbackStatus("저장되었습니다.");
    } catch (err) {
      setFeedbackStatus(err.message || "저장 실패", true);
    }
  }

  async function deletePost(id) {
    if (!confirm("이 의견을 삭제하시겠습니까?")) return;
    try {
      await fb.deletePost(id);
      await loadFeedback();
      setFeedbackStatus("삭제되었습니다.");
    } catch (err) {
      setFeedbackStatus(err.message || "삭제 실패", true);
    }
  }

  async function onAuthSubmit(event) {
    event.preventDefault();
    const email = els.authEmail?.value?.trim();
    const password = els.authPassword?.value || "";
    if (!email || !password) {
      setFeedbackStatus("이메일과 비밀번호를 입력하세요.", true);
      return;
    }
    try {
      await fb.signInAdmin(email, password);
      setFeedbackStatus("");
      await loadFeedback();
    } catch (err) {
      setFeedbackStatus("로그인에 실패했습니다. Firebase 계정을 확인하세요.", true);
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

  async function boot() {
    if (!fb.isConfigured()) {
      setFeedbackStatus("Firebase 설정이 없습니다. docs/feedback-firebase-setup.md", true);
      return;
    }
    try {
      await fb.init();
      firebaseReady = true;
      fb.onAuthChange(() => {
        updateAuthUi();
        if (document.querySelector('[data-admin-tab="feedback"]')?.classList.contains("is-active")) {
          loadFeedback();
        }
      });
      updateAuthUi();
    } catch (err) {
      console.error(err);
      setFeedbackStatus("Firebase 연결 실패", true);
    }
  }

  els.authForm?.addEventListener("submit", onAuthSubmit);
  els.authSignOut?.addEventListener("click", async () => {
    await fb.signOutAdmin();
    updateAuthUi();
    setFeedbackStatus("");
  });

  els.tabCatalog?.addEventListener("click", () => switchTab("catalog"));
  els.tabFeedback?.addEventListener("click", () => switchTab("feedback"));

  window.HyotAdminFeedback = { reload: loadFeedback, switchTab };
  boot();
})();
