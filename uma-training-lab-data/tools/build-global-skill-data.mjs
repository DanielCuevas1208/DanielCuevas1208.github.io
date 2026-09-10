import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_SKILLS_URL,
  isGlobalReleased,
  loadSkills,
  parseArgs,
  serverField,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const skillsUrl = args['skills-url'] || DEFAULT_SKILLS_URL;
const outPath = path.resolve(args.out || args.output || './skill_data.global.json');

const SCENARIO_SCALE_IDS = new Set([
  210011, 210012, 210021, 210022, 210031, 210032, 210041, 210042, 210051, 210052,
  210061, 210062, 210071, 210072, 210081, 210082,
  210261, 210262, 210271, 210272, 210281, 210282, 210291,
]);
const RANDOM_SCALE_IDS = new Set([202031, 202032, 104901111]);

function patchModifier(id, value) {
  if (SCENARIO_SCALE_IDS.has(Number(id))) return Number(value) * 1.2;
  if (RANDOM_SCALE_IDS.has(Number(id))) return Number(value) * 0.04;
  return Number(value);
}

function normalizeEffect(id, effect) {
  if (!effect || typeof effect !== 'object') return null;
  const type = Number(effect.type);
  const value = Number(effect.value);
  if (!Number.isFinite(type) || !Number.isFinite(value) || type === 0) return null;
  return {
    type,
    modifier: patchModifier(id, value),
    target: Number.isFinite(Number(effect.target)) ? Number(effect.target) : 1,
  };
}

function normalizeGroup(id, group) {
  if (!group || typeof group !== 'object') return null;
  const condition = String(group.condition || '');
  if (!condition || condition === '0') return null;
  const effects = (Array.isArray(group.effects) ? group.effects : [])
    .map((effect) => normalizeEffect(id, effect))
    .filter(Boolean);
  if (!effects.length) return null;
  return {
    baseDuration: Number(group.base_time || 0),
    condition,
    effects,
    precondition: String(group.precondition || ''),
  };
}

function addSkillRecord(record) {
  const id = Number(record?.id);
  if (!Number.isInteger(id) || id <= 0) return false;
  const groups = Array.isArray(record.condition_groups) ? record.condition_groups : [];
  const alternatives = groups
    .map((group) => normalizeGroup(id, group))
    .filter(Boolean);
  if (!alternatives.length) return false;
  out[String(id)] = {
    alternatives,
    rarity: Number(record.rarity || 1),
    wisdomCheck: Number(record.activation || 0),
  };
  return true;
}

function resolvedGlobalGene(skill) {
  if (!skill?.gene_version || typeof skill.gene_version !== 'object') return null;
  const override = skill?.loc?.en?.gene_version;
  return {
    ...skill.gene_version,
    ...(override && typeof override === 'object' ? override : {}),
  };
}

const source = await loadSkills(skillsUrl);
const out = {};
let released = 0;
let skipped = 0;
let noGroups = 0;
let genes = 0;

for (const skill of source) {
  const id = Number(skill?.id);
  if (!Number.isInteger(id) || id <= 0) continue;
  if (!isGlobalReleased(skill)) {
    skipped += 1;
    continue;
  }
  released += 1;

  const record = {
    id,
    activation: serverField(skill, 'global', 'activation'),
    condition_groups: serverField(skill, 'global', 'condition_groups'),
    rarity: serverField(skill, 'global', 'rarity'),
  };
  if (!addSkillRecord(record)) noGroups += 1;

  const gene = resolvedGlobalGene(skill);
  if (gene && addSkillRecord(gene)) genes += 1;
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(out)}\n`, 'utf8');
process.stdout.write(`Global skill_data: ${Object.keys(out).length} evaluable records from ${released} released skills (${genes} inherited uniques); ${skipped} unreleased; ${noGroups} top-level skills without usable groups.\n`);
process.stdout.write(`${outPath}\n`);