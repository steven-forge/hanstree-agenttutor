# Today 작업 목록

기준 문서: [TODAY_PLAN.md](./TODAY_PLAN.md)

## 작업

- [x] Today 메뉴와 `/today` 경로 추가
- [x] 오늘의 10대 뉴스 목록 화면 구현
- [x] 순위·제목·요약·중요성·출처 표시
- [x] 뉴스 상세 보기 방식 결정 및 구현
- [x] 모바일 반응형과 키보드 접근성 확인
- [x] 뉴스 데이터 구조 확정
- [x] KST 날짜·갱신 시각 표시
- [x] 중복 뉴스 판정 기준 적용
- [x] 출처·원문 링크 검증
- [x] 뉴스 부족·수집 실패 상태 구현
- [x] 갱신 주기와 실행 주체 결정
- [x] 공개 출처 수집 방식 구현
- [x] 정상 데이터 보존 규칙 적용

## 완료 조건

- [ ] `/today`에서 실제 검토된 뉴스가 정상 표시됨 (최대 10개, 24시간 내 적격 후보 0건으로 첫 기사 발행 대기)
- [x] 잘못된 링크·빈 데이터 상태가 안전하게 처리됨
- [ ] 발행된 기사 요약을 실제 원문과 대조 확인함 (첫 기사 발행 후 확인, 현재 미발행으로 미충족)

## 구현·확인 기록

- 2026-09-20, v0.2.0: `/today` 운영 반영 확인. 화면·수집·중복 URL 제거·검토 발행·실패 보존 기능을 구현했다. 상세 해설은 카드의 펼치기로 제공한다.
- 실제 수집: 공식 출처 6곳 응답, 최근 24시간 후보 0건, Anthropic 8건은 발행 시각 확인이 안 되어 보류. 화면에 부분 수집·후보 0건·보류 수를 표시하며 임의 기사나 빈 검토 완료 판본을 발행하지 않았다.
- `python3 scripts/check_content.py` 통과. 보류가 있는 빈 판본 발행 명령이 거부되었고 `data/today.json` 해시가 유지됨을 확인했다.
- 매일 06:15 KST 예약과 수동 실행을 등록했다. 로컬 실제 수집은 실행했으며 GitHub의 첫 예약 실행은 아직 확인하지 않았다. 발행 가능한 후보 확보 후 한국어 요약·중요성·원문을 검토하고 남은 2개 항목을 체크한다.
- 2026-09-21 재확인:
  - 수집 실행: 2026-09-21 05:18:23 KST(수집 기간: 09-20 05:18:23 ~ 09-21 05:18:23 KST). 공식 6개 출처 HTTP 응답 성공(실패 0), 24시간 윈도우 내 후보 0건, Anthropic 8건 발행시각 미확인 보류(전체 상태 partial). 출처 조회는 성공했으나 적격 기사가 없어 기사 발행은 미완료.
  - 출처별 확인: OpenAI RSS(최신 09-18 21:00 KST) 및 Google AI RSS(최신 09-18 23:00 KST) 모두 윈도우 밖. GitHub Releases API(최근 30건 직접 확인)상 최신 안정판(Codex rust-v0.155.1 09-19 05:03 KST, Gemini v0.60.0 09-16 05:31 KST)은 윈도우 이전이며, 윈도우 내 Codex alpha.9 및 Gemini nightly는 `prerelease: true`로 정책상 제외. Anthropic 최신 기사(accenture-embedded-evaluation)는 HTTP 200이나 본문에 'Sep 18, 2026' 텍스트만 존재하고 표준 발행시각 메타데이터 부재(사이트 설정 `_updatedAt`는 발행시각이 아니므로 미사용), xAI 최신 기사도 09-18자로 윈도우 밖.
  - 확인 출처: [OpenAI RSS](https://openai.com/news/rss.xml), [Google AI RSS](https://blog.google/innovation-and-ai/technology/ai/rss/), [Codex 안정판](https://github.com/openai/codex/releases/tag/rust-v0.155.1), [Gemini CLI 안정판](https://github.com/google-gemini/gemini-cli/releases/tag/v0.60.0), [Anthropic 원문](https://www.anthropic.com/news/accenture-embedded-evaluation), [xAI 목록](https://x.ai/news).
  - 원칙 및 판정: 허위 기사 작성·시각 임의 추정·과거 판본 날짜 변경·24시간 기준 완화 없이 `data/today.json` 보존. '실제 검토된 뉴스 표시' 및 '발행 기사 요약과 원문 대조' 완료 조건은 미충족 상태 유지. 최근 7일 범위 확대는 사용자 승인 대기 중. 첫 예약 실행은 아직 확인하지 않았다.
