# Next.js 전환 전 기준

- 기준 커밋: `3334f67f7cb908dc2b9ac89612560bc5dda347a2`
- 기준 브랜치: `master`
- 기준 시각: 2026-09-20 06:13 KST
- 운영 주소: 저장소와 프로젝트 파일에서 확인되지 않음. 추정한 Vercel 주소 3개는 모두 HTTP 404여서 운영 화면을 확인하지 못함.

## 기존 문서

| 문서 | 목록 설명 | 대표 출처 | 기존 `<code>` 수 | 구조화한 명령 행 수 |
| --- | --- | --- | ---: | ---: |
| Hanstree | 한스트리 작업실에서 쓰는 기본 운영 명령어 안내 | 한스트리 작업실 운영 안내 | 74 | 14 |
| Codex CLI | OpenAI Codex CLI 공식 명령어와 사용법 | OpenAI Codex CLI 공식 문서 | 80 | 62 |
| Claude Code CLI | Anthropic Claude Code CLI 명령어와 사용법 | Anthropic Claude Code 공식 문서 | 124 | 95 |
| Gemini CLI | Google Gemini CLI 명령어와 사용법 | Google Gemini CLI 공식 문서 | 66 | 44 |
| Antigravity CLI | Google Antigravity CLI 명령어와 사용법 | Google Antigravity CLI 공식 문서 | 53 | 38 |
| Grok CLI | xAI Grok CLI 명령어와 사용법 | xAI Grok CLI 공식 문서 | 65 | 50 |

`<code>` 수에는 본문 예시·스킬 이름·여러 줄 코드가 포함됩니다. 구조화한 명령 행 수는 설명이 붙은 표의 고유 행 기준입니다.

## 자동 갱신 기준

- Hanstree를 제외한 Codex, Claude, Gemini, Antigravity(`agy`), Grok만 자동 확인합니다.
- Gemini와 Antigravity는 서로 다른 문서·출처·스냅샷 대상으로 분리되어 있습니다.
- 2026-09-20 KST에 `python3 scripts/update_docs.py --check`를 실행했고 변경 없음과 두 데이터 파일의 해시 불변을 확인했습니다.
- GitHub Actions는 매일 오전 6시 `Asia/Seoul`과 수동 실행을 사용하며 `contents: write`, `issues: write` 권한을 사용합니다.
