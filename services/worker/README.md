# Smarvii Sports worker

Python service that claims jobs from the Postgres queue (`probe`, `analyze`, `purge`), runs FFmpeg/FFprobe,
and calls the analysis provider through `analysis/adapter.py`. See `docs/ARCHITECTURE.md` and `docs/TESTING.md`.

    uv venv .venv && uv pip install --python .venv/bin/python -e . pytest ruff
    .venv/bin/pytest -q
    cp .env.example .env   # fill in values, then:
    set -a; . ./.env; set +a; .venv/bin/smarvii-worker
