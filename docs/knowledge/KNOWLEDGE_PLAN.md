# Explore — 구성 및 운영 계획

## 현재 운영 방식

이 대화에 입력한 지식 주제·질문·자료는 핵심 요약, 쉬운 설명, 웹툰, 비슷한 제품 비교, 이해도 확인 퀴즈를 담은 문서로 정리한다. 완성 후 Explore에 등록하고 배포한 뒤 실제 운영 주소를 확인한다.

관련 후속 내용은 기존 문서에 추가한다. 작업 지시와 상태 확인 대화는 그 의도에 맞게 처리한다.

## 문서 한 편의 구성

1. 질문과 핵심 답변
2. 쉬운 설명과 용어 풀이
3. 그림으로 이해하기 — 설명 웹툰
4. 비슷한 제품과 비교 — 비교표, 선택에 도움이 되는 설명, 공식 출처
5. 자세한 설명
6. 헷갈리기 쉬운 점
7. 출처와 확인일
8. 이해도 확인 — 4지선다 3~5문항 퀴즈(`data/explore-quizzes.json`). 보기를 고르면 즉시 개별 채점되며, 오답이면 정답·해설을 노출하지 않고 바로 다른 보기를 다시 선택할 수 있다. 점수는 각 문항의 첫 선택 기준(첫 선택 기준 점수)으로 계산하고, 모든 문항에 첫 선택을 마치면 요약 채점으로 점수·제출 시각을 보여준다. 버전은 문서(slug)별로 독립 관리되며(`quizzes[slug].version`), 응시 기록은 저장하지 않는다(상태 없는 서버 채점).

앞으로 새로 추가하는 모든 Explore 문서는 8번 이해도 확인 섹션을 기본으로 포함한다. 문항은 `data/explore-quizzes.json`에 해당 문서 slug로 3~5개(텍스트·선택지 4개·정답 index·해설)를 추가하고, 개별 채점에서는 해당 문항을 맞혔을 때 해설을 보여주며, 오답 응답에는 정답·해설을 포함하지 않는다. 전체 요약 API는 기존 review 형식을 유지하지만 화면에 별도 정답 목록을 표시하지 않는다. 문항은 핵심 개념 하나·구체적 상황을 명시한 질문·범위가 비슷한 4개의 상호 배타적 보기로 작성하고, '가장 적절한' 식의 모호한 표현이나 황당한 오답, 트릭 질문은 피한다.

핵심 답변은 2~3문장으로 짧게 쓴다. 긴 설명은 한 문단에 한 주제, 보통 1~2문장씩 나누고 문단 사이에 여백을 둔다. 웹 화면과 Markdown 원고에 동일한 문단 구성을 반영한다.

직접 조작하는 예제는 현행 문서 구성에서 제외한다. 기존 설명 웹툰과 Decisions API의 Jev 비교 웹툰은 유지한다.

## 목록과 화면

왼쪽 Explore → All Documents에서 모든 문서를 찾는다. 목록의 검색과 주제 선택, 각 문서의 고유 주소를 유지한다. 큰 화면과 모바일의 목차는 같은 순서로 연결한다.

목록 화면은 문서 검색, 주제 필터, 전체 문서 목록으로 구성한다. 문서의 그림은 각 문서 상세에서 본다.

비교표는 셀 안에서 문장을 줄바꿈한다. 좁은 화면에서는 표 영역만 가로로 움직여 읽을 수 있게 하고 키보드로도 접근할 수 있게 한다.

## 작성과 관리

최신 사양·가격·이용 조건은 공식 자료를 확인하고 확인일과 출처를 표시한다. 발표 내용, 이해를 위한 가상 사례, 직접 실행해서 확인한 결과를 구분한다.

비슷한 목적의 제품이나 모델을 비교한다. 직접 성능을 비교하지 않았다면 승자를 단정하지 않고 기능·연결 방식·접근 조건·비용 조건을 설명한다.

공통 화면은 `app/explore/[slug]/page.tsx`, 문서 자료는 `data/explore.json`, 읽기용 원고는 `docs/knowledge`에서 관리한다. 수정·제목 변경·공개 중단 요청은 이 대화에서 반영한다.

## 현재 문서와 완료 기준

Decisions API(Jev 비교), OpenAI Dots(Claude Cowork 비교), Gemini 4 Argon(GPT-6 Astra·Claude Opus 5.5 비교), Exa(Tavily·Firecrawl 비교), Laya(TypeSafe Jev 비교), 하네스 엔지니어링(프롬프트·컨텍스트 엔지니어링과 비교), Herdr(tmux·Zellij 비교), 온톨로지(분류체계·데이터베이스 스키마·지식그래프 비교), Hermes Agent(Herdr·Claude Code 비교), FDE(제품 개발 엔지니어·솔루션 엔지니어 비교), ElevenLabs(Cartesia·Google Cloud TTS 비교), Osmo Film Emulation(Dehancer·FilmConvert Nitrate 비교)의 열두 문서를 관리한다.

v0.10.2까지 세 문서가 운영에 공개됐다. v0.10.3은 위 문단·제품 비교 구성을 반영한 개정판이다. 빌드·푸시·운영 문서 반영을 확인한 후 완료로 기록한다.

## 과거 이력

아래는 지금까지의 구현 과정을 시간순으로 남긴 기록이다. 각 항목은 그 시점의 상태이며, 현재 작성 기준은 위 "문서 한 편의 구성"을 따른다.

## Explore 메뉴 구현 이력 (v0.9.4)

