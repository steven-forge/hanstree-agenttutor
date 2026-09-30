# 배치 작업 운영 문서

> GitHub 연결·원격 커밋 관련 안전 수칙은 [GITHUB_CONNECTION.md](./GITHUB_CONNECTION.md)를 참고하세요.

AgentTutor에서 실제로 설정된 배치(자동·수동 반복) 작업을 정리한 문서입니다.
근거는 `.github/workflows/update-content.yml`, `.github/workflows/update-docs.yml`, `scripts/collect_content.py`, `scripts/update_docs.py`, `scripts/publish_news.py`, `scripts/check_content.py`입니다. 이 문서는 파일을 읽고 정리한 것이며, 작업을 실제로 실행해 확인한 결과는 아닙니다.

## 1. 한눈에 보기

| 작업명 | 자동/수동 | 목적 | KST 실행 주기 | 주요 결과 |
|---|---|---|---|---|
| Update Content | 자동 (수동 실행도 가능) | 공식 출처에서 최근 60일 뉴스를 수집하고, 학습 문서의 출처 변경 여부를 점검 | 매일 06:15 (의도) | `data/today.json`, `data/today-candidates.json`, `data/content-health.json`, `.source-cache/content.json` 갱신 후 master 자동 커밋·푸시 |
| Update Docs | 자동 (수동 실행도 가능) | 공식 문서에서 CLI·슬래시 명령어를 읽어 명령어 문서를 갱신 | 매일 06:00 (의도) | `data/docs.json`, `.source-cache` 갱신 후 master 자동 커밋·푸시. 실패 시 GitHub Issue 생성 |
| 뉴스 편집 발행 (`publish_news.py`) | 수동 | 사람이 검토한 제목·요약·해설을 기존 뉴스에 반영 | 예약 없음 | `data/today.json`의 편집 필드만 수정 (커밋·푸시는 사람이 함) |
| 전체 출처 강제 점검 | 수동 | 점검 주기와 관계없이 모든 문서 출처를 즉시 점검 | 예약 없음 (Update Content 수동 실행 시 `force_docs` 선택) | `data/content-health.json`, `.source-cache/content.json` 갱신 |
| 콘텐츠 자체 점검 (`check_content.py`) | 수동 | 수집·발행 로직과 데이터 무결성을 로컬에서 검증 | 예약 없음 | 파일 변경 없음. 통과/실패 메시지만 출력 |
| 운영 배포 확인 (`verify_live_site.py`) | 수동 | 공개 사이트의 버전·주요 경로·핵심 문구를 한 번에 확인 | 배포 후 | 파일 변경 없음. 20개 경로의 통과/실패 출력 |

## 2. 자동 작업

두 작업 모두 GitHub Actions로 실행되며 `master` 브랜치를 기준으로 동작합니다.

### 2.1 Update Content

- **workflow 이름**: `Update Content` (`.github/workflows/update-content.yml`)
- **예약**: `cron: '15 21 * * *'` (UTC 21:15 = 다음 날 06:15 KST). 수동 실행(`workflow_dispatch`)도 가능합니다.
- **순서**:
  1. 뉴스 수집 (`python3 scripts/collect_content.py news`): 수집 시각 기준 최근 60일. 8개 출처(OpenAI News, Google AI, Codex/Claude Code/Gemini CLI/Grok Releases, Anthropic News, xAI News)를 매번 전체 재조회합니다. 새 기사만 `data/today.json`에 누적하며, 기존 기사의 편집 내용은 덮어쓰지 않습니다. 영어 제목·설명은 외부 번역 서비스(MyMemory)로 한국어 번역합니다.
  2. 문서 출처 점검 (`python3 scripts/collect_content.py documents`): 워크플로는 매일 돌지만 출처별 내부 주기가 다릅니다. **Agents 1일, Engineering 7일, Learn·Glossary 30일**. 주기가 지난 출처만 점검하고, 직전에 실패한 출처는 주기와 관계없이 다음 실행에서 다시 점검합니다.
  3. 빌드 (`npm run build`).
  4. 커밋·푸시: 아래 4개 파일에 변경이 있을 때만 `chore(content): …` 메시지로 master에 커밋하고 `git pull --rebase` 후 푸시합니다. 변경이 없으면 푸시하지 않습니다.
  5. 마지막 단계에서 수집 단계 실패 여부를 확인합니다.
- **수동 실행 옵션 `force_docs`**: 체크하면 2번 단계가 `--force`로 실행되어 모든 문서 출처를 주기와 무관하게 점검합니다. 기본값은 꺼짐입니다.
- **입력**: 8개 뉴스 출처(RSS, GitHub Releases API, HTML), `data/agents.json`·`data/agent-engineering.json`·`data/learn.json`·`data/glossary.json`의 출처 URL, 기존 `data/today.json`, `.source-cache/content.json`.
- **출력(커밋 대상 4개 파일만)**:
  - `data/today.json`: 누적 뉴스. 새 기사 추가, 빠진 초보자 해설·릴리스 노트 보강.
  - `data/today-candidates.json`: 이번 실행에서 새로 발견한 항목과 출처별 결과.
  - `data/content-health.json`: 뉴스·문서 출처의 점검 상태.
  - `.source-cache/content.json`: 점검 기록과 본문 해시.
