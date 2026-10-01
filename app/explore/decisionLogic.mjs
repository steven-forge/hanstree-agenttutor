// 설명용 예제 전용 순수 함수. 실제 AI 호출이나 자유 텍스트 분석을 하지 않는다.

export const SELECTION_OPTIONS = ["shipping", "refund", "insufficient"];

/**
 * @param {{ selection: "shipping" | "refund" | "insufficient", hasShippingInfo: boolean, routeAllToAgent: boolean }} input
 * @returns {{ outcome: "auto" | "agent" | "moreInfo", reason: string }}
 */
export function decideOutcome({ selection, hasShippingInfo, routeAllToAgent }) {
  if (routeAllToAgent) {
    return { outcome: "agent", reason: "정책 스위치: 모든 문의를 담당자가 확인하도록 설정되어 있습니다." };
  }

  if (selection === "insufficient") {
    return { outcome: "moreInfo", reason: "문의 내용만으로는 어떤 선택지에도 확실히 맞지 않아 추가 정보가 필요합니다." };
  }

  if (selection === "refund") {
    return { outcome: "agent", reason: "환불 요청은 항상 담당자가 확인하도록 정해 두었습니다." };
  }

  if (selection === "shipping") {
    return hasShippingInfo
      ? { outcome: "auto", reason: "배송 조회에 필요한 정보가 있어 자동 안내로 처리할 수 있습니다." }
      : { outcome: "moreInfo", reason: "배송 조회에 필요한 정보(주문번호 등)가 없어 추가 정보가 필요합니다." };
  }

  throw new Error(`알 수 없는 선택지: ${selection}`);
}
