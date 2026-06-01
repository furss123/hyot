/**
 * HyoT — Firebase Firestore 의견 게시판
 */
(function () {
  const cfg = () => window.HYOT_FIREBASE_CONFIG;

  let app = null;
  let db = null;
  let auth = null;
  let ready = false;

  function isConfigured() {
    const c = cfg();
    return Boolean(c?.apiKey && c?.projectId && c?.appId);
  }

  function collectionName() {
    return cfg()?.collection || "feedback_posts";
  }

  function col() {
    if (!db) throw new Error("Firestore not initialized");
    return db.collection(collectionName());
  }

  async function init() {
    if (!isConfigured()) return false;
    if (ready) return true;
    if (typeof firebase === "undefined") throw new Error("Firebase SDK not loaded");

    const c = cfg();
    if (!firebase.apps.length) {
      app = firebase.initializeApp({
        apiKey: c.apiKey,
        authDomain: c.authDomain || `${c.projectId}.firebaseapp.com`,
        projectId: c.projectId,
        storageBucket: c.storageBucket || `${c.projectId}.appspot.com`,
        messagingSenderId: c.messagingSenderId || "",
        appId: c.appId,
      });
    } else {
      app = firebase.app();
    }
    db = firebase.firestore();
    auth = firebase.auth();
    ready = true;
    return true;
  }

  function docToPost(doc) {
    const data = doc.data();
    return { ...data, id: data.id || doc.id };
  }

  async function listPosts(options = {}) {
    const includeHidden = Boolean(options.includeHidden);
    const snap = await col().orderBy("createdAt", "desc").limit(200).get();
    let posts = snap.docs.map(docToPost);
    if (!includeHidden) posts = posts.filter((p) => p.status !== "hidden");
    return posts;
  }

  async function addPost(post) {
    await col().doc(post.id).set(post);
  }

  async function updatePost(id, patch) {
    await col().doc(id).update(patch);
  }

  async function deletePost(id) {
    await col().doc(id).delete();
  }

  async function signInAdmin(email, password) {
    if (!auth) throw new Error("Auth not initialized");
    await auth.signInWithEmailAndPassword(email, password);
  }

  async function signOutAdmin() {
    if (!auth) return;
    await auth.signOut();
  }

  function isAdmin() {
    return Boolean(auth?.currentUser);
  }

  function onAuthChange(callback) {
    if (!auth) return () => {};
    return auth.onAuthStateChanged(callback);
  }

  window.HyotFirebaseFeedback = {
    isConfigured,
    init,
    listPosts,
    addPost,
    updatePost,
    deletePost,
    signInAdmin,
    signOutAdmin,
    isAdmin,
    onAuthChange,
  };
})();
