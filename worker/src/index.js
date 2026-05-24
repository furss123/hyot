/**
 * HyoT feedback relay — GitHub 토큰은 Worker에만 저장 (Pages에 노출 안 함)
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const FEEDBACK_BRANCH = "main";
const MAX_SCREENSHOT_BASE64 = 600000;

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method !== "POST") {
      return json({ ok: false, error: "method_not_allowed" }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "invalid_json" }, 400);
    }

    const ingestKey = String(body.ingest_key || "");
    const post = body.post;
    if (!ingestKey || ingestKey !== env.INGEST_KEY) {
      return json({ ok: false, error: "forbidden" }, 403);
    }
    if (!post?.id || !post?.body) {
      return json({ ok: false, error: "invalid_post" }, 400);
    }

    const owner = env.GITHUB_OWNER || "furss123";
    const repo = env.GITHUB_REPO || "hyot";
    const token = env.GITHUB_TOKEN;
    if (!token) {
      return json({ ok: false, error: "server_not_configured" }, 503);
    }

    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "hyot-feedback-worker",
    };

    let prepared;
    try {
      prepared = await preparePostForStorage({ owner, repo, post, headers });
    } catch (err) {
      return json({ ok: false, error: "attachment_failed", detail: String(err) }, 400);
    }

    const dispatchRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/dispatches`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          event_type: "hyot_feedback_submit",
          client_payload: prepared,
        }),
      }
    );

    if (dispatchRes.ok) {
      return json({ ok: true, id: prepared.id });
    }

    try {
      await persistPost({ owner, repo, post: prepared, headers, branch: FEEDBACK_BRANCH });
      return json({ ok: true, id: prepared.id });
    } catch (err) {
      const detail = await dispatchRes.text().catch(() => String(err));
      return json({ ok: false, error: "github_failed", detail }, 502);
    }
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function screenshotExt(mime) {
  if (String(mime).includes("png")) return "png";
  if (String(mime).includes("webp")) return "webp";
  return "jpg";
}

async function putRepoFile({ owner, repo, path, branch, contentBase64, message, headers }) {
  const putBody = { message, content: contentBase64, branch };
  const getRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`,
    { headers }
  );
  if (getRes.ok) {
    const existing = await getRes.json();
    putBody.sha = existing.sha;
  } else if (getRes.status !== 404) {
    throw new Error(`read attachment: HTTP ${getRes.status}`);
  }

  const putRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    { method: "PUT", headers, body: JSON.stringify(putBody) }
  );
  if (!putRes.ok) {
    throw new Error(`write attachment: HTTP ${putRes.status}`);
  }
}

async function preparePostForStorage({ owner, repo, post, headers }) {
  const stored = { ...post, visibility: "admin" };
  delete stored.previewDataUrl;

  const raw = stored.screenshotBase64;
  if (raw) {
    if (String(raw).length > MAX_SCREENSHOT_BASE64) {
      throw new Error("screenshot_too_large");
    }
    const mime = stored.screenshotMime || "image/jpeg";
    const path = `feedback-attachments/${stored.id}.${screenshotExt(mime)}`;
    await putRepoFile({
      owner,
      repo,
      path,
      branch: FEEDBACK_BRANCH,
      contentBase64: String(raw).replace(/\s/g, ""),
      message: `feedback attachment: ${stored.id}`,
      headers,
    });
    stored.screenshotPath = path;
    stored.screenshotMime = mime;
    stored.hasScreenshot = true;
    delete stored.screenshotBase64;
  }

  return stored;
}

async function persistPost({ owner, repo, post, headers, branch }) {
  const path = "data/feedback.json";
  const ref = encodeURIComponent(branch);
  const getRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${ref}`,
    { headers }
  );

  let sha;
  let data = { posts: [] };
  if (getRes.ok) {
    const file = await getRes.json();
    sha = file.sha;
    const text = atob(file.content.replace(/\s/g, ""));
    data = JSON.parse(text);
  } else if (getRes.status !== 404) {
    throw new Error(`read ${branch}: HTTP ${getRes.status}`);
  }

  data.posts = Array.isArray(data.posts) ? data.posts : [];
  if (!data.posts.some((p) => p.id === post.id)) data.posts.unshift(post);

  const text = JSON.stringify(data, null, 2) + "\n";
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const content = btoa(binary);
  const putBody = {
    message: `feedback: ${post.title || post.id}`,
    content,
    branch,
    ...(sha ? { sha } : {}),
  };

  const putRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    { method: "PUT", headers, body: JSON.stringify(putBody) }
  );
  if (!putRes.ok) {
    throw new Error(`write ${branch}: HTTP ${putRes.status}`);
  }
}
