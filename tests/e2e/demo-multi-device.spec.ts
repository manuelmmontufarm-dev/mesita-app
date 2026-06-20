import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

/**
 * Layer 2 — multi-device UI e2e for /pay/demo.
 *
 * Each test opens N BrowserContexts (isolated localStorage + cookies = separate
 * deviceIds), navigates to the demo, and exercises a subset of the 20 scenarios
 * that have observable UI behavior. Layer 1 (vitest) already covers all 20 at
 * the store level, including store-only ones.
 */

const DEMO_URL = "/pay/demo?debug=1";
const RESET_ENDPOINT = "/api/demo/table/demo";

async function resetDemoTable(request: import("@playwright/test").APIRequestContext) {
  await request.post(RESET_ENDPOINT, {
    data: { action: "reset" },
    headers: { "Content-Type": "application/json" },
  });
}

async function openDevice(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  return { ctx, page };
}

async function enterTable(page: Page): Promise<void> {
  await page.goto(DEMO_URL, { waitUntil: "domcontentloaded" });

  // Race: lobby CTA vs bill stage. Whichever wins tells us where the hook landed.
  const entryBtn = page.getByTestId("demo-enter-table-btn");
  const billInput = page.getByTestId("bill-name-input");
  await Promise.race([
    entryBtn.waitFor({ state: "visible", timeout: 30_000 }),
    billInput.waitFor({ state: "visible", timeout: 30_000 }),
  ]);

  // If lobby is visible, tap it. If bill is already there, skip.
  if (await entryBtn.isVisible()) {
    await entryBtn.click();
    await billInput.waitFor({ state: "visible", timeout: 30_000 });
  }
}

async function readPayerAvatarInitials(page: Page): Promise<string> {
  const av = page.getByTestId("payer-avatar-initials");
  await av.waitFor({ state: "visible", timeout: 5_000 });
  return (await av.textContent())?.trim() ?? "";
}

test.beforeEach(async ({ request }) => {
  await resetDemoTable(request);
});

test.describe("Layer 2 — multi-device UI", () => {
  test("[01] 3 devices enter → Persona 1/2/3 unique labels", async ({ browser }) => {
    const a = await openDevice(browser);
    const b = await openDevice(browser);
    const c = await openDevice(browser);

    try {
      // Stagger slightly so Persona N assignment is deterministic per test run
      await enterTable(a.page);
      await enterTable(b.page);
      await enterTable(c.page);

      const labelA = await readPayerAvatarInitials(a.page);
      const labelB = await readPayerAvatarInitials(b.page);
      const labelC = await readPayerAvatarInitials(c.page);

      const labels = [labelA, labelB, labelC].sort();
      expect(labels).toEqual(["P1", "P2", "P3"]);
    } finally {
      await a.ctx.close();
      await b.ctx.close();
      await c.ctx.close();
    }
  });

  test("[03] Refresh same device → keeps Persona 1 via deviceId", async ({ browser }) => {
    const d = await openDevice(browser);
    try {
      await enterTable(d.page);
      const labelBefore = await readPayerAvatarInitials(d.page);
      expect(labelBefore).toBe("P1");

      // Reload — sessionStorage entered flag survives reload (not a "navigate"),
      // so the hook re-joins via stored guestId+deviceId and lands in bill again.
      await d.page.reload({ waitUntil: "domcontentloaded" });
      // Don't waitForLoadState("networkidle") — SSE keeps a persistent connection
      // open forever, so networkidle never resolves.
      await d.page.getByTestId("bill-name-input").waitFor({ state: "visible", timeout: 30_000 });

      const labelAfter = await readPayerAvatarInitials(d.page);
      expect(labelAfter).toBe("P1");
    } finally {
      await d.ctx.close();
    }
  });

  test("[09] Typed name appears in pill; placeholder gone", async ({ browser }) => {
    const d = await openDevice(browser);
    try {
      await enterTable(d.page);
      const input = d.page.getByTestId("bill-name-input");

      // Before typing, the avatar should still show "Persona 1" (Fix B)
      const labelBefore = await readPayerAvatarInitials(d.page);
      expect(labelBefore).toBe("P1");

      await input.fill("Manuel");
      // Wait for the pill to reflect the typed name (debounce 150ms + render tick)
      await d.page.waitForTimeout(300);
      const labelAfter = await readPayerAvatarInitials(d.page);
      expect(labelAfter).toBe("MA");

      // Value of input field
      expect(await input.inputValue()).toBe("Manuel");
    } finally {
      await d.ctx.close();
    }
  });

  test("[10] Two devices, two names — no cross-contamination", async ({ browser }) => {
    const a = await openDevice(browser);
    const b = await openDevice(browser);
    try {
      await enterTable(a.page);
      await enterTable(b.page);

      await a.page.getByTestId("bill-name-input").fill("Manuel");
      await b.page.getByTestId("bill-name-input").fill("Ale");
      await a.page.waitForTimeout(400);
      await b.page.waitForTimeout(400);

      expect(await readPayerAvatarInitials(a.page)).toBe("MA");
      expect(await readPayerAvatarInitials(b.page)).toBe("AL");
    } finally {
      await a.ctx.close();
      await b.ctx.close();
    }
  });

  test("[16] Reset by one device → others see reset (next enter restarts numbering)", async ({
    browser,
    request,
  }) => {
    const a = await openDevice(browser);
    try {
      await enterTable(a.page);
      expect(await readPayerAvatarInitials(a.page)).toBe("P1");

      // Simulate reset via API (the success-screen button uses the same endpoint)
      await resetDemoTable(request);

      // Within poll interval (500ms) + a margin, the hook kicks back to lobby.
      const entryBtn = a.page.getByTestId("demo-enter-table-btn");
      await entryBtn.waitFor({ state: "visible", timeout: 10_000 });

      // Re-entry — same device (localStorage deviceId persists), fresh table → Persona 1
      await entryBtn.click();
      await a.page
        .getByTestId("bill-name-input")
        .waitFor({ state: "visible", timeout: 30_000 });
      expect(await readPayerAvatarInitials(a.page)).toBe("P1");
    } finally {
      await a.ctx.close();
    }
  });

  test("[20] Input is empty by default — placeholder visible, avatar shows Persona 1", async ({
    browser,
  }) => {
    const d = await openDevice(browser);
    try {
      await enterTable(d.page);
      const input = d.page.getByTestId("bill-name-input");

      // Fix B regression: input must NOT be pre-filled with the Persona N label
      expect(await input.inputValue()).toBe("");
      // The placeholder must be one of the rotating "Ej: …" strings
      const placeholder = await input.getAttribute("placeholder");
      expect(placeholder).toMatch(/^Ej:/);

      // Avatar shows seat initials when input is empty
      expect(await readPayerAvatarInitials(d.page)).toBe("P1");
    } finally {
      await d.ctx.close();
    }
  });
});
