import { describe, expect, it } from "vitest";
import * as mod from "@/lib/safe-next";

describe("safe redirect targets", () => {
  it("only allows same-origin relative paths", () => {
    const fn = (Object.values(mod).find((v) => typeof v === "function") as (s: string | null | undefined) => string);
    expect(fn("/app/library")).toBe("/app/library");
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "", null, undefined]) {
      expect(fn(bad as string)).not.toMatch(/evil|javascript/);
      expect(fn(bad as string).startsWith("/")).toBe(true);
    }
  });
});
