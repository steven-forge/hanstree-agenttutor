# 모델 비교 데이터 갱신 — 2026-09-30

## 확인일
2026-09-30 (팀장 직접 원문 확인)

## 신규 추가 모델

### Claude Sonnet 5.5 (`claude-sonnet-5-5`)
- 출처: https://platform.claude.com/docs/en/models/sonnet-5-5/overview
- 출시 2026-09-28, 입력 $2/출력 $10/캐시읽기 $0.20 (100만 토큰), context 1M, max_output 128K(Batch beta 300K)
- effort: low/medium/high/xhigh/max, API 기본 high. between_tools는 low/medium/high만 지원, xhigh/max는 adaptive thinking 필요
  (https://platform.claude.com/docs/en/models/sonnet-5-5/migration-guide)
- 앱 최소 요금제 미확인 → `minimum_access`에 그대로 표기, 이전 Sonnet 5 값 복사하지 않음

### GPT-6.1 Sol (`gpt-6.1-sol`)
- 모델 문서: https://developers.openai.com/api/docs/models/gpt-6.1-sol
- 출시일 2026-09-29, 근거: https://deploymentsafety.openai.com/gpt-6-1-sol (시스템카드)
- 입력 $2/출력 $10/캐시읽기 $0.10/캐시쓰기 $2.50, context 1,050,000, max_output 128K
- effort: low/medium/high/xhigh/max, 기본 medium, none/minimal 미지원
- 앱 최소 이용은 요금제·클라이언트·워크스페이스별로 다름 → 근거: https://learn.chatgpt.com/docs/whats-new/september-28-october-2-2026
- Astra 바로 뒤에 배치, GPT-5.6 Luna는 그대로 유지 (Terra 미도입)

## 기존 항목 재확인 및 변경
- Claude: Fable5.1/Opus5/Sonnet5(이전 모델)는 effort_note "기본값은 high" 추가. Opus5.5는 "기본값 medium, adaptive 항상 켜짐" 추가. Sonnet5는 Sonnet5.5 이전 모델임을 표시(공식 legacy 상태를 새로 단정하지 않음).
- Codex: API reasoning.effort 기준과 Sol·Luna 기본 medium을 명시. Ultra는 API effort가 아닌 Codex의 별도 실행 모드임을 구분. 모델별 API 카드와 https://learn.chatgpt.com/docs/models 확인.
- Gemini: 각 모델에 thinking level 기본값(3.1Pro high, 나머지 medium) 및 3.8Flash의 minimal 요청 오류 note 추가. 목록/가격은 변경 없음(최신 텍스트 모델 이미 포함).
- Grok: 최신 공식 Markdown 모델 문서를 직접 확인. 4.7/4.6은 low/medium/high/xhigh(기본 high), 4.5는 low/medium/high(기본 high). 4.3은 none/low/medium/high/xhigh(기본 low)로 xhigh를 추가하고 이전 불일치 안내를 해소했다.
  - https://docs.x.ai/developers/models/grok-4.7.md
  - https://docs.x.ai/developers/models/grok-4.6.md
  - https://docs.x.ai/developers/models/grok-4.3.md
- DeepSeek: group effort_note에 "기본값 high, medium/xhigh 요청은 high로 매핑" 보완. 모델·가격 변경 없음(Pro 서비스 종료 아님, 유지 확인).
- Muse: 각 모델에 "none 미지원, max는 Standard 1.3만 지원" note 추가. 목록/가격 변경 없음(Spark 1.3 이미 최신).
- 기존 지원 목록 확인: https://ai.google.dev/gemini-api/docs/thinking · https://api-docs.deepseek.com/guides/thinking_mode/ · https://dev.meta.ai/docs/reasoning
- 최종 모델 수 28개(Claude 6, Codex 6, Gemini 5, Grok 4, DeepSeek 2, Muse 5). 기존 최신 범용 텍스트 API 모델 비교 범위를 유지하며 음성·이미지 생성 전용 모델은 포함하지 않았다.

## 버전
- package.json / package-lock.json: 0.8.17 → 0.8.18

## 미확인 항목
- Sonnet 5.5의 앱(구독제) 최소 요금제
- GPT-6.1 Sol의 앱 이용 최소 요금제(플랜별 세부 조건)
