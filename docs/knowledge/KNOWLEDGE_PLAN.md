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
8. 이해도 확인 — 4지선다 3~5문항 퀴즈(`data/explore-quizzes.json`), 제출 후 정답·해설·공유 기록 대시보드 표시. 버전은 문서(slug)별로 독립 관리되며(`quizzes[slug].version`), 응시 이력 조회는 커서(직전 페이지 마지막 응시 순번) 기반 페이지네이션을 쓴다.

앞으로 새로 추가하는 모든 Explore 문서는 8번 이해도 확인 섹션을 기본으로 포함한다. 문항은 `data/explore-quizzes.json`에 해당 문서 slug로 3~5개(텍스트·선택지 4개·정답 index·해설)를 추가하고, 정답과 해설은 제출 전까지 클라이언트에 노출하지 않는다.

핵심 답변은 2~3문장으로 짧게 쓴다. 긴 설명은 한 문단에 한 주제, 보통 1~2문장씩 나누고 문단 사이에 여백을 둔다. 웹 화면과 Markdown 원고에 동일한 문단 구성을 반영한다.

직접 조작하는 예제는 현행 문서 구성에서 제외한다. 기존 설명 웹툰과 Decisions API의 Jev 비교 웹툰은 유지한다.

## 목록과 화면

왼쪽 Explore → All Documents에서 모든 문서를 찾는다. 목록의 검색과 주제 선택, 각 문서의 고유 주소를 유지한다. 큰 화면과 모바일의 목차는 같은 순서로 연결한다.

비교표는 셀 안에서 문장을 줄바꿈한다. 좁은 화면에서는 표 영역만 가로로 움직여 읽을 수 있게 하고 키보드로도 접근할 수 있게 한다.

## 작성과 관리

최신 사양·가격·이용 조건은 공식 자료를 확인하고 확인일과 출처를 표시한다. 발표 내용, 이해를 위한 가상 사례, 직접 실행해서 확인한 결과를 구분한다.

비슷한 목적의 제품이나 모델을 비교한다. 직접 성능을 비교하지 않았다면 승자를 단정하지 않고 기능·연결 방식·접근 조건·비용 조건을 설명한다.

공통 화면은 `app/explore/[slug]/page.tsx`, 문서 자료는 `data/explore.json`, 읽기용 원고는 `docs/knowledge`에서 관리한다. 수정·제목 변경·공개 중단 요청은 이 대화에서 반영한다.

## 현재 문서와 완료 기준

Decisions API(Jev 비교), OpenAI Dots(Claude Cowork 비교), Gemini 4 Argon(GPT-6 Astra·Claude Opus 5.5 비교)의 세 문서를 관리한다.

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

## 이해도 확인 퀴즈 추가 (v0.11.0)

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
- 실제 Redis 저장·통계·기록 조회와 브라우저 화면 조작은 아직 확인하지 않았다. 저장소는 사용자 본인 Vercel 계정에서 연결해야 하며, 연결 후 별도 확인이 필요하다.
