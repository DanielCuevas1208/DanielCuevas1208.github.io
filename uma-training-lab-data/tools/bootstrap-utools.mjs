import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_SKILLS_URL,
  DEFAULT_UTOOLS_EFFECT_ROOT,
  STYLES,
  effectFile,
  fetchJson,
  indexSkills,
  loadSkills,
  mechanicsHash,
  normalizeEffectFile,
  parseArgs,
  writeJson,
} from './lib.mjs';
import { fetchUtoolsExpectedEffects } from './utools-live.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', 'skill-effects');
const args = parseArgs(process.argv.slice(2));
const skillsUrl = args['skills-url'] || DEFAULT_SKILLS_URL;
const discoveryRoot = args['discovery-root'] || DEFAULT_UTOOLS_EFFECT_ROOT;
const onlyCourse = args.course ? Number(args.course) : null;
const onlyStyle = args.style || null;

const skills = indexSkills(await loadSkills(skillsUrl));
const localJpRoot = path.join(root, 'jp');
let discovered = [];
if (fs.existsSync(localJpRoot)) {
  discovered = fs.readdirSync(localJpRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
    .map((entry) => Number(entry.name));
}
if (!discovered.length) {
  const index = await fetchJson(`${discoveryRoot}/available.json`);
  discovered = (index.courseIds || []).map(Number);
}

const courseIds = [...new Set(discovered)]
  .filter((id) => Number.isInteger(id) && (!onlyCourse || id === onlyCourse))
  .sort((a, b) => a - b);
const styles = onlyStyle ? [onlyStyle] : STYLES;
let written = 0;
const failures = [];

for (const courseId of courseIds) {
  for (const style of styles) {
    try {
      const source = await fetchUtoolsExpectedEffects(courseId, style);
      const rows = source.rows
        .map((row) => {
          const skill = skills.get(Number(row.id));
          if (!skill) return null;
          return {
            id: Number(row.id),
            expectedEffect: Number(row.expectedEffect),
            minEffect: null,
            medianEffect: null,
            maxEffect: null,
            p05Effect: null,
            p95Effect: null,
            samples: null,
            mechanicsHash: mechanicsHash(skill, 'jp'),
            source: 'utools-live',
            sourceUpdatedAt: source.fetchedAt,
          };
        })
        .filter(Boolean);
      if (rows.length < 10) throw new Error(`Only ${rows.length} live rows matched the current skill catalog`);
      const out = normalizeEffectFile({
        server: 'jp',
        courseId,
        style,
        generatedAt: source.fetchedAt,
        profile: {
          evaluator: 'U-tools live',
          sourceUrl: source.url,
          importedFrom: 'live U-tools race-course effects page',
        },
        skills: rows,
      });
      writeJson(effectFile(root, 'jp', courseId, style), out);
      written += 1;
      process.stdout.write(`jp ${courseId}/${style}: ${rows.length} live U-tools rows\n`);
    } catch (error) {
      failures.push(`${courseId}/${style}: ${error.message}`);
      process.stderr.write(`FAIL ${courseId}/${style}: ${error.message}\n`);
    }
  }
}

process.stdout.write(`wrote ${written} JP course/style files from live U-tools\n`);
if (failures.length) {
  throw new Error(`Live U-tools refresh failed for ${failures.length} course/style pages; refusing a partial refresh`);
}
