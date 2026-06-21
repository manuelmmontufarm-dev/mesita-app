import { test, expect } from "@playwright/test";

import { enterTable, openDevice, resetDemoTable } from "./helpers/demo";

const TOKEN = "demo-mesa-4";

test.beforeEach(async ({ request }) => {
  await resetDemoTable(request, TOKEN);
});

test.describe("demo mesa-4 — cierre total (≥$50 invoice)", () => {
  test("2 devices see the invoice-tier menu", async ({ browser }) => {
    const a = await openDevice(browser);
    const b = await openDevice(browser);
    try {
      await enterTable(a.page, TOKEN);
      await enterTable(b.page, TOKEN);

      await expect(a.page.getByText("Mesa 4", { exact: false })).toBeVisible();
      await expect(a.page.getByText(/Parrillada/i).first()).toBeVisible();
      await expect(b.page.getByText(/Parrillada/i).first()).toBeVisible();
    } finally {
      await a.ctx.close();
      await b.ctx.close();
    }
  });
});
