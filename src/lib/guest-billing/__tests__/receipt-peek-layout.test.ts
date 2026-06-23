import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FLOW_FOOT_STAGES,
  RECEIPT_OPEN_HTML_CLASS,
  RECEIPT_PEEK_FLOW_FOOT_SELECTORS,
  RECEIPT_PEEK_HTML_CLASS,
  SHEET_OPEN_HTML_CLASS,
  isFlowFootStage,
  shouldEnableReceiptPeekClass,
  shouldEnableSheetOpenClass,
  shouldHidePayChrome,
} from "../receipt-peek-layout";

const customerCss = readFileSync(
  resolve(process.cwd(), "src/app/pay/customer.css"),
  "utf8",
);

describe("receipt-peek-layout helpers", () => {
  it("enables peek class only when there are receipts", () => {
    expect(shouldEnableReceiptPeekClass(0)).toBe(false);
    expect(shouldEnableReceiptPeekClass(1)).toBe(true);
    expect(shouldEnableReceiptPeekClass(3)).toBe(true);
  });

  it("enables sheet-open class when share picker or item sheet is open", () => {
    expect(
      shouldEnableSheetOpenClass({ shareItem: null, sharePicker: false }),
    ).toBe(false);
    expect(
      shouldEnableSheetOpenClass({ shareItem: "locro", sharePicker: false }),
    ).toBe(true);
    expect(
      shouldEnableSheetOpenClass({ shareItem: null, sharePicker: true }),
    ).toBe(true);
  });

  it("hides pay chrome when receipt is open or a sheet is open", () => {
    expect(
      shouldHidePayChrome({ receiptOpen: false, sheetOpen: false }),
    ).toBe(false);
    expect(
      shouldHidePayChrome({ receiptOpen: true, sheetOpen: false }),
    ).toBe(true);
    expect(
      shouldHidePayChrome({ receiptOpen: false, sheetOpen: true }),
    ).toBe(true);
  });

  it("identifies confirm and payment as flow-foot stages", () => {
    expect(FLOW_FOOT_STAGES).toEqual(["confirm", "payment"]);
    expect(isFlowFootStage("confirm")).toBe(true);
    expect(isFlowFootStage("payment")).toBe(true);
    expect(isFlowFootStage("bill")).toBe(false);
    expect(isFlowFootStage("waiting")).toBe(false);
  });
});

describe("customer.css receipt-peek contract", () => {
  it("defines peek class and flow-foot-above-peek token", () => {
    expect(customerCss).toContain(`html.${RECEIPT_PEEK_HTML_CLASS}`);
    expect(customerCss).toContain("--flow-foot-above-peek");
  });

  it("keeps confirm/payment flow-foot visible above receipt peek", () => {
    for (const selector of RECEIPT_PEEK_FLOW_FOOT_SELECTORS) {
      expect(customerCss).toContain(selector);
    }
    const confirmBlock = customerCss.match(
      /html\.has-receipt-peek \.cust-app\[data-stage="confirm"\] \.flow-foot[\s\S]*?\}/,
    )?.[0];
    expect(confirmBlock).toBeTruthy();
    expect(confirmBlock).toContain("display: flex");
    expect(confirmBlock).toContain("position: fixed");
    expect(confirmBlock).toContain("z-index: 60");
  });

  it("does not blanket-hide all flow-foot when receipt peek is active", () => {
    expect(customerCss).not.toMatch(
      /html\.has-receipt-peek \.flow-foot,\s*\nhtml\.has-receipt-peek \.ws-wait-foot\s*\{\s*display:\s*none/,
    );
  });

  it("hides pay chrome when receipt drawer is open or share sheet is open", () => {
    expect(customerCss).toContain(`html.${RECEIPT_OPEN_HTML_CLASS} .c-dock`);
    expect(customerCss).toContain(`html.${SHEET_OPEN_HTML_CLASS} .c-dock`);
    expect(customerCss).toContain(
      `html.${RECEIPT_OPEN_HTML_CLASS} .cust-app[data-stage="confirm"] .flow-foot`,
    );
    expect(customerCss).toContain(`html.${SHEET_OPEN_HTML_CLASS} .flow-foot`);
  });

  it("raises share sheets above the pay dock layer", () => {
    expect(customerCss).toMatch(/\.sheet-scrim\s*\{[\s\S]*?z-index:\s*100/);
    expect(customerCss).toMatch(/\.sheet\s*\{[\s\S]*?z-index:\s*101/);
  });

  it("pads flow-scroll for foot + receipt peek stack", () => {
    expect(customerCss).toMatch(
      /html\.has-receipt-peek \.flow-scroll[\s\S]*--flow-foot-above-peek/,
    );
  });
});
