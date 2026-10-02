# 이해도 확인 퀴즈 — 운영 가이드

Explore 문서의 "8. 이해도 확인" 퀴즈는 상태 없는(stateless) 서버 채점만 수행합니다. 앱은 답안과 점수를 응시 기록으로 저장하지 않으며, 별도 저장소 연결·환경변수 설정이 필요 없습니다.

## 동작 방식

- 문항·정답·해설은 `data/explore-quizzes.json`(slug별 5문항, `quizzes[slug].version`으로 문서별 버전 관리)에 있습니다. 서버 페이지는 `toPublicQuestions`로 정답·해설을 제거한 문항만 클라이언트에 전달합니다(`app/explore/quizLogic.mjs`).
- 클라이언트(`app/explore/QuizClient.tsx`)는 답안을 모으고 `POST /api/explore/[slug]/quiz`로 `{ version, answers }`만 보냅니다. 서버는 `gradeQuiz`/`buildReview`로 항상 다시 채점하며 클라이언트가 보낸 점수는 신뢰하지 않습니다.
- 응답은 `correct`/`total`/`score`/`timestamp`/`timestampKst`/`review`만 포함합니다. 저장 여부·제출 번호·공유 이력 관련 필드는 없습니다.
- 응답 헤더는 항상 `Cache-Control: no-store`입니다. GET은 지원하지 않으며 기본 405를 반환합니다.
- 문항 버전(`version`)이 맞지 않으면 409를 반환하고, 클라이언트는 새로고침을 안내합니다.
- 결과는 현재 화면의 React state에만 있습니다. 새로고침이나 "새로 응시하기"를 누르면 사라지며, 브라우저에도 별도로 남기지 않습니다(localStorage/sessionStorage/cookie 등 미사용).

## 점검 명령

```
node scripts/check-explore-quiz.mjs
node scripts/check-explore-quiz.mjs http://127.0.0.1:<port>
```

첫 번째는 문항 스키마와 채점 순수 함수만 점검합니다. 인자로 로컬 서버 주소를 주면 위 API 동작(정상 채점, GET 405, 잘못된 본문/버전/오리진/용량 초과 거부)까지 점검합니다. 운영 서버에는 점검 요청을 보내지 않습니다.