- Claude가 `app/nav.ts`의 상단·왼쪽 공통 메뉴 자료에 Explore를 추가하고 `app/explore/page.tsx`에 문서 0개의 빈 목록 화면을 구현했다. 기존 자료를 사용하는 모바일 메뉴에도 연결된다.
- `package.json`과 잠금 파일의 제품 버전은 0.9.4다. 팀장이 `npm run build`를 실행했고 `/explore` 정적 페이지 생성까지 성공했다.
- 테스트와 실제 브라우저 클릭·화면 배치 확인은 수행하지 않았다.
- 작업 전 운영 `/explore`는 HTTP 404였다. 공개 GitHub API에서도 해당 저장소를 인증 없이 조회할 수 없었다(HTTP 404; 저장소가 없다는 의미로 단정하지 않음).
- 2026-10-01 프로젝트 전용 SSH 키와 GitHub 공식 호스트 지문을 사용해 원격 자동 갱신 커밋을 합쳤다. 병합 후 `npm run build`에서 `/explore`가 정적 페이지로 생성됐고, `master`를 푸시했다. 운영 `/explore`는 HTTP 200·Explore 제목·문서 0개 안내, 운영 홈은 Explore 메뉴, 두 페이지는 버전 0.9.4를 표시하는 응답으로 확인했다. 실제 브라우저 클릭·모바일 화면 배치는 확인하지 않았다.

## 첫 문서(Decisions API) 구현 현황

- 사용자의 ‘Decisions API를 문서로 정리해 줘’ 요청에 따라 첫 문서를 작성했다. OpenAI DevDay 2026 Recap의 Decisions API 절(2026-09-29 발표, 확인일 2026-10-01 KST)을 공식 근거로 사용했다.
- `data/explore.json`에 slug `decisions-api` 문서 1건(제목·요약·주제·태그·질문·핵심 답변·쉬운 설명·API 설명·자세한 설명·비교·헷갈리기 쉬운 점·출처·확인일)을 추가했다.
- `app/explore/page.tsx`에서 `ExploreListClient`(검색·주제 select·최근 등록일순 정렬·검색 결과 없음과 전체 없음 구분·필터 초기화·결과 개수 aria-live)를 연결했다.
- `app/explore/[slug]/page.tsx`를 공통 상세 라우트로 추가했다(static params, generateMetadata, notFound, SiteHeader/DocsSidebar/docs-shell/doc-main/page-outline 재사용, 모바일 접는 목차 `details` 포함).
- `app/explore/DecisionsExample.tsx`에 조작 예제(배송 확인/환불 요청/정보 부족 선택 + 배송 정보 보유 여부 + '모든 문의 담당자 확인' 정책 스위치 → 자동 안내/담당자 전달/추가 정보 요청과 이유, 흐름도, "미리 준비한 설명용 예제 · 실제 API 호출 없음" 표시, aria-live, 처음으로 버튼)를 구현했다. 판정 로직은 `app/explore/decisionLogic.mjs`(+`.d.mts`)의 순수 함수로 분리해 컴포넌트와 자체 점검 스크립트가 함께 사용한다.
- `app/DocsSidebar.tsx`의 그룹 펼침 조건에 `현재 경로가 그룹 href + '/'로 시작하는 경우`를 최소 추가해 Explore 상세 페이지에서도 Explore 그룹이 펼쳐지도록 했다(개별 문서 메뉴 항목은 추가하지 않음, 전체 문서 링크만 유지).
- `app/globals.css`에 Explore 전용 스타일(모바일 접는 목차, 조작 예제 흐름도·컨트롤·결과 표시)만 추가했다.
- `package.json`/`package-lock.json`의 버전을 0.10.0으로 올렸다.
- 자체 점검: `node scripts/check-explore.mjs` 실행 결과 `check-explore: OK`. 필수 문서 필드·slug 중복·출처와 예제의 분기 결과를 확인했다.
- `npm run build` 통과: TypeScript 검사와 51개 페이지 생성이 성공했고 `/explore`, `/explore/decisions-api`가 생성됐다. 실제 브라우저 조작·모바일 화면 배치는 확인하지 않았다.
- 작업실 규칙상 GitHub 작업은 프로젝트 전용 `github_project` 도구로 해야 하지만 이번 세션의 도구 목록에는 해당 기능이 없었다. 직접 Git 푸시나 공유 연결로 대체하지 않았다. 새 문서의 GitHub 반영·배포는 미완료이며, 운영 상세 주소의 조회 결과는 HTTP 404였다.
- 공개 전에도 읽을 수 있도록 [Decisions API 설명 문서](DECISIONS_API.md)를 함께 작성했다.

## 웹툰과 Jev 비교 추가 (v0.10.1)

- 사용자의 후속 요청으로 같은 `/explore/decisions-api` 문서에 설명 웹툰과 Jev 비교를 추가했다. Jev는 TypeSafe의 System One 판단 모델로 해석했다.
- 가상의 쇼핑몰 문의를 다룬 8컷 설명 웹툰과 8컷 비교 웹툰을 생성했다. 두 PNG는 각각 `public/explore/decisions-api-webtoon.png`, `public/explore/decisions-api-vs-jev-webtoon.png`에 저장했으며 크기는 모두 724×2172다.
- 비교는 OpenAI 공식 발표, TypeSafe의 Jev 소개·API 문서·Quickstart를 근거로 한다(확인일 2026-10-01 KST). API 제품과 모델의 구분, 입력, 공개 자료에서 확인한 답변 형식, Jev의 Choice·Noul·Score를 설명한다. 확인하지 못한 OpenAI 기능을 없다고 단정하지 않으며, 직접 성능을 비교한 결과는 제시하지 않는다.
- 웹툰은 이해를 위한 가상 사례이며 실제 API 호출 결과가 아니다. API의 판단과 앱의 권한 확인·실행을 구분한다.
- 비교 웹툰의 생성 지시는 `docs/knowledge/decisions-api-vs-jev-webtoon-prompt.txt`에 저장했다.
- 두 웹툰의 설명·가상 사례 표시·크게 보기 링크, 비교표·질문 형식 설명·출처, 큰 화면과 모바일 목차를 연결했다. Jev·TypeSafe 태그로 목록에서 검색할 수 있다.
- `node scripts/check-explore.mjs` 결과는 `check-explore: OK`다. 최종 `npm run build`는 TypeScript 검사와 51개 페이지 생성을 완료했다. 생성된 상세 HTML에 두 PNG의 경로·724×2172 크기·지연 로딩, 비교 본문과 두 목차 링크가 포함됨을 확인했다. 실제 브라우저 조작과 화면 배치는 확인하지 않았다.
- GitHub 반영·운영 배포는 아직 수행하지 않았다. 이번 세션에 필수 프로젝트 GitHub 동기화 도구가 없으며 직접 Git 푸시는 작업실 규칙상 허용되지 않는다. 2026-10-01 17:32 KST 운영 상세 주소 조회 결과는 HTTP 404였다.

