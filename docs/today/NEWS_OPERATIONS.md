# Today 뉴스 및 문서 출처 운영 지침 (NEWS OPERATIONS)

## 0. v0.3.0 AI 뉴스레터 개편 (현재 운영 기준)

아래 1~6장은 v0.2.x(24시간/7일 단일 스냅샷, 수집·발행 완전 분리) 기준의 **역사 기록**이다. 충돌하면 이 장이 우선하며, 구현 완료 전까지 실제 동작은 1~6장과 같다. 구현 항목은 [TODAY_TASKS.md](./TODAY_TASKS.md) 참고.

- **화면 이름**: `AI 뉴스레터`(경로 `/today`).
- **수집 범위**: 수집 시각 기준 고정 60일 rolling window(달력 두 달 아님). 기본 `news`가 60일이며 GitHub Actions 예약 수집(06:15 KST)도 60일로 실행한다. 6개 공식 출처가 제공하는 목록·피드·API 범위 안의 전체 항목이 대상이고, 출처가 이력을 제한(피드 항목 수, 목록 개수 등)하면 `data/content-health.json`의 해당 출처 상태에 한계를 기록한다. 1장의 "HTML 출처당 8개·Atom 10개" 제한은 이 범위에 맞게 재검토한다.
- **304/캐시**: 60일 조회는 과거 누락 방지를 위해 조건부 요청(304)을 쓰지 않고 항상 전체 재조회한다.
- **`data/today.json` = 누적 공개 아카이브**: 자동 수집이 원문 제목·공식 설명(`source_summary`)·링크·발행일을 그대로 누적하고, 제목·공식 설명의 주제에 근거한 한국어 초보자 해설(`why_it_matters`)을 반드시 추가한다. 기존 검토 완료 기사와 편집자가 쓴 `summary`·`why_it_matters`는 덮어쓰지 않는다. 화면에서 `source_summary`는 "출처 제공 설명"으로 구분해 표시한다.
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
