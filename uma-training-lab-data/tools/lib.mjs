import fs from 'node:fs';
import path from 'node:path';

export const STYLES = ['runner', 'leader', 'betweener', 'chaser'];
export const STYLE_PROFILE = Object.freeze({
  runner: 'nige',
  leader: 'senkou',
  betweener: 'sasi',
  chaser: 'oikomi',
});

export const GAMETORA_MANIFEST_URL = 'https://gametora.com/data/manifests/umamusume.json';
export const GAMETORA_DATA_ROOT = 'https://gametora.com/data/umamusume';
export const DEFAULT_SKILLS_URL = 'gametora:skills';
export const DEFAULT_UTOOLS_EFFECT_ROOT = 'https://raw.githubusercontent.com/Tsuyuchan-jp/umamusume-inherit-skill-list/master/data/effects';

export function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

export function fnv1a64(text) {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const byte of Buffer.from(String(text), 'utf8')) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

export function isGlobalReleased(skill) {
  return !!skill && !(Array.isArray(skill.unreleased) && skill.unreleased.includes('en'));
}

export function serverField(skill, server, key) {
  if (!skill) return undefined;
  if (server === 'global') {
    if (!isGlobalReleased(skill)) return undefined;
    const loc = skill?.loc?.en;
    if (loc && Object.prototype.hasOwnProperty.call(loc, key)) return loc[key];
  }
  return skill[key];
}

export function serverMechanics(skill, server) {
  if (!skill) return null;
  if (server === 'global' && !isGlobalReleased(skill)) return null;
  const keys = ['activation', 'condition_groups', 'rarity', 'type'];
  const out = {};
  for (const key of keys) out[key] = serverField(skill, server, key);
  return out;
}

export function mechanicsHash(skill, server) {
  const mechanics = serverMechanics(skill, server);
  return mechanics ? fnv1a64(stableStringify(mechanics)) : null;
}

export function mechanicsEqualAcrossServers(skill) {
  const jp = serverMechanics(skill, 'jp');
  const global = serverMechanics(skill, 'global');
  return !!jp && !!global && stableStringify(jp) === stableStringify(global);
}

export async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'uma-training-lab-skill-db/1.0',
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

export async function loadGameToraDataset(key) {
  const manifest = await fetchJson(GAMETORA_MANIFEST_URL);
  const hash = manifest?.[key];
  if (!hash) throw new Error(`GameTora manifest has no dataset: ${key}`);
  return fetchJson(`${GAMETORA_DATA_ROOT}/${key}.${hash}.json`);
}

export async function loadSkills(url = DEFAULT_SKILLS_URL) {
  const data = url === 'gametora:skills'
    ? await loadGameToraDataset('skills')
    : await fetchJson(url);
  if (!Array.isArray(data)) throw new Error('skills source did not return an array');
  return data;
}

export function inheritedSkillRecord(parent) {
  const gene = parent?.gene_version;
  if (!gene || typeof gene !== 'object' || !Number.isInteger(Number(gene.id))) return null;

  const parentEn = parent?.loc?.en || {};
  const geneEn = parentEn?.gene_version && typeof parentEn.gene_version === 'object'
    ? parentEn.gene_version
    : {};
  const translation = {};
  for (const key of ['name_en', 'enname', 'desc_en', 'endesc']) {
    if (Object.prototype.hasOwnProperty.call(parentEn, key)) translation[key] = parentEn[key];
  }

  return {
    ...parent,
    ...gene,
    id: Number(gene.id),
    inherited: true,
    parentSkillId: Number(parent.id),
    fullUniqueId: Number(parent.id),
    versions: [Number(parent.id), ...(parent.versions || []).map(Number)],
    loc: {
      ...(parent.loc || {}),
      en: { ...translation, ...geneEn },
    },
  };
}

export function indexSkills(skills) {
  const out = new Map();
  for (const raw of skills || []) {
    if (!raw || !Number.isInteger(Number(raw.id))) continue;
    const skill = { ...raw };
    const gene = inheritedSkillRecord(skill);
    if (gene) skill.geneVersionId = Number(gene.id);
    out.set(Number(skill.id), skill);
    if (gene) out.set(Number(gene.id), gene);
  }
  return out;
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      out._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next == null || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

export function parseIdList(text) {
  return [...new Set(
    String(text || '')
      .split(/[\s,]+/)
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0),
  )];
}

export function loadSkillIds(args) {
  if (args.skills) return parseIdList(args.skills);
  if (!args['skills-file']) return [];
  const file = path.resolve(args['skills-file']);
  const raw = fs.readFileSync(file, 'utf8').trim();
  if (!raw) return [];
  if (raw.startsWith('[')) {
    const parsed = JSON.parse(raw);
    return [...new Set(parsed.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  }
  return parseIdList(raw);
}

export function effectFile(root, server, courseId, style) {
  return path.join(root, server, String(courseId), `${style}.json`);
}

export function normalizeEffectFile({ server, courseId, style, profile = {}, skills = [], generatedAt = new Date().toISOString() }) {
  return {
    schemaVersion: 1,
    server,
    courseId: Number(courseId),
    style,
    generatedAt,
    profile,
    skills: skills
      .map((row) => ({ ...row, id: Number(row.id) }))
      .filter((row) => Number.isInteger(row.id) && row.id > 0)
      .sort((a, b) => Number(b.expectedEffect) - Number(a.expectedEffect) || a.id - b.id),
  };
}
