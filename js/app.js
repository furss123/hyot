/**
 * HyoT의 자료실 — 방문자 화면
 */

const DATA_URL = "data/data.json";
const {
  list: PLATFORMS,
  migrateUtility,
  getPlatformFile,
  hasExternalLink,
  isValidUtility,
  createPlatformIcon,
  createFileIcon,
  createUtilityIcon,
} = window.HYOT_PLATFORMS;

const els = {
  siteTitle: document.getElementById("site-title"),
  siteTagline: document.getElementById("site-tagline"),
  status: document.getElementById("status"),
  grid: document.getElementById("utility-grid"),
  empty: document.getElementById("empty-state"),
  footerYear: document.getElementById("footer-year"),
};

let allUtilities = [];

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.classList.toggle("status--error", isError);
}

function formatDate(isoDate) {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function sortByUpdatedAt(items) {
  return [...items].sort((a, b) => {
    const ta = new Date(a.updatedAt).getTime() || 0;
    const tb = new Date(b.updatedAt).getTime() || 0;
    return tb - ta;
  });
}

function normalizeUtilities(raw = []) {
  const migrated = raw.map(migrateUtility);
  const valid = migrated.filter(isValidUtility);
  const skipped = raw.length - valid.length;
  if (skipped > 0) {
    console.warn(`[HyoT] ${skipped}개 항목이 필수 필드 누락으로 제외되었습니다.`);
  }
  return sortByUpdatedAt(valid);
}

function buildMetaText(item) {
  const parts = [`업데이트 · ${formatDate(item.updatedAt)}`];
  if (item.version) parts.push(`v${item.version}`);
  const sizes = PLATFORMS.map((p) => {
    const pf = getPlatformFile(item, p.id);
    return pf?.fileSize ? `${p.shortLabel} ${pf.fileSize}` : "";
  }).filter(Boolean);
  if (sizes.length) parts.push(sizes.join(" · "));
  return parts.join(" · ");
}

function createLinkButton(item) {
  const link = document.createElement("a");
  link.className = "btn-download btn-download--link";
  link.href = item.link;
  link.append(
    createFileIcon("link", "btn-download__icon"),
    document.createTextNode(item.linkLabel || "바로가기")
  );
  if (item.link.startsWith("http")) {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }
  link.setAttribute("aria-label", `${item.name} — ${link.textContent}`);
  return link;
}

function getDownloadFileName(item, platform, pf) {
  if (pf?.fileName) return pf.fileName;
  if (pf?.file) return pf.file.split("/").pop();
  return item.name;
}

function createDownloadSpinner() {
  const spinner = document.createElement("span");
  spinner.className = "btn-platform__spinner";
  spinner.setAttribute("aria-hidden", "true");
  return spinner;
}

function setPlatformDownloadLoading(link, loading) {
  link.classList.toggle("is-downloading", loading);
  link.setAttribute("aria-busy", loading ? "true" : "false");
  if (loading) {
    if (!link.dataset.downloadAriaLabel) {
      link.dataset.downloadAriaLabel = link.getAttribute("aria-label") || "";
    }
    link.setAttribute("aria-label", "다운로드 준비 중…");
    return;
  }
  if (link.dataset.downloadAriaLabel) {
    link.setAttribute("aria-label", link.dataset.downloadAriaLabel);
    delete link.dataset.downloadAriaLabel;
  }
}

const DOWNLOAD_PROBE_TIMEOUT_MS = 15000;

async function waitUntilFileReady(url) {
  const ac = new AbortController();
  const timer = window.setTimeout(() => ac.abort(), DOWNLOAD_PROBE_TIMEOUT_MS);
  try {
    try {
      const head = await fetch(url, {
        method: "HEAD",
        cache: "no-store",
        credentials: "same-origin",
        signal: ac.signal,
      });
      if (head.ok) return true;
      if (head.status !== 405 && head.status !== 501) return false;
    } catch (_) {
      /* HEAD blocked or unsupported — try range */
    }

    const range = await fetch(url, {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      signal: ac.signal,
      headers: { Range: "bytes=0-0" },
    });
    return range.ok || range.status === 206;
  } catch (_) {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

function triggerPlatformDownload(link) {
  const a = document.createElement("a");
  a.href = link.href;
  if (link.download) a.download = link.download;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function handlePlatformDownloadClick(event) {
  const link = event.target.closest("a.btn-platform");
  if (!link || link.classList.contains("btn-platform--missing")) return;

  event.preventDefault();
  if (link.classList.contains("is-downloading")) return;

  setPlatformDownloadLoading(link, true);
  try {
    await waitUntilFileReady(link.href);
    triggerPlatformDownload(link);
  } catch (err) {
    console.warn("[HyoT] download probe failed, trying direct download:", err);
    triggerPlatformDownload(link);
  } finally {
    window.setTimeout(() => setPlatformDownloadLoading(link, false), 320);
  }
}

function bindPlatformDownloads() {
  if (els.grid.dataset.downloadBound === "1") return;
  els.grid.dataset.downloadBound = "1";
  els.grid.addEventListener("click", handlePlatformDownloadClick);
}

function createPlatformButton(item, platform) {
  const pf = getPlatformFile(item, platform.id);

  const inner = document.createDocumentFragment();
  inner.appendChild(createPlatformIcon(platform.id));

  const label = document.createElement("span");
  label.className = "btn-platform__label";
  label.textContent = platform.label;

  if (pf) {
    inner.appendChild(label);
    if (pf.fileSize) {
      const size = document.createElement("span");
      size.className = "btn-platform__size";
      size.textContent = pf.fileSize;
      inner.appendChild(size);
    }

    const link = document.createElement("a");
    link.className = `btn-download btn-platform btn-platform--${platform.id}`;
    link.href = pf.file;
    if (pf.fileName) link.download = pf.fileName;
    const ariaSize = pf.fileSize ? ` (${pf.fileSize})` : "";
    link.setAttribute(
      "aria-label",
      `${item.name} — ${getDownloadFileName(item, platform, pf)}${ariaSize} 다운로드`
    );
    link.append(inner, createDownloadSpinner());
    return link;
  }

  inner.appendChild(label);
  const missing = document.createElement("span");
  missing.className = "btn-platform__missing";
  missing.textContent = "준비 중";
  inner.appendChild(missing);

  const span = document.createElement("span");
  span.className = `btn-platform btn-platform--${platform.id} btn-platform--missing`;
  span.setAttribute("aria-disabled", "true");
  span.title = `${platform.label}용 파일이 아직 등록되지 않았습니다.`;
  span.append(inner);
  return span;
}

function createCard(item) {
  const li = document.createElement("li");
  li.className = "utility-card";
  li.dataset.id = item.id;

  const header = document.createElement("div");
  header.className = "utility-card__header";

  const name = document.createElement("h3");
  name.className = "utility-card__name";

  const nameText = document.createElement("span");
  nameText.className = "utility-card__name-text";
  nameText.textContent = item.name;

  name.append(createUtilityIcon(item, "utility-card__file-icon"), nameText);

  const desc = document.createElement("p");
  desc.className = "utility-card__desc";
  desc.textContent = item.description;

  const meta = document.createElement("p");
  meta.className = "utility-card__meta";
  meta.textContent = buildMetaText(item);

  header.append(name, desc, meta);

  const actions = document.createElement("div");
  actions.className = "utility-card__downloads";

  if (hasExternalLink(item)) {
    actions.setAttribute("role", "group");
    actions.setAttribute("aria-label", "바로가기");
    actions.appendChild(createLinkButton(item));
  } else {
    actions.setAttribute("role", "group");
    actions.setAttribute("aria-label", "플랫폼별 다운로드");
    PLATFORMS.forEach((platform) => {
      actions.appendChild(createPlatformButton(item, platform));
    });
  }

  li.append(header, actions);
  return li;
}

function applySiteMeta(site = {}) {
  if (site.title) {
    els.siteTitle.textContent = site.title;
    document.title = site.title;
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute("content", site.title);
  }
  if (site.tagline) els.siteTagline.textContent = site.tagline;
  if (site.description) {
    const desc = document.querySelector('meta[name="description"]');
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (desc) desc.setAttribute("content", site.description);
    if (ogDesc) ogDesc.setAttribute("content", site.description);
  }
}

function renderUtilities(utilities = []) {
  els.grid.replaceChildren();

  if (!utilities.length) {
    els.empty.hidden = false;
    els.empty.textContent =
      "등록된 자료가 없습니다. 곧 새로운 유틸리티가 추가될 예정입니다.";
    return;
  }

  els.empty.hidden = true;
  const fragment = document.createDocumentFragment();
  utilities.forEach((item) => fragment.appendChild(createCard(item)));
  els.grid.appendChild(fragment);
}

async function init() {
  els.footerYear.textContent = String(new Date().getFullYear());
  bindPlatformDownloads();
  setStatus("자료 목록을 불러오는 중…");

  try {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    applySiteMeta(data.site);
    allUtilities = normalizeUtilities(data.utilities);
    renderUtilities(allUtilities);
    setStatus("");
  } catch (err) {
    console.error("[HyoT] data load failed:", err);
    setStatus("자료 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", true);
    els.empty.hidden = false;
  }
}

init();
window.HyotApp = { refresh: init };
