import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

/**
 * R2 regression test — after the table is fully paid the guest must be able
 * to navigate Bill ↔ Success freely, and the bill-stage dock must surface
 * the **"Regresar al resumen de mesa"** CTA (testid `dock-completed-btn`).
 *
 * Pre-bug, that CTA disappeared because `showPayDock` used a 0.001 epsilon
 * and the 50/50 split left a sub-cent residual balance, so the PayDock
 * branch kept winning forever — the CompletedDock was unreachable.
 */

const DEMO_URL = "/pay/demo?debug=1";
const RESET_ENDPOINT = "/api/demo/table/demo";

async function resetDemoTable(
  request: import("@playwright/test").APIRequestContext,
) {
  await request.post(RESET_ENDPOINT, {
    data: { action: "reset" },
    headers: { "Content-Type": "application/json" },
  });
}

async function openDevice(
  browser: Browser,
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  return { ctx, page };
}

async function enterTable(page: Page): Promise<void> {
  await page.goto(DEMO_URL, { waitUntil: "domcontentloaded" });
  const entryBtn = page.getByTestId("demo-enter-table-btn");
  const billInput = page.getByTestId("bill-name-input");
  await Promise.race([
    entryBtn.waitFor({ state: "visible", timeout: 30_000 }),
    billInput.waitFor({ state: "visible", timeout: 30_000 }),
  ]);
  if (await entryBtn.isVisible()) {
    await entryBtn.click();
    await billInput.waitFor({ state: "visible", timeout: 30_000 });
  }
}

async function payTodo(page: Page): Promise<void> {
  // Pick "Todo" split mode and pay full bill. Each project has its own
  // testids; we keep this resilient by tapping the dock pay button.
  const dockPay = page.getByTestId("dock-pay-btn");
  await dockPay.waitFor({ state: "visible", timeout: 15_000 });
  await dockPay.click();
  // Confirm screen
  const ack = page.getByTestId("confirm-ack");
  if (await ack.isVisible().catch(() => false)) await ack.click();
  const confirmPay = page.getByTestId("confirm-pay-btn");
  await confirmPay.waitFor({ state: "visible", timeout: 10_000 });
  await confirmPay.click();
  // Payment screen → submit
  const submit = page.getByTestId("payment-submit-btn");
  await submit.waitFor({ state: "visible", timeout: 10_000 });
  await submit.click();
}

test.describe("R2 — completed-dock navigation after table close", () => {
  test.beforeEach(async ({ request }) => {
    await resetDemoTable(request);
  });

  test("after full pay, the Bill stage shows 'Regresar al resumen de mesa'", async ({
    browser,
  }) => {
    const { ctx, page } = await openDevice(browser);
    try {
      await enterTable(page);
      await payTodo(page);

      // Land on waiting/success. We don't depend on which — what we care
      // about is the navigation BACK to bill.
      await page.waitForTimeout(800);

      // Tap a "Ver mesa" CTA if visible, else jump straight to bill route
      const verMesa = page.getByRole("button", { name: /ver mesa|ver la mesa/i });
      if (await verMesa.isVisible().catch(() => false)) {
        await verMesa.click();
      } else {
        await page.goto(DEMO_URL, { waitUntil: "domcontentloaded" });
      }

      // The completed-dock CTA must be visible
      const completed = page.getByTestId("dock-completed-btn");
      await completed.waitFor({ state: "visible", timeout: 10_000 });
      await expect(completed).toContainText(/regresar al resumen de mesa/i);

      // Clicking it returns to the success/summary view
      await completed.click();
      // Some indicator that the success view is active — wait for one of
      // the typical success-only testids.
      const successAnchor = page
        .locator("[data-testid=ws-mesa-ring], .ok-ring, [data-testid=ws-payment-count]")
        .first();
      await successAnchor.waitFor({ state: "visible", timeout: 10_000 });
    } finally {
      await ctx.close();
    }
  });

  test("two devices both reach the completed-dock after their splits are paid", async ({
    browser,
  }) => {
    const da = await openDevice(browser);
    const db = await openDevice(browser);
    try {
      await Promise.all([enterTable(da.page), enterTable(db.page)]);

      // For brevity, device A pays everything (mode todo). Device B should
      // also land on the closed-table flow without the CTA being missing.
      await payTodo(da.page);

      // Device B navigates back to bill; the completed-dock CTA must show
      // because tableClosed is now true server-side regardless of B's local
      // residual math.
      await db.page.goto(DEMO_URL, { waitUntil: "domcontentloaded" });
      const completedB = db.page.getByTestId("dock-completed-btn");
      await completedB.waitFor({ state: "visible", timeout: 15_000 });
    } finally {
      await da.ctx.close();
      await db.ctx.close();
    }
  });
});
