type Team = { id: string; name: string };
type Player = { display_name?: string; jersey_number?: string | null; position?: string | null; bats_throws?: string | null; notes?: string | null; consent_status?: string; team_id?: string };

export function PlayerFields({ teams, player = {} }: { teams: Team[]; player?: Player }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label" htmlFor="display_name">Player name</label>
        <input className="field" id="display_name" name="display_name" required maxLength={120} defaultValue={player.display_name} />
        <p className="hint">No email or login is required for a roster entry.</p>
      </div>
      <div>
        <label className="label" htmlFor="team_id">Team</label>
        <select className="field" id="team_id" name="team_id" required defaultValue={player.team_id ?? teams[0]?.id}>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="jersey_number">Jersey number</label>
        <input className="field" id="jersey_number" name="jersey_number" maxLength={8} defaultValue={player.jersey_number ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor="position">Position</label>
        <input className="field" id="position" name="position" maxLength={60} defaultValue={player.position ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor="bats_throws">Bats / throws</label>
        <input className="field" id="bats_throws" name="bats_throws" maxLength={20} placeholder="e.g. R/R" defaultValue={player.bats_throws ?? ""} />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="consent_status">Recording consent status</label>
        <select className="field" id="consent_status" name="consent_status" defaultValue={player.consent_status ?? "not_recorded"}>
          <option value="not_recorded">Not recorded</option>
          <option value="on_file">Consent on file</option>
          <option value="not_required">Not required by our program</option>
          <option value="withdrawn">Consent withdrawn</option>
        </select>
        <p className="hint">Recorded for your program&apos;s own process. Smarvii does not verify consent.</p>
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="notes">Coach notes</label>
        <textarea className="field" id="notes" name="notes" rows={3} maxLength={4000} defaultValue={player.notes ?? ""} />
      </div>
    </div>
  );
}
