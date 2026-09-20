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
const nameToId = new Map();
for (const skill of skills.values()) {
  for (const rawName of [skill?.jpname, skill?.name_en, skill?.enname]) {
    const name = String(rawName || '').trim();
    if (name && !nameToId.has(name)) nameToId.set(name, Number(skill.id));
  }
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
let inheritedRows = 0;
let fullUniqueRows = 0;
let reusedExisting = 0;
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
      const source = await fetchUtoolsExpectedEffects(courseId, style, nameToId);
      let changed = !existing;
      const rows = source.rows
        .map((row) => {
          const skill = skills.get(Number(row.id));
          if (!skill) return null;
          if (skill.__geneParentId) inheritedRows += 1;
          else if (Number(skill.rarity) >= 3 && skill.gene_version) fullUniqueRows += 1;
          const hash = mechanicsHash(skill, 'jp');
          const old = oldById.get(Number(row.id));
          const unchanged = !!old
            && sameNumber(old.expectedEffect, row.expectedEffect)
            && sameNumber(old.minEffect, row.minEffect)
            && sameNumber(old.maxEffect, row.maxEffect)
            && sameNumber(old.averageEffect, row.averageEffect)
            && sameNumber(old.medianEffect, row.medianEffect)
            && sameNumber(old.activationRate, row.activationRate)
            && sameNumber(old.pointEfficiency, row.pointEfficiency)
            && old.mechanicsHash === hash;
          if (!unchanged) changed = true;
          return {
            id: Number(row.id),
            expectedEffect: Number(row.expectedEffect),
            minEffect: row.minEffect == null ? null : Number(row.minEffect),
            averageEffect: row.averageEffect == null ? null : Number(row.averageEffect),
            medianEffect: row.medianEffect == null ? null : Number(row.medianEffect),
            maxEffect: row.maxEffect == null ? null : Number(row.maxEffect),
            activationRate: row.activationRate == null ? null : Number(row.activationRate),
            pointEfficiency: row.pointEfficiency == null ? null : Number(row.pointEfficiency),
            p05Effect: null,
            p95Effect: null,
            samples: null,
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
          precision: source.transport.startsWith('direct-rsc') ? 'full source precision where exposed; reader-enriched rows retain displayed precision' : 'U-tools displayed precision via reader proxy',
        },
        skills: rows,
      });
      writeJson(dest, out);
      written += 1;
      process.stdout.write(`jp ${courseId}/${style}: ${rows.length} live U-tools rows via ${source.transport}${changed ? ' (changed)' : ''}\n`);
    } catch (error) {
      const dest = effectFile(root, 'jp', courseId, style);
      if (fs.existsSync(dest)) {
        reusedExisting += 1;
        process.stderr.write(`WARN ${courseId}/${style}: ${error.message}; retaining previously validated file\n`);
        continue;
      }
      failures.push(`${courseId}/${style}: ${error.message}`);
      process.stderr.write(`FAIL ${courseId}/${style}: ${error.message}\n`);
    }
  }
}

process.stdout.write(`wrote ${written} JP course/style files from live U-tools; indexed ${fullUniqueRows} full-unique row occurrence(s) and ${inheritedRows} inherited-unique row occurrence(s); reused ${reusedExisting} previous file(s) after transient fetch failures\n`);
if (failures.length) throw new Error(`Live U-tools refresh failed for ${failures.length} course/style pages with no previous file available; refusing an incomplete database`);
if (reusedExisting > 8) throw new Error(`Live U-tools refresh had ${reusedExisting} transient page failures; refusing to publish a refresh with too much stale source data`);
