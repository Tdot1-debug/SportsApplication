import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DRILLS } from "@/lib/drills";
import { REGISTRY, activitiesForSports, activityForTemplate } from "@/lib/capabilities";

describe("capability registry", () => {
  it("the web copy matches registry/capabilities.v1.json (run node registry/sync.mjs)", () => {
    const src = JSON.parse(readFileSync(path.resolve(__dirname, "../../../../registry/capabilities.v1.json"), "utf8"));
    expect(REGISTRY).toEqual(src);
  });

  it("maps every drill template to exactly one activity, and analysable drills to automated statuses", () => {
    for (const [template, d] of Object.entries(DRILLS)) {
      const a = activityForTemplate(template);
      expect(a, template).toBeDefined();
      expect(["experimental", "validated"].includes(a!.status)).toBe(d.analysable);
    }
  });

  it("never offers an unvalidated measurement", () => {
    for (const a of REGISTRY.activities) for (const m of a.metrics) if (m.kind === "measurement") expect(m.status).toBe("validated");
  });

  it("shows tennis and boxing as proposed rather than an empty screen", () => {
    const ids = activitiesForSports(["tennis", "boxing"]).map((a) => `${a.id}:${a.status}`);
    expect(ids).toContain("tennis.strokes:proposed");
    expect(ids).toContain("boxing.punches:proposed");
    expect(ids).toContain("manual.other:manual");
  });
});
