# GitHub 연결·백업 매뉴얼

이 프로젝트는 이미 GitHub 저장소에 연결되어 있습니다. **현재 프로젝트에 원격 저장소를 다시 추가하거나 SSH 키·토큰을 설정하지 마세요.** 이 문서는 현재 확인된 연결 상태와, 놀이터에서 본인 계정으로 다른 프로젝트를 연결하는 방법을 구분합니다.

## 현재 프로젝트에서 확인한 내용 (2026-09-30)

- 로컬 브랜치는 `master`, 원격 이름은 `origin`입니다. 원격 조회에서 `github.com:steven-forge/hanstree-agenttutor`의 `master`가 확인됐습니다. 다만 최초 연결에 사용한 화면·명령이나 계정은 기록만으로 알 수 없습니다.
- `.github/workflows/update-content.yml`, `update-models.yml`, `update-docs.yml`은 예약·수동 실행을 지원하며, 수집 결과를 `master`에 자동 커밋·푸시하도록 작성되어 있습니다. 이 때문에 로컬 작업 중에도 원격 브랜치가 앞서갈 수 있습니다.
- `vercel.json`에는 Next.js, `npm ci`, `npm run build` 설정이 있습니다. 공개 주소 `https://hanstree-agenttutor-jgwu.vercel.app/`는 확인 당시 HTTP 200으로 응답했습니다. **Vercel 대시보드의 실제 Git 연결과 Production Branch 값은 확인하지 못했습니다.**
- GitHub 저장소의 공개 범위·접근 권한, Vercel 환경 변수와 최초 인증 방식도 확인하지 못했습니다. 필요한 경우 해당 서비스 대시보드에서 본인 계정으로 확인하세요.

## 놀이터에서 본인 GitHub에 연결·백업하기

1. 본인 GitHub 계정으로 로그인합니다.
2. 놀이터의 **설정(`/settings`) → GitHub 백업**에서 본인 GitHub 토큰을 연결합니다. 토큰은 채팅이나 저장소 파일에 붙여 넣지 마세요.
3. 같은 화면에서 이 프로젝트의 저장소를 지정하고 **백업** 버튼을 누릅니다.
4. 백업 결과와 GitHub 저장소의 최신 커밋을 확인합니다. 화면에서 연결이 안 되어 있다면 이 경로에서 다시 확인하고, 공유 GitHub 연결·전역 `gh` 로그인·서버 SSH 키·환경 변수 토큰으로 우회하지 마세요.

위 절차는 **놀이터의 GitHub 백업 연결**입니다. 현재 저장소의 `origin`이나 Vercel 배포가 최초에 어떻게 만들어졌는지 재현한 절차는 아닙니다. Vercel 자동 배포가 필요하면 본인 계정의 Vercel 대시보드에서 해당 GitHub 저장소와 Production Branch 연결 상태를 별도로 확인하세요.

## 작업 시 주의

자동 작업이 `master`를 갱신할 수 있으므로, 변경을 올리기 전 원격 최신 커밋과 로컬 변경을 비교하세요. 다른 세션의 미완료 변경을 함께 올리지 말고, **강제 푸시로 원격 커밋을 덮어쓰지 마세요.**

참고: [GitHub 원격 저장소](https://docs.github.com/en/get-started/git-basics/about-remote-repositories) · [GitHub Actions의 `GITHUB_TOKEN`](https://docs.github.com/en/actions/concepts/security/github_token) · [Vercel Git 연동](https://vercel.com/docs/git)