## 두 번째·세 번째 문서 추가 (v0.10.2)

- OpenAI dots, Gemini 4 Argon 두 문서를 추가했다. 각 문서에 설명 웹툰과 조작 예제, Jev 비교 스타일을 따르지 않는 자체 설명을 포함했다.
- 이 시점까지는 문서 구성이 핵심 답변·쉬운 설명·그림·조작 예제·자세한 설명·(Decisions API만 비교)·헷갈리는 점·출처 순서였다.

## 문서 구조 정리와 제품 비교 전면 도입 (v0.10.3)

- 조작 예제 섹션(`DecisionsExample` 연결, `example_intro`/`example_steps` 필드)을 세 문서 모두에서 제거하고, 그 자리에 "비슷한 제품과 비교" 섹션을 4번으로 배치했다. 이전에 Decisions API에만 있던 Jev 비교를 같은 위치로 옮기고, 남은 두 문서에도 비교를 새로 작성했다: dots ↔ Claude(Cowork 기능), Gemini 4 Argon ↔ GPT-6 Astra ↔ Claude Opus 5.5.
- `data/explore.json`의 `comparison` 스키마를 `table.columns`(string 배열)·`rows[].values`(string 배열)로 일반화해 2~3개 제품을 공통 구조로 표현하도록 바꿨다. `jev_outcomes`는 선택 필드 `notes`로, 비교 웹툰은 선택 필드 `comparison_image`로 바꿨다. `comparison_note` 필드는 본문과 중복돼 제거했다.
- 긴 설명 필드(`core_answer`/`easy_explanation`/`api_explanation`/`details`/`comparison.intro`/`comparison.interpretation`)에 저자가 직접 `\n\n`으로 문단을 나눴다. 상세 페이지에는 이 값을 `\n\n` 기준으로만 나눠 `<p>`로 렌더링하는 `Paragraphs` 헬퍼를 추가했다(자동 문장 분리 없음).
- `app/globals.css`에 Explore 전용 문단 여백·줄간격 스타일과, 비교표의 모바일 가로 스크롤(`tabIndex`로 키보드 접근)을 Explore 범위에서만 추가했다.
- `scripts/check-explore.mjs`를 새 비교 스키마(열/행 개수 일치, notes·comparison_image는 있을 때만 검증)에 맞춰 갱신했다.
- `package.json`/`package-lock.json` 버전을 0.10.3으로 올렸다. 조작 예제 컴포넌트(`DecisionsExample.tsx`, `decisionLogic.mjs`)는 범위 최소화를 위해 삭제하지 않고 남겨뒀으며, 더 이상 상세 페이지에서 import하지 않는다.
- 빌드·테스트·배포는 팀장이 수행한다.

## 이해도 확인 퀴즈 추가 (v0.11.0, 저장소 연결은 v0.11.1에서 제거됨)

- 세 문서 모두에 8번 "이해도 확인" 섹션을 추가했다. 각 문서 하단에 4지선다 5문항 퀴즈(`QuizClient`)가 표시되고, 데스크톱·모바일 목차에 모두 연결했다.
- 문항·정답·해설은 `data/explore-quizzes.json`(slug별 5문항, `quizzes[slug].version`으로 문서별 버전 관리)에 저장했다. 서버 페이지는 `toPublicQuestions`로 정답·해설을 제거한 문항만 클라이언트에 전달한다(`app/explore/quizLogic.mjs`).
- 채점·검증 순수 함수(`gradeQuiz`/`isValidAnswerShape`/`buildReview`/`answerFingerprint`)를 `app/explore/quizLogic.mjs`(+`.d.mts`)에 분리했다. 기존 `decisionLogic.mjs` 패턴을 따른다.
- `app/api/explore/[slug]/quiz/route.ts`를 추가했다. GET은 slug·version·cursor를 검증해 해당 버전의 응시 통계(총 응시·평균·최고)와 최신순 페이지(20개)를 반환하고, POST는 익명 제출(uuid·version·answers)을 서버에서 다시 채점해 저장한다. 점수·시각은 항상 서버가 계산하며 클라이언트가 보낸 값은 쓰지 않는다.
- 저장소는 Upstash Redis REST API(`app/api/explore/[slug]/quiz/upstash.mjs`, 네이티브 fetch만 사용, 새 의존성 없음)를 통해 연결한다. 같은 제출 uuid의 중복 제출·통계 이중 집계를 막기 위해 Lua `EVAL` 트랜잭션으로 응시 기록 저장·정렬 이력 추가·통계 갱신을 원자적으로 처리하고, 내부 답안 지문(fingerprint)으로 같은 uuid의 재사용·충돌을 구분한다(공개 이력에는 지문을 노출하지 않음).
- Redis 환경변수(`UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`, 또는 Vercel 연동의 `KV_REST_API_URL`/`KV_REST_API_TOKEN`)가 없으면 채점과 시각 표시는 그대로 동작하되 `saved:false`와 "공유 기록 저장이 아직 준비되지 않았습니다." 안내와 재시도 버튼을 보여준다. 대시보드는 불러오기 실패 안내와 새로고침 버튼을 보여주며 가짜 통계를 표시하지 않는다. 이 세션에서는 실제 Redis 계정·환경변수를 만들거나 조회하지 않았다. 연결 가이드는 `docs/knowledge/QUIZ_SETUP.md`에 별도로 작성했다.
- 원본 제출 IP는 응시 기록에 저장하지 않는다. 런타임 토큰으로 IP를 HMAC-SHA256 해시한 키에 60초 TTL 카운터(`INCR`+`EXPIRE`)를 둬 분당 10회로 제한하는 임시 요청 제한만 적용했다(복잡한 인증·캡차는 추가하지 않았다. 이 완화 수준을 넘는 악용 방지가 필요하면 별도 검토가 필요하다는 점을 팀장에게 전달한다).
- `scripts/check-explore-quiz.mjs`로 문항 스키마(3~5문항, 선택지 4개, 정답 index 0~3, 해설 필수)와 `toPublicQuestions`/`isValidAnswerShape`/`gradeQuiz`/`buildReview`/`answerFingerprint` 순수 함수를 점검한다. 문항·채점 점검과 빌드는 통과했다. HTTP 점검은 저장소 연결을 끈 로컬 서버에서만 실행하도록 제한해 운영 이력에 확인용 기록이 섞이지 않게 했다.
- `app/globals.css`에 퀴즈 전용 스타일(문항 카드, 진행률, 결과·해설 카드, 공유 기록 대시보드)만 추가했다.
- `package.json`/`package-lock.json` 버전을 0.11.0으로 올렸다. `.gitignore`에 `.env*`를 추가했다(환경변수 파일 내용은 확인하지 않았다).
- 당시 실제 Redis 저장·통계·기록 조회는 확인하지 않았다. 이후 사용자가 기록 저장을 취소하여 v0.11.1에서 연결 작업도 취소했다.

