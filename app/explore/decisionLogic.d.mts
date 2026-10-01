export type DecisionSelection = "shipping" | "refund" | "insufficient";
export type DecisionOutcome = "auto" | "agent" | "moreInfo";

export declare const SELECTION_OPTIONS: DecisionSelection[];

export declare function decideOutcome(input: {
  selection: DecisionSelection;
  hasShippingInfo: boolean;
  routeAllToAgent: boolean;
}): { outcome: DecisionOutcome; reason: string };
