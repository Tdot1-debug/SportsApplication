import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { planForPrice } from "@/lib/billing";

type Admin = SupabaseClient<Database>;

const ACTIVE = new Set(["active", "trialing"]);

/** Apply a subscription state to entitlements. Never deletes recordings; lapsed plans fall back to manual review. */
export async function applySubscription(admin: Admin, sub: Stripe.Subscription) {
  const org = sub.metadata?.org_id;
  if (!org) return "missing_org";
  const item = sub.items?.data?.[0];
  const priceId = item?.price?.id ?? null;
  const plan = planForPrice(priceId) ?? sub.metadata?.plan_code ?? null;
  const periodEnd = (item as unknown as { current_period_end?: number })?.current_period_end
    ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  const must = (r: { error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message); // surface failures so the webhook returns 500 and Stripe retries
  };
  must(await admin.from("subscriptions").upsert({
    org_id: org,
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    stripe_subscription_id: sub.id,
    status: sub.status,
    plan_code: plan,
    price_id: priceId,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  }));

  const { data: active } = await admin.from("entitlements").select("id, source, plan_code").eq("org_id", org).eq("status", "active").maybeSingle();
  if (ACTIVE.has(sub.status) && plan) {
    if (active?.source === "stripe" && active.plan_code === plan) return "unchanged";
    if (active) must(await admin.from("entitlements").update({ status: "superseded" }).eq("id", active.id));
    must(await admin.from("entitlements").insert({ org_id: org, plan_code: plan, source: "stripe", note: `Stripe subscription ${sub.id}` }));
    return "granted";
  }
  if (sub.status === "past_due") return "past_due_grace"; // keep access; Stripe retries payment
  if (active?.source === "stripe") {
    must(await admin.from("entitlements").update({ status: "cancelled", ends_at: new Date().toISOString() }).eq("id", active.id));
    must(await admin.from("entitlements").insert({ org_id: org, plan_code: "manual", source: "default", note: `Stripe subscription ${sub.status}` }));
    return "revoked";
  }
  return "ignored";
}

export async function handleStripeEvent(admin: Admin, event: Stripe.Event, stripe: Stripe): Promise<string> {
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.mode !== "subscription" || !s.subscription) return "ignored";
      const sub = await stripe.subscriptions.retrieve(typeof s.subscription === "string" ? s.subscription : s.subscription.id);
      return applySubscription(admin, sub);
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return applySubscription(admin, event.data.object as Stripe.Subscription);
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      const customer = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
      if (customer) await admin.from("subscriptions").update({ status: "past_due", updated_at: new Date().toISOString() }).eq("stripe_customer_id", customer);
      return "payment_failed_recorded";
    }
    default:
      return "ignored";
  }
}
