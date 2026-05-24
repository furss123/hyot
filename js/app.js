/**
 * HyoT의 자료실 — 방문자 화면
 */

const DATA_URL = "data/data.json";
const { list: PLATFORMS, migrateUtility, getPlatformFile, isValidUtility, createPlatformIcon } =
  window.HYOT_PLATFORMS;

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

function createPlatformButton(item, platform) {
  const pf = getPlatformFile(item, platform.id);
  const label = document.createElement("span");
  label.className = "btn-platform__label";
  label.textContent = platform.label;

  const size = document.createElement("span");
  size.className = "btn-platform__size";
  size.textContent = pf?.fileSize || "";

  const inner = document.createDocumentFragment();
  inner.append(createPlatformIcon(platform.id), label);
  if (pf?.fileSize) inner.append(size);

  if (pf) {
    const link = document.createElement("a");
    link.className = `btn-download btn-platform btn-platform--${platform.id}`;
    link.href = pf.file;
    if (pf.fileName) link.download = pf.fileName;
    link.setAttribute("aria-label", `${item.name} — ${platform.label} 다운로드`);
    link.append(inner);
    return link;
  }

  const span = document.createElement("span");
  span.className = `btn-platform btn-platform--${platform.id} btn-platform--missing`;
  span.setAttribute("aria-disabled", "true");
  span.title = `${platform.label}용 파일이 아직 등록되지 않았습니다.`;
  span.append(inner);
  const missing = document.createElement("span");
  missing.className = "btn-platform__missing";
  missing.textContent = "준비 중";
  span.append(missing);
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
  name.textContent = item.name;

  const desc = document.createElement("p");
  desc.className = "utility-card__desc";
  desc.textContent = item.description;

  const meta = document.createElement("p");
  meta.className = "utility-card__meta";
  meta.textContent = buildMetaText(item);

  header.append(name, desc, meta);

  const downloads = document.createElement("div");
  downloads.className = "utility-card__downloads";
  downloads.setAttribute("role", "group");
  downloads.setAttribute("aria-label", "플랫폼별 다운로드");
  PLATFORMS.forEach((platform) => {
    downloads.appendChild(createPlatformButton(item, platform));
  });

  li.append(header, downloads);
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
