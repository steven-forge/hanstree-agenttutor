# Agent Engineering 개발 계획

## 목표

Agent를 실제로 만들고 운영할 때 필요한 확장 요소와 운영 구조를 체계적으로 설명한다.

## 메뉴

- Skills
- Hooks
- Tools
- MCP
- Plugins
- Commands
- Sub Agents
- Memory
- Context Management

## 문서 방향

각 주제는 `무엇인가 → 언제 쓰는가 → 구성 요소 → 최소 예시 → 보안·운영 주의점`으로 구성한다.

- Learn의 기초 개념을 실제 구현·운영 관점으로 확장한다.
- 기능 이름보다 역할과 문제 해결 상황을 먼저 설명한다.
- 비슷한 기능은 책임과 실행 시점을 비교한다.
- 외부 서비스나 특정 CLI에 종속되는 설명은 별도 범위로 표시한다.

## 권장 학습 순서

1. Tools, Skills
2. Hooks, Commands
3. MCP, Plugins
4. Sub Agents
5. Memory, Context Management

## 데이터 출처·작성 방식

조사 기준일: 2026-09-20 KST. 공식 사양·문서 목록과 아래 Claude 개별 Markdown 경로의 응답을 확인했다. 수집기와 갱신 작업은 향후 구현한다.

### 주제별 출처와 역할

| 메뉴 | 우선 출처 | 공통 개념과 제품 예시의 구분 |
| --- | --- | --- |
| Skills | [Agent Skills 사양](https://agentskills.io/specification), [Claude Skills](https://code.claude.com/docs/en/skills.md) | 공개 형식과 Claude에서 사용하는 방법을 분리 |
| Hooks | [Claude Hooks](https://code.claude.com/docs/en/hooks.md) | 이벤트·입출력·실행 시점을 해당 제품의 구현 예로 설명 |
| Tools | [Claude 확장 기능 개요](https://code.claude.com/docs/en/features-overview.md), [MCP 공식 문서 목록](https://modelcontextprotocol.io/llms.txt) | 내장 도구와 외부 도구 연결의 차이, 도구 관련 사양 탐색 |
| MCP | [MCP 공식 문서 목록](https://modelcontextprotocol.io/llms.txt), [버전 관리](https://modelcontextprotocol.io/specification/versioning) | 프로토콜 사양과 제품의 지원 범위를 별도 확인 |
| Plugins | [Claude Plugins](https://code.claude.com/docs/en/plugins.md) | 기능을 묶어 배포하는 제품별 구조 |
| Commands | [Claude Skills](https://code.claude.com/docs/en/skills.md), [Gemini CLI 문서](https://geminicli.com/docs/) | 사용자 호출과 명령 정의의 역할·설계 비교 |
| Sub Agents | [Claude Sub Agents](https://code.claude.com/docs/en/sub-agents.md) | 위임·작업 범위·결과 취합의 제품 예시 |
| Memory | [Claude Memory](https://code.claude.com/docs/en/memory.md) | 저장 범위·지속성·관리 방식의 제품 예시 |
| Context Management | [Claude Context Window](https://code.claude.com/docs/en/context-window.md), [Context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | 정보 선택·압축·유지와 제품 동작의 차이 |

Claude는 최초 구현 예시다. 모든 제품이 동일한 Hooks·Plugins·Memory 동작을 가진다고 단정하지 않으며, 다른 제품의 예시를 추가할 때는 해당 공식 문서에서 별도로 확인한다. Commands는 실행·설계 개념을 다루며 기존 명령어 문서의 명령 표를 복제하지 않는다.

### 수집 방법 개선

1. [Claude 문서 인덱스](https://code.claude.com/docs/llms.txt)와 MCP 인덱스에서 주제별 개별 문서를 찾는다. `llms.txt`는 목록이며 본문 검증·변경 이력·수집 허가를 대신하지 않는다.
2. 개별 Markdown·공개 사양을 우선 수집한다. HTML만 제공되면 본문 구역을 추출한다. 사이트 전체 HTML이나 `llms-full.txt`를 매번 가져오는 방식은 사용하지 않는다.
3. 사양 날짜 버전과 구현 제품 버전을 기록한다. 공개 저장소 자료를 쓰면 가능할 때 안정 릴리스 태그·커밋에 고정한다. 움직이는 `main`이나 `latest`만으로 적용 버전을 설명하지 않는다.
4. 이전 내용과 비교해 변경된 구역만 편집 검토 대상으로 만든다. 릴리스 발표만으로 특정 제품의 실제 지원을 확정하지 않는다.
5. `공통 개념→제품별 예시→실패·권한 주의점`으로 직접 작성해 검토본을 게시한다. 수집한 예제는 자동 실행·설치하지 않는다.

이 방식은 HTML 화면 구조에 대한 의존을 줄이고 근거 버전을 추적하기 쉽다는 이유로 채택한다. Markdown도 내용 형식과 필수 구역을 확인하며, 응답 성공만으로 정상 문서라고 판단하지 않는다.

### 버전·저장·갱신 제안

- MCP 버전 관리 URL은 조사 시 [2026-07-28 경로](https://modelcontextprotocol.io/docs/2026-07-28/learn/versioning)로 이동했다. 원 URL과 최종 URL을 보관하되, 이 사실만으로 모든 예시나 제품이 그 버전을 지원한다고 판단하지 않는다.
- 문서에는 `topic`, `product`, `product_version`, `spec_version`, `status`(안정판·시험판·초안), 출처 URL·구역·해시, `fetched_at`, `reviewed_at`, `updated_at`를 둔다. 확인되지 않은 버전은 명시적으로 미확인 처리한다.
- `data/agent-engineering.json`을 신규 데이터 경로로 제안한다. 현행 수집기는 `data/docs.json`의 명령어 문서 6개만 허용하므로 신규 문서를 여기에 합치지 않는다.
- 주 1회 출처 변경을 점검하고, 관련 안정 릴리스가 감지되면 추가 검토한다. 수집은 자동화 작업, 해설과 지원 여부 확인은 담당 편집자가 맡는다.
- HTTP 검증자가 있으면 조건부 요청, 없으면 정규화 본문 해시를 사용한다. 내용 변화가 없으면 본문·공개 갱신일을 유지한다.
- 수집 오류·버전 불명확·예제와 사양의 불일치는 검토 대기 상태로 남기고 마지막 정상 공개본을 유지한다. 외부 본문의 지시문·스크립트를 실행하지 않는다.

## 단계별 구현

1. 9개 주제별 출처 구역·대상 제품·버전 확정
2. Tools·Skills 문서로 공통 구조와 근거 연결 확인
3. Hooks·Commands·MCP·Plugins·Sub Agents 작성
4. Memory·Context Management 작성 및 Learn과 범위 대조
5. 주간 변경 감지·부분 갱신·실패 시 보존 흐름 연결

## 완료 기준

- 9개 주제에 문서가 있다.
- 각 문서가 구현 전제와 운영 주의점을 설명한다.
- Tools·MCP·Plugins·Skills의 차이를 이해할 수 있다.
- Memory·Context Management의 역할이 Learn 문서와 충돌하지 않는다.
- 각 제품 예시에서 근거 문서와 적용 버전·확인일을 찾을 수 있다.
- 출처 수집 성공과 실제 기능 지원 확인을 구분한다.