## 여섯 번째 문서(하네스 엔지니어링) 추가

- 기존 다섯 문서는 그대로 두고 여섯 번째 문서를 추가했다. 이 문서는 특정 제품이 아니라 작업 방법을 다루므로 4번 섹션 제목을 "비슷한 제품과 비교"가 아닌 "관련 개념과 비교"로 바꿨다.
- `data/explore.json`의 `Comparison` 스키마에 선택 필드 `title`을 추가했다. `app/explore/[slug]/page.tsx`는 `comparisonTitle = doc.comparison.title ?? "비슷한 제품과 비교"`를 두 목차(모바일·큰 화면)와 본문 h2, 비교표 `aria-label`에 공통으로 쓴다. `title`이 있으면 section-note도 "세 접근의 역할과 연결을 비교합니다."로 바뀌고, 없으면 기존 문구를 그대로 쓴다. 기존 다섯 문서는 `title`을 쓰지 않아 화면이 그대로 유지된다.
- `data/explore.json`에 slug `harness-engineering` 문서 1건(8번 구성: 핵심 답변·요리사 비유·AI 에이전트 설명·그림·관련 개념 비교·6항목 자세한 설명·헷갈리는 점·출처·퀴즈)을 추가했다. 근거는 OpenAI "Harness engineering"(2026-02-11), Anthropic "Effective harnesses for long-running agents"(2025-11-26), "Effective context engineering for AI agents"(2025-09-29), "Harness design for long-running apps"(2026-03-24)이며 확인일은 2026-10-04 KST다.
- 비교표는 프롬프트 엔지니어링·컨텍스트 엔지니어링·하네스 엔지니어링 세 관점을 "주로 묻는 질문/설계 대상/예약 페이지 예시/실패했을 때 살펴볼 것" 행으로 비교하며, 경쟁 제품이 아닌 겹치는 관점임을 본문에 명시했다.
- `data/explore-quizzes.json`에 `harness-engineering` 퀴즈(`version: 1`, 5문항)를 지정된 문항·보기·정답·해설 그대로 추가했다. 개념은 하네스/모델 학습 가중치 구분, 컨텍스트 엔지니어링의 정보 선택 역할, 완료 기준의 직접 근거, 세션 간 진행 기록의 필요성, 이 예제의 배포 전 사람 승인 정책을 다룬다.
- `docs/knowledge/HARNESS_ENGINEERING.md`를 기존 문서와 같은 8개 섹션 구성으로 작성했다. 비용·시간·반복 횟수 한도는 출처 사례에 없는 숫자를 지어내지 않고 "문서 작성자가 실무에서 설계할 수 있는 예시"로 표시했다.
- 웹툰 이미지(`public/explore/harness-engineering-webtoon.png`, 1024×1536)는 가상의 예약 페이지 제작 사례이며 실제 실행 결과나 제품 화면이 아니라고 본문에 명시했다. 이미지 생성·버전 올림·빌드·테스트·배포는 팀장이 수행한다.
- 기존 다섯 문서·퀴즈 값, `app/explore/[slug]/page.tsx`의 다른 화면·기능은 그대로 보존했다.

## 퀴즈 응시 기록 저장 제거 (v0.11.1)

- 사용자 요청("응시 기록은 저장소에 남기지 말고 결과만 보여주자")에 따라 v0.11.0의 Upstash Redis 연동을 전부 제거했다. 퀴즈는 이제 상태 없는(stateless) 서버 채점만 수행하며 응시 기록·통계·공유 대시보드를 저장하지 않는다.
- `app/api/explore/[slug]/quiz/route.ts`에서 GET(이력 조회)을 제거해 기본 405가 되며, POST는 `{ version, answers }`만 받아 채점 결과(`correct`/`total`/`score`/`timestamp`/`timestampKst`/`review`)만 반환한다. UUID·제출 번호·IP 기반 HMAC 횟수 제한·Redis EVAL 트랜잭션을 모두 제거했다.
- `app/api/explore/[slug]/quiz/upstash.mjs`, `upstash.d.mts` 파일을 삭제했다.
- `app/explore/quizLogic.mjs`/`.d.mts`에서 더 이상 쓰지 않는 `answerFingerprint`를 제거했다. 나머지 `toPublicQuestions`/`isValidAnswerShape`/`gradeQuiz`/`buildReview`는 그대로 재사용한다.
- `app/explore/QuizClient.tsx`를 결과 전용 state(`answers`/`result`/`submitting`/`errorMessage`/`staleVersion`)로 단순화했다. 대시보드·페이지네이션·제출 번호·저장 재시도 UI를 모두 제거하고 "응시 기록은 저장하지 않습니다. 결과는 현재 화면에서만 확인할 수 있습니다." 안내 문구를 추가했다.
- `app/globals.css`에서 대시보드·이력·저장 안내·제출 번호 전용 클래스를 제거하고 안내 문구용 `.quiz-note`만 남겼다.
- `scripts/check-explore-quiz.mjs`를 GET 405 기대, 응답에 uuid/saved/publicId/fingerprint가 없음을 확인하도록 갱신했다. 기존 잘못된 본문/버전/오리진/용량 초과 점검은 그대로 유지한다.
- `docs/knowledge/QUIZ_SETUP.md`를 Upstash 연결 가이드에서 저장소 없는 현재 동작 설명으로 다시 썼다.
- `package.json`/`package-lock.json` 버전을 0.11.1로 올렸다. `.gitignore`의 `.env*`는 그대로 둔다(다른 환경변수 보호에 계속 유용).
- 빌드·테스트·배포는 팀장이 수행한다.

