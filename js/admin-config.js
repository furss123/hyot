/** 공개 설정 — 비밀번호는 저장소에 포함하지 않습니다 */
window.HYOT_ADMIN_CONFIG = {
  github: {
    owner: "furss123",
    repo: "hyot",
    branch: "main",
  },
  dataPath: "data/data.json",
  downloadsPath: "downloads",
  /** 25MB 초과 파일은 GitHub Releases로 업로드 (최대 2GB) */
  releasesTag: "downloads",
};
