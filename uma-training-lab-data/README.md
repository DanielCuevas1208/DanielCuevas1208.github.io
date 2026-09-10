# Uma Training Lab · Skill Effect Database

Static course/skill-effect data consumed by the shareable Training Lab HTML.

The browser never simulates races. It reads precomputed server-specific files from this repository. JP values are imported from the U-tools effective-skill dataset. Global uses the same value when the skill's effect mechanics are identical; when Global and JP differ, the database keeps U-tools as the anchor and calculates only the JP→Global mechanical delta with `uma-skill-tools`.

## Runtime layout

```text
skill-effects/
  manifest.json
  global/<courseId>/<style>.json
  jp/<courseId>/<style>.json
```

`style` is one of `runner`, `leader`, `betweener`, or `chaser`.

Every row stores a mechanics fingerprint. The downloaded HTML computes the same fingerprint from the current live skill data and rejects a stale value instead of silently displaying it.

Skill cost is deliberately not part of the effect-value fingerprint: a cost-only balance change affects SP efficiency, which the UI can recompute from live data, but does not change horse-length gain.

## Value provenance

Global rows can have these sources:

- `utools-compatible`: current Global and JP effect mechanics are identical, so the U-tools value transfers directly.
- `utools-delta-global`: Global differs mechanically. The published value is `U-tools JP expectedEffect + (simulated Global gain - simulated JP gain)` using the same evaluator, horse profile, sample count, and deterministic seed for both simulations.
- `manual`: exceptional reviewed overrides.

The delta method is intentional. An absolute `uma-skill-tools` run does not reproduce U-tools' values closely enough to mix the two scales directly because the tools make different baseline/activation assumptions. Taking only the simulated server-to-server difference cancels most of that shared-model bias while preserving U-tools as the reference scale.

Legacy absolute `simulation` rows are purged by `bridge-global` and are no longer publication candidates.

## Automatic refresh

`.github/workflows/refresh-uma-skill-effects.yml` runs daily and can also be dispatched manually. It:

1. imports current U-tools JP values;
2. resolves current Global/JP skill definitions from the live skill source;
3. bridges mechanically identical Global rows directly;
4. finds only missing/stale Global-different rows;
5. generates evaluator-format JP and Global skill data from the current source;
6. calculates U-tools-anchored JP→Global deltas at 2,000 samples;
7. rebuilds the manifest;
8. validates both database structure and every published mechanics hash;
9. commits `skill-effects/` only if the published data changed.

Unchanged rows are never re-simulated.

## Manual refresh

From `uma-training-lab-data/tools`:

```bash
npm run bootstrap:utools
npm run bridge:global
npm run pending
```

If pending Global differences exist, clone/install `alpha123/uma-skill-tools`, then generate both server datasets:

```bash
node build-skill-data.mjs --server jp --out /tmp/skill_data.jp.json
node build-skill-data.mjs --server global --out /tmp/skill_data.global.json
```

Run the pending delta matrix:

```bash
node evaluate-pending.mjs \
  --tools-dir /path/to/uma-skill-tools \
  --jp-data /tmp/skill_data.jp.json \
  --global-data /tmp/skill_data.global.json \
  --samples 2000
```

Then:

```bash
npm run manifest
npm run validate
npm run validate:live
```

Commit `skill-effects/`. Existing downloaded HTML copies will consume the new values on their next online load.

## Data conversion

`build-skill-data.mjs` converts the current normalized GameTora/UmaTools skill data into the format expected by `uma-skill-tools`, including Global localization/mechanics overrides and inherited unique (`gene_version`) definitions. The small hard-coded modifier adjustments mirror the upstream `make_skill_data.pl` transformations required by the evaluator's internal representation.

The delta evaluator uses a neutral copy of the strategy profile with preset skills removed so the JP and Global runs differ only in the target skill definition.

## Validation

`validate.mjs` checks the static schema and manifest. `validate-live.mjs` additionally checks each published row against the current live skill source, including Global release state and mechanics hash. A changed skill therefore becomes missing/stale until a fresh compatible or delta-corrected value is available.

## Sources and licensing

JP course-effect values originate from U-tools via the static extraction maintained by `Tsuyuchan-jp/umamusume-inherit-skill-list`. Current normalized skill definitions are loaded from the UmaTools/GameTora-derived skill feed. Global-difference calculations use `alpha123/uma-skill-tools`.

`alpha123/uma-skill-tools` is GPL-3.0. The workflow clones it as an evaluator and publishes numeric derived results plus provenance. If a modified copy of that GPL program is distributed, follow its license terms.
