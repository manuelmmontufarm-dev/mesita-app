import { test, expect, type Page } from "@playwright/test";

/**
 * Bill First Page — scroll, layout, modes, tip, dock.
 * Guards the Mesita First Page UX against regressions (especially scroll).
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

test.describe("Bill First Page — layout & scroll", () => {
  test.beforeEach(async ({ request }) => {
    await request.post("/api/demo/table/demo", {
      data: { action: "reset" },
      headers: { "Content-Type": "application/json" },
    });
  });

  test("bill card renders with scroll container that can reach totals", async ({
    page,
  }) => {
    await enterTable(page);

    await expect(page.getByTestId("bill-card-fluid")).toBeVisible();
    await expect(page.getByTestId("bill-scroll")).toBeVisible();
    await expect(page.getByTestId("bill-total")).toBeVisible();

    const scroll = page.getByTestId("bill-scroll");
    const metrics = await scroll.evaluate((el) => ({
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
      overflowY: getComputedStyle(el).overflowY,
      minHeight: getComputedStyle(el).minHeight,
    }));

    expect(metrics.overflowY).toBe("auto");
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight + 12);

    await scroll.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });

    await expect(page.getByTestId("bill-total")).toBeInViewport();
    await expect(page.getByTestId("dock-pay-btn")).toBeVisible();
  });

  test("dock expands at bottom and shows pay copy with amount", async ({ page }) => {
    await enterTable(page);
    await page.getByTestId("bill-name-input").fill("Manuel");
    await page.getByTestId("bill-item-locro").click();

    const scroll = page.getByTestId("bill-scroll");
    await scroll.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });

    const dock = page.locator(".c-dock");
    await expect(dock).toHaveClass(/dock-full/);
    const payBtn = page.getByTestId("dock-pay-btn");
    await expect(payBtn).toContainText("Pagar tu parte ·");
    await expect(payBtn).not.toBeDisabled();
  });

  test("payer avatar initials update when name is typed", async ({ page }) => {
    await enterTable(page);
    const av = page.getByTestId("payer-avatar-initials");
    await expect(av).toHaveText("P1");

    await page.getByTestId("bill-name-input").fill("Manuel");
    await expect(av).toHaveText("MA");
  });

  test("equal mode shows banner and stepper", async ({ page }) => {
    await enterTable(page);
    await page.getByTestId("bill-mode-equal").click();
    await expect(page.locator(".mode-info-banner")).toContainText(
      "partes iguales",
    );
    await expect(page.getByRole("button", { name: "Más" })).toBeVisible();
  });

  test("tip chips and Otro POS input update total", async ({ page }) => {
    await enterTable(page);
    await page.getByTestId("bill-name-input").fill("Ana");
    await page.getByTestId("bill-item-encebollado").click();

    const totalBefore = await page.getByTestId("bill-total").textContent();
    await page.getByTestId("bill-tip-15").click();
    const totalAfter = await page.getByTestId("bill-total").textContent();
    expect(totalAfter).not.toBe(totalBefore);

    await page.getByTestId("bill-tip-other").click();
    await page.locator(".tip-pos-hidden-input").focus();
    await page.keyboard.type("250");
    await expect(page.locator(".tip-pos-amount")).toContainText("$2.50");
  });

  test("claiming item shows green row and owner name chip", async ({ page }) => {
    await enterTable(page);
    await page.getByTestId("bill-name-input").fill("Manuel");
    await page.getByTestId("bill-item-ceviche").click();
    await expect(page.getByTestId("bill-item-ceviche")).toHaveClass(/on/);
    await expect(page.getByTestId("bill-item-ceviche")).toContainText("Manuel");
  });

  test("todo mode marks all unpaid items selected", async ({ page }) => {
    await enterTable(page);
    await page.getByTestId("bill-mode-todo").click();
    await expect(page.locator(".todo-card .todo-payer-crown")).toBeVisible();
    const unpaid = page.locator(".item-row-fp:not(.paid)");
    const count = await unpaid.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(unpaid.nth(i)).toHaveClass(/on/);
    }
  });
});
