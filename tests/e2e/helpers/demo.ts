import type { APIRequestContext, Browser, BrowserContext, Page } from "@playwright/test";

export function demoUrlForToken(token: string, debug = true): string {
  const path =
    token === "demo"
      ? "/pay/demo"
      : `/pay/demo/${token.replace(/^demo-/, "")}`;
  return debug ? `${path}?debug=1` : path;
}

export async function resetDemoTable(
  request: APIRequestContext,
  token: string,
): Promise<void> {
  await request.post(`/api/demo/table/${token}`, {
    data: { action: "reset" },
    headers: { "Content-Type": "application/json" },
  });
}

export async function openDevice(
  browser: Browser,
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  return { ctx, page };
}

export async function enterTable(page: Page, token: string): Promise<void> {
  await page.goto(demoUrlForToken(token), { waitUntil: "domcontentloaded" });

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
