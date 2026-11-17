import { NextResponse, type NextRequest } from "next/server";
import { requireOwnerContext } from "@/lib/auth";
import { billingEnabled, getStripe, PLAN_PRICES } from "@/lib/billing";
import { publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  if (!billingEnabled()) return NextResponse.json({ error: "Billing is disabled" }, { status: 404 });
  const form = await request.formData();
  const plan = String(form.get("plan") ?? "standard");
  const { supabase, user, membership } = await requireOwnerContext();
  const org = membership.org_id;

  const price = PLAN_PRICES[plan];
  if (!price) return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
  if (plan === "founding_pilot") {
    // The founding offer is only available to organisations an operator assigned it to (pilot code entitlement).
    const { data: ent } = await supabase.from("entitlements").select("id").eq("org_id", org).eq("plan_code", "founding_pilot").limit(1).maybeSingle();
    if (!ent) return NextResponse.json({ error: "The founding offer has not been assigned to this organisation" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: sub } = await admin.from("subscriptions").select("stripe_customer_id").eq("org_id", org).maybeSingle();
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    customer: sub?.stripe_customer_id ?? undefined,
    customer_email: sub?.stripe_customer_id ? undefined : user.email,
    client_reference_id: org,
    metadata: { org_id: org, plan_code: plan },
    subscription_data: { metadata: { org_id: org, plan_code: plan } },
    success_url: `${publicEnv.appUrl}/app/settings?billing=success`,
    cancel_url: `${publicEnv.appUrl}/app/settings?billing=cancelled`,
  });
  return NextResponse.redirect(session.url!, { status: 303 });
}
