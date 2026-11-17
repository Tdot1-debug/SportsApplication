# Feasibility matrix: what phone and glasses video can support

Written 2026-11-07. Every source below was accessed on 2026-11-07. The machine-readable version of this
document is `registry/capabilities.v1.json` (registry version `2026-11-07.1`), which the app and worker load and
which every analysis run records. Where this file and the registry differ, the registry wins and this file is out
of date.

## Ground rules

1. **Four kinds of output, kept apart.**
   * *Observable events*: something you can point to in the video (a rep, a swing, a punch). Counts come from these.
   * *Qualitative observations*: a visible coaching note tied to a timestamp. Words, never numbers.
   * *Measurements*: a number with a unit (speed, angle, force, distance). Only from a validated method.
   * *Contextual outcomes*: results that depend on things outside the athlete (contact, target hit). Always
     human-confirmed, always shown as "x of y", never as an average or rate that implies a denominator we do not have.
2. **No model-generated measurements.** A language model's estimate of a speed, angle or force is not a measurement.
   The output schema already rejects numeric claims in free text (`services/worker/tests/test_schema.py`), and the
   registry test fails if any metric of kind `measurement` is not `validated`.
3. **Status words mean one thing each**: `validated` (passed an evaluation against thresholds written in advance;
   nothing is validated yet), `experimental` (in the product, labelled, every result reviewed by a person),
   `proposed` (researched and specified, manual review only), `unavailable` (not from phone or glasses video),
   `manual` (no automated analysis).
4. **No identity from appearance.** The reviewer confirms who a recording shows. Multi-person tracking stays experimental.
5. **Glasses footage**: good when a coach films an athlete, poor for the wearer's own technique (the wearer's own body
   is mostly out of frame). Nothing here integrates with any glasses vendor.

## Matrix

| Activity | Training question | Starting metric set | Status | Not available from video (why) | Capture | Key failure cases | Evidence |
|---|---|---|---|---|---|---|---|
| Strength reps (hinge, lunge, squat) | How many reps of each movement, and where? | Rep count; rep start/end times; movement name; timestamped technique notes | Experimental | Bar speed, joint angles in degrees, load, ROM, power (needs calibration or sensors; 2D pose angle agreement varies by view and joint) | Side-on, whole body, steady camera, ≥24 fps, 720p | Camera motion, partial reps, occlusion, several people, vague description | [repnet-2020], [nsca-ptq-10-2], [menychtas-2023], [baldinger-2025] |
| Any described movement | How many times did I do this? | Rep count; rep times | Experimental | Any speed, distance, angle, force | Whole body, steady, one person | Ambiguous "one rep"; abstains when the description is missing | [repnet-2020] |
| Softball hitting | How many swings, which made contact? | Swing count; contact outcome (human-confirmed, x of y) | Experimental | Bat speed, swing time, exit velocity, launch angle (published work used 300 Hz cameras plus calibration; a ~0.2 s swing spans ~6 frames at 30 fps) | Side-on from first/third base side, ≥30 fps | Ball not visible at contact; netting; several hitters | [reilly-boccia-2015] |
| Softball pitching | How many pitches, how many hit the target? | Pitch count; target hit/miss (human-confirmed, x of y) | Experimental | Pitch speed, spin, release angle (radar or calibrated high-speed) | Behind/beside catcher, target in frame | Target out of frame or not described | [reilly-boccia-2015] |
| Tennis strokes | How many strokes, of which kind? | Stroke count; stroke group limited to forehand / backhand / serve; serve technique notes | Proposed | Ball speed, spin, racket speed, line calls; joint angles (2D angles need a perpendicular camera, and agreement varies by view) | Behind baseline or side-on, whole player, 60 fps preferred | Blur at 30 fps; serve vs smash and slice vs volley confused without the ball | [vinyes-mora-2017], [cai-tang-2018], [elliott-2010], [baldinger-2025] |
| Boxing pad, bag, shadow | How many punches, of which kind? | Punch count; punch type (jab, cross, hook, uppercut; lead/rear) for a coach to confirm | Proposed | Punch force and hand speed (validated with glove sensors at 1000 Hz against a force plate, not video); landed punches in sparring (needs two-person tracking) | Fixed camera, front-oblique, one boxer | Arms hidden by bag or partner; fast combinations; two people | [boxingvi-2025], [menzel-potthast-2021] |
| Anything else | Keep the video with notes and a review | None automated | Manual | n/a | Any | n/a | n/a |

### What the evidence says, in short

* **Rep counting is a hard problem even for purpose-built models.** RepNet, a model trained specifically for
  repetition counting, had a mean relative error of 0.364 on real YouTube clips (Countix test set), and about 30% of
  clips were off by more than one count. It also halved counts when two body parts repeated at different rates
  [repnet-2020]. Our acceptance thresholds (see `docs/EVALUATION_PLAN.md`) are set for short, single-person,
  side-on gym clips, which are easier than Countix; they still have to be shown, not assumed.
* **Joint angles from 2D video are not reliable enough to show as numbers.** 2D pose matched marker-based capture
  for large motions but not small ones such as the ankle [menychtas-2023], and joint angles changed significantly with
  camera viewing angle, with poor shoulder agreement [baldinger-2025]. A coaching-grade angle needs a fixed camera
  perpendicular to the motion [elliott-2010] and its own validation. So angles stay `unavailable`.