- v0.11.1의 문항·채점 자체 점검, 로컬 HTTP 채점/입력 오류/GET 405 확인과 최종 빌드가 통과했다. 저장 관련 외부 호출·브라우저 저장·응시 ID가 없음을 별도 소스 검토로 확인했다. 실제 브라우저 클릭·화면 배치는 별도로 확인하지 않았다.

## 퀴즈 문항 명확화와 즉시 재선택 지원 (v0.11.2)

- 사용자 요청("문제와 보기가 모호한 부분이 많다. 핵심 내용에 대해 더 명확한 문제와 보기가 나오게 수정하고, 오답을 선택하면 바로 다시 선택할 수 있게 하자")에 따라 세 문서의 퀴즈 15문항을 모두 새로 작성했다(`data/explore-quizzes.json`, 세 slug 모두 `version` 1→2). 각 문항은 핵심 개념 하나·구체적 상황을 명시한 질문·범위가 비슷한 4개의 상호 배타적 보기로 구성했고, '가장 적절한/강조하는' 식의 모호한 표현과 전화 vs API 같은 황당한 오답, 공개일 같은 변동성 큰 트리비아를 피했다. 모든 정답·해설은 기존 `data/explore.json` 본문 범위 안에서만 작성했고 새로운 사실은 추가하지 않았다.
- 채점 방식을 보기 선택 즉시 개별 문항을 채점하는 방식으로 바꿨다. `app/explore/quizLogic.mjs`에 `isValidQuestionIndex`/`isValidSingleAnswer`/`gradeSingle`을 추가했고(`.d.mts` 동기화), `gradeSingle`은 오답일 때 `explanation` 필드 자체를 생략해 정답·해설을 노출하지 않는다.
- `app/api/explore/[slug]/quiz/route.ts`가 기존 전체 채점(`{ version, answers }`)에 더해 개별 채점(`{ version, questionIndex, answer }`)을 함께 처리한다. 두 모드의 필드를 섞은 요청은 400으로 거부하고, 버전 불일치는 두 모드 모두 409를 반환한다. 기존 오리진·본문 크기·MIME·버전 검증은 그대로 유지했다.
- `app/explore/QuizClient.tsx`를 전면 다시 작성했다. 보기를 고르면 바로 개별 채점 POST를 보내고, 오답이면 "오답입니다. 다른 보기를 다시 선택해 보세요."를 보여주며 선택지를 잠그지 않아 즉시 다른 보기를 다시 고를 수 있다. 정답이면 해설을 보여준다. 각 문항의 첫 번째로 성공한 채점 결과만 `firstAnswers`로 별도 보관해 "첫 선택 기준 점수"를 계산하며, 이후 연습 재시도는 점수에 영향을 주지 않는다(네트워크 실패는 첫 선택으로 기록하지 않음). 답변 완료 수와 현재 정답 수를 상단에 표시하고, 모든 문항의 첫 선택이 끝나면 기존 전체 채점 API로 `firstAnswers`를 보내 점수·KST 제출 시각을 보여준다. 결과가 보인 뒤에도 문항은 계속 보이고 다시 풀 수 있다. 문항별 요청 중(in-flight) 잠금으로 같은 문항의 중복 클릭/경합을 막고, 타임아웃 15초·네트워크 오류 재시도·409 새로고침 안내를 유지했다. 라디오 입력에는 선택할 때마다 포커스를 옮기지 않아 키보드 탐색을 방해하지 않는다. 점수·정답 여부·공개된 정답 인덱스는 항상 서버 계산을 그대로 사용하며 클라이언트는 신뢰하지 않는다.
- 기존 전체 요약 제출 API와 응답 형식(`correct`/`total`/`score`/`timestamp`/`timestampKst`/`review`, 응시 기록 미저장)은 그대로 유지했다. 문항별 해설은 개별 채점 응답으로 충분하므로 전체 문항을 다시 나열하는 두 번째 복습 목록은 추가하지 않았다.
- `app/globals.css`에서 더 이상 쓰지 않는 요약 복습 목록 클래스(`quiz-review*`)를 제거하고, 문항별 채점 상태 표시용 클래스(`quiz-question-feedback`, `quiz-feedback-grading/wrong/correct`)만 추가했다.
- `app/explore/[slug]/page.tsx`의 8번 섹션 소개 문구를 새 상호작용(즉시 채점·재선택·첫 선택 기준 점수)에 맞게 갱신했다.
- `docs/knowledge/DECISIONS_API.md`/`OPENAI_DOTS.md`/`GEMINI_4_ARGON.md`의 8번 섹션을 새 문항·보기·해설·상호작용 설명으로 다시 썼고, `docs/knowledge/QUIZ_SETUP.md`를 개별/전체 채점 두 모드와 첫 선택 기준 점수 계산 방식에 맞게 갱신했다.
- `scripts/check-explore-quiz.mjs`에 개별 채점 순수 함수 점검(오답 비노출, 오답→정답 재시도, 인덱스/답 범위·타입 검증)과, 로컬 HTTP 점검에 개별 채점 엔드포인트(오답 비노출, 재시도, 잘못된 인덱스/타입/범위, 모드 혼용 거부, 버전 불일치 409)를 추가했다. 기존 전체 채점 점검은 그대로 유지했다.
- `package.json`/`package-lock.json` 버전을 0.11.2로 올렸다.
- 빌드·테스트·배포는 팀장이 수행한다. 실제 브라우저 클릭·모바일 화면 배치·접근성(스크린 리더) 동작은 이번 세션에서 직접 확인하지 않았다.

