import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/lib/auth";
import { billingEnabled, getStripe } from "@/lib/billing";
import { publicEnv } from "@/lib/env";

export async function POST() {
  if (!billingEnabled()) return NextResponse.json({ error: "Billing is disabled" }, { status: 404 });
  const { supabase, membership } = await requireOwnerContext();
  const org = membership.org_id;
  // RLS: subscriptions are only visible to owners of the org.
  const { data: sub } = await supabase.from("subscriptions").select("stripe_customer_id").eq("org_id", org).maybeSingle();
  if (!sub?.stripe_customer_id) return NextResponse.json({ error: "No billing account for this organisation" }, { status: 404 });
  const portal = await getStripe().billingPortal.sessions.create({ customer: sub.stripe_customer_id, return_url: `${publicEnv.appUrl}/app/settings` });
  return NextResponse.redirect(portal.url, { status: 303 });
}
