# 의견 게시판 릴레이 (Cloudflare Worker)

GitHub 토큰을 공개 사이트에 넣으면 **자동 폐기**됩니다.  
대신 Worker가 GitHub API를 대신 호출합니다.

## 1분 설정

1. [Cloudflare](https://dash.cloudflare.com/sign-up) 가입 (무료)
2. **My Profile → API Tokens → Create Token** → **Edit Cloudflare Workers** 템플릿
3. GitHub `hyot` 저장소 **Secrets**에 추가:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID` (대시보드 URL의 Account ID)
4. Actions → **Deploy feedback relay (Cloudflare)** → **Run workflow**
5. 완료 후 **Deploy GitHub Pages** 가 자동 실행되면 사이트에 반영됩니다.

## 확인

메인 하단에 **「로그인 없이 바로 등록할 수 있습니다.」** 가 보이면 성공입니다.

## Firebase (선택)

Firestore만 쓰려면 [feedback-firebase-setup.md](./feedback-firebase-setup.md) 를 따르세요.  
Firebase가 설정되면 Worker보다 우선합니다.
