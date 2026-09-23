# Today 뉴스 및 문서 출처 운영 지침 (NEWS OPERATIONS)

## -0.5. 출처 제공 설명 → 원문 3줄 요약 (일반 뉴스 전용, release 제외)

일반 뉴스 후보(`make_candidate` 경로: RSS·HTML 공식 뉴스)와 외부 매체 자동 게시(`collect_hourly_news.py`의 `build_article` 경로) 모두, 편집자 `summary`가 없으면 `source_url`의 `<article>` 또는 `<main>` 안 `p`/`h2`/`li` 본문(`nav`/`header`/`footer`/`aside`/`script`/`style`는 전역 제외) 전체를 읽어 단어 빈도 기반 추출형 3문장을 뽑고 기존 `translate_to_korean`으로 번역해 `source_summary_ko`(줄바꿈으로 구분)와 `source_summary_provenance: "article_full_text_3line"`을 채운다. `<article>`/`<main>`이 모두 없는 페이지는 `FALLBACK_HOSTS`(현재 `x.ai`, `www.x.ai`)에 한해 `nav`/`header`/`footer`/`aside`/`script`/`style` 밖의 60자 이상 `p`/`h2`/`li`만 모으는 대체 추출기(`FallbackBodyExtractor`)를 쓴다. 문장 후보는 40~400자이면서 종결 부호(`.`/`!`/`?`, 뒤에 따옴표 허용)로 끝나고 단어 6개 이상인 것만 채택해 제목 조각·메뉴 문구·끊긴 인용이 섞이지 않게 하며, 본문 전체 길이가 200자 미만이면 요약을 시도하지 않는다. 새 요청은 SSRF 방지를 위해 `source_url` 자신의 hostname을 허용 목록으로 쓰지 않고, `source_id`로 `registered_hosts_for_source`가 돌려주는 사전 등록 호스트(공식 6개 출처는 `ALLOWED_HOSTS`, 외부 매체는 `data/news-sources.json`의 해당 출처 `hosts`)에 속할 때만 요청하며 리다이렉트도 같은 등록 호스트로만 제한한다. hostname이 등록되지 않았거나 본문을 못 찾거나(둘이 같은 본문을 중복 노출하면 동일 블록은 제거), 조건을 만족하는 문장이 3개 미만이거나 번역이 실패하면 조용히 `None`을 반환해 `source_summary_provenance`를 설정하지 않고 기존 요약·해당 출처 수집을 막지 않는다(한 출처 실패가 시간별 수집 전체를 중단시키지 않음). OpenAI 뉴스 원문 서버가 이 런타임의 수집 요청에 HTTP 403을 반환하는 경우도 같은 방식으로 처리되며, 우회하지 않고 기존 출처 제공 설명을 그대로 둔다. 4개 release source(`RELEASE_SOURCE_IDS`)는 뉴스레터가 아니므로 대상에서 제외한다. 화면(`/today`)은 `source_summary_provenance`가 이 값일 때만 "원문 3줄 요약" 라벨과 줄바꿈을 보여주고, 그 외에는 기존 "출처 제공 설명"을 유지한다. 이미 공개된 `data/today.json`의 과거 기사를 갱신하려면 `python3 scripts/collect_content.py backfill-summaries --days N`(기본/상한 3)을 실행한다. 이 명령은 최근 N일 이내 발행되었고 편집자 `summary`와 release가 아닌 기사만 대상으로 하며, 실패한 기사는 오류를 출력하고 기존 설명을 그대로 두고, 결과가 같으면 파일을 변경하지 않는다.

재실행 시 `article_full_text_3line`이 이미 있는 기사는 덮어쓰지 않는다. 2026-09-23에는 최근 3일의 일반 기사 12건을 원문 확인 후 한국어 3줄로 검토했다.

## -1. 외부 뉴스 매시간 자동 수집 (`scripts/collect_hourly_news.py`, 현재 운영 기준)

