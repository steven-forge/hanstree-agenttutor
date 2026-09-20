# Agents 개발 계획

## 목표

주요 AI Agent 제품의 특징과 사용 맥락을 비교해, 사용자가 어떤 도구를 선택할지 이해하도록 돕는다.

## 메뉴

- Claude
- Codex
- Gemini
- Grok

## 문서 구성

모든 Agent 문서는 같은 항목으로 비교한다.

- 한줄 소개
- 잘하는 일
- 작업 방식과 강점
- 적합한 사용자와 상황
- 주의할 점
- 공식 문서·홈페이지
- 다른 Agent와의 차이

## 원칙

- 특정 제품을 근거 없이 우월하다고 표현하지 않는다.
- 변할 수 있는 모델명·가격·지원 기능은 확인 날짜와 출처를 함께 둔다.
- 공개적으로 확인 가능한 정보와 해석을 구분한다.
- 비교는 기능 나열보다 실제 선택 상황 중심으로 작성한다.

## 데이터 출처·수집 방식

조사 기준일: 2026-09-20 KST. 아래 설계는 제품의 최신 성능이나 가격을 확정한 문서가 아니다.

최초 구현은 `data/agents.json`과 `/agents`, `/agents/[slug]`에서 4개 제품의 동일 항목 비교를 제공한다. App·CLI·API 지원 여부를 공식 지원 확인·조건부·미확인으로 구분하고 출처·검토일을 표시한다. Codex SDK와 일반 모델 API를 혼동하지 않으며 [Grok 공식 CLI](https://docs.x.ai/build/cli/reference)처럼 확인한 제공 형태만 확정한다. 출처는 `scripts/collect_content.py documents`로 매일 점검한다. 마지막 검토 이후 출처 변경·접속 실패 또는 30일 이상 검토 경과 시 확인 필요 안내를 표시한다. 가격 수치와 성능 순위는 최초 범위에서 제외한다.

### 제품별 수집 출처

| 메뉴 | 기능 설명의 근거 | 변경을 감지할 출처 |
| --- | --- | --- |
| Claude | [Claude Code 공식 문서 목록](https://code.claude.com/docs/llms.txt)의 기능별 본문 | 같은 인덱스의 changelog, [Anthropic 뉴스](https://www.anthropic.com/news) |
| Codex | [공식 문서 목록](https://learn.chatgpt.com/docs/llms.txt)에서 Codex 해당 페이지 선택 | [공식 변경 기록](https://learn.chatgpt.com/docs/changelog), [Codex Atom](https://github.com/openai/codex/releases.atom) |
| Gemini | [Gemini CLI 문서](https://geminicli.com/docs/), API·앱은 각각 해당 공식 본문 | [Gemini API 변경 기록](https://ai.google.dev/gemini-api/docs/changelog), [CLI Atom](https://github.com/google-gemini/gemini-cli/releases.atom), [Google AI RSS](https://blog.google/innovation-and-ai/technology/ai/rss/) |
| Grok | [API 개요](https://docs.x.ai/overview), [공식 문서 목록](https://docs.x.ai/llms.txt)의 해당 제품 페이지 | [xAI 공식 발표](https://x.ai/news) |

Codex의 이전 `developers.openai.com/codex/overview`와 `/codex/changelog`는 조사 시 각각 `learn.chatgpt.com/docs`와 `/docs/changelog`로 이동했다. 원 URL·최종 URL을 보관하며 통합 문서의 ChatGPT 내용이 Codex 기능으로 섞이지 않게 대상 제품을 확인한다. 목록은 발견용이며 기능별 본문을 읽어야 지원 여부의 근거가 된다.

### 수집과 비교 설명을 분리

1. 공식 변경 기록·피드를 일 1회 확인해 새 릴리스·내용 변경 후보를 만든다. 상세 지원 여부는 연결된 공식 문서에서 확인한다.
2. 피드가 없으면 지정한 공식 HTML 문서의 본문 변화만 감지한다. 모델·기능 전체를 열거해 주는 공개 API가 있다고 가정하지 않는다.
3. 비교 항목마다 근거 URL·확인 시점·제품 사용 형태(앱/API/CLI)·버전·요금제·지역·공개 상태를 기록한다. 적용되지 않는 필드는 비워 두되 이유를 남긴다.
4. 담당 편집자가 근거와 변경 내용을 대조해 기능 설명을 갱신한다. 추천 사용 상황은 편집 판단임을 표시한다. 회사의 성능 우위 주장은 독립 검증된 비교 결과로 취급하지 않는다.
5. 검토한 항목만 정적 JSON에 반영한다. 자동 수집 결과가 기존 비교 문장을 바로 덮어쓰지 않게 한다.

### 더 나은 수집 방식의 선택

- 전체 홈페이지를 매일 재수집하기보다 변경 기록·릴리스로 검토할 범위를 좁힌다. 변경 기록에 빠질 수 있는 수정은 주 1회 핵심 기능 문서 점검으로 보완한다.
- GitHub Atom은 최근 항목만 제공한다. 조사 시 두 피드는 각각 10개 항목을 반환했으며 장기간 중단으로 공백이 생기면 [Releases API](https://docs.github.com/en/rest/releases/releases)로 필요한 기간을 보충한다. 시험판 릴리스를 안정판 지원 근거로 쓰지 않는다.
- 최초 버전의 가격 정보는 공식 요금 페이지 링크 중심으로 제공한다. 숫자를 직접 비교할 때만 통화·단위·세금 포함 여부·지역·요금제·확인일을 함께 검토한다. 요금 페이지의 정확한 주소는 구현 시 제품별 공식 링크에서 확인해 등록한다.
- 검색 결과·리뷰·벤치마크는 비교할 질문을 찾는 보조 자료다. 수치 비교를 추가하려면 원 벤치마크의 버전·조건까지 확인하며 현재 계획에서 임의의 제품 순위를 만들지 않는다.

### 제품 구분·저장·실패 처리 제안

- Claude 앱과 Claude Code, Codex의 앱·CLI·클라우드, Gemini 앱·API·CLI, Grok 앱·API·개발 도구를 구분한다. 한 사용 형태의 릴리스로 다른 형태의 지원을 추정하지 않는다.
- 비교 항목의 상태는 `공식 지원 확인`, `조건부·시험 제공`, `미지원 명시`, `미확인`으로 나눈다. 문서에 없다는 이유만으로 미지원 처리하지 않는다.
- `data/agents.json`에 제품 소개와 기능별 근거를 저장한다. 기존 `data/docs.json`의 명령어 문서 6개 구조는 그대로 두며 명령어 표는 중복 작성하지 않는다.
- 각 근거에 `source_url`, `resolved_url`, `source_version`, `fetched_at`, `reviewed_at`를 저장하고 본문 변경 시에만 `updated_at`를 갱신한다. 조건부 HTTP 요청과 본문 해시를 사용해 반복 수집·편집을 줄인다.
- 수집 실패 시 마지막 검토본과 확인일을 유지한다. 확인 실패 또는 미검토 변경이 있으면 확인 필요 표시를 붙이고, 수집 성공을 내용 검토 완료로 처리하지 않는다.
- 공개 전에는 4개 제품을 같은 항목으로 비교할 수 있는지 확인한다. 공식 자료만으로 판단하기 어려운 항목은 빈칸 대신 미확인과 사유를 표시한다.

## 단계별 구현

1. 제품별 사용 형태와 공통 비교 항목 확정
2. 공식 문서에서 근거를 모아 제품 4개 초안 작성
3. 조건부 제공·미확인·가격 링크 표시 확인
4. 일일 변경 감지와 주간 핵심 문서 점검 연결

## 완료 기준

- 4개 Agent 문서가 같은 기준으로 비교된다.
- 각 문서에 공식 출처와 확인 날짜가 있다.
- 최신성이 필요한 정보의 갱신 책임이 정해져 있다.
- 사용자가 자신의 목적에 맞는 선택을 할 수 있다.
- 기능별 근거와 적용 제품·버전·조건을 추적할 수 있다.
- 미확인과 미지원을 구분하고 자동 감지 결과는 검토 후에만 공개한다.
