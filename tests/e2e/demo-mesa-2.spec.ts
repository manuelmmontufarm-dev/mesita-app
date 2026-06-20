import { test, expect } from "@playwright/test";

import { enterTable, openDevice, resetDemoTable } from "./helpers/demo";

const TOKEN = "demo-mesa-2";

test.beforeEach(async ({ request }) => {
  await resetDemoTable(request, TOKEN);
});

test.describe("demo mesa-2 — pagos parciales", () => {
  test("seeded paid items show up at entry", async ({ browser }) => {
    const a = await openDevice(browser);
    const b = await openDevice(browser);
    try {
      await enterTable(a.page, TOKEN);
      await enterTable(b.page, TOKEN);

      await expect(a.page.getByText("Mesa 2", { exact: false })).toBeVisible();
      // Fritada is fully paid in the seed → it should render somewhere with a paid affordance.
      await expect(a.page.getByText(/Fritada/i).first()).toBeVisible();
    } finally {
      await a.ctx.close();
      await b.ctx.close();
    }
  });
});
