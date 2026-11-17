type Opt = { id: string; name: string };
type S = { team_id?: string; session_date?: string; title?: string; drill_type?: string; intended_target?: string | null; notes?: string | null; coach_user_id?: string | null };

export function SessionFields({ teams, coaches, session = {} }: { teams: Opt[]; coaches: Opt[]; session?: S }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label" htmlFor="title">Title</label>
        <input className="field" id="title" name="title" required maxLength={160} defaultValue={session.title} placeholder="e.g. Tuesday tee work" />
      </div>
      <div>
        <label className="label" htmlFor="session_date">Date</label>
        <input className="field" id="session_date" name="session_date" type="date" required defaultValue={session.session_date ?? today} />
      </div>
      <div>
        <label className="label" htmlFor="team_id">Team</label>
        <select className="field" id="team_id" name="team_id" required defaultValue={session.team_id}>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="coach_user_id">Coach</label>
        <select className="field" id="coach_user_id" name="coach_user_id" defaultValue={session.coach_user_id ?? undefined}>
          {coaches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="drill_type">Drill</label>
        <select className="field" id="drill_type" name="drill_type" defaultValue={session.drill_type ?? "softball_hitting"}>
          <option value="softball_hitting">Softball hitting</option>
          <option value="softball_pitching">Underhand softball pitching</option>
          <option value="gym_test">Gym test</option>
          <option value="general_movement">Any movement (describe it)</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="intended_target">Target or movement description (optional)</label>
        <input className="field" id="intended_target" name="intended_target" maxLength={200} defaultValue={session.intended_target ?? ""} placeholder="e.g. low and away corner, or: kettlebell swing, one rep = hips back to lockout" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="notes">Notes</label>
        <textarea className="field" id="notes" name="notes" rows={4} maxLength={8000} defaultValue={session.notes ?? ""} />
      </div>
    </div>
  );
}
