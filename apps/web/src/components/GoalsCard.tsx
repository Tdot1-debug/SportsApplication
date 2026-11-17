import { ActionForm } from "@/components/FormStateForm";
import { Badge, Card } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { saveGoal } from "@/app/app/roster/actions";

type Goal = { id: string; sport: string; text: string; status: string; target_date: string | null; created_at: string };
const SPORT_LABEL: Record<string, string> = { strength: "Strength", softball: "Softball", tennis: "Tennis", boxing: "Boxing", other: "Other" };

export function GoalsCard({ playerId, goals, defaultSport }: { playerId: string; goals: Goal[]; defaultSport: string }) {
  return (
    <Card>
      <h2 className="font-semibold">Goals</h2>
      {goals.length ? (
        <ul className="mt-3 space-y-3 text-sm">
          {goals.map((g) => (
            <li key={g.id} className="rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{SPORT_LABEL[g.sport] ?? g.sport}</Badge>
                <Badge tone={g.status === "achieved" ? "ok" : g.status === "dropped" ? "neutral" : "lime"}>{g.status}</Badge>
                {g.target_date ? <span className="text-xs text-muted">target {fmtDate(g.target_date)}</span> : null}
              </div>
              <p className="mt-1">{g.text}</p>
              {g.status === "active" ? (
                <ActionForm action={saveGoal} submitLabel="Mark achieved" submitVariant="secondary" className="mt-2">
                  <input type="hidden" name="player_id" value={playerId} />
                  <input type="hidden" name="goal_id" value={g.id} />
                  <input type="hidden" name="sport" value={g.sport} />
                  <input type="hidden" name="text" value={g.text} />
                  <input type="hidden" name="status" value="achieved" />
                  {g.target_date ? <input type="hidden" name="target_date" value={g.target_date} /> : null}
                </ActionForm>
              ) : null}
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 text-sm text-muted">No goals yet.</p>}
      <ActionForm action={saveGoal} submitLabel="Add goal" submitVariant="secondary" className="mt-4 space-y-2 border-t border-line pt-4">
        <input type="hidden" name="player_id" value={playerId} />
        <div><label className="label" htmlFor="goal-text">New goal</label><input className="field" id="goal-text" name="text" required minLength={3} maxLength={500} placeholder="e.g. Eyes ahead at the bottom of every hinge" /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label" htmlFor="goal-sport">Sport</label>
            <select className="field" id="goal-sport" name="sport" defaultValue={defaultSport}>{Object.entries(SPORT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div><label className="label" htmlFor="goal-date">Target date (optional)</label><input className="field" id="goal-date" name="target_date" type="date" /></div>
        </div>
      </ActionForm>
    </Card>
  );
}
