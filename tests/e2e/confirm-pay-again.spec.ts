import { test, expect, type Page } from "@playwright/test";

/**
 * Confirm / pay-again — CTA must stay visible when receipt peek is showing.
 * Regression: html.has-receipt-peek used to hide .flow-foot globally.
 */

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

async function ackConfirm(page: Page): Promise<void> {
  const ack = page.getByTestId("confirm-ack");
  if (await ack.isVisible()) {
    await ack.click();
  }
}

async function payWithTestCard(page: Page): Promise<void> {
  await page.getByRole("button", { name: /tarjeta de prueba/i }).click();
  await page.getByLabel(/CVV/i).fill("123");
  await page.getByTestId("payment-pay-btn").click();
  await page.getByRole("button", { name: /Volver a pagar/i }).waitFor({
    state: "visible",
    timeout: 45_000,
  });
}

async function assertConfirmPayBtnVisible(page: Page): Promise<void> {
  const payBtn = page.getByTestId("confirm-pay-btn");
  await expect(payBtn).toBeVisible();
  await expect(payBtn).toContainText("Pagar tu parte ·");

  const display = await payBtn.evaluate((el) => getComputedStyle(el).display);
  expect(display).not.toBe("none");

  const footDisplay = await page.locator(".flow-foot").evaluate((el) => {
    return getComputedStyle(el).display;
  });
  expect(footDisplay).toBe("flex");
}

test.describe("Confirm stage — pay CTA with receipt peek", () => {
  test.beforeEach(async ({ request }) => {
    await request.post("/api/demo/table/demo", {
      data: { action: "reset" },
      headers: { "Content-Type": "application/json" },
    });
  });

  test("first visit: confirm pay button visible before any receipt", async ({
    page,
  }) => {
    await enterTable(page);
    await page.getByTestId("bill-name-input").fill("Persona 1");
    await page.getByTestId("bill-item-locro").click();

    const scroll = page.getByTestId("bill-scroll");
    await scroll.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.getByTestId("dock-pay-btn").click();

    await expect(page.getByTestId("guest-bill-flow")).toHaveAttribute(
      "data-stage",
      "confirm",
    );
    await assertConfirmPayBtnVisible(page);
    await expect(page.locator("html")).not.toHaveClass(/has-receipt-peek/);
  });

  test("pay again: confirm pay button visible above receipt peek", async ({
    page,
  }) => {
    await enterTable(page);
    await page.getByTestId("bill-name-input").fill("Persona 1");
    await page.getByTestId("bill-item-locro").click();

    let scroll = page.getByTestId("bill-scroll");
    await scroll.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.getByTestId("dock-pay-btn").click();
    await ackConfirm(page);
    await page.getByTestId("confirm-pay-btn").click();
    await payWithTestCard(page);

    await page.getByRole("button", { name: /Volver a pagar/i }).click();
    await page.getByTestId("bill-item-seco").click();

    scroll = page.getByTestId("bill-scroll");
    await scroll.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.getByTestId("dock-pay-btn").click();

    await expect(page.locator("html")).toHaveClass(/has-receipt-peek/);
    await expect(page.getByTestId("guest-bill-flow")).toHaveAttribute(
      "data-stage",
      "confirm",
    );
    await assertConfirmPayBtnVisible(page);

    const footBox = await page.locator(".flow-foot").boundingBox();
    const receiptBox = await page.locator(".receipt-drawer").boundingBox();
    expect(footBox).toBeTruthy();
    expect(receiptBox).toBeTruthy();
    if (footBox && receiptBox) {
      expect(footBox.y + footBox.height).toBeLessThanOrEqual(
        receiptBox.y + 4,
      );
    }
  });

  test("pay again: payment stage CTA visible above receipt peek", async ({
    page,
  }) => {
    await enterTable(page);
    await page.getByTestId("bill-name-input").fill("Persona 1");
    await page.getByTestId("bill-item-locro").click();

    let scroll = page.getByTestId("bill-scroll");
    await scroll.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.getByTestId("dock-pay-btn").click();
    await ackConfirm(page);
    await page.getByTestId("confirm-pay-btn").click();
    await payWithTestCard(page);

    await page.getByRole("button", { name: /Volver a pagar/i }).click();
    await page.getByTestId("bill-item-encebollado").click();
    scroll = page.getByTestId("bill-scroll");
    await scroll.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.getByTestId("dock-pay-btn").click();
    await ackConfirm(page);
    await page.getByTestId("confirm-pay-btn").click();

    await expect(page.getByTestId("guest-bill-flow")).toHaveAttribute(
      "data-stage",
      "payment",
    );
    const payBtn = page.getByTestId("payment-pay-btn");
    await expect(payBtn).toBeVisible();
    const display = await payBtn.evaluate((el) => getComputedStyle(el).display);
    expect(display).not.toBe("none");
  });
});
