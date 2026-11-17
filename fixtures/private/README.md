# Private fixture videos

Put the coach-supplied recordings here (they are git-ignored and must never be committed):

- `20261102172657258.MP4`
- `20261102172738437.MP4`

Then run, from `services/worker` with `ANTHROPIC_API_KEY` set:

    .venv/bin/smarvii-eval

Results are written to `eval-output/<timestamp>/` (also git-ignored).
