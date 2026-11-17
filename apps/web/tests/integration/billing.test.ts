// Stripe subscription -> entitlement mapping against the real database (no network calls to Stripe).
import { beforeAll, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { admin, newOrg, newUser, ok } from "./helpers";
import { applySubscription } from "@/lib/stripe-webhook";

let orgId: string;
const run = crypto.randomUUID().slice(0, 8);
const sub = (status: string) => ({
  id: `sub_test_${run}`, status, customer: `cus_test_${run}`, cancel_at_period_end: false, metadata: { org_id: orgId, plan_code: "standard" },
  items: { data: [{ price: { id: "price_unknown" }, current_period_end: Math.floor(Date.now() / 1000) + 86400 }] },
}) as unknown as Stripe.Subscription;
const active = async () => (await ok(admin.from("entitlements").select("plan_code, source").eq("org_id", orgId).eq("status", "active"))) as { plan_code: string; source: string }[];

beforeAll(async () => {
  const owner = await newUser("billing-owner");
  ({ orgId } = await newOrg(owner, "Billing Org"));
});

describe("subscription entitlements", () => {
  it("grants once, is idempotent on replays, and falls back to manual on cancellation without deleting data", async () => {
    expect(await applySubscription(admin as never, sub("active"))).toBe("granted");
    expect(await applySubscription(admin as never, sub("active"))).toBe("unchanged");
    expect(await active()).toEqual([{ plan_code: "standard", source: "stripe" }]);
    expect(await applySubscription(admin as never, sub("past_due"))).toBe("past_due_grace");
    expect(await active()).toEqual([{ plan_code: "standard", source: "stripe" }]);
    expect(await applySubscription(admin as never, sub("canceled"))).toBe("revoked");
    expect(await active()).toEqual([{ plan_code: "manual", source: "default" }]);
    const subs = (await ok(admin.from("subscriptions").select("status").eq("org_id", orgId))) as { status: string }[];
    expect(subs).toEqual([{ status: "canceled" }]);
  });

  it("stripe event ids are unique so a replayed webhook is detected", async () => {
    const id = `evt_test_${crypto.randomUUID()}`;
    await ok(admin.from("stripe_events").insert({ id, type: "customer.subscription.updated" }));
    const dup = await admin.from("stripe_events").insert({ id, type: "customer.subscription.updated" });
    expect(dup.error?.code).toBe("23505");
  });
});
