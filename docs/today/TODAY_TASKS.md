# Today 작업 목록

기준 문서: [TODAY_PLAN.md](./TODAY_PLAN.md)

## 작업

- [x] Today 메뉴와 `/today` 경로 추가
- [x] 오늘의 10대 뉴스 목록 화면 구현
- [x] 순위·제목·요약·중요성·출처 표시
- [x] 뉴스 상세 보기 방식 결정 및 구현
- [x] 모바일 반응형과 키보드 접근성 확인
- [x] 뉴스 데이터 구조 확정
- [x] KST 날짜·갱신 시각 표시
- [x] 중복 뉴스 판정 기준 적용
- [x] 출처·원문 링크 검증
- [x] 뉴스 부족·수집 실패 상태 구현
- [x] 갱신 주기와 실행 주체 결정
- [x] 공개 출처 수집 방식 구현
- [x] 정상 데이터 보존 규칙 적용
- [x] Anthropic의 오래된 날짜 전용 기사를 보류 대신 수집 범위 밖으로 판정

## v0.5.0 Claude Code·Grok Releases 추가

기준: [TODAY_PLAN.md](./TODAY_PLAN.md) v0.5.0 구역, [NEWS_OPERATIONS.md](./NEWS_OPERATIONS.md) 0장. 구현·확인이 끝난 항목만 체크한다.

