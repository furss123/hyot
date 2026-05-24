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

  function hasExternalLink(item) {
    return typeof item?.link === "string" && item.link.trim().length > 0;
  }

  function isValidUtility(item) {
    return (
      item &&
      typeof item.id === "string" &&
      typeof item.name === "string" &&
      typeof item.description === "string" &&
      typeof item.updatedAt === "string" &&
      (hasAnyPlatform(item) || hasExternalLink(item))
    );
  }

  function fileKindFromPath(path = "") {
    const name = String(path).split("/").pop() || "";
    const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
    if (ext === "exe" || ext === "msi") return "exe";
    if (ext === "zip" || ext === "7z") return "archive";
    if (ext === "apk" || ext === "aab") return "apk";
    if (ext === "txt" || ext === "md") return "text";
    return "file";
  }

  function getFileKindFromPlatformFile(pf) {
    if (!pf) return "file";
    const name = pf.fileName || pf.file || "";
    return fileKindFromPath(name);
  }

  function getPrimaryPlatformFile(item) {
    for (const p of PLATFORMS) {
      const pf = getPlatformFile(item, p.id);
      if (pf) return pf;
    }
    return null;
  }

  function getCardFileKind(item) {
    if (hasExternalLink(item)) return "link";
    return getFileKindFromPlatformFile(getPrimaryPlatformFile(item));
  }

  function getUtilityIconPath(item) {
    const path = item?.icon;
    return typeof path === "string" && path.trim() ? path.trim() : "";
  }

  function createUtilityIcon(item, className = "file-icon") {
    const path = getUtilityIconPath(item);
    if (path) {
      const img = document.createElement("img");
      img.className = `${className} utility-icon utility-icon--custom`;
      img.src = path;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.addEventListener(
        "error",
        () => {
          img.replaceWith(createFileIcon(getCardFileKind(item), className));
        },
        { once: true }
      );
      return img;
    }
    return createFileIcon(getCardFileKind(item), className);
  }

  function createFileIcon(kind, className = "file-icon") {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", `${className} file-icon file-icon--${kind}`);
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");

    const paths = {
      exe:
        '<path fill="currentColor" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm-1 2 5 5h-5V4ZM8 12h8v1.5H8V12Zm0 3.5h5.5V17H8v-1.5Z"/>',
      archive:
        '<path fill="currentColor" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm-1 2 5 5h-5V4ZM8 10h2v2H8v-2Zm4 0h2v2h-2v-2Zm-4 4h2v2H8v-2Zm4 0h2v2h-2v-2Z"/>',
      apk:
        '<path fill="currentColor" d="M17 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Zm-5 3.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm-4.2 9.8 1.4-2.4h5.6l1.4 2.4H7.8ZM7 19v-2h2v2H7Zm8 0v-2h2v2h-2Z"/>',
      text:
        '<path fill="currentColor" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm-1 2 5 5h-5V4ZM8 11h8v1.5H8V11Zm0 3h8v1.5H8V14Z"/>',
      link:
        '<path fill="currentColor" d="M10.6 13.4a1 1 0 0 1 0-1.4l2.5-2.5a3.5 3.5 0 1 1 5 5l-1.3 1.3a1 1 0 1 1-1.4-1.4l1.3-1.3a1.5 1.5 0 1 0-2.1-2.1l-2.5 2.5a1 1 0 0 1-1.4 0ZM13.4 10.6a1 1 0 0 1 0 1.4l-2.5 2.5a3.5 3.5 0 1 1-5-5l1.3-1.3a1 1 0 0 1 1.4 1.4l-1.3 1.3a1.5 1.5 0 0 0 2.1 2.1l2.5-2.5a1 1 0 0 1 1.4 0Z"/>',
      file:
        '<path fill="currentColor" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm-1 2 5 5h-5V4Z"/>',
    };

    svg.innerHTML = paths[kind] || paths.file;
    return svg;
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
    hasExternalLink,
    isValidUtility,
    createPlatformIcon,
    createFileIcon,
    createUtilityIcon,
    getUtilityIconPath,
    getCardFileKind,
    getFileKindFromPlatformFile,
  };
})();
