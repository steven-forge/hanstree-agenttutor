# Learn 개발 계획

## 목표

Agent를 처음 배우는 사람이 핵심 개념을 순서대로 이해하도록 기초 학습 문서를 제공한다.

## 메뉴

- Agent 기본
- LLM
- Prompt
- Context
- Memory
- Agent Pattern

## 학습 구조

각 문서는 `개념 → 쉬운 예시 → 동작 흐름 → 흔한 실수 → 다음 학습` 순서로 작성한다.

| 순서 | 문서 | 학습 목표 |
| --- | --- | --- |
| 1 | Agent 기본 | Agent의 구성 요소와 실행 흐름 이해 |
| 2 | LLM | 언어 모델의 역할과 한계 이해 |
| 3 | Prompt | 원하는 일을 정확히 요청하는 방법 이해 |
| 4 | Context | 모델이 판단에 참고하는 정보 이해 |
| 5 | Memory | 정보를 보존하는 방법 이해 |
| 6 | Agent Pattern | 반복 사용되는 설계 패턴 이해 |

## 원칙

- 비개발자도 읽을 수 있는 쉬운 한국어를 사용한다.
- 용어는 Glossary와 연결한다.
- 예시는 특정 서비스에 종속되지 않게 작성한다.
- 코드가 필요할 때만 짧은 예시를 넣는다.

## 데이터 출처·작성 방식

조사 기준일: 2026-09-20 KST. 공식 학습 자료를 확인했다. 아래는 현재 구현과 그 설계 근거이며, 아직 구현하지 않은 항목은 "미구현"으로 표시한다.

현재 구현은 `data/learn.json`의 한국어 편집 문서 6개와 목록 화면 `/learn`, 문서 화면 `/learn/[slug]`를 사용한다. 정의·쉬운 예시·동작 흐름·흔한 실수·다음 학습을 공통 항목으로 두고, `related_glossary_ids`로 용어사전에 연결한다. 출처 URL·검토일은 문서에, 출처별 본문 해시·HTTP 응답 정보는 별도 캐시에 저장한다. `scripts/collect_content.py documents`가 30일 주기로 원문 변경을 점검하며, 자동 수집 결과로 설명문을 덮어쓰지 않는다. 출처를 다른 메뉴에서도 사용할 때는 더 짧은 점검 주기를 적용한다.

### 주제별 출처