### 구현 작업
- [x] docs/today/ 문서 3종(PLAN, TASKS, OPERATIONS)에 v0.5.0 운영 기준과 공식 출처·57건 예상(Claude 49건, Grok 8건)·작업 목록 추가
- [x] 제품 버전 0.5.0 상향 (package.json, package-lock.json)
- [x] release source id 4개 확장 (codex-releases, gemini-releases, claude-releases, grok-releases)
- [x] app/today/page.tsx에서 4개 release source 제외 (기사 수·페이징·목록·출처 상태)
- [x] app/releases/page.tsx 4개 release source 페이징 및 소개 문구(Codex, Claude Code, Gemini CLI, Grok) 갱신
- [x] scripts/collect_content.py에 RELEASE_SOURCE_IDS 상수 정의 및 기존 반복 set 교체
- [x] Claude Code GitHub release(anthropics/claude-code) parse_github_releases 재사용 및 버전형 제목('Claude Code vX 버전 출시') 생성
- [x] Claude `What's changed`의 Added·New·Introduced / Fixed·Resolved / 나머지를 New Features / Bug Fixes / Chores로 분류
- [x] Grok 공식 HTML(https://docs.x.ai/developers/release-notes) HTMLParser 파싱 구현 (월 h2, 날짜 div, h3 id/title, p/li 설명, script/style 무시, 연도 처리, day 정밀도)
- [x] canonicalize_url에서 docs.x.ai release-notes 경로의 URL fragment 보존
- [x] Grok 설명 new_features/chores 분류, 최대 3개·420바이트 요약 및 번역, bug_fixes 비움, release_notes_ko 항상 포함
- [x] Grok 후보 make_candidate 생성, 번역 실패 시 출처 실패 처리 및 영문 비공개
- [x] Grok 불완전 항목 보류(held_count) 및 60일 도달 시 coverage_limited=false 처리
- [x] source config에 Grok Releases(xai_releases) 추가 및 fetch status/content type 검증 연결
- [x] archive 보강 집계와 초보자 해설 release 판정에 4개 release source 적용

### 확인 작업
- [x] 실제 60일 릴리스 수집 실행 (Claude 49건, Grok 8건, 전체 릴리스 87건·뉴스 162건, 8개 출처 정상)
- [x] 프로덕션 빌드 통과 및 `/today`, `/releases` 경로 생성 확인 (`npm run build`)
- [ ] 배포 후 `/today` 및 `/releases` 화면 표시와 4개 릴리스 출처 동작 확인

### v0.5.0 구현 기록
- 2026-09-21, v0.5.0:
  - `package.json` 및 `package-lock.json` 버전을 0.5.0으로 상향했다.
  - release source id를 `codex-releases`, `gemini-releases`, `claude-releases`, `grok-releases` 4개로 확장했다.
  - `/today`에서 4개 release source를 기사 수, 페이징, 목록, 출처 점검 상태에서 완전히 제외했다.
  - `/releases`에서 4개 release source만 최신순 10개씩 페이징하고, 소개 문구에 Codex, Claude Code, Gemini CLI, Grok을 명시했다.
  - `scripts/collect_content.py`에 `RELEASE_SOURCE_IDS` 상수를 선언하고 중복 set들을 일원화했다.
  - Claude Code는 `parse_github_releases`를 그대로 재사용해 source config에 추가하고, `Claude Code vX 버전 출시` 제목 생성과 3분류 요약·번역을 연동했다.
  - Claude `What's changed`의 접두어를 세 분류로 나누고, 기존 한국어 요약 27건을 재번역 없이 올바른 구역으로 이동했다.
  - Grok은 공식 HTML(`https://docs.x.ai/developers/release-notes`)을 Python stdlib `HTMLParser`로 파싱하여 월 h2(명시 연도 지원), 날짜 div, h3 id/title, p/li 설명을 읽도록 구현했다. `canonicalize_url`에서 `#<h3-id>` fragment를 보존하도록 하고, 3개·420바이트 상한 및 번역, new_features/chores 분류, 불완전 항목 보류, 60일 도달 시 `coverage_limited=false` 등을 구현했다.
  - archive 보강 집계와 초보자 해설 release 판정에도 4개 source를 적용했다.

## v0.4.0 Releases 분리 및 한국어 릴리스 요약 (역사 기록)

기준: [TODAY_PLAN.md](./TODAY_PLAN.md) v0.4.0 구역, [NEWS_OPERATIONS.md](./NEWS_OPERATIONS.md) 0장. 구현·확인이 끝난 항목만 체크한다.

### 구현 작업
- [x] docs/today/ 문서 3종(PLAN, TASKS, OPERATIONS)에 v0.4.0 운영 기준과 작업 기록
- [x] app/nav.ts Today 그룹에 Releases 링크 추가
- [x] app/content.ts TodayArticle에 release_notes_ko 선택 필드 추가
- [x] app/today/page.tsx에서 codex-releases, gemini-releases 제외 (기사 수·페이징·목록·출처 상태·안내 문구)
- [x] app/releases/page.tsx 신설 (최신순 10개 페이징, 3분류 릴리스 노트 요약 카드, 빈 상태, 접근성)
- [x] scripts/collect_content.py GitHub release body 3분류(new_features, bug_fixes, chores) 추출 구현
- [x] Markdown 명시적 제목 우선 및 What's Changed conventional prefix 분류 구현
- [x] 장식(Full Changelog, compare, author, PR URL) 제외 및 최대 3개 bullet 420바이트 상한 번역(ponytail 주석)
- [x] 신규 release candidate에 release_notes_ko 필수 추가 및 빈 객체({}) 저장
- [x] 기존 archive release 기사 GitHub Releases API 순회 중 URL로 찾아 full body에서 보강
- [x] 기존 known release 보강 시 archive 변경 감지 및 today.json 저장 연결
- [x] 번역 실패 시 해당 release source 기존 수집 실패 경로 유지 및 영문 요약 비공개
- [x] 제품 버전 0.4.0 상향 (package.json, package-lock.json)

### 확인 작업
- [x] 기존 릴리스 30건 `release_notes_ko` 보강 및 한국어 포함 여부 확인
- [x] 프로덕션 빌드에서 `/today`, `/releases` 경로 생성 확인
- [x] 배포 후 `/today` 뉴스 162건·`/releases` 릴리스 30건 분리와 화면 표시 확인

### v0.4.0 구현 기록
- 2026-09-21, v0.4.0:
  - `data/today.json` 단일 아카이브를 재사용하고 `source_id`를 기반으로 `/today`(AI 뉴스레터)와 `/releases`(릴리스 요약)를 분리했다.
  - `/today`에서 `codex-releases`와 `gemini-releases`를 기사 수, 페이징, 목록, 출처 상태, 안내 문구에서 완전히 제외했다.
  - `/releases` 화면을 신규 생성하여 두 release source만 최신순 10개씩 페이징하고, `새 기능 · New Features`, `버그 수정 · Bug Fixes`, `기타 작업 · Chores` 3개 구역의 한국어 요약을 표시하도록 구현했다.
  - `scripts/collect_content.py`에 GitHub release body 3분류 추출 로직을 구현했다. 명시적 Markdown 제목 우선, What's Changed conventional prefix 분류, 장식(compare 링크, 작성자, PR URL) 제거, 분류별 최대 3개 bullet 및 420바이트 상한 적용(MyMemory 단일 호출 보장), 번역 실패 시 실패 처리 등을 연결했다.
  - 신규 릴리스 후보에 `release_notes_ko` 필수 생성(빈 객체 `{}` 보장) 및 기존 archive 릴리스 기사 GitHub Releases API 순회 중 URL 매칭 보강과 `today.json` 저장 변경 감지를 구현했다.

## v0.3.0 AI 뉴스레터 개편 (역사 기록)

기준: [TODAY_PLAN.md](./TODAY_PLAN.md) v0.3.0 구역, [NEWS_OPERATIONS.md](./NEWS_OPERATIONS.md) 0장. 구현·확인이 끝난 항목만 체크한다. 위의 v0.2.x 항목과 구현·확인 기록은 역사 기록이다.

### 구현
- [x] 기존 영문 기사 182건의 제목·출처 설명 한국어 번역 보강
- [x] 원문 보존 + 화면 한국어 번역 우선 표시
- [x] 신규 영문 기사 자동 번역, 번역 실패 시 영문 공개 차단·다음 수집 재시도
- [x] 데이터 검사에서 영문 기사의 한국어 번역 누락 차단
- [x] 기존 archive 전체 기사에 `why_it_matters` 초보자 해설 보강
- [x] 앞으로 수집되는 모든 기사에 초보자 해설 자동 추가, 기존 편집 해설 보존
- [x] 데이터 검사에서 해설 누락·비한국어 값 차단
- [x] 화면 타이틀·메뉴명·페이지 메타를 `AI 뉴스레터`로 변경 (`오늘의 10대 뉴스` 문구가 화면에 남지 않음)
- [x] `data/today.json`을 누적 아카이브 구조로 확장, 기존 검토 완료 10건과 편집 요약 그대로 보존
- [x] 항목에 `published_at` 또는 `published_on` + `date_precision: "day"` 저장, 시각 임의 생성 없음
- [x] 수집 기본 조회를 수집 시각 기준 고정 60일 rolling window로 변경 (6개 공식 출처 전체)
- [x] 출처가 이력을 제한하는 경우 출처별 상태(`content-health.json`)에 한계 기록
- [x] 60일 조회는 304 우회·항목 수 상한 재검토 (출처 제공 범위 전체 수집)
- [x] `today.json`과 `id`/URL로 대조해 기존 항목 상세 재수집·재추가 방지
- [x] 날짜 미확인 보류 항목을 매 60일 수집에서 재확인하고 실행별 보류 수 기록
- [x] 자동 수집이 편집자 `summary`·`why_it_matters`를 덮어쓰지 않음
- [x] 정렬: 발행일 내림차순, 같은 날 정확한 시각 먼저·날짜 전용은 `id` 순
- [x] `/today?page=N` 페이징, 페이지당 10건, 이전/다음·페이지 번호 이동
- [x] 범위 밖·잘못된 page는 보정 없이 빈 상태 안내 + 1페이지 링크(404 아님)
- [x] 원문 `source_summary`를 "출처 제공 설명"으로 구분 표시, 원문 링크 새 탭
- [x] `publish_news.py`·`check_content.py`를 누적 구조에 맞게 조정 (기존 검사 통과)
- [x] GitHub Actions 예약 수집을 60일 기본 조회로 바꾸고 `data/today.json`까지 커밋

### 실제 확인
- [x] archive 영문 제목·출처 설명의 한국어 번역 누락 0건 확인
- [x] 운영 20페이지에서 영문 제목·설명 미노출 확인
- [x] 현재 archive 전체 기사 해설 존재 확인
- [x] 신규 후보 생성과 기존 해설 보존 검사 통과
- [x] 실제 60일 수집 실행: 수집 시각·기간, 출처별 건수·한계·실패, 아카이브 총건수 기록
- [x] 같은 조건 재실행: 추가 0건, `today.json` 해시 불변
- [x] `/today` 1페이지: 최신순 10건, 다음 링크 동작
- [x] `/today?page=2`: 다음 10건이 1페이지와 겹치지 않고 이어짐, 범위 밖 page 빈 상태 확인
- [ ] 모바일·데스크톱(390/768/1280px) 가로 넘침 없음
- [x] 키보드만으로 페이지 이동·링크 접근 가능
- [x] `npm run build` 통과
- [x] 커밋·푸시 후 운영 배포 화면 확인 (타이틀·페이징·데이터 일치)
- [ ] GitHub Actions 수동 또는 예약 실행 1회 확인 (60일 조회·`today.json` 반영)

### v0.3.0 구현·확인 기록

- 2026-09-21, v0.3.3: 영문 원문 기사 182건의 `title_ko`·`source_summary_ko`를 보강하고 원문 필드를 보존했다. 화면은 한국어 번역을 우선 표시한다. 신규 영문 기사는 MyMemory 공개 번역 API로 자동 번역하며 실패하면 해당 출처를 실패 처리해 영문 상태로 공개하지 않는다. 번역 누락 검사, 실제 신규 기사 번역 호출, 빌드를 통과했고 운영 20페이지의 기사 192건 제목·설명을 공개 데이터와 대조해 모두 일치함을 확인했다.
- 2026-09-21, v0.3.2: 전체 192건의 한국어 `why_it_matters`를 확인해 누락 0건으로 보강했다. 기존 편집 기사 10건의 해설은 보존하고, 나머지는 제목·공식 설명의 주제를 분류한 안전·정책·연구·교육·창작·경제·모델·에이전트·릴리스 해설을 적용했다. 신규 후보 생성 시 해설 자동 추가, 비한국어·누락 차단, 동일 조건 재수집 시 `today.json` 해시 불변을 확인했다.
- 2026-09-21 06:46 KST 기준 고정 60일(2026-07-23 06:46 ~ 2026-09-21 06:46 KST)을 실제 수집했다. 최종 아카이브는 192건(OpenAI 110, Google AI 20, Codex 20, Gemini CLI 10, Anthropic 10, xAI 22)이며 실패·보류는 0건이다. Google AI RSS는 제공 이력이 60일 시작점에 닿지 않아 범위 제한을 기록했다.
- 기존 검토 완료 10건의 한국어 `summary`·`why_it_matters`가 모두 보존됐고 날짜 전용 기사는 10건이다. Codex Releases 30건 응답은 약 10.5MB로 확인해 12MB 상한과 최대 20페이지(600건)로 조정한 뒤 정상 수집했다.
- 동일 조건 재실행은 신규 0건이었고 `data/today.json` SHA-256 `413b18e3d61d98e488f407e210157f8de5beb2490505da2e96ef03b48b00fed4`가 유지됐다.
- 로컬 렌더링에서 1·2페이지가 각각 서로 겹치지 않는 기사 10건을 표시하고 총 20페이지를 제공했다. `page=999`와 `page=abc`는 기사 0건·1페이지 링크가 있는 빈 상태를 표시했다. 페이지 이동과 원문은 실제 링크이며 현재 페이지는 `aria-current="page"`로 표시된다.
- `python3 scripts/check_content.py` 7개 점검과 `npm run build`가 통과했다. 커밋 `bff298a`를 푸시한 뒤 운영 `/today`에서 `v0.3.0`, `AI 뉴스레터`, 총 20페이지와 정상 상태를 확인했다. 운영 1·2페이지는 각 10건이고 `page=999`·`page=abc`는 기사 0건과 1페이지 링크를 표시하며, 이전 `오늘의 10대 뉴스` 문구는 남지 않았다.
- 모바일 3개 폭은 현재 환경에 브라우저 렌더링 도구가 없어 실제 화면 확인을 마킹하지 않았다. GitHub Actions는 워크플로를 수정했지만 NAS에 `gh` 실행 파일이 없어 수동 실행을 시작하지 못했으므로 실제 실행 확인도 미완료로 남겼다.

## 완료 조건

- [x] `/today`에서 실제 검토된 뉴스가 정상 표시됨 (최근 7일 첫 판본 10건, 운영 확인)
- [x] 잘못된 링크·빈 데이터 상태가 안전하게 처리됨
- [x] 발행된 기사 요약을 실제 원문과 대조 확인함 (첫 판본 10건 전체 대조)

## 구현·확인 기록

- 2026-09-20, v0.2.0: `/today` 운영 반영 확인. 화면·수집·중복 URL 제거·검토 발행·실패 보존 기능을 구현했다. 상세 해설은 카드의 펼치기로 제공한다.
- 실제 수집: 공식 출처 6곳 응답, 최근 24시간 후보 0건, Anthropic 8건은 발행 시각 확인이 안 되어 보류. 화면에 부분 수집·후보 0건·보류 수를 표시하며 임의 기사나 빈 검토 완료 판본을 발행하지 않았다.
- `python3 scripts/check_content.py` 통과. 보류가 있는 빈 판본 발행 명령이 거부되었고 `data/today.json` 해시가 유지됨을 확인했다.
- 매일 06:15 KST 예약과 수동 실행을 등록했다. 로컬 실제 수집은 실행했으며 GitHub의 첫 예약 실행은 아직 확인하지 않았다. 발행 가능한 후보 확보 후 한국어 요약·중요성·원문을 검토하고 남은 2개 항목을 체크한다.
- 2026-09-21 재확인:
  - 수집 실행: 2026-09-21 05:18:23 KST(수집 기간: 09-20 05:18:23 ~ 09-21 05:18:23 KST). 공식 6개 출처 HTTP 응답 성공(실패 0), 24시간 윈도우 내 후보 0건, Anthropic 8건 발행시각 미확인 보류(전체 상태 partial). 출처 조회는 성공했으나 적격 기사가 없어 기사 발행은 미완료.
  - 출처별 확인: OpenAI RSS(최신 09-18 21:00 KST) 및 Google AI RSS(최신 09-18 23:00 KST) 모두 윈도우 밖. GitHub Releases API(최근 30건 직접 확인)상 최신 안정판(Codex rust-v0.155.1 09-19 05:03 KST, Gemini v0.60.0 09-16 05:31 KST)은 윈도우 이전이며, 윈도우 내 Codex alpha.9 및 Gemini nightly는 `prerelease: true`로 정책상 제외. Anthropic 최신 기사(accenture-embedded-evaluation)는 HTTP 200이나 본문에 'Sep 18, 2026' 텍스트만 존재하고 표준 발행시각 메타데이터 부재(사이트 설정 `_updatedAt`는 발행시각이 아니므로 미사용), xAI 최신 기사도 09-18자로 윈도우 밖.
  - 확인 출처: [OpenAI RSS](https://openai.com/news/rss.xml), [Google AI RSS](https://blog.google/innovation-and-ai/technology/ai/rss/), [Codex 안정판](https://github.com/openai/codex/releases/tag/rust-v0.155.1), [Gemini CLI 안정판](https://github.com/google-gemini/gemini-cli/releases/tag/v0.60.0), [Anthropic 원문](https://www.anthropic.com/news/accenture-embedded-evaluation), [xAI 목록](https://x.ai/news).
  - 원칙 및 판정: 허위 기사 작성·시각 임의 추정·과거 판본 날짜 변경·24시간 기준 완화 없이 `data/today.json` 보존. '실제 검토된 뉴스 표시' 및 '발행 기사 요약과 원문 대조' 완료 조건은 미충족 상태 유지. 최근 7일 범위 확대는 사용자 승인 대기 중. 첫 예약 실행은 아직 확인하지 않았다.

### 2026-09-21 첫 판본 발행 완료 (v0.2.1)

- 위 대기 기록 이후 사용자가 첫 발행용 최근 7일 확대를 승인했다. `news --days 7`을 추가했고, 매일 06:15 KST 자동 수집은 기존 24시간 기준을 유지한다.
- 실제 수집 기간: 2026-09-14 05:34:29 ~ 2026-09-21 05:34:29 KST. 공식 출처 6곳에서 후보 24건, 실패 0곳, Anthropic 발행 시각 미확인 8건 보류. 피드·HTML의 기존 확인 개수 제한은 유지하므로 7일 전체 뉴스의 전수 조사를 뜻하지 않는다.
- 공식 원문을 직접 읽어 OpenAI 5건·Google 3건·xAI 2건을 선별하고 한국어 요약·중요성을 대조했다. 고객 사례는 제공사 설명으로 표시하고, 성능 우위·가상 성과 수치는 제외했으며 DevFest는 예정 행사로 구분했다. 기사별 출처 URL과 원문 RSS/JSON-LD 발행 시각은 [공개 데이터](../../data/today.json)에 보존했다.
- 검토 시각은 2026-09-21 05:36:52 KST. `publish_news.py`로 10건을 발행했고, 같은 입력으로 재실행해 파일을 다시 쓰지 않는 것을 확인했다. 24시간·7일 허용, 범위 밖 기사·임의 기간·보류가 있는 빈 판본 거부 등 `check_content.py` 검사 통과. Claude의 읽기 전용 검토에서 발행을 막는 문제는 없었으며 실제 검토 시각 적용과 제한된 수집 범위를 재확인했다.
- `npm run build` 통과. 커밋 `317907f`를 푸시·배포한 뒤 05:40 KST [운영 Today](https://hanstree-agenttutor-jgwu.vercel.app/today)에서 390·768·1280px 화면을 확인했다. 기사 10건의 제목·요약·해설·원문 링크·발행 시각이 공개 데이터와 일치하며, 7일 판본 안내·보류 상태·키보드 펼치기·가로 넘침 없음도 확인했다.
- 완료 조건 3개 모두 충족. 첫 GitHub 예약 실행 자체는 아직 확인하지 않았으며, 이번에는 수동 수집·검토 발행 경로를 실제 실행했다.

### 2026-09-21 보류 8건 원인 해결 (v0.2.2)

- 원인: Anthropic 기사에는 `Sep 18, 2026`처럼 날짜만 보이고 표준 발행시각 메타데이터가 없어, 수집기가 목록의 오래된 기사 8개를 모두 발행 시각 미확인으로 보류했다.
- 조치: 기사 날짜 영역의 영문 날짜를 읽되 정확한 시각을 만들지 않는다. 날짜가 수집 기간과 겹칠 가능성이 없는 오래된 기사만 범위 밖으로 제외하고, 경계에 걸릴 수 있는 날짜는 계속 보류한다.
- 실제 재수집: 2026-09-21 05:53:50 KST, 기본 24시간 범위로 공식 출처 6곳을 확인했다. 실패 0곳, 후보 0건, Anthropic 포함 전체 보류 0건으로 상태가 `partial`에서 `ok`로 바뀌었다. 기존 검토 완료 10건 공개본은 그대로 유지했다.
