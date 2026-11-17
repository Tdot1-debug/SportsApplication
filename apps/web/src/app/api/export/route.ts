import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/lib/auth";

export async function GET() {
  const { supabase, membership } = await requireOwnerContext();
  const { data, error } = await supabase.rpc("export_organization", { p_org: membership.org_id });
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="smarvii-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