### 보정: 보기 중복 제거 및 진행 표시 문구 수정

- 세 퀴즈에서 서로 같은 뜻인 보기가 겹치던 문항들을 상호 배타적인 4개 보기로 다시 썼다(정답 위치는 유지하거나 재배치, 전체 정답 위치는 여전히 0~3 중 3곳 이상 분산).
- `app/explore/QuizClient.tsx`의 진행 표시를 "답변 완료 N/총 문항 · 현재 맞힌 문항 N/총 문항"으로 바꾸고, 점수 계산 기준("첫 선택 기준 점수") 설명은 별도 안내 문구로 분리했다. 채점 중인 문항의 라디오를 비활성화해 조용히 무시되는 클릭을 막고(`aria-busy`), 오답이면 즉시 다시 활성화한다. "새로 응시하기"는 문항 채점이나 요약 제출이 진행 중이면 비활성화한다.
- `docs/knowledge/DECISIONS_API.md`/`OPENAI_DOTS.md`/`GEMINI_4_ARGON.md`의 8번 섹션을 새 문항·보기·해설로 다시 갱신했고, `docs/knowledge/QUIZ_SETUP.md`의 진행 표시·버튼 비활성화 설명도 함께 갱신했다.

- 최종 문항·원고 일치와 기존 1~7번 본문 보존을 확인했다. 최종 빌드(53개 정적 페이지)와 로컬 HTTP 채점 확인이 통과했다. 오답→정답 재선택, 입력 범위·버전·오리진 검증, GET 405를 확인했으며 실제 브라우저 클릭·모바일 배치는 직접 확인하지 않았다.

## 네 번째 문서(Exa) 추가

- 사용자의 'EXA 에 대해서 알려줘' 요청에 따라 네 번째 문서를 작성했다. Exa 공식 문서(Search·Contents·MCP·Websets·Agent·Pricing, 확인일 2026-10-02 KST)를 근거로 썼고, Tavily·Firecrawl 공식 문서를 비교 출처로 함께 썼다.
- `data/explore.json`에 slug `exa` 문서 1건(8번 구성: 핵심 답변·쉬운 설명·그림·Tavily·Firecrawl 비교·자세한 설명·헷갈리는 점·출처·퀴즈)을 추가했다. 기존 세 문서 값은 그대로 두었다.
- `data/explore-quizzes.json`에 `exa` 퀴즈(`version: 1`, 5문항)를 추가했다. 개념은 검색의 외부 자료 조회 역할, Contents의 URL 본문 가져오기, 출처·날짜 재확인의 필요성, MCP의 연결 표준 역할, Websets의 조건 기반 검증·보강을 다룬다.
- 설명 웹툰 이미지(`public/explore/exa-webtoon.png`, 1024×1536)를 내장 imagegen으로 생성해 저장했다. 가상 사례이며 실제 제품 화면이나 검색 결과가 아니다.
- `docs/knowledge/EXA.md`를 기존 문서와 같은 8개 섹션 구성으로 작성했다.
- 빌드·테스트·배포는 팀장이 수행한다.

- v0.11.4: 본문 문단과 요금 설명을 짧게 나누고 MCP 표준과 Exa MCP 연결 도구를 구분했다. 비교표는 검색·본문 수집의 공통 기능을 명시하고 Firecrawl의 접근 가능한 하위 페이지 수집 설명과 공식 출처를 보완했다.
- 기존 세 문서·퀴즈 값 보존, 새 원고와 5문항 일치, Explore 무결성·채점 점검, 최종 빌드(54개 정적 페이지)가 통과했다. 로컬 Exa 문서·목록과 개별 오답→정답 재선택을 HTTP로 확인했다. 실제 브라우저 클릭·모바일 화면 배치는 직접 확인하지 않았다.

## 다섯 번째 문서(Laya) 추가

- 사용자 요청에 따라 Laya 설명 문서를 작성했다. Laya 공식 소개·GitHub README·Benchmarks(확인일 2026-10-03 KST), TypeSafe 공식 문서를 근거로 썼다.
- `data/explore.json`에 slug `laya` 문서 1건(8번 구성: 핵심 답변·쉬운 설명·Router/체크포인트 설명·그림·Jev 비교·자세한 설명·헷갈리는 점·출처·퀴즈)을 추가했다. 기존 네 문서 값은 그대로 두었다.
- `data/explore-quizzes.json`에 `laya` 퀴즈(`version: 1`, 5문항)를 추가했다. 개념은 choice가 실제 처리 완료가 아닌 분류 결과라는 점, choice/score/noul의 형식 구분, 로컬 실행 준비와 첫 다운로드·운영 비용, 벤치마크의 조건 의존성과 검증 필요성을 다룬다.
- 내장 imagegen으로 8컷 웹툰(`public/explore/laya-webtoon.png`, 1024×1536)을 생성해 저장했다. 가상 쇼핑몰 문의로 선택·점수·확률과 판단/실행의 차이를 설명한다.
- `docs/knowledge/LAYA.md`를 기존 문서와 같은 8개 섹션 구성으로 작성했다.
- laya-ai.com·Laya Studio 같은 비공식 커뮤니티·독립 호스팅 서비스는 공식 출처로 쓰지 않았고, 본문에 공식 모델과 구분된다는 점을 명시했다. Jev와의 속도·정확도 우열은 단정하지 않았다.
- `package.json`/`package-lock.json` 버전을 0.11.6으로 올렸다.
- 기존 4문서·퀴즈 값 보존, 새 원고와 5문항 일치, 웹툰 치수를 확인했다. 최종 빌드가 통과했고 55개 정적 페이지에 Laya 상세 페이지가 포함됐다. 실제 Laya 모델을 설치하거나 실행한 작업은 아니며 설명 문서 추가다. 실제 브라우저 클릭·모바일 화면 배치는 확인하지 않았다.

