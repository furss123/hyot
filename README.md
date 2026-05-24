# HyoT의 자료실

로그인 없이 업무용 유틸리티를 무료로 배포하는 정적 웹사이트입니다.  
GitHub 저장소만으로 운영하며, GitHub Pages에 자동 배포됩니다.

**사이트 주소:** https://furss123.github.io/hyot/

## 폴더 구조

```
hyot/
├── index.html              # 메인 페이지
├── 404.html                # GitHub Pages용 404
├── css/style.css           # 스타일
├── js/app.js               # 목록 렌더링·검색
├── data/data.json          # 프로그램 메타데이터 (관리자 편집)
├── downloads/              # 배포 파일 (.zip, .exe 등)
├── assets/favicon.svg
├── .github/workflows/      # Pages 자동 배포
└── .nojekyll
```

## 관리자: 새 유틸리티 추가

1. 실행 파일을 `downloads/` 폴더에 넣습니다.
2. `data/data.json`의 `utilities` 배열에 항목을 추가합니다.

```json
{
  "id": "unique-id",
  "name": "프로그램 이름",
  "description": "한두 줄 설명",
  "updatedAt": "2026-05-24",
  "file": "downloads/my-app.zip",
  "fileName": "다운로드-파일명.zip",
  "version": "1.0.0",
  "fileSize": "2.4 MB"
}
```

| 필드 | 필수 | 설명 |
|------|------|------|
| `id` | ✓ | 고유 ID (영문·숫자·하이픈) |
| `name` | ✓ | 카드 제목 |
| `description` | ✓ | 짧은 설명 (1~2줄) |
| `updatedAt` | ✓ | `YYYY-MM-DD` |
| `file` | ✓ | 저장소 기준 경로 (`downloads/...`) |
| `fileName` | 권장 | 브라우저 저장 시 파일명 |
| `version` | 선택 | 버전 표시 |
| `fileSize` | 선택 | 용량 표시 |

3. `main` 브랜치에 push하면 Actions가 사이트를 갱신합니다.

## 로컬 미리보기

`file://`로 열면 JSON 로드가 차단될 수 있습니다.

```powershell
npx --yes serve .
```

브라우저에서 http://localhost:3000 을 엽니다.

## GitHub Pages 최초 설정

1. 저장소 **Settings → Pages**
2. **Build and deployment → Source:** `Deploy from a branch`
3. **Branch:** `gh-pages` / `/ (root)` 선택 후 Save
4. `main`에 push하면 Actions가 `gh-pages` 브랜치를 갱신합니다

## 기술 스택

HTML · CSS · Vanilla JavaScript · GitHub Pages (서버·DB 없음)
