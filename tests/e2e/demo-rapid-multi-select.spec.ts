import { test, expect } from "@playwright/test";

import { enterTable, openDevice, resetDemoTable } from "./helpers/demo";

test.beforeEach(async ({ request }) => {
  await resetDemoTable(request, "demo");
});

test.describe("Layer 2 — selection stability", () => {
  test("rapid multi-select keeps all items checked on one device", async ({
    browser,
  }) => {
    const d = await openDevice(browser);
    try {
      await enterTable(d.page, "demo");
      const tappable = d.page.locator(".item-row-fp.tappable:not(.paid)");
      await tappable.first().waitFor({ state: "visible", timeout: 30_000 });
      const count = await tappable.count();
      test.skip(count < 3, "need at least 3 unpaid items on demo table");

      for (let i = 0; i < 3; i++) {
        await tappable.nth(i).click({ delay: 40 });
      }

      // Allow claim POST chain + one poll cycle to settle.
      await d.page.waitForTimeout(2_000);

      const selected = d.page.locator(".item-row-fp.on:not(.paid)");
      await expect(selected).toHaveCount(3, { timeout: 10_000 });

      const dockTotal = d.page.locator(".dock-total");
      await expect(dockTotal).not.toHaveText(/\$0\.00/);
    } finally {
      await d.ctx.close();
    }
  });

  test("two devices each keep their own item selection", async ({ browser }) => {
    const a = await openDevice(browser);
    const b = await openDevice(browser);
    try {
      await enterTable(a.page, "demo");
      await enterTable(b.page, "demo");

      const itemsA = a.page.locator(".item-row-fp.tappable:not(.paid)");
      const itemsB = b.page.locator(".item-row-fp.tappable:not(.paid)");
      await itemsA.first().waitFor({ state: "visible", timeout: 30_000 });
      await itemsB.first().waitFor({ state: "visible", timeout: 30_000 });

      await itemsA.nth(0).click();
      await itemsB.nth(1).click();

      await a.page.waitForTimeout(2_000);
      await b.page.waitForTimeout(2_000);

      await expect(a.page.locator(".item-row-fp.on:not(.paid)")).toHaveCount(1);
      await expect(b.page.locator(".item-row-fp.on:not(.paid)")).toHaveCount(1);

      // Cross-device: B should not steal A's row (shake/taken, not selected).
      await expect(a.page.locator(".item-row-fp.on:not(.paid)").first()).toBeVisible();
      await expect(b.page.locator(".item-row-fp.on:not(.paid)").first()).toBeVisible();
    } finally {
      await a.ctx.close();
      await b.ctx.close();
    }
  });
});
