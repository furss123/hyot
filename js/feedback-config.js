/** 의견 게시판 공개 설정 */
window.HYOT_FEEDBACK_CONFIG = {
  catalogPath: "data/data.json",
  dataPath: "data/feedback.json",
  relayUrl: "",
  github: {
    owner: "furss123",
    repo: "hyot",
    branch: "main",
  },
  categories: [
    { id: "improvement", label: "개선사항" },
    { id: "bug", label: "버그·오류" },
    { id: "other", label: "기타" },
  ],
  limits: {
    titleMax: 80,
    bodyMax: 1200,
    authorMax: 24,
    submitCooldownMs: 60000,
    screenshotMaxInputBytes: 2 * 1024 * 1024,
    screenshotMaxOutputBytes: 420000,
    screenshotMaxDimension: 1280,
    screenshotQuality: 0.82,
  },
  /** 공개 사이트에 올리지 않음 — main 브랜치 + 관리자만 조회 */
  adminOnlyData: true,
};
