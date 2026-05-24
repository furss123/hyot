/**
 * HyoT — 플랫폼(Windows / Android) 공통 정의
 */
(function () {
  const PLATFORMS = [
    {
      id: "windows",
      label: "Windows",
      shortLabel: "Win",
      accept: ".exe,.msi,.zip,.7z",
    },
    {
      id: "android",
      label: "Android",
      shortLabel: "And",
      accept: ".apk,.aab",
    },
  ];

  function migrateUtility(item) {
    if (!item || typeof item !== "object") return item;
    const out = { ...item };
    if (typeof item.file === "string" && !out.windows) {
      out.windows = {
        file: item.file,
        fileName: item.fileName || "",
        fileSize: item.fileSize || "",
      };
      delete out.file;
      delete out.fileName;
      delete out.fileSize;
    }
    return out;
  }

  function getPlatformFile(item, platformId) {
    const pf = item?.[platformId];
    if (!pf || typeof pf.file !== "string" || !pf.file.trim()) return null;
    return pf;
  }

  function hasAnyPlatform(item) {
    return PLATFORMS.some((p) => getPlatformFile(item, p.id));
  }

  function isValidUtility(item) {
    return (
      item &&
      typeof item.id === "string" &&
      typeof item.name === "string" &&
      typeof item.description === "string" &&
      typeof item.updatedAt === "string" &&
      hasAnyPlatform(item)
    );
  }

  function createPlatformIcon(platformId) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "btn-platform__icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");

    if (platformId === "windows") {
      svg.innerHTML =
        '<path fill="currentColor" d="M3 5.5 10.5 4.4V12H3V5.5Zm0 7.5h7.5v7.6L3 19.5V13Zm9.5-8.3L21 3.9v7.6h-8.5V4.7Zm0 9.3H21v7.6l-8.5-1.5V14Z"/>';
      return svg;
    }

    svg.innerHTML =
      '<path fill="currentColor" d="M8.2 3c.4 1.1.9 2.1 1.6 3.1-.9.3-1.8.8-2.5 1.4C6.4 5.8 5.5 4.5 5 3h3.2ZM16 3c-.5 1.5-1.4 2.8-2.3 3.9-.7-.6-1.6-1.1-2.5-1.4.7-1 1.2-2 1.6-3.1H16ZM7 8.2c1.2-.2 2.4-.2 3.6 0 1.2.2 2.3.6 3.4 1.2-1 .8-2.2 1.3-3.4 1.6-1.2.3-2.4.3-3.6 0-1.2-.3-2.4-.8-3.4-1.6 1.1-.6 2.2-1 3.4-1.2Zm-2.1 3.4c1 .9 2.2 1.5 3.5 1.8v5.1c-1.2-.4-2.2-1-3-1.9-.9-.9-1.5-2-1.8-3.2.5-.6 1-1.1 1.3-1.8Zm10.2 1.8c-.3 1.2-.9 2.3-1.8 3.2-.8.9-1.8 1.5-3 1.9v-5.1c1.3-.3 2.5-.9 3.5-1.8.3.7.8 1.2 1.3 1.8ZM12 14.8c1.2-.4 2.2-1 3-1.9.5 1.4.5 2.9 0 4.3-.8.4-1.7.6-2.6.7-.9.1-1.8.1-2.7 0-.9-.1-1.8-.3-2.6-.7-.5-1.4-.5-2.9 0-4.3.8.9 1.8 1.5 3 1.9Z"/>';
    return svg;
  }

  window.HYOT_PLATFORMS = {
    list: PLATFORMS,
    migrateUtility,
    getPlatformFile,
    hasAnyPlatform,
    isValidUtility,
    createPlatformIcon,
  };
})();
