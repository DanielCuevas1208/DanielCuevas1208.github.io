import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_SKILLS_URL,
  STYLE_PROFILE,
  STYLES,
  effectFile,
  indexSkills,
  isGlobalReleased,
  loadSkillIds,
  loadSkills,
  mechanicsHash,
  normalizeEffectFile,
  parseArgs,
  readJson,
  writeJson,
} from './lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbRoot = path.resolve(here, '..', 'skill-effects');
const args = parseArgs(process.argv.slice(2));
const toolsDir = args['tools-dir'] ? path.resolve(args['tools-dir']) : null;
const jpDataPath = args['jp-data'] ? path.resolve(args['jp-data']) : null;
const globalDataPath = args['global-data'] ? path.resolve(args['global-data']) : null;
const courseId = Number(args.course);
const style = String(args.style || '').toLowerCase();
const samples = Math.max(1, Number(args.samples || args.nsamples || 2000));
const skillsUrl = args['skills-url'] || DEFAULT_SKILLS_URL;
const force = !!args.force;
const seedBase = Number.isInteger(Number(args.seed)) ? Number(args.seed) >>> 0 : 0x6d2b79f5;

if (!toolsDir) throw new Error('--tools-dir is required');
if (!jpDataPath || !fs.existsSync(jpDataPath)) throw new Error('--jp-data is required');
if (!globalDataPath || !fs.existsSync(globalDataPath)) throw new Error('--global-data is required');
if (!Number.isInteger(courseId) || courseId <= 0) throw new Error('--course is required');
if (!STYLES.includes(style)) throw new Error(`--style must be one of ${STYLES.join(', ')}`);
if (!fs.existsSync(path.join(toolsDir, 'tools', 'gain.ts'))) throw new Error('tools/gain.ts was not found under --tools-dir');

const skillIds = loadSkillIds(args);
if (!skillIds.length) throw new Error('Provide --skills or --skills-file');
const skills = indexSkills(await loadSkills(skillsUrl));
const jpEffectFile = effectFile(dbRoot, 'jp', courseId, style);
if (!fs.existsSync(jpEffectFile)) throw new Error(`JP reference file missing: ${courseId}/${style}`);
const jpEffects = readJson(jpEffectFile);
const jpReference = new Map((jpEffects.skills || []).map((row) => [Number(row.id), row]));

const dest = effectFile(dbRoot, 'global', courseId, style);
const existing = fs.existsSync(dest)
  ? readJson(dest)
  : normalizeEffectFile({ server: 'global', courseId, style, skills: [] });
const rows = new Map((existing.skills || []).map((row) => [Number(row.id), row]));

const sourceHorse = args.horse
  ? path.resolve(args.horse)
  : path.join(toolsDir, 'tools', `${STYLE_PROFILE[style]}.json`);
if (!fs.existsSync(sourceHorse)) throw new Error(`Horse profile not found: ${sourceHorse}`);
const horse = readJson(sourceHorse);
const neutralHorsePath = path.join(toolsDir, `.training-lab-delta-${style}-horse.json`);
writeJson(neutralHorsePath, { ...horse, skills: [] });

