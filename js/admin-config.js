/**
 * 관리자 설정 — 배포 전 adminPasswordSha256 값을 반드시 변경하세요.
 * 비밀번호 해시 생성 (브라우저 콘솔):
 *   crypto.subtle.digest('SHA-256', new TextEncoder().encode('새비밀번호'))
 *     .then(b => Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join(''))
 */
window.HYOT_ADMIN_CONFIG = {
  github: {
    owner: "furss123",
    repo: "hyot",
    branch: "main",
  },
  dataPath: "data/data.json",
  downloadsPath: "downloads",
  /** 기본 비밀번호: hyot-admin (배포 전 변경 권장) */
  adminPasswordSha256:
    "c7e79a65ccc18144f4a7253275e2d519376bf9ba3e18e5690a8b2978686fd841",
};
