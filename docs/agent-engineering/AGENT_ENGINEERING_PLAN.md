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

- 각 기능은 해당 기능을 제공하는 제품의 공식 문서와 공개 사양을 1차 출처로 사용한다.
- MCP처럼 공개 표준이 있는 주제는 표준 문서와 공식 구현 문서를 함께 확인한다.
- 기능 이름, 입력·출력, 실행 시점은 공식 자료에서 확인하고 사용 판단과 예시는 직접 작성한다.
- 문서 데이터에는 출처 URL, 확인 날짜, 적용 제품·버전을 저장한다.
- 특정 제품에 종속된 내용은 공통 개념과 분리해 기록하고, 변경 가능성이 큰 내용은 수동 갱신 대상으로 둔다.

## 완료 기준

- 9개 주제에 문서가 있다.
- 각 문서가 구현 전제와 운영 주의점을 설명한다.
- Tools·MCP·Plugins·Skills의 차이를 이해할 수 있다.
- Memory·Context Management의 역할이 Learn 문서와 충돌하지 않는다.
