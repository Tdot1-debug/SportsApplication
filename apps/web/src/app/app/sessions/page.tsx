import Link from "next/link";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { requireStaffContext } from "@/lib/auth";
import { DRILLS, type DrillType } from "@/lib/drills";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Sessions" };

export default async function Sessions() {
  const { supabase, membership } = await requireStaffContext();
  const { data, error } = await supabase.from("practice_sessions")
    .select("id, title, session_date, drill_type, intended_target, teams!practice_sessions_team_id_fkey(name), videos(count)")
    .eq("org_id", membership.org_id).order("session_date", { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return (
    <>
      <PageHeader title="Sessions" subtitle="Group recordings from one practice." actions={<ButtonLink href="/app/sessions/new">New session</ButtonLink>} />
      {data?.length ? (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
          {data.map((s) => (
            <li key={s.id}>
              <Link href={`/app/sessions/${s.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-paper">
                <span>
                  <span className="font-medium">{s.title}</span>
                  <span className="block text-xs text-muted">{fmtDate(s.session_date)} · {(s.teams as unknown as { name: string })?.name} · {DRILLS[s.drill_type as DrillType]?.short}</span>
                </span>
                <span className="text-xs text-muted">{(s.videos as unknown as { count: number }[])?.[0]?.count ?? 0} recordings</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : <EmptyState title="No sessions yet" action={<ButtonLink href="/app/sessions/new">Create a session</ButtonLink>}>Sessions are optional, but they make the library and reports easier to read.</EmptyState>}
    </>
  );
}
