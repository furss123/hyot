/** 의견 게시판 공개 설정 */
window.HYOT_FEEDBACK_CONFIG = {
  catalogPath: "data/data.json",
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
