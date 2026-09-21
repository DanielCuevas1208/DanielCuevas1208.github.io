# U-tools factor score reproduction

The Training Lab factor scorer has two deliberately separate modes.

## U-tools exact

For imported U-tools factor-event pages, the Lab reproduces the public U-tools client formula using the serialized inputs from that same page. The recovered implementation is in `tools/utools-factor-score-exact.mjs`.

The current exact dataset covers:

- 2026-08 League of Heroes — course 10504 (`loh2`)
- 2026-09 Champions Meeting — course 10603 (`chm`)
- 2026-10 Champions Meeting — course 10808 (`chm3`)
- 2026-09 Special Champions Meeting — course 11203 (`chm2`)

All four running styles are stored for each event. The parity test currently checks 16 pages × 48 displayed cards = 768 ranking rows and requires exact score, rank, and top-set equality.

### Recovered score

For a candidate support card:

1. Start with a baseline of 10.
2. Score the literal hint table.
   - Each skill uses U-tools' factor-page `courseEffectSet`.
   - If a skill has a base-family ID, use the base skill's effect and multiply by 1.5.
   - If the selected main deck already supplies that skill or base family, multiply the skill value by 0.5.
   - Per hint-table slot, use `1000 × score / cumulative acquisition point`.
   - Tables shorter than seven are padded to seven with `-2` entries.
   - Average the table, multiply by 7, except Hint Lv Up 4 uses 8.4.
   - Apply the reciprocal hint-point discount for Hint Lv 0–5: 1, 0.9, 0.8, 0.7, 0.65, 0.6.
3. Score event skills.
   - Random-event rate: 0.5.
   - Sequence-event rate: 0.9.
   - Event scalar: 750.
   - For each event choice, average granted hint levels by skill across possible result outcomes and use occurrence frequency as the drop rate.
   - Keep the highest-scoring choice per event.
4. Round component totals to two decimals exactly as U-tools does.
5. `total = round2(10 + hint + random + sequence)`.
6. Exclude cards already in the selected main deck, sort descending by total, display the first 48.

The factor-page `point` field is cumulative acquisition cost. For a gold/base-linked skill this can include prerequisite skill costs and is not interchangeable with the skill's ordinary listed SP cost.

## Unsupported courses

The normal Training Lab course-effect database must not be substituted for U-tools' factor-page `courseEffectSet` and labeled exact.

A cross-check on course 11203 showed that factor-page effects are not a simple rounded or constant-scaled version of the normal course-effect data. Typical skills are often near a ~1.05 ratio, but conditional skills can diverge much more. Therefore unsupported courses use the existing Lab estimate and are explicitly labeled as an approximation.

## Data files

- `model.json` — recovered formula metadata and validation
- `exact-pages/index.json` — exact course/style availability
- `exact-pages/<event>/<style>.json` — serialized U-tools factor inputs
- `rankings/<event>/<style>.json` — live U-tools top-48 ranking oracle
- `utools-support-cards.json` — current generic support metadata snapshot
- `support-events.json` — legacy GameTora event topology used by the earlier fitted approximation; not required by the exact scorer

## Verification

Run:

```bash
cd uma-training-lab-data/tools
node verify-utools-factor-exact.mjs
```

The verification is also enforced by the factor-score CI workflow.
