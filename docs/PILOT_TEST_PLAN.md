# Pilot test plan (first softball program)

Goal: learn whether coach-reviewed suggestions save coaches time without misleading athletes. Success is judged on
coach-confirmed data, not on model output.

## Before the pilot

- [ ] Deployment smoke test passes ([DEPLOYMENT.md](DEPLOYMENT.md) §5) on production URLs.
- [ ] Custom SMTP configured; confirmation and reset emails arrive and links work on phones.
- [ ] Program owner has written recording permission from athletes/guardians; consent status recorded per player.
- [ ] Data-use notice (`/privacy`) reviewed by the program; retention period agreed (default 365 days).
- [ ] Live evaluation run on the two gym fixtures and at least 5 held-out softball clips (hitting and pitching),
      results recorded with cost per analysed minute. Allowance and pricing adjusted per [COST_MODEL.md](COST_MODEL.md).
- [ ] A pilot code created for the program (one redemption).
- [ ] Platform operator account set up; `/app/ops` shows the worker heartbeat.

## Week 1: setup and manual review

1. Owner creates the program, redeems the pilot code, adds teams and the roster (names only; no athlete email
   needed until invitations).
2. Owner invites assistant coaches, each assigned to their team.
3. Coaches upload 3–5 recordings per drill type from the glasses (exported files), **without** automated
   analysis, and label events manually. Record minutes spent per recording.

## Weeks 2–4: suggested labels

1. Coaches request analysis on excerpts (≤ 60 s) and review every suggestion.
2. For each reviewed recording, capture from the app (exportable via `/api/export`):
   * suggested event count vs coach-final count (added / removed / boundary-edited / merged / split);
   * outcome suggestions accepted vs changed vs left unclear;
   * abstentions and their reasons;
   * coach review time (self-reported or timed).
3. Publish reports to a small group of athletes; collect athlete feedback on clarity.

## Measures

| Measure | How | Target to continue |
|---|---|---|
| Count agreement | `abs(suggested − coach-final)` per recording | Median ≤ 1 on gym; report honestly for softball |
| Outcome precision | suggestions not changed by coach / all non-unclear suggestions | Report; no target until measured |
| Abstention usefulness | coach agrees the clip was unclear | Majority |
| Coach time saved | manual-only minutes vs review minutes | Positive for at least one drill type |
| Provider cost per analysed minute | `analysis_runs` / ops page | Within plan margin |
| Incidents | wrong player shown to athlete, draft visible to athlete, access errors | Zero |

## Things to watch

* Fast moments (ball contact, release) at 10 fps sampling: expect `insufficient_temporal_resolution` abstentions.
* Head-worn camera motion and occlusion by the coach's hands.
* Attribution: every report requires a coach confirmation that the recording shows the assigned player.
* Never quote hit rates as batting averages; reports say "confirmed contacts out of assessable swings".

## Exit

Owner can export all data and delete the organisation at any time. Deleted recordings are purged from storage
within minutes; retention removes old recordings automatically.
