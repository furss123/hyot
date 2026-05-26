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
├── admin.html              # 관리자 로그인·관리 페이지
├── js/admin.js             # 관리자 패널 (GitHub API)
├── js/admin-config.js      # 공개 저장소 설정
├── js/admin-secrets.js     # 로컬 전용 (gitignore)
├── data/data.json          # 프로그램 메타데이터 (관리자 편집)
├── assets/favicon.svg
├── .github/workflows/      # Pages 자동 배포
└── .nojekyll
```

## 관리자 패널

메인 화면 **우측 상단「관리자」** → `admin.html` 로그인 페이지로 이동합니다.

- 아이디·비밀번호는 **GitHub 저장소 Secrets**에만 보관 (소스 코드에 없음)
- `업데이트` 날짜는 저장 시 **오늘 날짜 자동** 입력
- [GitHub 토큰](https://github.com/settings/tokens/new?scopes=repo&description=HyoT-admin) (`repo` 권한) — `data.json`·아이콘 저장용

### GitHub Secrets 설정 (최초 1회)

저장소 **Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
|------|--------|
| `HYOT_ADMIN_ID` | 관리자 아이디 |
| `HYOT_ADMIN_PASSWORD_SHA256` | 비밀번호의 SHA-256 해시 (hex) |

비밀번호 해시 생성 (PowerShell):

```powershell
$bytes = [System.Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes("여기에비밀번호"))
($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
```

Secrets 저장 후 `main`에 push하면 배포 시 `js/admin-auth.js`가 자동 생성됩니다.

### 로컬 개발

`js/admin-secrets.example.js`를 `js/admin-auth.js`로 복사한 뒤 값을 채웁니다.

### 다운로드 파일 (GitHub 저장소)

관리자 패널에서 **exe · msi · zip · 7z** 파일을 선택하면 `main` 브랜치의 `downloads/`에 GitHub API로 업로드되고, `data.json`에는 저장소 경로가 기록됩니다. 방문자는 `media.githubusercontent.com` CDN으로 받습니다.

- **95MB 이하**: 관리자에서 파일 선택 후 저장 (브라우저 업로드)
- **95MB 초과**: 로컬에서 Git LFS로 `downloads/`에 올린 뒤, 관리자에서 「Git·LFS로 직접 올림」과 경로 입력

GitHub Pages 배포(`gh-pages`)에는 `downloads/`가 포함되지 않습니다. 바이너리는 `main`만 사용합니다.

### 수동 추가 (JSON 직접 편집)

`data/data.json`의 `utilities` 배열에 항목을 추가할 수 있습니다. `windows.file`에는 **저장소 경로**를 넣습니다.

```json
{
  "id": "unique-id",
  "name": "프로그램 이름",
  "description": "한두 줄 설명",
  "updatedAt": "2026-05-24",
  "windows": {
    "file": "downloads/my-app-1.0.0.exe",
    "fileName": "my-app.exe",
    "fileSize": "2.4 MB"
  }
}
```

| 필드 | 필수 | 설명 |
|------|------|------|
| `id` | ✓ | 고유 ID (영문·숫자·하이픈) |
| `name` | ✓ | 카드 제목 |
| `description` | ✓ | 짧은 설명 (1~2줄) |
| `updatedAt` | ✓ | ISO 날짜 |
| `windows` | 선택 | `file`: `downloads/...` 경로, `fileName`, `fileSize` |
| `icon` | 선택 | 관리자에서 업로드한 카드 아이콘 (`assets/icons/...`) |

`main` 브랜치에 push하면 Actions가 사이트를 갱신합니다.

## 변동 사항 자동 커밋·푸시 (기본 ON)

이 저장소는 **`main`에 자동 커밋·푸시`** 가 켜져 있습니다. Cursor 에이전트 작업이 끝나면 변경 사항이 `origin/main`으로 올라갑니다.

최초 클론·다른 PC에서 한 번만:

```powershell
.\scripts\setup-auto-push.ps1
```

| 시점 | 동작 |
|------|------|
| Cursor 에이전트 **작업 종료** | `.cursor/hooks.json` → 커밋(있을 때) + push |
| `git commit` 직후 | `.githooks/post-commit` → push |
| 수동 | `.\scripts\auto-push.ps1` |

커밋 메시지를 직접 지정: `.\scripts\auto-push.ps1 -Message "fix: 설명"`

관리자 패널에서 저장한 `data.json` 등은 GitHub API로 바로 반영되며, 위 훅과 별개입니다.

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