## 하네스 엔지니어링·Herdr 문서 추가 (2026-10-04)

- 사용자의 하네스 엔지니어링 설명 요청과 이어진 Herdr 설명 요청을 각각 독립 문서로 작성했다. 기존 다섯 문서와 퀴즈는 유지했다.
- 하네스 문서는 OpenAI·Anthropic의 공식 사례를 바탕으로 프롬프트·컨텍스트·하네스의 역할, 작업 환경·권한·진행 기록·결과 확인을 설명한다. 세 접근은 겹치는 설계 관점이며, 특정 사례의 성과나 다중 에이전트 구성을 보편적인 필수 조건으로 제시하지 않는다.
- Herdr 문서는 공식 Concepts·Agents·Session state·How to work·Connecting machines·Integrations·Agent automation·Install 및 저장소를 확인했다. 로컬/원격 사용, 접속 해제와 서버 종료의 차이, 조건부 대화 재개, 상태 표시와 결과 검증의 차이를 설명한다. tmux·Zellij 공식 문서로 제품 비교를 정리했다.
- 두 문서 각각 8컷 웹툰(1024×1536)을 내장 imagegen으로 생성해 `public/explore/harness-engineering-webtoon.png`, `public/explore/herdr-webtoon.png`에 저장했다. 모두 가상 사례이며 실제 제품 화면이나 실행 결과가 아니다. 제작 지시는 같은 이름의 `docs/knowledge/*-webtoon-prompt.txt`에 있다.
- 각 문서에 4지선다 5문항을 추가했다. 오답 즉시 재선택·첫 선택 기준 점수·응시 기록 미저장 방식을 유지한다. 원고는 `HARNESS_ENGINEERING.md`, `HERDR.md`이며 웹 본문과 문제·보기·해설을 맞췄다.
- 비교 제목을 문서별로 지정할 수 있게 최소 수정했다. 하네스는 '관련 개념과 비교', 기존 제품 문서와 Herdr는 '비슷한 제품과 비교'이며 본문·모바일 목차·큰 화면 목차를 함께 맞췄다.
- 기존 뉴스 관리 작업의 완료 커밋과 자동 갱신을 유지한 상태로 통합했다. 버전은 0.13.1이다. 이 작업은 설명 문서 추가이며 Herdr 설치나 새 에이전트 실행 환경 구축은 수행하지 않았다.
- 최종 빌드가 통과해 58개 정적 페이지를 생성했다. 새 두 페이지의 비교 제목·웹툰 참조·각 5문항과 20개 선택지를 생성 HTML에서 확인했다. 실제 브라우저 클릭·모바일 화면 배치는 확인하지 않았다.

## 여덟 번째 문서(온톨로지) 추가 (2026-10-04)

- 비개발자용 온톨로지 설명 문서를 추가했다. W3C OWL2 Primer·RDF1.1 Primer, Stanford Ontology101(Noy & McGuinness)을 주요 근거로, SHACL·SKOS·Palantir Foundry Ontology·Stanford 철학 백과를 추가 참고로 썼다(확인일 2026-10-04 KST).
- `data/explore.json`에 slug `ontology` 문서 1건(8번 구성: 핵심 답변·쉬운 설명·용어 풀이·그림·관련 개념 비교·자세한 설명·헷갈리는 점·출처·퀴즈)을 추가했다. `comparison`에 온톨로지·분류체계·데이터베이스 스키마·지식그래프 4열 비교표를 뒀다.
- 공통 상세 화면의 그림 안내 문구를 문서별로 바꿀 수 있도록 `ExploreDoc`에 선택 필드 `diagram_description`을 추가하고 `app/explore/[slug]/page.tsx`의 section-note를 `doc.diagram_description ?? 기존 문구`로 처리했다. 온톨로지 문서에만 전용 문구를 지정했고 기존 7개 문서의 안내는 그대로 유지된다.
- `data/explore-quizzes.json`에 `ontology` 퀴즈(`version: 1`, 5문항)를 추가했다. 개념은 온톨로지 설계 vs 실제 운영 업무 구분, 클래스/개체 용어 구분, 공리로부터의 안전한 추론 범위, OWL 열린 세계 가정, 온톨로지·지식그래프의 역할 차이를 다룬다.
- `docs/knowledge/ONTOLOGY.md`를 기존 문서와 같은 8개 섹션 구성으로 작성하고 JSON 본문과 문단·표·퀴즈를 동일하게 맞췄다. 웹툰 이미지(`public/explore/ontology-webtoon.png`, 1024×1536)는 가상 도서관 사례이며 실제 제품 화면이 아니라고 본문에 명시했다. 내장 imagegen으로 생성한 8컷 웹툰을 연결했다.
- 이후 가독성 보완: `core_answer`·`api_explanation`·`details`의 문장·문단을 다시 다듬고 RDF(일반 데이터 모델)와 OWL(온톨로지 언어)의 구분을 명확히 했으며, 퀴즈 4·5번은 정답 의미를 바꾸지 않고 보기 순서만 재배치했다(`ONTOLOGY.md` 동기화).

## 아홉·열 번째 문서(Hermes Agent, FDE) 추가 (2026-10-04)

