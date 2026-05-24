/**
 * HyoT의 자료실 — 방문자 화면
 */

const DATA_URL = "data/data.json";

const els = {
  siteTitle: document.getElementById("site-title"),
  siteTagline: document.getElementById("site-tagline"),
  siteDescription: document.getElementById("site-description"),
  status: document.getElementById("status"),
  grid: document.getElementById("utility-grid"),
  empty: document.getElementById("empty-state"),
  footerYear: document.getElementById("footer-year"),
  search: document.getElementById("search-input"),
  resultCount: document.getElementById("result-count"),
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

function isValidUtility(item) {
  return (
    item &&
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.description === "string" &&
    typeof item.updatedAt === "string" &&
    typeof item.file === "string"
  );
}

function sortByUpdatedAt(items) {
  return [...items].sort((a, b) => {
    const ta = new Date(a.updatedAt).getTime() || 0;
    const tb = new Date(b.updatedAt).getTime() || 0;
    return tb - ta;
  });
}

function normalizeUtilities(raw = []) {
  const valid = raw.filter(isValidUtility);
  const skipped = raw.length - valid.length;
  if (skipped > 0) {
    console.warn(`[HyoT] ${skipped}개 항목이 필수 필드 누락으로 제외되었습니다.`);
  }
  return sortByUpdatedAt(valid);
}

function filterUtilities(query) {
  const q = query.trim().toLowerCase();
  if (!q) return allUtilities;
  return allUtilities.filter(
    (item) =>
      item.name.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      (item.version && item.version.toLowerCase().includes(q))
  );
}

function updateResultCount(shown, total) {
  if (!total) {
    els.resultCount.textContent = "";
    return;
  }
  if (shown === total) {
    els.resultCount.textContent = `총 ${total}개`;
  } else {
    els.resultCount.textContent = `${shown}개 / 전체 ${total}개`;
  }
}

function createDownloadIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "btn-download__icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("aria-hidden", "true");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    "M12 3v12m0 0l4-4m-4 4L8 11M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2"
  );
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);
  return svg;
}

function buildMetaText(item) {
  const parts = [`업데이트 · ${formatDate(item.updatedAt)}`];
  if (item.version) parts.push(`v${item.version}`);
  if (item.fileSize) parts.push(item.fileSize);
  return parts.join(" · ");
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

  const link = document.createElement("a");
  link.className = "btn-download";
  link.href = item.file;
  if (item.fileName) link.download = item.fileName;
  link.setAttribute("aria-label", `${item.name} 다운로드`);
  link.append(createDownloadIcon(), document.createTextNode("다운로드"));

  li.append(header, link);
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
    els.siteDescription.textContent = site.description;
    const desc = document.querySelector('meta[name="description"]');
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (desc) desc.setAttribute("content", site.description);
    if (ogDesc) ogDesc.setAttribute("content", site.description);
  }
}

function renderUtilities(utilities = []) {
  els.grid.replaceChildren();

  if (!allUtilities.length) {
    els.empty.hidden = false;
    els.empty.textContent =
      "등록된 자료가 없습니다. 곧 새로운 유틸리티가 추가될 예정입니다.";
    updateResultCount(0, 0);
    return;
  }

  if (!utilities.length) {
    els.empty.hidden = false;
    els.empty.textContent = "검색 결과가 없습니다. 다른 키워드로 시도해 보세요.";
    updateResultCount(0, allUtilities.length);
    return;
  }

  els.empty.hidden = true;
  const fragment = document.createDocumentFragment();
  utilities.forEach((item) => fragment.appendChild(createCard(item)));
  els.grid.appendChild(fragment);
  updateResultCount(utilities.length, allUtilities.length);
}

function onSearchInput() {
  renderUtilities(filterUtilities(els.search.value));
}

async function init() {
  els.footerYear.textContent = String(new Date().getFullYear());
  setStatus("자료 목록을 불러오는 중…");

  els.search.addEventListener("input", onSearchInput);

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