* **Fine-grained tennis stroke labels are not reliable from RGB video.** On THETIS (indoor, ball not visible),
  12-class accuracy was 47%, rising to 77% for 4 groups and 88% for 3 strokes [vinyes-mora-2017]. A different protocol
  reached 74% on 12 classes [cai-tang-2018]. That is why the proposed tennis set uses only forehand / backhand / serve,
  each confirmed by a person.
* **Boxing punch type has a public dataset but no published baseline accuracy.** BoxingVI has 6,915 labelled punch
  clips in six classes from fixed monocular video [boxingvi-2025]. Until we measure our own accuracy, punch type stays
  `proposed`. Punch force and speed need instrumented gloves [menzel-potthast-2021].
* **Fast ball contact needs high frame rates.** The softball swing study used 300 Hz cameras with a calibration
  distance and reported no validity statistics [reilly-boccia-2015]. Phone or glasses video at 30 fps cannot
  support bat speed or swing time, so the product only counts swings and asks a person to confirm contact.
* **Coaching notes should be few and visible.** The NSCA guidance is to give one or two cues at a time, to model from
  front and side, and to use video as augmented feedback [nsca-ptq-10-2]. Technique notes in the product follow
  that: short, timestamped, worded as observations.

## Order to add activities

1. **Strength reps**: already built (experimental). Next step is evaluation against the pre-written thresholds
   once an API key is available and at least 20 consented, labelled clips exist.
2. **Tennis strokes**: count plus forehand / backhand / serve group. Needs consented clips filmed per the capture
   guide and labelled before any run; then the same evaluation.
3. **Boxing bag and shadow work**: punch count first, punch type second, one boxer in frame only.
4. **Softball**: already experimental for counts and human-confirmed outcomes; no speed metrics planned.

Running, cycling and team sports are later. Pace, distance and heart rate come from GPS or wearables, not video,
so a video product would only add technique notes there. Team sports need multi-athlete tracking, which stays
experimental, and identity is never inferred from appearance.

## Sources (accessed 2026-11-07)

* **[repnet-2020]** Dwibedi, Aytar, Tompson, Sermanet, Zisserman. *Counting Out Time: Class Agnostic Video Repetition
  Counting in the Wild.* CVPR 2020. https://arxiv.org/abs/2006.15418
* **[menychtas-2023]** Menychtas et al. *Gait analysis comparison between manual marking, 2D pose estimation
  algorithms, and 3D marker-based system.* Frontiers in Rehabilitation Sciences 4:1238134 (2023).
  https://doi.org/10.3389/fresc.2023.1238134 (the page text was partly truncated when read; only the abstract,
  method and discussion statements are relied on here)
* **[baldinger-2025]** Baldinger, Reimer, Senner. *Influence of the Camera Viewing Angle on OpenPose Validity in
  Motion Analysis.* Sensors 25(3):799 (2025). https://doi.org/10.3390/s25030799 (abstract only)
* **[vinyes-mora-2017]** Vinyes Mora, Knottenbelt. *Deep Learning for Domain-Specific Action Recognition in Tennis.*
  CVPR Workshops (CVSports) 2017. https://www.doc.ic.ac.uk/~wjk/publications/vinyes-knottenbelt-cvsports-2017.pdf
* **[cai-tang-2018]** Cai, Tang. *RGB Video Based Tennis Action Recognition Using a Deep Weighted Long Short-Term
  Memory.* arXiv:1808.00845 (2018). https://arxiv.org/abs/1808.00845
* **[elliott-2010]** Elliott. *Biomechanical Analysis of Stroke Production.* ITF Coaching & Sport Science Review 50:7–9
  (2010), CC BY 4.0. https://doi.org/10.52383/itfcoaching.v18i50.619
* **[boxingvi-2025]** Kumar et al. *BoxingVI: A Multi-Modal Benchmark for Boxing Action Recognition and Localization.*
  arXiv:2511.16524 (2025). https://arxiv.org/abs/2511.16524
* **[menzel-potthast-2021]** Menzel, Potthast. *Validation of a Unique Boxing Monitoring System.* Sensors 21(21):6947
  (2021). https://doi.org/10.3390/s21216947
* **[reilly-boccia-2015]** Reilly-Boccia, Ficklin, Lund. *Swing Kinematics Described in Division I Female Softball
  Players.* The Sport Journal (2015).
  https://thesportjournal.org/article/swing-kinematics-described-in-division-i-female-softball-players/
* **[nsca-ptq-10-2]** Lincoln, Ill, Ibrahim. *Progressive Strategies for Teaching Fundamental Resistance Training
  Movement Patterns.* NSCA Personal Training Quarterly 10.2 (2023).

Sources tried and not usable: the USA Softball fundamentals page (video only, no text), the England Boxing
"technique" tag page (no technique content), and PMC7739747 (blocked by a captcha). Softball therefore has no cited
coaching source yet. The softball templates already allow draft observations limited to visible stance, stride,
balance and finish, which a coach must accept or delete; they are not grounded in a cited coaching framework, and a
source should be added before they leave experimental. Boxing has no automated analysis.
