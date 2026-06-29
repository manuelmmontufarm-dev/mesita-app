import { test, expect, type Page } from "@playwright/test";

import { enterTable, openDevice, resetDemoTable } from "./helpers/demo";

const TOKEN = "demo-mesa-1";

/** POS-mirrored mesa: precuenta wait OR live POS items — never catalog seed. */
async function expectPosMirrorBill(page: Page): Promise<void> {
  const precuenta = page.getByTestId("pos-precuenta-wait");
  const posItems = page.locator('[data-testid^="bill-item-"]');
  await expect(precuenta.or(posItems.first())).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Bolón de verde/i)).not.toBeVisible();
  await expect(page.getByText(/Churrasco/i)).not.toBeVisible();
}

test.beforeEach(async ({ request }) => {
  await resetDemoTable(request, TOKEN);
});

test.describe("demo mesa-1 — POS mirror (empty or live precuenta)", () => {
  test("2 devices enter and see precuenta wait or POS items", async ({ browser }) => {
    const a = await openDevice(browser);
    const b = await openDevice(browser);
    try {
      await enterTable(a.page, TOKEN);
      await enterTable(b.page, TOKEN);

      await expect(a.page.getByText("Mesa 1", { exact: false })).toBeVisible();
      await expectPosMirrorBill(a.page);
      await expectPosMirrorBill(b.page);
    } finally {
      await a.ctx.close();
      await b.ctx.close();
    }
  });
});
