import { test, expect, type Page } from "@playwright/test";

const DEMO_URL = "/pay/demo?debug=1";

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

async function completeOnePayment(page: Page): Promise<void> {
  await page.getByTestId("bill-name-input").fill("Persona 1");
  await page.getByTestId("bill-item-locro").click();
  const scroll = page.getByTestId("bill-scroll");
  await scroll.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.getByTestId("dock-pay-btn").click();
  const ack = page.getByTestId("confirm-ack");
  if (await ack.isVisible()) await ack.click();
  await page.getByTestId("confirm-pay-btn").click();
  await page.getByRole("button", { name: /tarjeta de prueba/i }).click();
  await page.getByLabel(/CVV/i).fill("123");
  await page.getByTestId("payment-pay-btn").click();
  await page.getByRole("button", { name: /Volver a pagar/i }).waitFor({
    state: "visible",
    timeout: 45_000,
  });
  await page.getByRole("button", { name: /Volver a pagar/i }).click();
}

test.describe("Pay chrome hidden under overlays", () => {
  test.beforeEach(async ({ request }) => {
    await request.post("/api/demo/table/demo", {
      data: { action: "reset" },
      headers: { "Content-Type": "application/json" },
    });
  });

  test("dock hides when receipt drawer is expanded", async ({ page }) => {
    await enterTable(page);
    await completeOnePayment(page);

    await expect(page.locator("html")).toHaveClass(/has-receipt-peek/);
    const dock = page.locator(".c-dock.pay-dock-return");
    await expect(dock).toBeVisible();

    await page.getByTestId("receipt-drawer").click();
    await expect(page.locator("html")).toHaveClass(/has-receipt-open/);

    const opacity = await dock.evaluate((el) => getComputedStyle(el).opacity);
    expect(Number(opacity)).toBe(0);
  });

  test("dock hides when share picker is open", async ({ page }) => {
    await enterTable(page);
    await completeOnePayment(page);

    await page.getByTestId("bill-share-entry").click();
    await expect(page.getByTestId("share-picker")).toBeVisible();
    await expect(page.locator("html")).toHaveClass(/has-sheet-open/);

    const dock = page.locator(".c-dock.pay-dock-return");
    const opacity = await dock.evaluate((el) => getComputedStyle(el).opacity);
    expect(Number(opacity)).toBe(0);
  });

  test("share sheet shows who is selected for the dish", async ({ page }) => {
    await enterTable(page);
    await page.getByTestId("bill-name-input").fill("Ana");
    await page.getByTestId("bill-item-locro").click();
    await page.getByTestId("bill-share-entry").click();
    await page.getByTestId("share-picker-item-locro").click();

    await expect(page.getByTestId("share-sheet")).toBeVisible();
    await expect(page.getByTestId("share-selected-summary")).toBeVisible();
    await expect(page.getByTestId("share-pick-p1")).toContainText(
      /Seleccionado|Ana|Persona/,
    );
  });
});
