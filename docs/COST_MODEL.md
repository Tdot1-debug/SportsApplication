# Cost model (estimates, not measurements)

No live provider call has been made from this repository yet, so every number here is computed from
configuration and published prices. Replace them with measured values from `analysis_runs` / the evaluation
report once real runs exist. The app records per-request input/output tokens and an estimated cost for every run
(`/app/ops`, and the provenance line on each review).

## Inputs

* Image tokens ≈ `ceil(w/28) × ceil(h/28)` per frame after resizing the long edge to 768 px (`FRAME_LONG_EDGE_PX`).
  * 1600×1200 (4:3 glasses footage) → 768×576 → **588 tokens/frame**.
  * 1920×1080 (16:9 phone) → 768×432 → **448 tokens/frame**.
* Sampling defaults: gym 4 fps, 12 s windows, 3 s overlap; softball 10 fps, 4.8 s windows, 1.2 s overlap;
  ≤ 48 frames per request. About 2,500 text tokens per request (instructions + labels + schema).
* Output: 2,000–6,000 tokens per window including adaptive thinking (assumption; measure it).
* Prices used for estimates (USD per million tokens, input/output): Opus 5.5 $4/$20; Sonnet 5.5 $2/$10.
  Override with `PROVIDER_INPUT_USD_PER_MTOK` / `PROVIDER_OUTPUT_USD_PER_MTOK`.

## Per excerpt (4:3 footage)

| Excerpt | Windows | Frames | Input tokens | Opus 5.5 | Sonnet 5.5 |
|---|---|---|---|---|---|
| Gym 13.8 s (fixture 2) | 2 | 98 | ≈ 63k | $0.33–0.49 | $0.17–0.25 |
| Gym 25.1 s (fixture 1) | 3 | 147 | ≈ 94k | $0.50–0.74 | $0.25–0.37 |
| Gym 60 s | 7 | 343 | ≈ 219k | $1.16–1.72 | $0.58–0.86 |
| Softball 60 s | 17 | 825 | ≈ 528k | $2.79–4.15 | $1.40–2.08 |

A repair attempt re-sends the window, so a run with repairs costs more. Failed windows are still paid.

## Monthly allowance vs proposed prices

| Plan (proposed) | Price | Analysed minutes | Provider cost if all softball on Opus 5.5 | All gym on Opus 5.5 |
|---|---|---|---|---|
| Evaluation | $0 | 30 total | ≈ $84–125 | ≈ $35–52 |
| Founding pilot | $99/mo | 120 | ≈ $335–500 | ≈ $139–206 |
| Standard | $149/mo | 120 | ≈ $335–500 | ≈ $139–206 |

**At the current defaults, a fully used allowance costs more in provider fees than the proposed price.** Before
selling, pick one or more of these levers and re-measure with the evaluation harness:

1. Smaller frames: 512 px long edge cuts image tokens by about 55% (266 tokens/frame at 4:3), at some loss of
   detail for ball contact.
2. Cheaper model: Sonnet 5.5 halves the estimate; check accuracy on the fixtures first.
3. Lower softball sampling (for example 6 fps) or shorter windows only around detected motion.
4. Smaller allowances (for example 30–60 analysed minutes) with manual review for the rest.
5. Lower `ANTHROPIC_EFFORT` to reduce output tokens, if accuracy holds.

Storage (Supabase) and compute (Render worker, Vercel) are small next to provider cost at pilot scale; check the
current plan prices on each vendor's pricing page before quoting.
