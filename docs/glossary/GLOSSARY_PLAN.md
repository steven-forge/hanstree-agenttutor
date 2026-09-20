# Glossary 개발 계획

## 목표

AgentTutor 전체에서 사용하는 AI·Agent 용어를 짧고 일관되게 설명한다.

## 메뉴

- Glossary

## 항목 구성

각 용어는 용어명, 한국어 풀이, 한줄 정의, 쉬운 예시, 관련 용어, 처음 등장하는 학습 문서, 확인한 출처를 가진다.

## 분류

- 기본 개념: Agent, LLM, Prompt, Context, Memory
- 구성 요소: Tool, Skill, Hook, Plugin, MCP
- 구조·운영: Sub Agent, Agent Pattern, Context Management
- 제품·실행: CLI, Command, Model

## 원칙

- 한 용어에 한 핵심 뜻을 우선한다.
- 유사 용어의 차이를 함께 설명한다.
- 번역어와 원어를 함께 표기한다.
- 제품별 의미가 다르면 공통 뜻과 제품별 뜻을 나눈다.

## 데이터 출처·작성 방식

조사 기준일: 2026-09-20 KST. 외부 자료를 확인했으며 데이터 모델·갱신 방식은 아래와 같이 제안한다.

### 용어별 출처

| 대상 | 우선 출처 | 사용 방법 |
| --- | --- | --- |
| 일반 AI·LLM 용어 | [Google Machine Learning Glossary](https://developers.google.com/machine-learning/glossary) | 해당 용어 항목을 찾아 의미와 관련 용어 확인; 모든 Agent 용어가 있다고 가정하지 않음 |
| Agent·Workflow·Pattern | [Anthropic: Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) | 개념 구분의 근거로 활용하며 특정 저자의 정의임을 구분 |
| Skills | [Agent Skills 사양](https://agentskills.io/specification) | 공개 형식의 정의와 구성 확인 |
| MCP·관련 구성 요소 | [MCP 공식 문서 목록](https://modelcontextprotocol.io/llms.txt) | 정의가 있는 사양 본문과 버전 선택 |
| 제품별 기능 이름 | [Claude 공식 목록](https://code.claude.com/docs/llms.txt), [Codex 공식 목록](https://learn.chatgpt.com/docs/llms.txt), [Gemini CLI 문서](https://geminicli.com/docs/), [xAI 공식 목록](https://docs.x.ai/llms.txt) | 해당 제품의 개별 정의를 확인해 공통 뜻과 구분 |
| 대표 표기·별칭·관련 용어 구조 | [W3C SKOS Reference](https://www.w3.org/TR/skos-reference/) | 데이터 구성의 참고 자료이며 AI 용어 정의 출처는 아님 |

### 수집보다 문서 연계를 우선하는 방식

1. Learn·Agent Engineering에서 사용한 용어를 최초 목록으로 만든다. 초기에는 소수 핵심 용어를 직접 선정하며, 이후 새로 검토된 본문의 용어 표기·용어 ID에서 추가 후보를 추출한다.
2. 기존 대표 용어와 별칭을 대조해 중복 후보를 합친다. 철자가 같아도 제품별 의미가 다르면 적용 범위를 나누고 자동 병합하지 않는다.
3. 후보별 공식 정의를 읽고 출처 URL·구역·버전·확인일을 기록한다. Google 용어집에 없는 항목은 해당 사양·제품 원문에서 확인한다. 공식 번역이 없으면 한국어 표기를 AgentTutor 편집 표기로 구분한다.
4. 담당 편집자가 한줄 정의와 쉬운 예시를 직접 작성한다. 원문 사실과 비유를 구분하고 관련 문서에서 일관된 뜻으로 쓰는지 확인한다.
5. 검토된 항목에 고정 ID를 부여하고 학습 문서와 연결해 공개한다. Learn 초안 작성 중 후보를 함께 준비할 수 있으므로 두 메뉴가 서로의 완료를 기다릴 필요는 없다.

### 대안 비교와 선택

- 외부 용어집 전체 복제보다 실제 학습 문서에서 사용하는 용어부터 등록한다. 불필요한 항목과 번역 유지 비용을 줄이고 설명의 일관성을 높이기 위한 선택이다.
- AI 자동 정의 생성보다 공식 근거를 대조한 편집을 기본으로 한다. AI가 후보나 초안을 제안해도 승인된 정의를 자동 대체하지 않는다.
- SKOS의 대표 표기·별칭·관련 개념 구분만 작은 JSON 구조에 적용한다. 초기 규모에는 문자열·별칭 검색으로 시작하며 별도 검색 서버나 그래프 데이터베이스는 필요해질 때 검토한다.

### 데이터·갱신 제안

- 저장 경로: `data/glossary.json`. 기존 명령어 문서의 `data/docs.json`에 추가하지 않는다.
- 항목: `id`, `term`, `korean`, `aliases`, `scope`, `definition`, `example`, `related_ids`, `used_in_docs`, `sources`, `reviewed_at`, `updated_at`. 출처에는 URL·구역·버전·확인 시점을 둔다.
- `id`는 이름을 고쳐도 유지한다. `scope`는 공통 개념/공개 사양/특정 제품을 구분하며, 여러 뜻이 있으면 뜻별 설명과 근거를 기록한다.
- 신규 학습 문서 또는 개정 문서를 검토할 때 관련 용어도 갱신한다. 월 1회 출처 링크와 정의 변경을 점검한다. 원문 전체를 반복 수집하지 않고 사용 중인 항목만 확인한다.
- 출처 변경·접속 실패는 확인 필요 상태로 남긴다. 기존 정의는 검토 후에만 바꾸며 자동 삭제하지 않는다. 단순 링크 점검으로 본문 갱신일을 바꾸지 않는다.
- 관련 ID의 존재 여부, 별칭 충돌, 학습 문서의 누락 링크를 공개 전 확인한다. 용어집 검색 결과에서 관련 학습 문서로 돌아갈 수 있게 한다.

## 단계별 구현

1. Learn·Engineering 핵심 용어와 출처 선정
2. 대표 용어·별칭·적용 범위·고정 ID 확정
3. 한국어 정의·예시 편집과 학습 문서 연결
4. 검색·분류·관련 용어 이동 및 갱신 흐름 확인

## 완료 기준

- 주요 메뉴의 핵심 용어가 모두 등록된다.
- 문서 본문에서 Glossary로 이동할 수 있다.
- 중복 정의와 서로 다른 번역이 정리된다.
- 모든 정의에 근거와 검토일이 있고 제품별 의미가 구분된다.
- ID·별칭·관련 문서 연결이 유효하며 정의를 고쳐도 기존 링크가 유지된다.