- 사용자 요청에 따라 Hermes Agent, FDE 두 문서를 추가했다. 기존 일곱 문서·퀴즈를 보존했고, 같은 작업에서 온톨로지의 표현과 보기 순서를 보완했다.
- Hermes Agent는 NousResearch 공식 문서(Memory·Skills·Cron·Quickstart·Security·FAQ)와 GitHub, Herdr·Claude Code 문서를 비교 출처로 썼다. memory·skills·cron의 역할, 메신저 연결과 실제 실행 환경의 구분, 외부 모델 연결 시 데이터 전달 가능성을 설명한다.
- FDE는 Palantir·OpenAI 공식 채용 공고를 근거로, 사람의 역할이라는 점과 가상 배송 지연 사례, 제품 개발 엔지니어·솔루션 엔지니어(사전영업)와의 역할 비교를 설명한다. 급여·채용 여부·학력·출장 비율 같은 공고별 변동 조건은 일반화하지 않았다.
- `data/explore.json`에 slug `hermes-agent`, `fde` 문서를 추가하고, `data/explore-quizzes.json`에 각각 5문항(`version: 1`)을 추가했다. `docs/knowledge/HERMES_AGENT.md`, `FDE.md`를 같은 8개 섹션 구성으로 작성해 JSON 본문과 맞췄다.
- 웹툰 이미지(`public/explore/hermes-agent-webtoon.png`, `public/explore/fde-webtoon.png`, 각 1024×1536)는 가상 사례이며 실제 제품 화면이나 측정된 성과가 아니라고 본문에 명시했다. 내장 imagegen으로 생성한 8컷 웹툰을 각각 연결했다.

- 세 원고의 문단·비교표·문제·보기·해설을 웹 자료와 맞췄다. 속성과 속성값, Hermes의 메모·스킬과 모델 학습, FDE의 현장 적용 책임을 분명히 구분하고 직무 비교에 제품 개발 엔지니어의 공식 출처도 추가했다. 퀴즈는 각 5문항이며 기존 즉시 재선택·첫 선택 점수·기록 미저장 방식을 유지한다.
- v0.13.5 빌드가 통과해 61개 정적 페이지를 생성했다. 새 세 페이지에서 웹툰 참조와 각 5문항·20개 선택지, 문서별 그림 안내·비교 제목을 확인했다. 실제 브라우저 클릭과 모바일 화면 배치는 직접 확인하지 않았다.

## 열한·열두 번째 문서(ElevenLabs, Osmo Film Emulation) 추가 (2026-10-05)

- 'Eleven'은 AI 음성 맥락에서 ElevenLabs로 잠정 해석했고 본문 첫머리에 가정을 밝혔다. 기존 열 문서와 퀴즈는 그대로 두고 두 문서만 추가했다.
- ElevenLabs는 공식 모델·받아쓰기·더빙·Agents Platform·목소리 도움말·생성물 이용 안내를 근거로 TTS·STT·더빙·대화 에이전트의 역할과 이용 조건을 설명한다. Cartesia·Google Cloud TTS와는 읽은 문서 범위의 기능만 비교했고 속도·발음은 비교하지 않았다.
- Osmo Film Emulation은 공식 도구 페이지를 근거로 기존 영상 후처리 역할, 입력 형식 확인, 스톡·룩, 그레인·할레이션, 기기 내 처리 공식 설명을 설명한다. Dehancer·FilmConvert Nitrate는 공식 자료 범위로 비교했다. 도구를 직접 실행하거나 통신을 측정하지 않았다.
- `data/explore.json`에 slug `elevenlabs`, `osmo-film-emulation` 문서를, `data/explore-quizzes.json`에 각각 5문항(`version: 1`)을 추가했다. 정답 위치는 elevenlabs 2·0·3·1·2, osmo-film-emulation 1·3·0·2·1(0부터 센 index)이다. `docs/knowledge/ELEVENLABS.md`, `OSMO_FILM_EMULATION.md`를 같은 8개 섹션 구성으로 작성해 웹 자료와 맞췄다.
- 내장 imagegen으로 생성한 8컷 웹툰 두 편(`public/explore/elevenlabs-webtoon.png`, `public/explore/osmo-film-emulation-webtoon.png`, 각 1024×1536)을 저장하고 본문에 연결했다. 제작 지시는 `docs/knowledge/elevenlabs-webtoon-prompt.txt`, `docs/knowledge/osmo-film-emulation-webtoon-prompt.txt`에 있다.
- 반복 설명을 줄이고 한국어 음성 확인 예시, 입력 색상 설정과 Log 처리, 할레이션·그레인의 차이를 보완했다. 두 원고의 본문·문항과 웹 자료의 일치, 기존 열 문서·퀴즈 보존을 확인했다.
- v0.13.11의 배포용 빌드가 통과해 65개 정적 페이지를 생성했다. 새 두 페이지의 HTML에서 웹툰과 각 5문항·20개 선택지, 버전 표시를 확인했다. 실제 브라우저 클릭·모바일 화면 배치와 원제품의 음성·영상 처리 실행은 수행하지 않았다.

## 목록 상단 웹툰 가로 보기 추가 (2026-10-05)

- v0.13.14에서 기존 문서의 대표 웹툰 12편과 Decisions API·Jev 비교 웹툰 1편을 목록 상단에 연결했다. 카드 전체를 해당 문서 상세 링크로 사용하며 문서 데이터에서 자동으로 목록을 만든다.
- 기존 검색·주제 필터를 유지하고, 별도 라이브러리 없이 기본 가로 스크롤·스냅·키보드 링크 이동을 사용한다. 이미지는 표시 크기에 맞춰 제공하고 원본 비율을 유지한다.
- 배포용 빌드로 65개 정적 페이지를 생성했다. 로컬 브라우저의 320·390·768·844·1440px 화면에서 페이지 가로 넘침 없이 13개 카드와 이미지 로딩을 확인했다. 터치 입력의 가로 스와이프·카드 탭, 키보드 Tab/Enter의 상세 이동, 기존 Osmo 검색 결과 1건을 확인했다. 실제 모바일 기기에서 실행한 것은 아니다.

## 목록 상단 웹툰 가로 보기 제거 (2026-10-06)

- v0.13.15에서 Explore 목록 상단의 '웹툰으로 둘러보기' 섹션과 페이지 목차 링크, 전용 스타일을 제거했다. 검색·주제 필터·전체 문서 목록과 문서 상세의 웹툰은 그대로 둔다.
- 배포용 빌드를 완료해 65개 정적 페이지를 생성했다.
