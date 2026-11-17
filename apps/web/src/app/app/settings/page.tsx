import Link from "next/link";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ActionForm } from "@/components/FormStateForm";
import { Badge, Card, Notice, PageHeader } from "@/components/ui";
import { requireStaffContext } from "@/lib/auth";
import { billingEnabled } from "@/lib/billing";
import { fmtDate, fmtMinutes } from "@/lib/format";
import {
  activateEvaluation, archiveTeam, createSeason, createTeam, deleteOrganization, inviteCoach, redeemCode, removeMember, revokeInvitation, setCoachTeams, updateOrg,
} from "./actions";

export const metadata = { title: "Team & settings" };

type Usage = Record<string, number | string | boolean | null>;
type Member = { membership_id: string; user_id: string; role: string; display_name: string | null; email: string | null; all_teams: boolean; team_ids: string[]; created_at: string };

export default async function Settings({ searchParams }: { searchParams: Promise<{ billing?: string }> }) {
  const sp = await searchParams;
  const { supabase, user, membership } = await requireStaffContext();
  const owner = membership.role === "owner";
  const personal = membership.org_kind === "personal";
  const org = membership.org_id;
  const [orgRes, teams, members, invites, usage, plans, sub, ent, seasons] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", org).single(),
    supabase.from("teams").select("id, name, sport, archived_at").eq("org_id", org).order("name"),
    supabase.rpc("list_org_members", { p_org: org }),
    owner ? supabase.from("invitations").select("id, email, role, expires_at, accepted_at, revoked_at, created_at").eq("org_id", org).order("created_at", { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
    supabase.rpc("get_usage_summary", { p_org: org }),
    supabase.from("plans").select("*").order("analysis_minutes_per_month"),
    owner ? supabase.from("subscriptions").select("*").eq("org_id", org).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("entitlements").select("plan_code, source, status, starts_at, ends_at").eq("org_id", org).order("created_at", { ascending: false }),
    supabase.from("seasons").select("id, name, starts_on, ends_on").eq("org_id", org).order("created_at", { ascending: false }),
  ]);
  const o = orgRes.data!;
  const u = (usage.data ?? {}) as Usage;
  const ms = (members.data ?? []) as Member[];
  const activeTeams = (teams.data ?? []).filter((t) => !t.archived_at);
  const teamName = new Map((teams.data ?? []).map((t) => [t.id, t.name]));
  const hadEvaluation = (ent.data ?? []).some((e) => e.source === "evaluation");
  const hasFoundingOffer = (ent.data ?? []).some((e) => e.plan_code === "founding_pilot");

  return (
    <>
      <PageHeader
        title={personal ? "Coach access & settings" : "Team & settings"}
        subtitle={personal
          ? (owner ? "Your workspace is private. Coaches you invite can review your videos and approve reports; remove them at any time." : "You are a coach invited into this athlete's personal workspace.")
          : owner ? "You are an organisation owner." : "Some settings can only be changed by an organisation owner."} />
      {sp.billing === "success" ? <div className="mb-4"><Notice tone="ok">Checkout complete. Your plan updates when Stripe confirms the subscription (usually within a minute).</Notice></div> : null}
      {sp.billing === "cancelled" ? <div className="mb-4"><Notice>Checkout cancelled. Nothing was charged.</Notice></div> : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Plan and usage</h2>
          <p className="mt-1 text-sm"><Badge tone="dark">{String(u.plan_name)}</Badge> {u.ends_at ? <span className="text-xs text-muted">ends {fmtDate(String(u.ends_at))}</span> : null}</p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted">Analysed this month</dt><dd>{fmtMinutes(Number(u.analysis_seconds_settled) + Number(u.analysis_seconds_reserved))} / {fmtMinutes(u.analysis_seconds_limit as number)}</dd>
            <dt className="text-muted">Stored footage</dt><dd>{fmtMinutes(u.retained_seconds as number)} / {fmtMinutes(u.retained_seconds_limit as number)}</dd>
            <dt className="text-muted">Teams</dt><dd>{String(u.teams)} / {String(u.max_teams)}</dd>
            <dt className="text-muted">Coaches incl. owner</dt><dd>{String(u.staff)} / {String(u.max_coaches)}</dd>
            <dt className="text-muted">Active players</dt><dd>{String(u.players)} / {String(u.max_players)}</dd>
          </dl>
          <p className="mt-2 text-xs text-muted">Monthly analysis resets on the 1st (UTC). Analysis stops at the limit; there are no overage charges. Limits are provisional pilot allowances.</p>
          {owner ? (
            <div className="mt-4 space-y-4 border-t border-line pt-4">
              {!hadEvaluation && u.plan_code === "manual" ? (
                <div>
                  <p className="text-sm font-medium">30-day evaluation</p>
                  <p className="mb-2 text-xs text-muted">One per organisation. Activating it starts the 30-day clock immediately.</p>
                  <ConfirmButton label="Activate evaluation" confirmLabel="Start 30-day evaluation" action={activateEvaluation} />
                </div>
              ) : null}
              <ActionForm action={redeemCode} submitLabel="Redeem" submitVariant="secondary" className="flex flex-wrap items-end gap-2">
                <div className="grow"><label className="label" htmlFor="code">Pilot access code</label><input className="field" id="code" name="code" autoComplete="off" /></div>
              </ActionForm>
              {billingEnabled() ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Billing (Stripe test mode)</p>
                  {sub.data ? <p className="text-xs text-muted">Subscription: {sub.data.status}{sub.data.current_period_end ? `, renews ${fmtDate(sub.data.current_period_end)}` : ""}{sub.data.cancel_at_period_end ? " (cancels at period end)" : ""}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    {hasFoundingOffer ? <form action="/api/billing/checkout" method="post"><input type="hidden" name="plan" value="founding_pilot" /><button className="rounded-lg bg-lime px-4 py-2 text-sm font-semibold">Founding pilot: $99/mo (proposed)</button></form> : null}
                    <form action="/api/billing/checkout" method="post"><input type="hidden" name="plan" value="standard" /><button className="rounded-lg border border-line px-4 py-2 text-sm font-semibold">Standard: $149/mo (proposed)</button></form>
                    {sub.data?.stripe_customer_id ? <form action="/api/billing/portal" method="post"><button className="rounded-lg px-4 py-2 text-sm underline">Manage billing</button></form> : null}
                  </div>
                  <p className="text-xs text-muted">If a subscription lapses the organisation drops to manual review; recordings are not deleted.</p>
                </div>
              ) : <p className="text-xs text-muted">Online billing is not enabled. Pilot plans are assigned manually.</p>}
            </div>
          ) : null}
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer text-muted">Plan catalogue (provisional)</summary>
            <ul className="mt-1 space-y-1">{(plans.data ?? []).map((p) => <li key={p.code}><strong>{p.name}</strong>: {p.analysis_minutes_per_month} analysed min/month, {p.retained_video_minutes} stored min, {p.max_players} players, {p.max_coaches} coaches{p.price_usd_month !== null ? `, $${p.price_usd_month}/mo proposed` : ""}</li>)}</ul>
          </details>
        </Card>

        <Card>
          <h2 className="font-semibold">{personal ? "People with access" : "Members"}</h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {ms.map((m) => (
              <li key={m.membership_id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">{m.display_name ?? m.email ?? "Member"}</span>
                    {m.email && m.display_name ? <span className="block text-xs text-muted">{m.email}</span> : null}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone={m.role === "owner" ? "dark" : "neutral"}>{m.role}</Badge>
                    {owner && m.user_id !== user.id ? <ConfirmButton label={personal ? "Revoke access" : "Remove"} variant="danger" confirmLabel="Remove access" prompt="Access ends immediately for new requests. Playback links already issued expire within 10 minutes." action={removeMember.bind(null, m.membership_id)} /> : null}
                  </span>
                </div>
                {m.role === "coach" && !personal ? (
                  owner ? (
                    <ActionForm action={setCoachTeams} submitLabel="Update teams" submitVariant="secondary" className="flex flex-wrap items-center gap-3 text-xs">
                      <input type="hidden" name="membership_id" value={m.membership_id} />
                      <label className="flex items-center gap-1"><input type="checkbox" name="all_teams" defaultChecked={m.all_teams} /> All teams</label>
                      {activeTeams.map((t) => <label key={t.id} className="flex items-center gap-1"><input type="checkbox" name="team_ids" value={t.id} defaultChecked={m.team_ids.includes(t.id)} /> {t.name}</label>)}
                    </ActionForm>
                  ) : <p className="text-xs text-muted">{m.all_teams ? "All teams" : m.team_ids.map((t) => teamName.get(t)).join(", ") || "No teams"}</p>
                ) : null}
              </li>
            ))}
          </ul>
          {owner ? (
            <div className="mt-4 border-t border-line pt-4">
              <h3 className="text-sm font-semibold">Invite a coach</h3>
              <ActionForm action={inviteCoach} submitLabel="Create invitation link" submitVariant="secondary">
                <input className="field" name="email" type="email" required placeholder="coach@example.com" aria-label="Coach email" />
                {personal ? null : <div className="flex flex-wrap gap-3 text-xs">
                  <label className="flex items-center gap-1"><input type="checkbox" name="all_teams" /> All teams</label>
                  {activeTeams.map((t) => <label key={t.id} className="flex items-center gap-1"><input type="checkbox" name="team_ids" value={t.id} defaultChecked={activeTeams.length === 1} /> {t.name}</label>)}
                </div>}
                <p className="hint">Coaches use their own login. The link is single-use, expires in 7 days, and only works for this email address.</p>
              </ActionForm>
              {invites.data?.length ? (
                <ul className="mt-3 space-y-1 text-xs">
                  {invites.data.map((i) => {
                    const state = i.accepted_at ? "accepted" : i.revoked_at ? "revoked" : new Date(i.expires_at) < new Date() ? "expired" : "pending";
                    return (
                      <li key={i.id} className="flex items-center justify-between gap-2">
                        <span>{i.email} · {i.role} · {state}</span>
                        {state === "pending" ? <ConfirmButton label="Revoke" variant="secondary" action={revokeInvitation.bind(null, i.id)} /> : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          ) : null}
        </Card>

        {personal ? null : <Card>
          <h2 className="font-semibold">Teams</h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {(teams.data ?? []).map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2">
                <span>{t.name} <span className="text-xs text-muted">{t.sport}</span> {t.archived_at ? <Badge>Archived</Badge> : null}</span>
                {owner ? <ConfirmButton label={t.archived_at ? "Restore" : "Archive"} action={archiveTeam.bind(null, t.id, !t.archived_at)} /> : null}
              </li>
            ))}
          </ul>
          {owner ? (
            <ActionForm action={createTeam} submitLabel="Add team" submitVariant="secondary" className="mt-3 flex flex-wrap items-end gap-2">
              <div className="grow"><label className="label" htmlFor="team-name">Team name</label><input className="field" id="team-name" name="name" required maxLength={120} /></div>
              <select className="field !w-auto" name="sport" aria-label="Team sport"><option value="softball">Softball</option><option value="gym">Gym</option><option value="multi">Multiple</option></select>
            </ActionForm>
          ) : null}
          <h3 className="mt-5 text-sm font-semibold">Seasons</h3>
          {(seasons.data ?? []).length ? <ul className="mt-1 text-sm">{(seasons.data ?? []).map((s) => <li key={s.id}>{s.name}{s.starts_on ? <span className="text-xs text-muted"> · {fmtDate(s.starts_on)}{s.ends_on ? `–${fmtDate(s.ends_on)}` : ""}</span> : null}</li>)}</ul> : <p className="text-xs text-muted">No seasons yet. Seasons are optional labels on roster entries.</p>}
          {owner ? (
            <ActionForm action={createSeason} submitLabel="Add season" submitVariant="secondary" className="mt-2 flex flex-wrap items-end gap-2">
              <div className="grow"><label className="label" htmlFor="season-name">Season name</label><input className="field" id="season-name" name="name" required maxLength={80} placeholder="Spring 2027" /></div>
              <div><label className="label" htmlFor="season-start">Starts</label><input className="field" id="season-start" name="starts_on" type="date" /></div>
              <div><label className="label" htmlFor="season-end">Ends</label><input className="field" id="season-end" name="ends_on" type="date" /></div>
            </ActionForm>
          ) : null}
        </Card>}

        <Card>
          <h2 className="font-semibold">{personal ? "Workspace and retention" : "Organisation, branding and retention"}</h2>
          {owner ? (
            <ActionForm action={updateOrg} submitLabel="Save">
              <div><label className="label" htmlFor="org-name">Organisation name</label><input className="field" id="org-name" name="name" defaultValue={o.name} required /></div>
              <div><label className="label" htmlFor="org-display">Display name on reports</label><input className="field" id="org-display" name="display_name" defaultValue={o.display_name ?? ""} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label" htmlFor="org-accent">Accent colour</label><input className="field" id="org-accent" name="accent_color" defaultValue={o.accent_color ?? ""} placeholder="#C8F53C" pattern="^#[0-9a-fA-F]{6}$" /></div>
                {personal ? <input type="hidden" name="sport" value={o.sport} /> : <div><label className="label" htmlFor="org-sport">Sport</label><select className="field" id="org-sport" name="sport" defaultValue={o.sport}><option value="softball">Softball</option><option value="gym">Gym</option><option value="multi">Multiple</option></select></div>}
              </div>
              <div>
                <label className="label" htmlFor="retention">Recording retention (days)</label>
                <input className="field" id="retention" name="retention_days" type="number" min={30} max={3650} defaultValue={o.retention_days} />
                <p className="hint">Recordings older than this are deleted automatically (originals, derived files and analysis). Hosting-provider backups may persist for their backup window.</p>
              </div>
            </ActionForm>
          ) : <p className="mt-2 text-sm text-muted">Retention: {o.retention_days} days.</p>}
        </Card>

        <Card>
          <h2 className="font-semibold">Data export</h2>
          <p className="mt-1 text-sm text-muted">Download organisation metadata (roster, sessions, review labels, reports, usage and audit log) as JSON. Original recordings download individually from the review page.</p>
          {owner ? <a className="mt-3 inline-block rounded-lg border border-line px-4 py-2 text-sm font-semibold" href="/api/export">Download export</a> : <p className="mt-2 text-xs text-muted">Owner only.</p>}
        </Card>

        <Card>
          <h2 className="font-semibold">Account</h2>
          <p className="mt-1 text-sm">{user.email}</p>
          <p className="mt-2 text-sm"><Link className="underline" href="/forgot-password">Change password</Link></p>
          <form action="/auth/signout" method="post" className="mt-2"><button className="text-sm underline" type="submit">Sign out</button></form>
          {owner ? (
            <div className="mt-4 border-t border-line pt-4">
              <h3 className="text-sm font-semibold text-danger">Delete organisation</h3>
              <p className="mb-2 text-xs text-muted">Revokes all access and permanently deletes every recording and analysis. Type the organisation name to confirm.</p>
              <ActionForm action={deleteOrganization} submitLabel="Delete organisation" submitVariant="danger">
                <input className="field" name="confirm" placeholder={o.name} aria-label="Type organisation name to confirm" autoComplete="off" />
              </ActionForm>
            </div>
          ) : null}
        </Card>
      </div>
    </>
  );
}
