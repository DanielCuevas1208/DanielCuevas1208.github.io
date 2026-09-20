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
  readJson,
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

const skillList = await loadSkills(skillsUrl);
const skills = indexSkills(skillList);
const nameToIds = new Map();
function addNameId(name, id, inherited = false) {
  const key = String(name || '').trim();
  const n = Number(id);
  if (!key || !Number.isInteger(n) || n <= 0) return;
  if (!nameToIds.has(key)) nameToIds.set(key, []);
  if (!nameToIds.get(key).some((entry) => Number(entry.id) === n)) {
    nameToIds.get(key).push({ id: n, inherited });
  }
}
for (const skill of skillList) {
  addNameId(skill?.jpname, skill?.id, false);
  if (skill?.gene_version?.id) addNameId(skill?.jpname, skill.gene_version.id, true);
}

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

function sameNumber(a, b) {
  if (a == null && b == null) return true;
  return Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Math.abs(Number(a) - Number(b)) <= 1e-12;
}

for (const courseId of courseIds) {
  for (const style of styles) {
    try {
      const dest = effectFile(root, 'jp', courseId, style);
      const existing = fs.existsSync(dest) ? readJson(dest) : null;
      const oldById = new Map((existing?.skills || []).map((row) => [Number(row.id), row]));
      const source = await fetchUtoolsExpectedEffects(courseId, style, nameToIds);
      let changed = !existing;
      const rows = source.rows
        .map((row) => {
          const skill = skills.get(Number(row.id));
          if (!skill) return null;
          const hash = mechanicsHash(skill, 'jp');
          const old = oldById.get(Number(row.id));
          const unchanged = !!old
            && sameNumber(old.expectedEffect, row.expectedEffect)
            && sameNumber(old.minEffect, row.minEffect)
            && sameNumber(old.maxEffect, row.maxEffect)
            && old.mechanicsHash === hash;
          if (!unchanged) changed = true;
          return {
            id: Number(row.id),
            expectedEffect: Number(row.expectedEffect),
            minEffect: row.minEffect == null ? null : Number(row.minEffect),
            averageEffect: row.averageEffect == null ? null : Number(row.averageEffect),
            medianEffect: row.medianEffect == null ? null : Number(row.medianEffect),
            maxEffect: row.maxEffect == null ? null : Number(row.maxEffect),
            p05Effect: row.p05Effect == null ? null : Number(row.p05Effect),
            p95Effect: row.p95Effect == null ? null : Number(row.p95Effect),
            activationRate: row.activationRate == null ? null : Number(row.activationRate),
            effectiveness: row.effectiveness == null ? null : Number(row.effectiveness),
            displayEfficiency: row.displayEfficiency == null ? null : Number(row.displayEfficiency),
            samples: row.samples == null ? null : Number(row.samples),
            mechanicsHash: hash,
            source: 'utools-live',
            sourceUpdatedAt: unchanged ? (old.sourceUpdatedAt || source.fetchedAt) : source.fetchedAt,
          };
        })
        .filter(Boolean);
      if (rows.length < 10) throw new Error(`Only ${rows.length} live rows matched the current skill catalog`);
      if (existing && rows.length !== (existing.skills || []).length) changed = true;
      const out = normalizeEffectFile({
        server: 'jp',
        courseId,
        style,
        generatedAt: changed ? source.fetchedAt : (existing.generatedAt || source.fetchedAt),
        profile: {
          evaluator: 'U-tools live',
          sourceUrl: source.url,
          importedFrom: source.transport,
          precision: source.transport.startsWith('direct-rsc') ? 'full source precision where available; live reader metadata merged' : 'U-tools displayed precision via reader proxy',
        },
        skills: rows,
      });
      writeJson(dest, out);
      written += 1;
      process.stdout.write(`jp ${courseId}/${style}: ${rows.length} live U-tools rows via ${source.transport}${changed ? ' (changed)' : ''}\n`);
    } catch (error) {
      failures.push(`${courseId}/${style}: ${error.message}`);
      process.stderr.write(`FAIL ${courseId}/${style}: ${error.message}\n`);
    }
  }
}

process.stdout.write(`wrote ${written} JP course/style files from live U-tools\n`);
if (failures.length) throw new Error(`Live U-tools refresh failed for ${failures.length} course/style pages; refusing a partial refresh`);
