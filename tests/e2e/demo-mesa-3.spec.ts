import { test, expect } from "@playwright/test";

import { enterTable, openDevice, resetDemoTable } from "./helpers/demo";

const TOKEN = "demo-mesa-3";

test.beforeEach(async ({ request }) => {
  await resetDemoTable(request, TOKEN);
});

test.describe("demo mesa-3 — grupo grande (long bill)", () => {
  test("2 devices see the long menu", async ({ browser }) => {
    const a = await openDevice(browser);
    const b = await openDevice(browser);
    try {
      await enterTable(a.page, TOKEN);
      await enterTable(b.page, TOKEN);

      await expect(a.page.getByText("Mesa 3", { exact: false })).toBeVisible();
      await expect(a.page.getByText(/Ceviche mixto/i).first()).toBeVisible();
      await expect(b.page.getByText(/Ceviche mixto/i).first()).toBeVisible();
    } finally {
      await a.ctx.close();
      await b.ctx.close();
    }
  });
});
