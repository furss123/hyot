# 의견 게시판 — Firebase Firestore 설정

GitHub 토큰·워크플로 없이 의견을 저장합니다. (무료 Spark, 광고 없음)

## 1. Firebase 프로젝트

1. [Firebase Console](https://console.firebase.google.com/) → **프로젝트 추가**
2. **Firestore Database** → **데이터베이스 만들기** → 프로덕션 모드
3. **규칙** 탭 → 저장소의 `firestore.rules` 내용을 붙여넣고 **게시**
4. **Authentication** → **시작하기** → **이메일/비밀번호** 사용 설정
5. **사용자 추가** → 관리자용 계정 1개 (예: `hyot-admin@school.local`)

## 2. 웹 앱 설정

1. 프로젝트 설정 → **일반** → **앱 추가** → **웹**
2. 표시되는 `firebaseConfig` 값을 복사

## 3. 사이트에 반영

**방법 A — GitHub Secrets (Pages 배포 시 자동)**

저장소 **Settings → Secrets → Actions** 에 추가:

| Secret | 예시 |
|--------|------|
| `HYOT_FIREBASE_API_KEY` | AIza… |
| `HYOT_FIREBASE_PROJECT_ID` | hyot-feedback |
| `HYOT_FIREBASE_APP_ID` | 1:123…:web:abc |
| `HYOT_FIREBASE_AUTH_DOMAIN` | (선택) `프로젝트ID.firebaseapp.com` |
| `HYOT_FIREBASE_MESSAGING_SENDER_ID` | (선택) |
| `HYOT_FIREBASE_STORAGE_BUCKET` | (선택) |

`main` push 후 Pages가 재배포되면 `js/firebase-config.js` 가 채워집니다.

**방법 B — 로컬**

`js/firebase-config.example.js` 를 참고해 `js/firebase-config.js` 를 직접 수정합니다.

## 4. 관리자 페이지

1. 사이트 **관리자** 로그인 (기존과 동일)
2. **피드백** 탭 → Firebase **이메일/비밀번호** 로그인 (위 1-5에서 만든 계정)
3. 처리 완료·숨기기·삭제 가능

## 5. 기존 `data/feedback.json` 이전 (선택)

Firebase 콘솔 → Firestore → `feedback_posts` 컬렉션에 문서를 추가하거나,  
각 `posts[]` 항목을 문서 ID = `id` 필드로 수동 등록합니다.

## 확인

- 메인 하단에 **「로그인 없이 바로 등록할 수 있습니다.」** 가 보이면 공개 등록 가능
- 의견 등록 후 목록에 바로 표시되면 성공
