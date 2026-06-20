import { beforeAll, describe, expect, it } from "vitest";

import { SCENARIOS } from "@/lib/demo-scenarios";
import { resetDemoTableState } from "@/lib/demo-table-store";

/**
 * Multi-user concurrency stress harness — Layer 1 (vitest, store-level).
 *
 * Every scenario runs REP_COUNT times with random timing jitter to expose race
 * conditions that would be invisible in a single deterministic run.
 *
 * If a scenario fails even 1/REP_COUNT times → that's a real bug. We collect
 * all failures across all reps before reporting, so one run pinpoints every
 * flaky scenario at once instead of forcing the loop to find them one by one.
 */

const REP_COUNT = 20;

beforeAll(() => {
  // Defensive: force in-memory store path (don't accidentally hit Upstash during fuzz).
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

describe("multi-user scenarios — 20 scenarios × 20 reps with jitter", () => {
  for (const scenario of SCENARIOS) {
    it(
      `[${scenario.id}] ${scenario.name}`,
      async () => {
        const failures: Array<{ rep: number; error: string }> = [];

        for (let rep = 0; rep < REP_COUNT; rep++) {
          // Unique token per (scenario, rep) — perfect isolation, no cross-test bleed.
          const token = `fuzz-${scenario.id}-rep-${rep}-${Math.random().toString(36).slice(2, 8)}`;
          await resetDemoTableState(token); // clean slate

          try {
            await scenario.run(token);
          } catch (err) {
            failures.push({
              rep,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        if (failures.length > 0) {
          const summary = failures
            .slice(0, 5) // show first 5 to keep noise low
            .map((f) => `  rep ${f.rep}: ${f.error}`)
            .join("\n");
          const more = failures.length > 5 ? `\n  ... and ${failures.length - 5} more` : "";
          expect.fail(
            `scenario ${scenario.id} failed ${failures.length}/${REP_COUNT} reps:\n${summary}${more}`,
          );
        }
      },
      30_000, // generous timeout — 20 reps × ~50ms jitter each
    );
  }
});
