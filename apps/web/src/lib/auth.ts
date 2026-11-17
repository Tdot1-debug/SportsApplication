import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const ORG_COOKIE = "smarvii_org";

export type Role = "owner" | "coach" | "athlete";
export type OrgKind = "team" | "personal";
export type MembershipSummary = { id: string; org_id: string; role: Role; all_teams: boolean; org_name: string; org_kind: OrgKind };

export const getUser = cache(async function getUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
});

export async function requireUser(next = "/app") {
  const { supabase, user } = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return { supabase, user };
}

export const listMemberships = cache(async function listMemberships(): Promise<{ user: NonNullable<Awaited<ReturnType<typeof getUser>>["user"]>; memberships: MembershipSummary[] }> {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("memberships")
    .select("id, org_id, role, all_teams, organizations!inner(name, kind, deleted_at)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .is("organizations.deleted_at", null)
    .order("created_at");
  if (error) throw new Error(error.message);
  return {
    user,
    memberships: (data ?? []).map((m) => ({
      id: m.id,
      org_id: m.org_id,
      role: m.role as Role,
      all_teams: m.all_teams,
      org_name: (m.organizations as unknown as { name: string }).name,
      org_kind: (m.organizations as unknown as { kind: OrgKind }).kind,
    })),
  };
});

/**
 * Resolve the active staff organisation. The cookie is only a preference: it is honoured only when
 * the signed-in user holds an active owner/coach membership there. RLS still enforces every query.
 */
export async function requireStaffContext() {
  const { supabase } = await requireUser();
  const { user, memberships } = await listMemberships();
  const staff = memberships.filter((m) => m.role === "owner" || m.role === "coach");
  if (staff.length === 0) {
    if (memberships.some((m) => m.role === "athlete")) redirect("/athlete");
    redirect("/onboarding");
  }
  const preferred = (await cookies()).get(ORG_COOKIE)?.value;
  const active = staff.find((m) => m.org_id === preferred) ?? staff[0];
  return { supabase, user, membership: active, memberships: staff, allMemberships: memberships };
}

export async function requireOwnerContext() {
  const ctx = await requireStaffContext();
  if (ctx.membership.role !== "owner") redirect("/app/dashboard?denied=owner");
  return ctx;
}
