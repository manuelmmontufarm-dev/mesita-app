/**
 * Rigorous swarm harness — 20 scenarios × 10 diners × 20 reps each.
 * All 20 must pass every rep before we ship.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { RIGOROUS_SWARM_SCENARIOS } from "@/lib/demo-rigorous-swarm";
import { resetDemoTableState } from "@/lib/demo-table-store";

const REP_COUNT = 20;

beforeAll(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

describe(`rigorous swarm — ${RIGOROUS_SWARM_SCENARIOS.length} scenarios × 10 diners × ${REP_COUNT} reps`, () => {
  for (const scenario of RIGOROUS_SWARM_SCENARIOS) {
    it(
      `[${scenario.id}] ${scenario.name}`,
      async () => {
        const failures: Array<{ rep: number; error: string }> = [];

        for (let rep = 0; rep < REP_COUNT; rep++) {
          const token = `rigor-${scenario.id}-rep-${rep}-${Math.random().toString(36).slice(2, 8)}`;
          await resetDemoTableState(token);

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
            .slice(0, 5)
            .map((f) => `  rep ${f.rep}: ${f.error}`)
            .join("\n");
          const more =
            failures.length > 5 ? `\n  ... and ${failures.length - 5} more` : "";
          expect.fail(
            `scenario ${scenario.id} failed ${failures.length}/${REP_COUNT} reps:\n${summary}${more}`,
          );
        }
      },
      120_000,
    );
  }
});
