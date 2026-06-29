import { test, expect, type Page } from "@playwright/test";

import { enterTable, openDevice, resetDemoTable } from "./helpers/demo";

const TOKEN = "demo-mesa-2";

/** POS-mirrored mesa: no catalog seed (e.g. Fritada) — precuenta or live POS bill. */
async function expectPosMirrorBill(page: Page): Promise<void> {
  const precuenta = page.getByTestId("pos-precuenta-wait");
  const posItems = page.locator('[data-testid^="bill-item-"]');
  await expect(precuenta.or(posItems.first())).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Fritada/i)).not.toBeVisible();
}

test.beforeEach(async ({ request }) => {
  await resetDemoTable(request, TOKEN);
});

test.describe("demo mesa-2 — POS mirror (no catalog partial-pay seed)", () => {
  test("2 devices enter without Fritada catalog seed", async ({ browser }) => {
    const a = await openDevice(browser);
    const b = await openDevice(browser);
    try {
      await enterTable(a.page, TOKEN);
      await enterTable(b.page, TOKEN);

      await expect(a.page.getByText("Mesa 2", { exact: false })).toBeVisible();
      await expectPosMirrorBill(a.page);
      await expectPosMirrorBill(b.page);
    } finally {
      await a.ctx.close();
      await b.ctx.close();
    }
  });
});
