import { describe, expect, it } from "vitest";
import { buildCsp } from "@/lib/csp";

describe("buildCsp", () => {
  it("uses the nonce, blocks framing and allows only the Supabase origin for data", () => {
    const csp = buildCsp("abc123", "https://proj.supabase.co", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self' https://proj.supabase.co wss://proj.supabase.co");
    expect(csp).toContain("media-src 'self' blob: https://proj.supabase.co");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });
  it("allows eval only in development and tolerates a missing URL", () => {
    const csp = buildCsp("n", "", true);
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});
