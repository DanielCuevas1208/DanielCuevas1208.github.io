# Uma Training Lab · Skill Effect Database

Static course/skill-effect data consumed by the shareable Training Lab HTML.

The browser never simulates races. It reads server-specific precomputed files from this repository. JP values can be bootstrapped from U-tools-derived data, Global can inherit only mechanically identical JP rows, and Global-specific skill versions can then be replaced with direct simulation results.

## Runtime layout

```text
skill-effects/
  manifest.json
  global/<courseId>/<style>.json
  jp/<courseId>/<style>.json
```

`style` is one of `runner`, `leader`, `betweener`, or `chaser`.

Each skill row stores its expected horse-length gain plus a mechanics fingerprint. The HTML compares that fingerprint against the current live skill definition; stale values are hidden instead of silently reused.

## Fast bootstrap

From this folder:

```bash
cd tools
npm run bootstrap:utools
npm run bridge:global
npm run manifest
npm run validate
```

`bootstrap:utools` mirrors the currently extracted U-tools white/common skill values into the JP database.

`bridge:global` copies a JP value into Global only when the current Global and JP mechanical definitions are identical. Existing `simulation` or `manual` Global rows are preserved.

## Recalculate a Global-different skill

Clone or maintain an `uma-skill-tools` checkout whose `data/skill_data.json` represents the server/version you intend to evaluate, then run:

```bash
node evaluate.mjs \
  --server global \
  --tools-dir /path/to/uma-skill-tools-global \
  --course 10606 \
  --style leader \
  --skills 201342,201352 \
  --samples 2000
```

Or put skill IDs in a JSON array / newline-delimited text file and use `--skills-file`.

The driver calls `tools/gain.ts` once per skill with paired control/test RNG, records min/median/mean/max horse-length gain, and merges the result into the existing course/style file. A matching simulation row is skipped on later runs unless `--force` is supplied.

After evaluating:

```bash
node build-manifest.mjs
node validate.mjs
```

Commit `skill-effects/`. Existing downloaded Training Lab HTML copies will use the new values automatically on their next online load.

## Important evaluator note

The upstream `alpha123/uma-skill-tools` checkout is JP-oriented by default. Pointing the driver at it and labeling the output `global` does not magically make its skill definitions Global-correct. For skills whose mechanics differ between servers, use an evaluator checkout/data build containing the intended Global definitions.

## Sources and licensing

The database can contain rows derived from U-tools and rows generated with `alpha123/uma-skill-tools`. Keep `source`, evaluator revision, and timestamps intact so the UI can expose provenance when needed.

`alpha123/uma-skill-tools` is GPL-3.0. If you distribute modified copies of that program, follow its license. This repository stores the generated numeric results and the small orchestration scripts used to build the database.
