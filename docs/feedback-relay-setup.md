# 의견 게시판 릴레이 (Cloudflare Worker)

GitHub 토큰을 공개 사이트에 넣으면 **자동 폐기**됩니다.  
대신 Worker가 GitHub API를 대신 호출합니다.

## 1분 설정 (Cloudflare 로그인 후)

1. [API Tokens](https://dash.cloudflare.com/profile/api-tokens) → **Create Token** → **Edit Cloudflare Workers**
2. **Account ID** 복사 (Workers & Pages 화면 오른쪽 또는 URL)
3. 아래 **방법 A** 또는 **B** 중 하나

### 방법 A — GitHub Actions (추천)

1. GitHub → **Actions** → **Deploy feedback relay (Cloudflare)** → **Run workflow**
2. 입력란에 **API Token**, **Account ID** 붙여넣기 → Run
3. 성공 시 `HYOT_FEEDBACK_RELAY_URL` 저장 + Pages 자동 재배포

### 방법 B — PC에서 한 번에

```powershell
.\scripts\deploy-feedback-relay-local.ps1 -ApiToken "여기에_토큰" -AccountId "여기에_Account_ID"
```

또는 Secrets에 등록만:

```powershell
.\scripts\set-cloudflare-secrets.ps1 -ApiToken "..." -AccountId "..."
```

이후 Actions에서 **Deploy feedback relay (Cloudflare)** 실행.

## 확인

메인 하단에 **「로그인 없이 바로 등록할 수 있습니다.」** 가 보이면 성공입니다.

## Firebase (선택)

Firestore만 쓰려면 [feedback-firebase-setup.md](./feedback-firebase-setup.md) 를 따르세요.  
Firebase가 설정되면 Worker보다 우선합니다.