- **실패 시 동작**:
  - 뉴스 수집과 문서 점검 단계는 `continue-on-error`라서, 한쪽이 실패해도 빌드와 커밋 단계는 계속 진행됩니다.
  - 일부 출처만 실패하면 상태가 `partial`로 기록되고 작업은 성공으로 끝납니다. 8개 출처가 **모두** 실패해야 뉴스 수집이 실패(종료 코드 1)로 간주됩니다. 문서 점검도 이번에 점검할 출처가 **전부** 실패해야 실패로 간주됩니다.
  - 수집이 실패로 간주되면 커밋·푸시까지 마친 뒤 마지막 단계에서 워크플로 전체를 실패로 표시합니다.
  - 빌드가 실패하면 커밋·푸시 단계는 실행되지 않습니다.
  - 이 workflow에는 실패 시 Issue를 만드는 단계가 없습니다. 실패는 Actions 실행 기록에서 확인합니다.
  - 동시 실행은 `concurrency` 설정으로 한 번에 하나만 허용하고, 실행 중인 작업을 취소하지 않고 기다리게 합니다.

### 2.2 Update Docs

- **workflow 이름**: `Update Docs` (`.github/workflows/update-docs.yml`)
- **예약**: 파일에 `cron: '0 6 * * *'`과 `timezone: 'Asia/Seoul'`이 선언되어 있어 매일 06:00 KST 실행을 의도한 설정입니다. 수동 실행(`workflow_dispatch`)도 가능합니다. (GitHub가 이 timezone 항목을 실제로 적용하는지는 이 문서에서 확인하지 못했습니다. 실행 기록에서 실제 시각을 확인하세요.)
- **순서**: `python3 scripts/update_docs.py` → 빌드 → 변경이 있으면 커밋·푸시 → 실패 시 Issue 생성.
- **입력**: `sources.json`에 적힌 5개 대상(codex, claude, gemini, agy, grok)의 공식 문서 URL, 기존 `data/docs.json`, 이전 기준 스냅샷 `.source-cache/snapshot.json`.
- **동작**: 공식 문서에서 명령어를 추출해 이전 스냅샷과 비교합니다. 새로 보인 명령은 "신규 감지", 사라진 명령은 "공식 문서에서 확인되지 않음"으로 `data/docs.json`에 표시합니다. 스냅샷이 없으면 기준 스냅샷만 만들고 문서는 바꾸지 않습니다.
- **출력**: `data/docs.json`, `.source-cache` (스냅샷 포함). 변경이 있으면 `docs: 공식 문서 명령어 자동 갱신` 메시지로 master에 커밋·푸시합니다. 변경이 없으면 푸시하지 않습니다.
- **실패 시 동작**:
  - 다음 중 하나라도 있으면 스크립트가 종료 코드 1로 끝나며, **기존 데이터는 그대로 보존**합니다: 출처 URL 없음, 가져온 내용이 100바이트 미만, 명령어 추출 결과 없음, 이전 대비 명령어가 절반 미만으로 감소, `data/docs.json` 구조 오류. 대상 하나만 실패해도 전체가 중단되어 아무것도 갱신되지 않습니다.
  - 실패하면 `[자동 갱신] 공식 문서 갱신 실패` 제목의 GitHub Issue를 만듭니다. 같은 제목의 열린 Issue가 이미 있으면 새로 만들지 않습니다.
  - 이 workflow의 푸시 단계에는 `git pull --rebase`가 없습니다. 같은 시각대에 다른 커밋이 master에 올라가 있으면 푸시가 거절되어 실패할 수 있습니다.

## 3. 수동 작업

아래 작업은 예약되어 있지 않으며 사람이 직접 실행합니다.

### 3.1 뉴스 편집 발행 (`scripts/publish_news.py`)

- **목적**: 자동 수집이 이미 `data/today.json`에 쌓아 둔 기사에, 사람이 검토한 한국어 `title`·`summary`·`why_it_matters`를 반영합니다. 편집 요약 보강은 이 도구를 통한 수동 검토로만 이루어집니다.
- **실행**: `python3 scripts/publish_news.py <프로젝트 안의 검토 JSON 파일>`
- **입력**: 프로젝트 안의 검토 JSON 1개(1MB 이하), 기존 `data/today.json`.
- **출력**: `data/today.json`. 기사별 편집 필드 3개와 `reviewed_at`만 바뀌고, 다른 기사와 필드, 정렬은 그대로입니다. 저장은 임시 파일을 거쳐 한 번에 교체합니다.
- **검증**: `id`가 기존 기사에 있어야 하고, `source_url`·발행일 등 공식 메타데이터는 기존 값과 같아야 하며, `summary`·`why_it_matters`에는 한글이 있어야 합니다. `reviewed_at`은 시간대가 있어야 하고 미래일 수 없습니다. 심볼릭 링크, 프로젝트 밖 경로, `.env`·`login`·`auth`·`secret` 등이 들어간 파일명은 거부합니다.
- **커밋·푸시**: 하지 않습니다. 반영 후 사람이 직접 커밋·푸시해야 공개본에 나갑니다.
- **실패 시 동작**: 검증에 실패하면 오류 메시지를 내고 종료하며 `data/today.json`은 바뀌지 않습니다. 내용이 기존과 완전히 같으면 변경 없이 정상 종료합니다.

