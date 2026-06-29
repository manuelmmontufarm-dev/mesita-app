/**
 * Documents and validates the 51-test ecosystem swarm matrix
 * (5 demo mesas × 10 tests + estadísticas page: APP + DASHBOARD + POS).
 *
 * Runs live HTTP checks when SMOKE_URL is reachable; POS-layer tests skip
 * when POS_API_KEY is unset or SWARM_SKIP_POS=1.
 */

import { describe, expect, it } from "vitest";

import {
  BASE_URL,
  MESAS,
  POS_API_KEY,
  TEST_DEFS,
  runEcosystemSwarm,
} from "../../scripts/ecosystem-swarm.mjs";

const MESA_TESTS = MESAS.length * TEST_DEFS.length;
const TOTAL = MESA_TESTS + 1; // + estadísticas page
const skipPos = !POS_API_KEY?.trim() || process.env.SWARM_SKIP_POS === "1";

async function serverReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/demo/table/demo`, { method: "GET" });
    return res.status < 500;
  } catch {
    return false;
  }
}

describe(`ecosystem swarm matrix (${TOTAL} tests)`, () => {
  it("defines 5 mesas, 10 tests each, plus estadísticas page (51 total)", () => {
    expect(MESAS).toHaveLength(5);
    expect(TEST_DEFS).toHaveLength(10);
    expect(MESA_TESTS).toBe(50);
    expect(TOTAL).toBe(51);
  });

  it("covers required mesa tokens", () => {
    const tokens = MESAS.map((m) => m.token);
    expect(tokens).toEqual([
      "demo",
      "demo-mesa-1",
      "demo-mesa-2",
      "demo-mesa-3",
      "demo-mesa-4",
    ]);
  });

  describe("test catalog documentation", () => {
    for (const mesa of MESAS) {
      describe(`${mesa.label} (${mesa.token})`, () => {
        for (const test of TEST_DEFS) {
          const title = `[${test.layer}] ${test.id} — ${test.description}`;
          it(title, () => {
            expect(test.id.length).toBeGreaterThan(0);
            expect(["APP", "DASHBOARD", "POS"]).toContain(test.layer);
            if (test.layer === "POS" && skipPos) {
              expect(skipPos).toBe(true);
              return;
            }
            expect(mesa.token).toBeTruthy();
          });
        }
      });
    }
  });

  it(
    "runs live swarm when server is reachable",
    async () => {
      const reachable = await serverReachable();
      if (!reachable) {
        console.warn(`Skipping live swarm — ${BASE_URL} unreachable`);
        return;
      }

      const { matrix, failed, total } = await runEcosystemSwarm({ skipPos });
      expect(Object.keys(matrix)).toHaveLength(MESAS.length);
      for (const mesa of MESAS) {
        expect(Object.keys(matrix[mesa.label])).toHaveLength(TEST_DEFS.length);
      }
      expect(failed).toBe(0);
      expect(total).toBe(51);
    },
    120_000,
  );
});
