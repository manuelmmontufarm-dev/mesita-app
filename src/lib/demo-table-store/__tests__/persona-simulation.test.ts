import { describe, expect, it } from "vitest";
import {
  buildPersonaRecommendations,
  runPersonaSwarm,
} from "@/lib/demo-persona-simulation";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

describe("persona simulation — 20 grandpas + 20 children", () => {
  it("runs 40 personas and all join successfully", async () => {
    const token = `persona-${Date.now()}`;
    const results = await runPersonaSwarm(token, 20, 20);

    expect(results).toHaveLength(40);
    const grandpas = results.filter((r) => r.kind === "grandpa");
    const children = results.filter((r) => r.kind === "child");
    expect(grandpas).toHaveLength(20);
    expect(children).toHaveLength(20);

    for (const r of results) {
      expect(r.completedJoin, `${r.personaId} should join`).toBe(true);
    }

    const recommendations = buildPersonaRecommendations(results);
    expect(recommendations.length).toBeGreaterThanOrEqual(8);

    const doc = [
      "# Persona UX Recommendations",
      "",
      "Simulated **20 Grandpa** personas (slow, double-tap, pay-before-claim, wrong equal split)",
      "and **20 Child** personas (fast rename, rapid claim/release, tiny payments).",
      "",
      "## Summary",
      "",
      `- Grandpas joined: ${grandpas.filter((r) => r.completedJoin).length}/20`,
      `- Children joined: ${children.filter((r) => r.completedJoin).length}/20`,
      `- Total friction events: ${results.flatMap((r) => r.frictions).length}`,
      "",
      "## Recommendations",
      "",
      ...recommendations.map((r, i) => `${i + 1}. ${r}`),
      "",
    ].join("\n");

    const outDir = join(process.cwd(), "docs");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "PERSONA_RECOMMENDATIONS.md"), doc, "utf8");
  }, 60_000);
});
