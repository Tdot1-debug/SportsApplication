import { NextResponse, type NextRequest } from "next/server";
import { getStripe } from "@/lib/billing";
import { handleStripeEvent } from "@/lib/stripe-webhook";
import { createAdminClient } from "@/lib/supabase/admin";

// Stripe webhook: signature verified against the raw body; each event id processed once.
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: "Billing not configured" }, { status: 404 });
  const sig = request.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  const body = await request.text();
  const stripe = getStripe();
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { error: dup } = await admin.from("stripe_events").insert({ id: event.id, type: event.type });
  if (dup) {
    const { data: prior } = await admin.from("stripe_events").select("processed_at").eq("id", event.id).maybeSingle();
    if (prior?.processed_at) return NextResponse.json({ received: true, duplicate: true });
  }
  try {
    const outcome = await handleStripeEvent(admin, event, stripe);
    await admin.from("stripe_events").update({ processed_at: new Date().toISOString(), outcome }).eq("id", event.id);
    return NextResponse.json({ received: true, outcome });
  } catch (e) {
    await admin.from("stripe_events").update({ outcome: `error: ${e instanceof Error ? e.message : "unknown"}` }).eq("id", event.id);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
