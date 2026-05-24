/** 의견 게시판 공개 설정 */
window.HYOT_FEEDBACK_CONFIG = {
  dataPath: "data/feedback.json",
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
  },
};