const activeSkillData = path.join(toolsDir, 'data', 'skill_data.json');
const jpData = readJson(jpDataPath);
const globalData = readJson(globalDataPath);
let evaluatorRevision = null;
try {
  evaluatorRevision = execFileSync('git', ['-C', toolsDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {}

function derivedSeed(skillId) {
  let x = (seedBase ^ courseId ^ skillId) >>> 0;
  for (const ch of style) x = Math.imul(x ^ ch.charCodeAt(0), 16777619) >>> 0;
  return x >>> 0;
}

function activateData(sourcePath) {
  fs.copyFileSync(sourcePath, activeSkillData);
}

function runGain(skillId, seed) {
  const stdout = execFileSync('npx', [
    'ts-node', 'tools/gain.ts', neutralHorsePath,
    '-c', String(courseId),
    '-s', String(skillId),
    '-N', String(samples),
    '--seed', String(seed),
    '--csv', String(skillId),
  ], {
    cwd: toolsDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const line = stdout.split(/\r?\n/).filter(Boolean).at(-1) || '';
  const cols = line.split(',');
  if (cols.length < 5 || Number(cols[0]) !== skillId) throw new Error(`Unexpected gain.ts output: ${line}`);
  const values = cols.slice(1, 5).map(Number);
  if (!values.every(Number.isFinite)) throw new Error(`Non-numeric gain.ts output: ${line}`);
  return {
    min: values[0],
    max: values[1],
    median: values[2],
    mean: values[3],
    samplePolicy: cols.at(-1) || null,
  };
}

const candidates = [];
for (const id of skillIds) {
  const skill = skills.get(Number(id));
  const ref = jpReference.get(Number(id));
  if (!skill || !isGlobalReleased(skill) || !ref || !Number.isFinite(Number(ref.expectedEffect))) continue;
  if (!Object.prototype.hasOwnProperty.call(jpData, String(id))) continue;
  if (!Object.prototype.hasOwnProperty.call(globalData, String(id))) continue;
  const hash = mechanicsHash(skill, 'global');
  const current = rows.get(Number(id));
  if (!force && current?.source === 'utools-delta-global' && current.mechanicsHash === hash && Number(current.samples) === samples && current.evaluatorRevision === evaluatorRevision) continue;
  candidates.push({ id: Number(id), skill, ref, hash, seed: derivedSeed(Number(id)) });
}

const jpRuns = new Map();
const globalRuns = new Map();
const failures = new Map();

activateData(jpDataPath);
for (const item of candidates) {
  try {
    jpRuns.set(item.id, runGain(item.id, item.seed));
  } catch (error) {
    failures.set(item.id, `JP simulation: ${error.message}`);
  }
}

activateData(globalDataPath);
for (const item of candidates) {
  if (failures.has(item.id)) continue;
  try {
    globalRuns.set(item.id, runGain(item.id, item.seed));
  } catch (error) {
    failures.set(item.id, `Global simulation: ${error.message}`);
  }
}

let completed = 0;
for (const item of candidates) {
  if (failures.has(item.id)) {
    process.stderr.write(`FAIL ${item.id}: ${failures.get(item.id)}\n`);
    continue;
  }
  const jpRun = jpRuns.get(item.id);
  const globalRun = globalRuns.get(item.id);
  const correction = globalRun.mean - jpRun.mean;
  const expectedEffect = Number(item.ref.expectedEffect) + correction;
  if (!Number.isFinite(expectedEffect)) {
    failures.set(item.id, 'non-finite corrected effect');
    process.stderr.write(`FAIL ${item.id}: non-finite corrected effect\n`);
    continue;
  }
  rows.set(item.id, {
    id: item.id,
    expectedEffect,
    minEffect: null,
    medianEffect: null,
    maxEffect: null,
    samples,
    seed: item.seed,
    mechanicsHash: item.hash,
    source: 'utools-delta-global',
    methodVersion: 1,
    referenceExpectedEffect: Number(item.ref.expectedEffect),
    referenceSourceUpdatedAt: item.ref.sourceUpdatedAt || null,
    simulatedJpEffect: jpRun.mean,
    simulatedGlobalEffect: globalRun.mean,
    simulatedDelta: correction,
    jpSamplePolicy: jpRun.samplePolicy,
    globalSamplePolicy: globalRun.samplePolicy,
    evaluator: 'alpha123/uma-skill-tools',
    evaluatorRevision,
    evaluatedAt: new Date().toISOString(),
  });
  completed += 1;
  process.stdout.write(`${item.id}: ${Number(item.ref.expectedEffect).toFixed(4)} + (${globalRun.mean.toFixed(4)} - ${jpRun.mean.toFixed(4)}) = ${expectedEffect.toFixed(4)}\n`);
}

const out = normalizeEffectFile({
  server: 'global',
  courseId,
  style,
  generatedAt: new Date().toISOString(),
  profile: {
    evaluator: 'mixed',
    globalDifferenceMethod: 'U-tools JP expected effect + paired simulator(Global - JP)',
    evaluatorRevision,
    samples,
  },
  skills: [...rows.values()],
});
writeJson(dest, out);
process.stdout.write(`done: ${completed} corrected, ${skillIds.length - candidates.length} not applicable/current, ${failures.size} failed\n`);
if (failures.size) process.exitCode = 1;
