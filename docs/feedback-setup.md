# 의견 게시판 — 로그인 없이 등록 설정

방문자는 **GitHub 계정 없이** 사이트에서 바로 의견을 남길 수 있습니다.  
저장소에 토큰을 한 번만 설정하면 됩니다.

## 1. 토큰 만들기

1. GitHub → **Settings** → **Developer settings** → **Fine-grained tokens** → **Generate new token**
2. Repository access: **Only select repositories** → `hyot` 선택
3. Permissions → **Contents**: Read and write
4. 생성 후 토큰 문자열을 복사합니다. (다시 볼 수 없습니다)

## 2. 저장소 Secret 등록

1. `hyot` 저장소 → **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret**
3. Name: `HYOT_FEEDBACK_TOKEN`
4. Value: 위에서 복사한 토큰

## 3. 배포

`main` 브랜치에 push되면 GitHub Actions가 Pages를 다시 배포하고,  
사이트에 토큰이 반영됩니다. (1~2분 소요)

## 확인

- 메인 페이지 의견 게시판에 **「GitHub 로그인 없이 바로 등록할 수 있습니다.」** 문구가 보이면 설정 완료입니다.
- 등록 버튼은 **「의견 등록」** 으로 표시됩니다.
