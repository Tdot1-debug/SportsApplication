import { AppNav } from "@/components/AppNav";
import { requireStaffContext } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user, membership, memberships, allMemberships } = await requireStaffContext();
  const alsoAthlete = allMemberships.some((m) => m.role === "athlete");
  const accountItems = [
    ...(alsoAthlete ? [{ href: "/athlete", label: "My athlete view" }] : []),
    { href: "/account", label: "Account" },
  ];
  const { data: op } = await supabase.from("platform_operators").select("user_id").eq("user_id", user.id).maybeSingle();
  const personal = membership.org_kind === "personal";
  let selfPlayer: string | null = null;
  if (personal) {
    const { data } = await supabase.from("players").select("id").eq("org_id", membership.org_id).not("self_user_id", "is", null).maybeSingle();
    selfPlayer = data?.id ?? null;
  }
  const items = personal ? [
    { href: "/app/dashboard", label: "My training" },
    { href: "/app/upload", label: "Upload" },
    { href: "/app/library", label: "Video library" },
    { href: "/app/sessions", label: "Sessions" },
    ...(selfPlayer ? [{ href: `/app/roster/${selfPlayer}`, label: "Profile, goals & history" }] : []),
    { href: "/app/settings", label: membership.role === "owner" ? "Coach access & settings" : "Settings" },
    { href: "/app/guide", label: "Upload guide" },
    { href: "/app/capabilities", label: "What we analyse" },
    ...(op ? [{ href: "/app/ops", label: "Operations" }] : []),
    ...accountItems,
  ] : [
    { href: "/app/dashboard", label: "Dashboard" },
    { href: "/app/upload", label: "Upload" },
    { href: "/app/library", label: "Video library" },
    { href: "/app/sessions", label: "Sessions" },
    { href: "/app/roster", label: "Roster" },
    { href: "/app/compare", label: "Compare" },
    { href: "/app/settings", label: "Team & settings" },
    { href: "/app/guide", label: "Upload guide" },
    { href: "/app/capabilities", label: "What we analyse" },
    ...(op ? [{ href: "/app/ops", label: "Operations" }] : []),
    ...accountItems,
  ];
  return (
    <div className="lg:flex">
      <AppNav
        items={items}
        orgName={membership.org_name}
        orgs={memberships.map((m) => ({ id: m.org_id, name: m.org_name }))}
        activeOrg={membership.org_id}
        email={user.email ?? ""}
        roleLabel={personal ? (membership.role === "owner" ? "Personal workspace" : "Invited coach (personal workspace)") : membership.role === "owner" ? "Organisation owner" : "Coach"}
      />
      <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
