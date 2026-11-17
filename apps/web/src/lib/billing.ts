import "server-only";
import Stripe from "stripe";

export function billingEnabled() {
  return process.env.NEXT_PUBLIC_BILLING_ENABLED === "true" && Boolean(process.env.STRIPE_SECRET_KEY);
}

let stripe: Stripe | null = null;
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe is not configured");
  if (!key.startsWith("sk_test_") && process.env.STRIPE_ALLOW_LIVE !== "true") {
    throw new Error("Refusing to use a live Stripe key without STRIPE_ALLOW_LIVE=true");
  }
  stripe ??= new Stripe(key, { maxNetworkRetries: 2 });
  return stripe;
}

/** Server-controlled mapping between plan codes and Stripe price IDs. Clients never send price IDs. */
export const PLAN_PRICES: Record<string, string | undefined> = {
  standard: process.env.STRIPE_PRICE_STANDARD,
  founding_pilot: process.env.STRIPE_PRICE_FOUNDING,
};

export function planForPrice(priceId: string | null | undefined): string | null {
  if (!priceId) return null;
  for (const [plan, price] of Object.entries(PLAN_PRICES)) if (price && price === priceId) return plan;
  return null;
}