### 3.2 전체 출처 강제 점검

- **목적**: 점검 주기(1/7/30일)를 기다리지 않고 4개 메뉴의 모든 문서 출처를 즉시 점검합니다.
- **방법**: GitHub Actions에서 `Update Content`를 수동 실행하며 `force_docs`를 켭니다. 이 경우 뉴스 수집, 빌드, 커밋·푸시도 함께 실행됩니다. 로컬에서는 `python3 scripts/collect_content.py documents --force`로 문서 점검만 실행할 수 있으며, 이때는 커밋·푸시가 자동으로 일어나지 않습니다.
- **입력·출력·실패 처리**: 2.1의 문서 출처 점검과 같습니다. 대상이 전체 출처가 된다는 점만 다릅니다.

### 3.3 콘텐츠 자체 점검 (`scripts/check_content.py`)

- **목적**: 네트워크와 외부 설치 없이 표준 라이브러리만으로 수집·발행 로직과 데이터 무결성을 검사합니다. 두 workflow 어디에도 연결되어 있지 않으며, 사람이 필요할 때 실행합니다.
- **실행**: `python3 scripts/check_content.py`
- **입력**: `data/today.json`, `data/learn.json`, `data/agent-engineering.json`, `data/glossary.json`, 그리고 스크립트 안의 예시 데이터.
- **검사 내용**: 7단계. RSS·릴리스 처리, URL 정규화와 허용 목록, 누적·중복 제거·정렬, 편집 반영 검증, `today.json`의 중복·날짜·한국어 해설, 학습 데이터의 고유 ID와 용어 참조.
- **출력**: 화면에 진행 메시지만 출력하고 파일은 쓰지 않습니다.
- **커밋·푸시**: 해당 없음.
- **실패 시 동작**: 검사가 하나라도 어긋나면 오류로 중단되며 종료 코드가 0이 아닙니다.

### 3.4 운영 배포 확인 (`scripts/verify_live_site.py`)

- **목적**: 배포 후 공개 사이트가 현재 `package.json` 버전을 표시하고, 주요 메뉴 8개와 `AI의 작동 방식 이해하기` 상세 문서 12개가 정상 응답하며 각 페이지의 핵심 제목을 실제 본문에 표시하는지 한 번에 확인합니다.
- **실행**: `python3 scripts/verify_live_site.py`
- **다른 배포 확인**: `python3 scripts/verify_live_site.py --base-url https://example.vercel.app`
- **동작**: Python 표준 라이브러리로 각 HTML을 읽고, 스크립트·스타일을 제외한 본문에서 핵심 문구를 확인합니다. 로컬 파일과 운영 사이트를 수정하지 않습니다.
- **성공/실패**: 모든 경로가 HTTP 200이고 핵심 문구와 운영 버전이 확인되면 종료 코드 0, 하나라도 다르면 종료 코드 1입니다.
- **확인 기록**: 2026-09-22 08:07 KST에 기본 운영 주소에서 실행해 v0.7.0과 20개 경로가 모두 통과했습니다.

## 4. 반드시 알아둘 점

- **예약 시각은 정확하지 않을 수 있습니다.** GitHub Actions의 예약 실행은 지연되거나 드물게 건너뛸 수 있습니다. 06:00·06:15는 "그 시각쯤 시작을 의도한다"는 뜻입니다. 확인이 필요하면 Actions 실행 기록을 봅니다.
- **자동 수집과 편집 승인 발행의 경계**:
  - 자동(Update Content)은 공식 출처의 원문 제목·설명·링크·발행일과 기본 초보자 해설, 한국어 번역을 `data/today.json`에 직접 누적하고 master에 올립니다. 사람의 승인 없이 공개본이 갱신됩니다.
  - 자동 수집은 기존 기사의 편집 내용(`title`·`summary`·`why_it_matters`)을 덮어쓰지 않습니다.
  - 편집자가 다듬은 요약·해설을 넣는 일은 `publish_news.py`를 사용한 수동 검토와 사람이 하는 커밋·푸시로만 이루어집니다.
- **두 자동 작업은 서로 다른 파일을 다룹니다.** Update Content는 뉴스·문서 출처 점검 결과, Update Docs는 `data/docs.json`(명령어 문서)입니다. 다만 둘 다 `.source-cache` 아래에 기록하고 master에 직접 푸시합니다.
- 뉴스 출처 상태(`ok`/`partial`/`failed`)와 출처별 보류·건너뜀 수는 `data/content-health.json`과 `data/today-candidates.json`에서 확인할 수 있습니다.
- `docs/today/NEWS_OPERATIONS.md`에는 "자동 공개본 수정 금지", 24시간·7일 수집, 6개 출처 등 옛 기준이 남아 있습니다. 실제 workflow와 스크립트가 다르면 이 문서와 실제 파일을 우선합니다.