- **주기**: GitHub Actions `.github/workflows/update-content.yml`이 매시 정각(UTC `0 * * * *`)에 공식 뉴스 수집(`collect_content.py news`)과 외부 뉴스 매시간 자동 수집(`scripts/collect_hourly_news.py`)을 이 순서로 매번 함께 실행해, 같은 모델을 다루는 외부 보도가 먼저 게시된 공식 기사에 이어 붙는다. 06:15 KST(UTC 21:15) 실행에서만 문서 출처 점검(`collect_content.py documents`)이 추가로 실행되고, `workflow_dispatch` 수동 실행은 세 단계를 모두 실행한다.
- **출처 목록**: `data/news-sources.json` 한 파일에 출처 URL·독립 여부·필요 환경 변수를 정의한다. `window_hours`(기본 72시간)와 `publish.min_independent`(기본 2), `publish.high_importance_at`(기본 3)도 이 파일에서 조정한다.
- **자동 게시 조건**: 같은 사건을 다루는 서로 다른 등록 도메인의 독립 출처가 2곳 이상 모이면 자동으로 `data/today.json`에 게시된다. 독립 출처가 3곳 이상이면 `importance: "high"`로 표시된다. 공식 원문으로 확인된 새 모델 출시는 독립 출처 수와 무관하게 중요도 높음으로 게시한다. 독립 출처가 1곳뿐이거나 커뮤니티·소셜 신호만 있으면 `data/today-candidates.json`의 `events`에 후보로 남는다.
- **API 키 없는 출처(`not_configured`)**: YouTube·X·Reddit처럼 `required_env`가 정의된 출처는 해당 환경 변수가 수집기에 전달되지 않으면 네트워크 요청 없이 `status: "not_configured"`로 보고된다.
- **공식 API 연동 opt-in 설정 (기본값: 세 출처 모두 호출 보류)**: `update-content.yml`의 `Collect hourly news` 스텝은 `YOUTUBE_API_KEY`·`X_BEARER_TOKEN`·`REDDIT_CLIENT_ID`·`REDDIT_CLIENT_SECRET`을 각각 repository Variable `ENABLE_YOUTUBE_NEWS`·`ENABLE_X_NEWS`·`ENABLE_REDDIT_NEWS`가 문자열 `true`일 때만 같은 이름의 repository Secret에서 전달하고, 그 외에는 빈 문자열을 전달해 기존 `not_configured` 보호가 그대로 동작한다. 실제로 값을 켜려면 순서대로 진행한다:
  1. 출처별 공식 이용 권한·요금·쿼터를 먼저 확인한다: [YouTube Data API Search](https://developers.google.com/youtube/v3/docs/search/list)(일일 쿼터 소모), [X API 최근 검색](https://docs.x.com/x-api/posts/search/quickstart/recent-search)(승인된 앱·토큰 필요), Reddit([Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy), [Data API Terms](https://redditinc.com/policies/data-api-terms))는 명시적 승인과 상업적 이용 조건이 붙을 수 있다. 정확한 유료 요금은 계정 조건마다 달라 여기서 추정하지 않는다.
  2. 필요한 만큼만 GitHub repository Secret([공식 문서](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets))에 `YOUTUBE_API_KEY`·`X_BEARER_TOKEN`·`REDDIT_CLIENT_ID`·`REDDIT_CLIENT_SECRET` 중 해당 값을 등록한다.
  3. 해당 출처의 repository Variable(`ENABLE_YOUTUBE_NEWS`/`ENABLE_X_NEWS`/`ENABLE_REDDIT_NEWS`)을 `true`로 설정한다.
  4. 다음 정시 수집 이후 `data/content-health.json`에서 해당 출처 상태가 `not_configured`를 벗어났는지 확인한다.
  활성화 전까지는 승인·계정 신청이나 실제 API 요청을 하지 않는다.
- **실패 감지**: 워크플로 마지막 단계가 뉴스/문서/시간별 수집 세 스텝의 outcome을 확인해 하나라도 `failure`(모든 출처 실패)면 워크플로 자체를 실패로 표시한다. 부분 실패(`partial`)는 워크플로를 막지 않는다.
- **동시 실행 방지**: 기존 `concurrency: group: update-content`가 일일·시간별 실행 모두에 적용되어 겹쳐 실행되지 않는다.
- **커밋 대상**: 시간별 실행도 `data/today.json`, `data/today-candidates.json`, `data/content-health.json`, `.source-cache/content.json` 변경분을 빌드 후 커밋·푸시한다(기존 커밋 단계 그대로 재사용).

## 0. v0.5.0 Claude Code·Grok Releases 추가 (현재 운영 기준)

- **화면 및 출처 분리**:
  - `뉴스레터`(`/today`): 일반 뉴스 전용. 4개 release source(`codex-releases`, `gemini-releases`, `claude-releases`, `grok-releases`)를 기사 수, 페이징, 목록, 출처 점검 상태, 안내 문구에서 완전히 제외한다.
  - `Releases`(`/releases`): 개발 도구 릴리스 전용. 4개 release source(`codex-releases`, `gemini-releases`, `claude-releases`, `grok-releases`)만 최신순 10개씩 페이징 노출한다. 소개 문구는 Codex, Claude Code, Gemini CLI, Grok을 모두 명시한다.
- **공식 출처 및 60일 실측**:
  - `claude-releases`: `https://github.com/anthropics/claude-code/releases`, GitHub API `anthropics/claude-code`, 최근 60일 49건 실측.
  - `grok-releases`: `https://docs.x.ai/developers/release-notes`, 공식 HTML, 최근 60일 8건 실측. (Markdown URL은 날짜가 빠지므로 제외)
  - 총 예상 신규 릴리스: 57건 (Claude 49건 + Grok 8건).
- **수집 및 파싱 기준**:
  - **Claude Code**: 기존 `parse_github_releases`를 그대로 재사용해 source config 한 줄을 추가한다. 버전형 제목은 `Claude Code vX 버전 출시`로 생성한다. `What's changed`의 `Added`·`New`·`Introduced`는 New Features, `Fixed`·`Resolved`는 Bug Fixes, 나머지는 Chores로 분류한다.
  - **Grok**: Python stdlib `HTMLParser`로 `<main>` 안의 월 `h2`, 날짜 div(예: `September 17`), 항목 `h3 id=...`, 설명 `p`/`li`를 파싱한다. script/style 데이터는 무시한다. 페이지 최신 연도는 `window_end`의 KST 연도이며, `December 2025` 같은 명시 연도 제목을 지원한다. 날짜는 원문에 시각이 없으므로 `published_on`/`date_precision: day`로 보존한다.
  - **URL 정규화 (Fragment 보존)**: Grok 항목 URL은 `https://docs.x.ai/developers/release-notes#<h3-id>`이며, `canonicalize_url`은 이 경로에 한해 fragment를 보존하여 항목별 식별과 중복 제거를 지원한다. 다른 URL fragment 정책은 변경하지 않는다.
  - **Grok 요약 및 분류**: 항목 설명은 기본 `new_features`로 최대 3개·420바이트 요약 후 한국어 번역한다. 제목에 retirement/deprecation/deprecated가 있으면 `chores`로 분류한다. `bug_fixes`는 공식 본문에 해당 내용이 없으므로 비운다. `release_notes_ko`는 항상 포함한다.
  - **후보 생성 및 무결성**: 신규 Grok 후보도 `make_candidate`를 사용해 한국어 제목, 원문 요약, 초보자 해설을 갖추며, 번역 실패 시 해당 출처 실패 경로로 처리하고 영문만 공개하지 않는다. 공식 URL, 날짜, 제목, 설명이 불완전한 항목은 보류(`held_count`) 처리하며, 60일보다 오래된 항목에 도달하면 `coverage_limited=false`로 기록한다.
  - **Source Config**: `Grok Releases`, URL `https://docs.x.ai/developers/release-notes`, type `xai_releases`를 추가하고 fetch status 및 content type을 확인한 후 parser로 넘긴다.
  - **Archive 보강**: archive 보강 집계와 초보자 해설 release 판정도 4개 source(`RELEASE_SOURCE_IDS`)를 사용한다.
- **데이터 보강 운영 명령**:
  ```bash
  python3 scripts/collect_content.py news
  ```

## 0.1 v0.4.0 Releases 분리 및 한국어 릴리스 요약 (역사 기록)

아래 내용은 v0.4.0 기준 역사 기록이다. 충돌하면 위의 v0.5.0 구역이 우선한다.

- **화면 및 출처 분리**:
  - `AI 뉴스레터`(`/today`): 일반 뉴스 전용. `codex-releases`와 `gemini-releases`를 기사 수, 페이징, 목록, 출처 점검 상태, 안내 문구에서 완전히 제외한다.
  - `Releases`(`/releases`): 개발 도구 릴리스 전용. `codex-releases`와 `gemini-releases`만 최신순 10개씩 페이징 노출한다.
- **데이터 저장**: 별도 DB나 파일 분리 없이 기존 `data/today.json` 누적 아카이브를 공유하고 화면에서 `source_id`로 분리한다.
- **릴리스 노트 요약 필드 (`release_notes_ko`)**:
  - `TodayArticle`에 `release_notes_ko?: { new_features?: string; bug_fixes?: string; chores?: string }` 선택 필드를 지원한다.
  - Releases 카드에는 제품명, 한국어 제목, 발행 시각, 세 구역(`새 기능 · New Features`, `버그 수정 · Bug Fixes`, `기타 작업 · Chores`), 원문 새 탭 링크를 표시한다. 항목이 없거나 비어 있으면 `공식 릴리스 노트에 별도 항목 없음`으로 표시한다.
- **수집 및 번역 규칙**:
  - GitHub release 원문 body에서 명시적 Markdown 제목(`New Features`/`Features`, `Bug Fixes`/`Fixes`, `Chores`)을 우선 추출한다.
  - 명시적 제목이 없거나 `What's Changed`인 경우 conventional prefix(`feat`->New Features, `fix`->Bug Fixes, `chore`·`docs`·`refactor`·`test`·`ci`·`build`·`perf`·`style` 및 기타->Chores)로 분류한다.
  - Full Changelog, compare 링크, 작성자·PR URL 장식은 제거한다.
  - 분류별 최대 3개 핵심 bullet, 합계 420바이트 이하 영어 요약으로 만들어 기존 `translate_to_korean`을 분류별 1회 호출한다.
  - 신규 릴리스 후보에는 `release_notes_ko`가 필수이며 내용이 없어도 `{}` 빈 객체를 저장한다.
  - 기존 archive 릴리스 기사는 GitHub API 순회 시 URL로 찾아 full body에서 `release_notes_ko`를 보강하고 `today.json`에 저장한다. 기존 필드는 온전히 보존한다.
  - 번역 실패 시 해당 출처는 수집 실패 처리하며 영문 요약을 공개하지 않는다.
- **데이터 보강 운영 명령**:
  - 기존 릴리스 기사에 한국어 릴리스 요약을 채우기 위해 팀장은 아래 명령을 실행한다:
    ```bash
    python3 scripts/collect_content.py news
    ```

## 0.1 v0.3.0 AI 뉴스레터 개편 (역사 기록)

아래 내용은 v0.3.0 기준 역사 기록이다. 충돌하면 위의 v0.4.0 구역이 우선한다.

- **화면 이름**: `AI 뉴스레터`(경로 `/today`).
- **수집 범위**: 수집 시각 기준 고정 60일 rolling window(달력 두 달 아님). 기본 `news`가 60일이며 GitHub Actions 예약 수집(06:15 KST)도 60일로 실행한다. 6개 공식 출처가 제공하는 목록·피드·API 범위 안의 전체 항목이 대상이고, 출처가 이력을 제한(피드 항목 수, 목록 개수 등)하면 `data/content-health.json`의 해당 출처 상태에 한계를 기록한다. 1장의 "HTML 출처당 8개·Atom 10개" 제한은 이 범위에 맞게 재검토한다.
- **304/캐시**: 60일 조회는 과거 누락 방지를 위해 조건부 요청(304)을 쓰지 않고 항상 전체 재조회한다.
- **`data/today.json` = 누적 공개 아카이브**: 자동 수집이 원문 제목·공식 설명(`source_summary`)·링크·발행일을 그대로 누적하고, 제목·공식 설명의 주제에 근거한 한국어 초보자 해설(`why_it_matters`)을 반드시 추가한다. 기존 검토 완료 기사와 편집자가 쓴 `summary`·`why_it_matters`는 덮어쓰지 않는다. 화면에서 `source_summary`는 "출처 제공 설명"으로 구분해 표시한다.
- **한국어 표시**: 영문 원문은 `title`·`source_summary`에 보존하고 [MyMemory 공개 번역 API](https://mymemory.translated.net/doc/spec.php)로 만든 `title_ko`·`source_summary_ko`를 화면에 우선 표시한다. 번역에 실패한 신규 기사는 archive에 넣지 않고 해당 출처를 실패 처리해 다음 수집에서 다시 시도한다. 공개 기사 텍스트 외의 정보는 번역 서비스로 보내지 않는다.
- **중복 방지**: 새 수집 결과를 `data/today.json`과 `id`/정규화 URL로 대조해 이미 본 항목은 상세 재수집·재추가하지 않는다. 재실행 시 추가 0건·`data/today.json` 파일 무변경.
- **보류 재확인**: `data/today-candidates.json`은 이번 실행의 새 항목·건너뛴 수·보류 수를 기록한다. 발행 날짜를 확인할 수 없는 항목은 60일 전체 재조회 때 다시 확인하며 별도 누적 큐는 두지 않는다.
- **발행 시각**: 정확한 시각이 있으면 `published_at`(시간대 포함), 날짜만 확인되면 `published_on` + `date_precision: "day"`. 시각을 임의로 만들지 않는다.
- **정렬**: 발행일(KST) 내림차순, 같은 날짜 안에서는 정확한 시각 항목(시각 내림차순) 먼저, 이후 날짜 전용 항목(`id` 오름차순).
- **페이징**: `/today?page=N`, 페이지당 10건. 범위 밖·잘못된 page는 마지막 페이지로 보정하지 않고 빈 상태 안내와 1페이지 링크를 보여준다.
- **검증 도구**: `publish_news.py`의 1일/7일 윈도우·10건 상한 검증은 누적 아카이브 구조와 충돌하므로 구현 시 편집 필드 검증 중심으로 조정하고 `check_content.py`도 함께 갱신한다.
- **범위 밖**: 외부 의존성 추가, 별도 DB, 새 상세 페이지.

---

## 1. 개요 및 운영 원칙 (v0.2.x 역사 기록)

AgentTutor의 뉴스 브리핑(`/today`)과 학습 자료 출처 점검은 **자동 후보 수집**과 **담당자 검토 및 발행**을 엄격히 분리하여 운영합니다.

- **표준 라이브러리 및 공개 피드 기반**: 외부 유료 API나 상용 인증 토큰 없이 공식 공개 피드(RSS, Atom, HTML)와 Python 표준 라이브러리만을 사용하여 동작합니다. 단, GitHub Actions 워크플로 실행 분수 및 호스팅 플랫폼(Vercel 등)의 무료 할당량(Quota) 제한이 존재하므로 무제한 무과금을 보증하는 것은 아닙니다.
- **수집과 발행의 분리 (자동 공개 금지)**: 자동화 스크립트(`collect_content.py`) 및 GitHub Actions 워크플로는 후보(`data/today-candidates.json`)와 헬스(`data/content-health.json`)만 갱신하며, 실제 공개본(`data/today.json`)을 자동으로 수정하거나 게시하지 않습니다. 모든 발행은 담당자의 명시적 검증 절차를 거쳐야 합니다.
- **편집자 책임 원칙**: 자동 수집은 제목·공식 설명의 주제에 근거한 기본 초보자 해설(`why_it_matters`)을 반드시 넣습니다. 담당자는 기사 선별과 한국어 요약(`summary`)을 작성하고 기본 해설을 더 구체적으로 다듬을 수 있으며, 검증 도구(`publish_news.py`)는 편집한 내용을 공개본에 원자적으로 반영합니다.
- **사실성 보장**: 임의의 날짜 조작, 시간대 없는 날짜에 임의 UTC 자정 붙이기를 엄격히 금지합니다. 시간대가 불명확하거나 수집 윈도우 인근의 모호한 날짜는 자동으로 제외하지 않고 보류(`held`) 처리합니다.
- **단일 스냅샷 및 Git 이력**: 별도의 날짜별 폴더 구조를 두지 않고 `data/today.json`에 최신 단일 스냅샷을 유지하며, 과거 판본 이력은 Git 버전 관리 히스토리를 통해 보존합니다.

---

## 2. 파일 구성 및 역할

| 파일 경로 | 관리 주체 | 설명 |
|---|---|---|
| `data/today-candidates.json` | 수집기 (`collect_content.py news [--days 1\|7]`) | 6개 공식 출처에서 최근 24시간(기본) 또는 7일(수동) 내 수집된 기사 후보 목록과 출처별 수집 상태 |
| `data/today.json` | 발행 스크립트 (`publish_news.py`) | 웹 서비스(`/today`)에 실제 노출되는 오늘의 10대 뉴스 공개본 (단일 최신 스냅샷) |
| `data/content-health.json` | 자동 점검기 (`collect_content.py`) | 뉴스 수집 상태(`news`) 및 학습 자료 4개 메뉴 출처 점검 상태(`documents`) |
| `.source-cache/content.json` | 자동 수집기/점검기 | HTTP ETag, Last-Modified 헤더 및 콘텐츠 정규화 해시 캐시 (전문 본문 저장 안 함) |

---

## 3. 실행 인터페이스 (CLI Commands)

### 3.1 뉴스 후보 수집
```bash
# 기본: 최근 24시간 수집 (일일 자동 실행과 동일)
python3 scripts/collect_content.py news
# 또는
python3 scripts/collect_content.py news --days 1

# 첫 발행 또는 필요 시: 최근 7일 수집 (2026-09-21 승인)
python3 scripts/collect_content.py news --days 7
```
- **수집 기간 옵션 (`--days 1|7`)**:
  - 기본값은 1(최근 24시간)이며, 일일 자동 실행(GitHub Actions)은 기존 24시간 수집 원칙을 그대로 유지합니다.
  - 2026-09-21 승인으로 첫 뉴스 발행을 위한 최근 7일 확대 수집(`--days 7`)을 지원합니다.
  - CLI 및 함수 호출 시 1 또는 7 이외의 일수는 거부되며, 임의 날짜 주입은 불가합니다.
- **캐시 및 조건부 요청(304) 정책**:
  - 24시간 수집(`--days 1`): 기존 캐시(`window_days == 1`)가 존재할 때만 ETag/Last-Modified 조건부 요청(304)을 사용합니다.
  - 7일 수집(`--days 7`): 과거 6일 치 후보 누락을 방지하기 위해 조건부 요청(304)을 우회하고 피드를 항상 전체 재조회합니다.
  - 수집된 후보 캐시(`cached_items`)는 20개 상한을 제거하고 파싱된 전체 항목을 저장합니다.
  - 학습 자료 문서 출처 점검(`documents`) 캐시에는 일절 영향을 주지 않습니다.
- **동작**: 6개 공식 뉴스 출처(OpenAI, Google AI, Codex, Gemini CLI, Anthropic, xAI)에서 지정 기간 이내 발행된 기사를 수집합니다.
- **한정된 수집 범위 (Bounded Coverage)**:
  - HTML 뉴스 출처당 최대 8개의 기사 링크만 추출하여 분석합니다.
  - Atom 릴리스 피드당 최신 10개의 엔트리만 검토하며, 프리릴리즈 및 구버전 릴리스는 API 요청 전 사전 필터링합니다.
- **반영 파일**: `data/today-candidates.json`, `data/content-health.json`의 `news` 섹션, `.source-cache/content.json`.
- **보호**: 공개본 `data/today.json`은 일절 건드리지 않습니다.

### 3.2 문서 출처 점검
```bash
# 기본: 주기가 도래한 URL만 점검 (Agents 1일, Engineering 7일, Learn/Glossary 30일)
python3 scripts/collect_content.py documents

# 강제: 주기와 관계없이 4개 메뉴의 모든 출처 URL 즉시 점검
python3 scripts/collect_content.py documents --force
```
- **동작**: 4개 메뉴(`agents.json`, `agent-engineering.json`, `learn.json`, `glossary.json`)의 `sources[].url` 중복을 제거하고 ETag/Last-Modified 조건부 요청 또는 본문 해시 비교로 변경 여부를 감지합니다. 실패한 출처는 30일을 기다리지 않고 다음 일일 워크플로에서 즉시 재시도됩니다.
- **반영 파일**: `data/content-health.json`의 `documents` 섹션, `.source-cache/content.json`.
- **보호**: 기존 문서 본문 JSON 파일은 절대 수정하지 않습니다.

### 3.3 뉴스 공개본 검증 및 발행
```bash
python3 scripts/publish_news.py <프로젝트-내-reviewed-edition.json>
```
- **동작**: 담당자가 작성한 검토 판본 파일을 후보 근거(`today-candidates.json`)와 대조 검증한 후 `data/today.json`을 원자적으로 교체합니다.
- **보안**: 프로젝트 외부 파일 경로(`Path.resolve()`), 심볼릭 링크, 민감 정보 파일명(`.env`, `login`, `auth` 등), 1MB 초과 파일은 엄격히 거부됩니다.

---

## 4. 뉴스 편집 및 발행 절차

### 1단계: 일일 수집 실행
매일 06:15 Asia/Seoul(KST)에 GitHub Actions가 자동으로 수집을 실행하거나, 필요 시 로컬에서 `python3 scripts/collect_content.py news`를 수동 실행합니다.

### 2단계: 후보 확인
`data/today-candidates.json`을 열어 수집된 기사 후보 목록을 확인합니다.
- 각 후보는 `id`, `title`, `source_name`, `source_url`, `published_at`, `evidence`를 포함합니다.
- URL 중복은 수집기에서 제거한다. URL이 달라도 제품·발표일·주요 변경 내용이 같은 사건이면 편집자가 묶어서 한 건만 선택한다. 신뢰성·학습 관련성·사용자 영향·신규성 순으로 검토하고 회사별 편중도 확인한다.
- `evidence`는 피드 본문에서 추출된 참조 근거이며, 한국어 요약으로 자동 노출되지 않습니다.

### 3단계: 편집 파일 작성
프로젝트 내 임의의 작업 경로(예: `scripts/reviewed-today.json`)에 JSON 파일을 생성하고 다음과 같이 작성합니다:

```json
{
  "edition_date": "2026-09-20",
  "window_start": "2026-09-19T00:45:00+09:00",
  "window_end": "2026-09-20T00:45:00+09:00",
  "collected_at": "2026-09-20T00:45:00+09:00",
  "reviewed_at": "2026-09-20T01:30:00+09:00",
  "articles": [
    {
      "id": "a1b2c3d4e5f67890",
      "title": "[스키마 예시] 공식 플랫폼 신규 릴리스 업데이트",
      "summary": "[가상 스키마 예시] 이 내용은 스키마 구조 안내를 위한 예시이며 실제 발행 시에는 당일 수집된 후보 기사의 사실적 한국어 요약을 작성합니다.",
      "why_it_matters": "[가상 스키마 예시] 초보자 개발자 관점에서 이 업데이트가 실무 에이전트 개발 환경에 미치는 실질적인 영향을 설명합니다.",
      "source_id": "openai-news",
      "source_name": "OpenAI News",
      "source_url": "https://openai.com/news/sample-article",
      "published_at": "2026-09-19T15:30:00+00:00"
    }
  ]
}
```

#### 스키마 및 검증 규칙
1. **시간 및 윈도우 일치**:
   - `window_start`, `window_end`, `collected_at`은 `data/today-candidates.json`의 값과 정확히 일치해야 합니다.
   - 수집 윈도우 기간(`window_end - window_start`)은 정확히 1일(24시간) 또는 7일만 허용되며, 2일 등 임의 기간은 거부됩니다.
2. **발행일 일치**: `edition_date`는 `window_end`의 KST 날짜(`YYYY-MM-DD`)와 일치해야 합니다.
3. **검토 시각**: `reviewed_at`은 검토자가 작업을 마친 실제 시각(ISO 8601, 시간대 포함)이며, `collected_at` 이후여야 하고 현재 시각보다 미래일 수 없습니다.
4. **기사 매칭 및 타임존**:
   - `id`, `source_id`, `source_name`, `source_url`, `published_at`은 후보와 100% 동일해야 합니다.
   - 모든 타임스탬프(`published_at` 포함)는 명시적인 시간대(Timezone) 정보를 반드시 포함해야 합니다.
   - `published_at`은 수집 윈도우(`window_start` ~ `window_end`) 범위 내여야 합니다.
   - `title`은 이해를 돕기 위해 한국어로 번역할 수 있습니다.
   - `summary` 및 `why_it_matters`는 초보자가 이해하기 쉬운 한국어 설명이어야 하며 누락될 수 없습니다.
5. **개수 및 중복**: 기사는 최대 10개까지 등록 가능하며, 중복 기사 ID나 중복 URL은 거부됩니다.

### 4단계: 발행 명령 실행
```bash
python3 scripts/publish_news.py scripts/reviewed-today.json
```
- 모든 검증을 통과하면 `data/today.json`이 원자적으로 교체됩니다.
- 동일한 내용으로 재실행할 경우 파일 변경 없이 정상 종료(멱등성 보장)됩니다.

### 5단계: 배포
기존 Next.js 배포 흐름에 따라 Git 커밋 및 푸시합니다:
```bash
git add data/today.json
git commit -m "feat(today): 2026-09-20 오늘의 뉴스 발행"
git push origin master
```

---

## 5. 예외 상황 처리 지침

### 5.1 최근 24시간(또는 7일) 수집 기간 내 후보가 0건인 경우
- 피드 응답이 정상이고 보류(`held`)나 실패(`failed`) 출처가 전혀 없으며 실제로 해당 수집 윈도우 기간 내 발행된 뉴스가 없는 경우에만 수집기 상태가 `ok`가 됩니다.
- **빈 에디션 발행**: 후보가 0건이고 수집 상태가 `ok`이며 보류/실패 출처가 0개일 때에만 `articles: []` 상태의 빈 에디션 발행이 허용됩니다.
- **보류/장애 상태에서의 0건**: 메타데이터 불확실성으로 보류(`held`)된 항목이 있거나 일부 출처가 실패(`partial`)한 경우에는 빈 에디션을 발행할 수 없으며, 기존의 최신 공개본이 안전하게 보존됩니다.

### 5.2 부분 수집 장애 및 보류 (`partial`)
- 6개 출처 중 네트워크 오류가 발생하거나 메타데이터 불확실성으로 보류(`held_count > 0`) 항목이 발생한 경우 전체 수집 상태는 `partial`로 기록됩니다.
- 후보가 수집된 경우 담당자는 정상 수집된 기사들로 뉴스 발행을 진행할 수 있으며, 화면 상단에 부분 수집 안내가 표시됩니다.

### 5.3 전체 수집 장애 (`failed`)
- 6개 출처 모두 수집에 실패한 경우 `status: "failed"`로 기록되고 스크립트는 종료 코드 1로 종료됩니다.
- 기존의 최신 공개본(`data/today.json`)은 안전하게 보존되며 웹 화면에는 수집 지연/장애 안내문이 표시됩니다.

### 5.4 과거 판본으로의 퇴행 방지 (단조 증가)
- 이미 최신 날짜나 동일 날짜의 최신 수집본이 발행되어 있는 경우, 이전 날짜 또는 이전 시각의 수집본으로 되돌리려는 발행은 시스템에 의해 엄격히 차단됩니다.

---

## 6. 학습 자료 문서 출처 점검 운영

### 6.1 점검 주기
- **Agents** (`data/agents.json`): 매일 (1일 주기)
- **Agent Engineering** (`data/agent-engineering.json`): 매주 (7일 주기)
- **Learn** (`data/learn.json`): 매월 (30일 주기)
- **Glossary** (`data/glossary.json`): 매월 (30일 주기)

### 6.2 변경 감지 및 `changed_at` 유지 원칙
- 출처 페이지 내용이 변경되어 새 해시가 감지되면 상태가 `changed`로 변경되고 `changed_at`에 **가장 최근에 감지된 변경 시각(latest detected change)**이 기록됩니다.
- 출처 페이지 내용이 다시 한 번 변경되어 새로운 서로 다른 해시가 감지되면 `changed_at`은 그 시점의 최신 시각으로 즉시 갱신됩니다.
- 출처 서버가 304(Not Modified)나 동일 해시를 반환하는 동안에는 직전에 감지된 `changed_at` 시각과 `changed` 상태가 그대로 보존됩니다.
- 이를 통해 점검 시점과 편집자의 검토 시점 차이로 인해 갱신 필요 정보가 유실되지 않습니다.