| 메뉴 | 우선 참고할 원문 | 활용 범위 |
| --- | --- | --- |
| Agent 기본 | [Anthropic: Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) | Agent와 정해진 Workflow의 차이, 구성 요소 |
| LLM | [Hugging Face LLM Course](https://huggingface.co/learn/llm-course/chapter1/1) | 모델 학습의 기초 설명과 관련 장 탐색 |
| Prompt | [Google: Prompt design strategies](https://ai.google.dev/gemini-api/docs/prompting-strategies) | 명확한 지시, 예시, 제약 조건을 사용하는 방법 |
| Context | [Anthropic: Context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | 모델에 필요한 정보를 골라 제공하는 원리 |
| Memory | [Context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), [Claude 메모리 문서](https://code.claude.com/docs/en/memory.md) | 기억의 필요성과 제품별 보존 방식의 예시 |
| Agent Pattern | [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) | 작업 연결·분기·병렬 처리·위임·평가와 개선 패턴 |

### 추가 조사 학습자료

기존 주제별 출처를 중심에 두고, 아래 자료는 각 문서의 이해를 돕는 보강 자료로 사용한다. 자료의 내용을 그대로 옮기지 않고, 초보자에게 필요한 개념과 실습 순서만 재구성한다.

| 학습 단계 | 자료 | 추가할 내용 | 활용 방식 |
| --- | --- | --- | --- |
| LLM 입문 | [Hugging Face LLM Course](https://huggingface.co/learn/llm-course/chapter0/1) | LLM의 기본 구조, 토큰화, 사전학습 모델 사용 흐름 | LLM 문서의 다음 학습 링크와 선택형 실습 자료 |
| Prompt | [Google Prompt design strategies](https://ai.google.dev/gemini-api/docs/prompting-strategies) | 명확한 지시, few-shot 예시, 맥락 제공, 작업 분해 | Prompt 문서의 예시와 체크리스트 보강 |
| Agent 기본 | [Anthropic Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) | Workflow와 Agent의 차이, 단순한 설계에서 시작하는 기준 | Agent 기본과 Agent Pattern의 핵심 비교 근거 |
| Context | [Anthropic Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | 제한된 컨텍스트에서 필요한 정보 선별, 검색·기억·도구의 조합 | Context와 Memory 문서의 연결 설명 보강 |
| Tools | [Anthropic Writing effective tools for AI agents](https://www.anthropic.com/engineering/writing-tools-for-agents) | 도구 이름·입력·출력 설계, 도구 평가, 토큰 효율 | Agent Engineering의 Tools·MCP 문서로 연결 |
| 평가 | [Anthropic Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) | 단일 응답과 다단계 Agent 평가의 차이, 회귀 확인 | Agent Pattern의 평가와 개선 단원 보강 |
| 첫 실습 | [OpenAI Developer quickstart](https://platform.openai.com/docs/quickstart/make-your-first-api-request) | 첫 API 요청, 텍스트·이미지·파일 입력의 기본 흐름 | 코드를 처음 접하는 독자를 위한 선택형 후속 자료 |

조사 결과, Learn의 필수 순서는 `LLM 기초 → Prompt → Context → Agent → Tool → Pattern·평가`로 보강한다. API 사용과 코딩은 필수가 아닌 선택형 실습으로 분리해 비개발자용 본문을 어렵게 만들지 않는다. Anthropic 자료의 제품별 권장사항은 일반 원칙과 구분해 소개하고, 특정 모델의 기능을 모든 모델의 공통 규칙으로 쓰지 않는다.

공식 교육 문서도 저자의 관점과 제품 전제를 가진다. 제품별 권장법을 모든 모델의 규칙으로 일반화하지 않는다. 연구 결과나 수치를 넣는 경우에는 해당 원 논문까지 확인한다. 오래된 글은 개념 설명에 활용하고 최신 제품 지원 여부의 근거로 쓰지 않는다.

### 채택할 작성·수집 흐름

1. 담당 편집자가 주제별 학습 목표와 읽을 원문 구역을 정한다. 공식 문서 인덱스가 있으면 필요한 페이지를 찾는 데만 사용한다.
2. 제공되는 개별 Markdown을 우선 가져오고, 없으면 HTML 본문의 해당 구역을 읽는다. 문서 전체를 반복 수집하거나 전체 사이트를 학습 데이터로 만들지 않는다.
3. 원문의 사실을 한국어로 재구성해 `개념→예시→흔한 실수`를 작성한다. 직접 만든 비유·예시와 원문이 설명하는 사실을 구분한다.
4. 문서마다 근거 URL과 검토일을 연결하고 개념이 정확한지 검토한다. 외부 원문 전체 번역본을 그대로 게시하지 않는다. (미구현: 단락별 근거 연결과 원문 구역명 기록)
5. 검토한 본문과 Glossary 용어 ID를 정적 JSON에 저장해 빌드한다. AI 초안은 선택 사항이며 사실 확인과 편집을 대신하지 않는다.

### 더 나은 방법과 채택 이유

| 비교 대상 | 채택 방향 | 이유 |
| --- | --- | --- |
| 매일 전체 본문 자동 재작성 | 원문 변경 감지 후 해당 단락만 편집 | 학습 흐름·예시를 보존하고 불필요한 변경을 줄임 |
| 검색 결과 요약을 그대로 사용 | 지정된 공식 원문의 구역을 근거로 작성 | 설명의 근거와 변경 원인을 추적할 수 있음 |
| 질의 때마다 웹 검색·AI 생성 | 검토한 정적 학습 문서 제공 | 같은 개념을 일관되게 설명하고 호출 비용을 줄임 |

### 저장·갱신 방식

- `data/learn.json`에 `id`, `slug`, `title`, `description`, `order`(학습 순서), 본문 항목(`definition`, `easy_example`, `flow_steps`, `common_mistakes`, `next_steps`), `related_glossary_ids`, `sources`를 저장한다. 출처에는 이름과 URL을 둔다. 원문 해시는 별도 캐시에 둔다. (미구현: 출처의 구역명·원문 버전 기록)
- `reviewed_at`(검토 시각)과 `updated_at`(공개 내용 변경 시각)을 분리한다. 원문을 마지막으로 점검한 시각은 문서가 아닌 캐시에 저장한다. 단순 확인만으로 공개 갱신 날짜를 바꾸지 않는다.
- 30일 주기로 출처 변경을 점검하고, 틀린 설명이나 관련 공식 변경을 발견하면 수시로 검토한다. 조건부 요청이 가능하면 사용하고, 아니면 본문 해시로 변경 여부를 판별한다. 변경이 감지되면 담당 편집자가 관련 구역을 비교한다.
- 변경 감지는 자동화 작업, 설명 수정과 공개 판단은 담당 편집자가 맡는다. 접속 실패나 내용 변경 감지는 기존 문서의 자동 삭제·재작성 사유가 아니다. 마지막 검토본을 유지하고 확인 필요 상태를 남긴다.
- 기존 `data/docs.json`은 명령어 문서 6개 전용이므로 학습 데이터를 추가하지 않는다. 기존 화면 구성과 정적 데이터 처리 방식을 활용하되 신규 데이터는 분리한다.
- Learn의 Memory는 기억의 목적·한계, Engineering의 Memory는 저장·조회·만료·삭제 같은 구현을 설명한다. Memory와 Context 문서는 각각 Engineering의 해당 문서로, 나머지는 Engineering 첫 화면으로 연결해 중복을 줄인다.

## 단계별 구현

4단계 모두 완료했다(2026-09-20 기준).

1. 6개 주제의 출처와 학습 범위 확정
2. Agent 기본 1개로 데이터·본문·용어 연결 형식 확인
3. 나머지 5개 작성 후 학습 순서·출처 연결 확인
4. 출처 변경 점검 연결 (변경 감지 후 본문 수정은 담당 편집자가 직접 한다)

## 완료 기준

- [x] 6개 학습 문서가 각각 고유 경로에서 열린다.
- [x] 학습 순서와 이전·다음 이동이 명확하다.
- [x] 각 문서에 예시와 흔한 실수가 있다.
- [x] Glossary로 주요 용어를 연결할 수 있다.
- [x] 문서마다 근거 URL과 검토일을 찾을 수 있다.
- [x] 원문 접근 실패나 변경 감지 시에도 검토 전 공개 본문은 유지된다.
- [ ] 핵심 설명(단락)마다 근거 구역을 찾을 수 있다. (미구현)
