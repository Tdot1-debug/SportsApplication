import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ActionForm } from "@/components/FormStateForm";
import { SessionFields } from "@/components/SessionFields";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { VideoStatusBadge } from "@/components/video/StatusBadge";
import { requireStaffContext } from "@/lib/auth";
import { fmtDate, fmtSeconds } from "@/lib/format";
import { listStaff } from "@/lib/staff";
import { deleteSession, saveSession } from "../actions";

export const metadata = { title: "Session" };

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, membership, user } = await requireStaffContext();
  const { data: s } = await supabase.from("practice_sessions").select("*").eq("id", id).maybeSingle();
  if (!s) notFound();
  const [teams, videos, coaches] = await Promise.all([
    supabase.from("teams").select("id, name").eq("org_id", membership.org_id).is("archived_at", null),
    supabase.from("videos").select("id, original_filename, status, upload_status, duration_s, players(display_name)").eq("session_id", id).order("created_at"),
    listStaff(supabase, membership.org_id, user.id),
  ]);
  return (
    <>
      <PageHeader title={s.title} subtitle={`${fmtDate(s.session_date)}${s.intended_target ? ` · Target: ${s.intended_target}` : ""}`}
        actions={<ButtonLink href={`/app/upload?session=${s.id}`} variant="lime">Add recordings</ButtonLink>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <Card>
          <h2 className="font-semibold">Recordings</h2>
          {videos.data?.length ? (
            <ul className="mt-3 divide-y divide-line text-sm">
              {videos.data.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/app/videos/${v.id}`} className="font-medium hover:underline">
                    {(v.players as unknown as { display_name: string } | null)?.display_name ?? "Unassigned"} · {v.original_filename}
                  </Link>
                  <span className="flex items-center gap-2 text-xs text-muted">{fmtSeconds(v.duration_s)} <VideoStatusBadge status={v.status} uploadStatus={v.upload_status} personal={membership.org_kind === "personal"} /></span>
                </li>
              ))}
            </ul>
          ) : <div className="mt-3"><EmptyState title="No recordings in this session" /></div>}
          {s.notes ? <div className="mt-6"><h3 className="text-sm font-semibold">Notes</h3><p className="mt-1 whitespace-pre-wrap text-sm">{s.notes}</p></div> : null}
        </Card>
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 font-semibold">Edit session</h2>
            <ActionForm action={saveSession} submitLabel="Save">
              <input type="hidden" name="id" value={s.id} />
              <SessionFields teams={teams.data ?? []} coaches={coaches} session={s} />
            </ActionForm>
          </Card>
          <Card>
            <h2 className="mb-2 font-semibold">Delete session</h2>
            <p className="mb-3 text-xs text-muted">Recordings stay in the library; they are just no longer grouped.</p>
            <ConfirmButton label="Delete session" variant="danger" action={deleteSession.bind(null, s.id)} />
          </Card>
        </div>
      </div>
    </>
  );
}
