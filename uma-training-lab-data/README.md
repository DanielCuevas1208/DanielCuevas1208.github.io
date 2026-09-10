# Uma Training Lab · Skill Effect Database

Static course/skill-effect data consumed by the shareable Training Lab HTML.

The browser never simulates races. It reads precomputed server-specific files from this repository. JP values are imported from the U-tools effective-skill dataset. Global uses the same value when the skill's effect mechanics are identical; when Global and JP differ, the database keeps U-tools as the anchor and calculates only the JP→Global mechanical change with the modern Umalator engine from `kachi-dev/uma-tools`.

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
- `utools-delta-global`: Global differs mechanically. The published value is currently anchored to the U-tools JP value and corrected by paired JP/Global runs in modern Umalator using the same horse profile, sample count, seed, and course.
- `manual`: exceptional reviewed overrides.

Each corrected row also stores both the raw simulated difference and JP→Global ratio. That lets the calibration method be improved later without losing the underlying paired measurements.

The modern evaluator is `kachi-dev/uma-tools/uma-skill-tools`, not the older standalone `alpha123/uma-skill-tools`. Rows made by the old evaluator are deliberately treated as stale and must be regenerated before validation succeeds.

Legacy absolute `simulation` rows are purged by `bridge-global` and are no longer publication candidates.

## Automatic refresh

`.github/workflows/refresh-uma-skill-effects.yml` runs daily and can also be dispatched manually. It:

1. imports current U-tools JP values;
2. resolves current Global/JP skill definitions from the live skill source;
3. bridges mechanically identical Global rows directly;
4. finds missing/stale Global-different rows, including rows created by an obsolete evaluator;
5. clones the current Global Umalator fork from `kachi-dev/uma-tools`;
6. generates evaluator-format JP and Global skill data from the current source;
7. calculates paired JP→Global changes at 2,000 samples;
8. rebuilds the manifest;
9. validates both database structure and every published mechanics hash/evaluator version;
10. commits `skill-effects/` only if the published data changed.

Unchanged rows are never re-simulated.

## Manual refresh

From `uma-training-lab-data/tools`:

```bash
npm run bootstrap:utools
npm run bridge:global
npm run pending
```

If pending Global differences exist, clone `kachi-dev/uma-tools` and install the evaluator under its `uma-skill-tools` directory:

```bash
git clone https://github.com/kachi-dev/uma-tools.git /tmp/uma-tools
cd /tmp/uma-tools/uma-skill-tools
npm ci
```

Generate both server datasets:

```bash
node build-skill-data.mjs --server jp --out /tmp/skill_data.jp.json
node build-skill-data.mjs --server global --out /tmp/skill_data.global.json
```

Run the pending matrix:

```bash
node evaluate-pending.mjs \
  --tools-dir /tmp/uma-tools/uma-skill-tools \
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

`build-skill-data.mjs` converts the current normalized GameTora/UmaTools skill data into the format expected by Umalator's skill engine, including Global localization/mechanics overrides and inherited unique (`gene_version`) definitions. The small hard-coded modifier adjustments mirror the upstream `make_skill_data.pl` transformations required by the evaluator's internal representation.

The paired evaluator uses a neutral copy of the strategy profile with preset skills removed so the JP and Global runs differ only in the target skill definition.

## Calibration

`.github/workflows/benchmark-uma-skill-effects.yml` compares modern Umalator against mechanically identical U-tools reference rows. The benchmark reports raw error plus a multiplicative-only and affine calibration fit. This exists specifically to decide empirically whether Global corrections are better expressed as an additive difference, a proportional change, or another calibrated mapping rather than guessing.

## Validation

`validate.mjs` checks the static schema and manifest. `validate-live.mjs` additionally checks each published row against the current live skill source, including Global release state, mechanics hash, and the required modern evaluator/method version for Global-different rows. A changed skill or obsolete evaluator result therefore becomes missing/stale until a fresh compatible or corrected value is available.

## Sources and licensing

JP course-effect values originate from U-tools via the static extraction maintained by `Tsuyuchan-jp/umamusume-inherit-skill-list`. Current normalized skill definitions are loaded from the UmaTools/GameTora-derived skill feed. Global-difference calculations use the Umalator engine in `kachi-dev/uma-tools/uma-skill-tools`.

The Umalator/uma-skill-tools code is GPL-3.0. The workflow clones it as an evaluator and publishes numeric derived results plus provenance. If a modified copy of that GPL program is distributed, follow its license terms.
