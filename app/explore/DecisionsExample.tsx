"use client";

import { useState } from "react";
import { decideOutcome, type DecisionSelection } from "./decisionLogic.mjs";

const SELECTIONS: { value: DecisionSelection; label: string }[] = [
  { value: "shipping", label: "배송 확인" },
  { value: "refund", label: "환불 요청" },
  { value: "insufficient", label: "정보 부족" }
];

const OUTCOME_LABEL: Record<string, string> = {
  auto: "자동 안내",
  agent: "담당자 전달",
  moreInfo: "추가 정보 요청"
};

export default function DecisionsExample() {
  const [selection, setSelection] = useState<DecisionSelection>("shipping");
  const [hasShippingInfo, setHasShippingInfo] = useState(true);
  const [routeAllToAgent, setRouteAllToAgent] = useState(false);

  const result = decideOutcome({ selection, hasShippingInfo, routeAllToAgent });

  function reset() {
    setSelection("shipping");
    setHasShippingInfo(true);
    setRouteAllToAgent(false);
  }

  return (
    <div className="card decisions-example">
      <p className="status-unconfirmed" style={{ marginBottom: "14px" }}>
        미리 준비한 설명용 예제 · 실제 API 호출 없음
      </p>

      <div className="decisions-diagram" role="img" aria-label="입력 맥락과 질문이 Decisions API로 들어가 세 가지 선택지 중 하나가 선택되고, 앱이 정책을 확인한 뒤 실제 행동을 결정하는 흐름도">
        <div className="decisions-diagram-box">
          <strong>입력 맥락 + 질문</strong>
          <span>문의 내용과 배송 정보 여부</span>
        </div>
        <div className="decisions-diagram-arrow" aria-hidden="true">→</div>
        <div className="decisions-diagram-box">
          <strong>Decisions API</strong>
          <span>미리 정한 3개 선택지 중 하나 선택</span>
        </div>
        <div className="decisions-diagram-arrow" aria-hidden="true">→</div>
        <div className={`decisions-diagram-box decisions-outcome decisions-outcome-${result.outcome}`}>
          <strong>선택 결과</strong>
          <span>{OUTCOME_LABEL[result.outcome]}</span>
        </div>
        <div className="decisions-diagram-arrow" aria-hidden="true">→</div>
        <div className="decisions-diagram-box">
          <strong>앱의 실제 처리</strong>
          <span>정책·권한 확인 후 실행</span>
        </div>
      </div>

      <form
        className="decisions-controls"
        onSubmit={(e) => e.preventDefault()}
      >
        <fieldset>
          <legend>문의 내용 선택</legend>
          {SELECTIONS.map((item) => (
            <label key={item.value} className="decisions-radio">
              <input
                type="radio"
                name="decisions-selection"
                value={item.value}
                checked={selection === item.value}
                onChange={() => setSelection(item.value)}
              />
              {item.label}
            </label>
          ))}
        </fieldset>

        <label className="decisions-checkbox">
          <input
            type="checkbox"
            checked={hasShippingInfo}
            onChange={(e) => setHasShippingInfo(e.target.checked)}
          />
          배송 정보(주문번호 등)가 있음
        </label>

        <label className="decisions-checkbox">
          <input
            type="checkbox"
            checked={routeAllToAgent}
            onChange={(e) => setRouteAllToAgent(e.target.checked)}
          />
          정책: 모든 문의를 담당자가 확인
        </label>

        <button type="button" onClick={reset} className="decisions-reset">
          처음으로
        </button>
      </form>

      <p className="decisions-result" aria-live="polite">
        <strong>{OUTCOME_LABEL[result.outcome]}</strong> — {result.reason}
      </p>
      <p className="decisions-note">
        이 결과는 AI가 고른 선택지일 뿐이며, 실제 안내 발송이나 담당자 전달 같은 행동은 앱이 자신의 정책과 권한을 확인한 뒤에 수행합니다.
      </p>
    </div>
  );
}
