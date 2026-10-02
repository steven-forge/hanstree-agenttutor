# 이해도 확인 퀴즈 — Upstash Redis 연결 가이드

Explore 문서의 "8. 이해도 확인" 퀴즈는 익명 응시 기록(제출 횟수/평균/최고/이력)을 Upstash Redis REST API에 저장합니다. 코드는 네이티브 `fetch`만 사용하며 새 의존성을 추가하지 않았습니다(`app/api/explore/[slug]/quiz/upstash.mjs`).

Redis 환경변수가 없으면 채점과 시각 표시는 그대로 동작하지만 `saved:false`로 표시되고 "공유 기록 저장이 아직 준비되지 않았습니다." 안내와 저장 재시도 버튼을 보여줍니다. 대시보드에는 불러올 수 없다는 안내와 새로고침 버튼을 표시하며 가짜 통계를 만들지 않습니다.

## 1. Vercel에 Upstash Redis 연결

1. Vercel 프로젝트 → Storage → Marketplace Database Providers → Upstash 선택 후 Redis 데이터베이스를 생성/연결합니다.
2. 연동이 완료되면 Vercel이 프로젝트 환경변수로 `KV_REST_API_URL`/`KV_REST_API_TOKEN`(또는 `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`)을 자동으로 주입합니다. 코드는 두 쌍의 이름을 모두 지원하되, 같은 접두사의 URL과 TOKEN이 함께 있는 완전한 쌍만 사용합니다(한쪽 접두사의 URL과 다른 쪽 접두사의 TOKEN을 섞어 쓰지 않습니다).
3. 환경변수 추가/변경 후에는 **재배포(redeploy)** 가 필요합니다. 참고: https://upstash.com/docs/redis/howto/vercelintegration

필요한 환경변수 이름(값은 Vercel/Upstash 대시보드에서만 확인):

- `UPSTASH_REDIS_REST_URL` 또는 `KV_REST_API_URL`
- `UPSTASH_REDIS_REST_TOKEN` 또는 `KV_REST_API_TOKEN`

연결 값은 서버에서만 사용하며 화면·문서·로그에 출력하지 않습니다. 채팅으로 키를 전달할 필요가 없습니다.

## 2. Eviction(축출) 정책 끄기

퀴즈 응시 이력은 TTL 없이 영구 보관해야 하므로, Upstash 콘솔에서 해당 데이터베이스의 eviction을 **비활성화(no-eviction)** 상태로 설정하는 것을 권장합니다. 그렇지 않으면 메모리 압박 시 오래된 키가 임의로 삭제될 수 있습니다. 참고: https://upstash.com/docs/redis/features/eviction

## 3. 동작 방식 요약

- REST 호출: `POST {URL}` + `Authorization: Bearer {TOKEN}` + Redis 명령 배열(JSON) → `{ result }` 또는 `{ error }` 응답. 참고: https://upstash.com/docs/redis/features/restapi
- 제출(POST) 처리와 통계 갱신은 Lua `EVAL` 트랜잭션으로 원자적으로 수행해 같은 제출 번호(uuid)의 중복 집계를 막습니다. 버전은 문서(slug)별로 독립적으로 관리되며(`data/explore-quizzes.json`의 `quizzes[slug].version`), 한 문서의 문항을 바꿔도 다른 문서의 기존 응시 이력에는 영향이 없습니다.
- 이력 조회는 커서 기반입니다. 제출 시 슬러그·버전별 응시 횟수(`attempts`)를 원자적으로 증가시킨 값을 각 응시의 고유 순번(seq)으로 쓰고, 이 순번을 정렬 점수로 저장합니다. 목록 조회는 `cursor`(직전 페이지 마지막 seq, 정수)보다 작은 순번을 최신순으로 반환해 중간에 새 제출이 들어와도 페이지가 중복되거나 건너뛰지 않습니다. 레코드에는 TTL이나 개수 상한을 두지 않습니다.
- 런타임은 요청마다 `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`(또는 `KV_REST_API_URL`/`KV_REST_API_TOKEN`) 환경변수를 읽어 Upstash에 연결을 시도합니다. 환경변수가 없거나 짝이 맞지 않으면(예: 한쪽 접두사의 URL과 다른 접두사의 TOKEN을 섞어 쓰는 경우) 저장 기능을 끈 것으로 보고 `saved:false`로 동작합니다.
- 원시(raw) 요청 IP는 저장하지 않지만, 분당 10회 요청 제한을 위해 런타임 토큰으로 IP를 HMAC-SHA256 해시한 가명(pseudonymous) 카운터 키(60초 TTL)를 Redis에 둡니다. 즉 "아무 흔적도 남기지 않는다"는 뜻은 아니며, 원본 IP를 직접 보관하지 않는 임시 키가 60초간 존재합니다. 호스팅 제공자의 접속 로그 보관은 별도 정책을 따릅니다.

## 4. 연결 후 확인 — 공유 저장 검증 대기

문항·채점 점검과 빌드, 저장소 연결을 끈 로컬 HTTP 점검은 통과했습니다. 실제 Redis 저장·중복 제출·다른 방문자 기록 조회는 연결 후 아래 절차로 확인해야 합니다. 로컬 HTTP 점검은 `node scripts/check-explore-quiz.mjs http://127.0.0.1:4311`로 실행하며 운영 사이트에는 점검 기록을 제출하지 않습니다.

1. Vercel에 Upstash Redis 연동 및 **재배포**(환경변수 추가/변경 후 재배포하지 않으면 런타임에 반영되지 않습니다)
2. `GET /api/explore/decisions-api/quiz?version=1` 요청 시 `503`이 아닌 `200`과 통계가 반환되는지 확인(버전 번호는 `data/explore-quizzes.json`의 해당 slug `version` 값과 일치해야 합니다)
3. 퀴즈 제출 후 `saved: true`와 대시보드 표시, `nextCursor`를 이용한 "이전 기록 더 보기" 동작 확인
4. `node scripts/check-explore-quiz.mjs` 실행

데이터 키는 `agenttutor:explore:quiz:`로 시작합니다. 문항 또는 정답을 바꿀 때 해당 문서의 퀴즈 버전을 올립니다. 이전 버전 기록은 지우지 않으며 현재 대시보드에서는 현재 문항 버전만 조회합니다.
