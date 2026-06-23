/** Document class toggled when the receipt drawer peek bar is visible. */
export const RECEIPT_PEEK_HTML_CLASS = "has-receipt-peek";

/** Receipt drawer expanded — pay CTAs must hide. */
export const RECEIPT_OPEN_HTML_CLASS = "has-receipt-open";

/** Share picker / share item sheet open — pay CTAs must hide. */
export const SHEET_OPEN_HTML_CLASS = "has-sheet-open";

/** Stages that render `.flow-foot` with the primary pay CTA (must stay visible over peek). */
export const FLOW_FOOT_STAGES = ["confirm", "payment"] as const;

export type FlowFootStage = (typeof FLOW_FOOT_STAGES)[number];

export function shouldEnableReceiptPeekClass(receiptCount: number): boolean {
  return receiptCount > 0;
}

export function shouldEnableSheetOpenClass(opts: {
  shareItem: string | null;
  sharePicker: boolean;
}): boolean {
  return Boolean(opts.shareItem || opts.sharePicker);
}

/** True when pay dock / flow-foot must be hidden (modal overlays). */
export function shouldHidePayChrome(opts: {
  receiptOpen: boolean;
  sheetOpen: boolean;
}): boolean {
  return opts.receiptOpen || opts.sheetOpen;
}

export function isFlowFootStage(stage: string): stage is FlowFootStage {
  return (FLOW_FOOT_STAGES as readonly string[]).includes(stage);
}

/** CSS selectors that must keep confirm/payment pay buttons visible when peeking. */
export const RECEIPT_PEEK_FLOW_FOOT_SELECTORS = FLOW_FOOT_STAGES.map(
  (stage) => `html.has-receipt-peek .cust-app[data-stage="${stage}"] .flow-foot`,
);
