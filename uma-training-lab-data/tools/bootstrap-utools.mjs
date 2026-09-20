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
import { fetchUtoolsCharacterEffects } from './utools-characters.mjs';

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
const parentToGene = new Map();
const fullUniqueByCardId = new Map();

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
  const geneId = Number(skill?.gene_version?.id);
  if (Number.isInteger(geneId) && geneId > 0) {
    addNameId(skill?.jpname, geneId, true);
    parentToGene.set(Number(skill.id), geneId);
    for (const cardId of Array.isArray(skill?.char) ? skill.char : []) {
      const n = Number(cardId);
      if (!Number.isInteger(n) || n <= 0) continue;
      if (!fullUniqueByCardId.has(n)) fullUniqueByCardId.set(n, []);
      fullUniqueByCardId.get(n).push(skill);
    }
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
const failures = [];

function sameNumber(a, b) {
  if (a == null && b == null) return true;
  return Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Math.abs(Number(a) - Number(b)) <= 1e-12;
}

function rowMetricsEqual(a, b) {
  if (!a || !b) return false;
  return [
    'expectedEffect', 'minEffect', 'averageEffect', 'medianEffect', 'maxEffect',
    'p05Effect', 'p95Effect', 'activationRate', 'effectiveness', 'displayEfficiency',
    'characterTotalEffect', 'evolved1Effect', 'evolved2Effect', 'recoveryAdjustment',
  ].every((key) => sameNumber(a[key], b[key]));
}

function baseUtoolsRow(row, skill, source, old = null) {
  const hash = mechanicsHash(skill, 'jp');
  const unchanged = !!old && rowMetricsEqual(old, row) && old.mechanicsHash === hash;
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
    source: row.source || 'utools-live',
    sourceUpdatedAt: unchanged ? (old.sourceUpdatedAt || source.fetchedAt) : source.fetchedAt,
    ...(row.characterCardId == null ? {} : { characterCardId: Number(row.characterCardId) }),
    ...(row.characterLabel == null ? {} : { characterLabel: String(row.characterLabel) }),
    ...(row.characterTotalEffect == null ? {} : { characterTotalEffect: Number(row.characterTotalEffect) }),
    ...(row.evolved1Effect == null ? {} : { evolved1Effect: Number(row.evolved1Effect) }),
    ...(row.evolved2Effect == null ? {} : { evolved2Effect: Number(row.evolved2Effect) }),
    ...(row.recoveryAdjustment == null ? {} : { recoveryAdjustment: Number(row.recoveryAdjustment) }),
  };
}

function resolveCharacterUnique(row) {
  const candidates = fullUniqueByCardId.get(Number(row.cardId)) || [];
  if (candidates.length === 1) return candidates[0];
  if (!candidates.length) return null;
  return candidates.find((skill) => Number(skill?.rarity) >= 3) || candidates[0];
}

for (const courseId of courseIds) {
  let characterSource = null;
  try {
    characterSource = await fetchUtoolsCharacterEffects(courseId);
  } catch (error) {
    failures.push(`${courseId}/characters: ${error.message}`);
    process.stderr.write(`FAIL ${courseId}/characters: ${error.message}\n`);
  }

  for (const style of styles) {
    try {
      const dest = effectFile(root, 'jp', courseId, style);
      const existing = fs.existsSync(dest) ? readJson(dest) : null;
      const oldById = new Map((existing?.skills || []).map((row) => [Number(row.id), row]));
      const source = await fetchUtoolsExpectedEffects(courseId, style, nameToIds);
      let changed = !existing;
      const byId = new Map();

      for (const rawRow of source.rows) {
        const rawId = Number(rawRow.id);
        const id = parentToGene.get(rawId) || rawId;
        const skill = skills.get(id);
        if (!skill) continue;
        const row = { ...rawRow, id };
        const old = oldById.get(id);
        const built = baseUtoolsRow(row, skill, source, old);
        if (!old || !rowMetricsEqual(old, built) || old.mechanicsHash !== built.mechanicsHash || old.source !== built.source) changed = true;
        byId.set(id, built);
        if (skill?.inherited || Number(skill?.__geneParentId) > 0) inheritedRows += 1;
      }

      if (characterSource) {
        for (const character of characterSource.rows.filter((row) => row.style === style)) {
          const skill = resolveCharacterUnique(character);
          if (!skill) continue;
          const id = Number(skill.id);
          const row = {
            id,
            expectedEffect: Number(character.fullUniqueEffect),
            minEffect: null,
            averageEffect: null,
            medianEffect: null,
            maxEffect: null,
            p05Effect: null,
            p95Effect: null,
            activationRate: null,
            effectiveness: null,
            displayEfficiency: null,
            samples: null,
            source: 'utools-character-live',
            characterCardId: Number(character.cardId),
            characterLabel: character.label,
            characterTotalEffect: Number(character.totalEffect),
            evolved1Effect: character.evolved1Effect,
            evolved2Effect: character.evolved2Effect,
            recoveryAdjustment: character.recoveryAdjustment,
          };
          const old = oldById.get(id);
          const built = baseUtoolsRow(row, skill, characterSource, old);
          if (!old || !rowMetricsEqual(old, built) || old.mechanicsHash !== built.mechanicsHash || old.source !== built.source) changed = true;
          byId.set(id, built);
          fullUniqueRows += 1;
        }
      }

      const rows = [...byId.values()];
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
          characterSourceUrl: characterSource?.url || null,
          characterImportedFrom: characterSource?.transport || null,
          precision: source.transport.startsWith('direct-rsc')
            ? 'full source precision where available; live reader ranges/activation metadata merged'
            : 'U-tools displayed precision via reader proxy',
          uniqueValueMethod: 'Inherited uniques come from the strategy course list; full character uniques use the first character-exclusive component from the live U-tools course character ranking.',
        },
        skills: rows,
      });
      writeJson(dest, out);
      written += 1;
      process.stdout.write(`jp ${courseId}/${style}: ${rows.length} live U-tools rows via ${source.transport}; ${rows.filter((row) => row.source === 'utools-character-live').length} full uniques${changed ? ' (changed)' : ''}\n`);
    } catch (error) {
      failures.push(`${courseId}/${style}: ${error.message}`);
      process.stderr.write(`FAIL ${courseId}/${style}: ${error.message}\n`);
    }
  }
}

process.stdout.write(`wrote ${written} JP course/style files from live U-tools; indexed ${inheritedRows} inherited-unique row placements and ${fullUniqueRows} full-unique row placements\n`);
if (failures.length) throw new Error(`Live U-tools refresh failed for ${failures.length} source/course/style pages; refusing a partial refresh`);
