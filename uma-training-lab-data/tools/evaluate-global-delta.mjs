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
const EVALUATOR = 'kachi-dev/uma-tools/uma-skill-tools';
const METHOD_VERSION = 4;
const RUNNER = '.training-lab-current-gain.ts';

if (!toolsDir) throw new Error('--tools-dir is required');
if (!jpDataPath || !fs.existsSync(jpDataPath)) throw new Error('--jp-data is required');
if (!globalDataPath || !fs.existsSync(globalDataPath)) throw new Error('--global-data is required');
if (!Number.isInteger(courseId) || courseId <= 0) throw new Error('--course is required');
if (!STYLES.includes(style)) throw new Error(`--style must be one of ${STYLES.join(', ')}`);
if (!fs.existsSync(path.join(toolsDir, RUNNER))) throw new Error(`${RUNNER} was not found under --tools-dir`);

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

const DEFAULT_ENV = Object.freeze({ season: 'spring', weather: 'sunny', ground: 'good', time: 'midday', grade: 'g1' });
const ENV_FIELDS = Object.freeze({
  season: { arg: 'season', values: { 1: 'spring', 2: 'summer', 3: 'autumn', 4: 'winter', 5: 'sakura' } },
  weather: { arg: 'weather', values: { 1: 'sunny', 2: 'cloudy', 3: 'rainy', 4: 'snowy' } },
  ground_condition: { arg: 'ground', values: { 1: 'good', 2: 'yielding', 3: 'soft', 4: 'heavy' } },
  time: { arg: 'time', values: { 0: 'notime', 1: 'morning', 2: 'midday', 3: 'evening', 4: 'night' } },
  grade: { arg: 'grade', values: { 100: 'g1', 200: 'g2', 300: 'g3', 400: 'op', 700: 'preop', 800: 'maiden', 900: 'debut', 999: 'daily' } },
});

function staticEnvironment(record) {
  const alternatives = record?.alternatives || [];
  let best = { score: -1, env: { ...DEFAULT_ENV } };
  for (const alt of alternatives) {
    for (const branch of String(alt?.condition || '').split('@')) {
      const env = { ...DEFAULT_ENV };
      let score = 0;
      let conflict = false;
      for (const [field, info] of Object.entries(ENV_FIELDS)) {
        const match = branch.match(new RegExp(`(?:^|&)${field}==(-?\\d+)(?:&|$)`));
        if (!match) continue;
        const value = info.values[Number(match[1])];
        if (!value) {
          conflict = true;
          break;
        }
        env[info.arg] = value;
        score += 1;
      }
      if (!conflict && score > best.score) best = { score, env };
    }
  }
  return best.env;
}

function contextFlags(record) {
  const text = (record?.alternatives || []).map((alt) => String(alt?.condition || '')).join('@');
  const flags = [];
  if (/\b(season|weather|ground_condition|time|grade)\b/.test(text)) flags.push('static-environment');
  if (/\bactivate_count/.test(text)) flags.push('activation-count');
  if (/\b(near_count|visiblehorse|bashin_diff|blocked_|behind_near_lane|infront_near_lane|is_surrounded|same_skill_horse_count|running_style_count)/.test(text)) flags.push('opponents');
  if (/\b(order|order_rate|change_order|overtake|is_overtake)/.test(text)) flags.push('race-order');
  if (/\b(lane|is_move_lane)/.test(text)) flags.push('lane-state');
  return [...new Set(flags)];
}

function derivedSeed(skillId) {
  let x = (seedBase ^ courseId ^ skillId) >>> 0;
  for (const ch of style) x = Math.imul(x ^ ch.charCodeAt(0), 16777619) >>> 0;
  return x >>> 0;
}

function activateData(sourcePath) {
  fs.copyFileSync(sourcePath, activeSkillData);
}

function runGain(skillId, seed, env) {
  const stdout = execFileSync('npx', [
    'ts-node', '--transpile-only', RUNNER,
    '--horse', neutralHorsePath,
    '--course', String(courseId),
    '--skill', String(skillId),
    '--samples', String(samples),
    '--seed', String(seed),
    '--csv', String(skillId),
    '--season', env.season,
    '--weather', env.weather,
    '--ground', env.ground,
    '--time', env.time,
    '--grade', env.grade,
    '--assume-activation-counts', 'true',
  ], {
    cwd: toolsDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const line = stdout.split(/\r?\n/).filter(Boolean).at(-1) || '';
  const cols = line.split(',');
  if (cols.length < 10 || Number(cols[0]) !== skillId) throw new Error(`Unexpected evaluator output: ${line}`);
  const values = cols.slice(1, 10).map(Number);
  if (!values.every(Number.isFinite)) throw new Error(`Non-numeric evaluator output: ${line}`);
  return {
    min: values[0],
    max: values[1],
    p05: values[2],
    p25: values[3],
    median: values[4],
    mean: values[5],
    p75: values[6],
    p95: values[7],
    stddev: values[8],
    policy: cols.slice(10).join(',') || null,
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
  if (!force
      && current?.source === 'utools-delta-global'
      && current.mechanicsHash === hash
      && Number(current.samples) === samples
      && current.evaluator === EVALUATOR
      && Number(current.methodVersion) >= METHOD_VERSION
      && current.evaluatorRevision === evaluatorRevision
      && Number.isFinite(Number(current.referenceExpectedEffect))
      && Math.abs(Number(current.referenceExpectedEffect) - Number(ref.expectedEffect)) <= 1e-12) continue;
  candidates.push({
    id: Number(id),
    ref,
    hash,
    seed: derivedSeed(Number(id)),
    jpEnv: staticEnvironment(jpData[String(id)]),
    globalEnv: staticEnvironment(globalData[String(id)]),
    flags: [...new Set([...contextFlags(jpData[String(id)]), ...contextFlags(globalData[String(id)])])],
  });
}

const jpRuns = new Map();
const globalRuns = new Map();
const failures = new Map();

activateData(jpDataPath);
for (const item of candidates) {
  try {
    jpRuns.set(item.id, runGain(item.id, item.seed, item.jpEnv));
  } catch (error) {
    failures.set(item.id, `JP simulation: ${error.message}`);
  }
}

activateData(globalDataPath);
for (const item of candidates) {
  if (failures.has(item.id)) continue;
  try {
    globalRuns.set(item.id, runGain(item.id, item.seed, item.globalEnv));
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
  const ratio = Math.abs(jpRun.mean) > 1e-9 ? globalRun.mean / jpRun.mean : null;
  const expectedEffect = Number(item.ref.expectedEffect) + correction;
  if (!Number.isFinite(expectedEffect)) {
    failures.set(item.id, 'non-finite corrected effect');
    process.stderr.write(`FAIL ${item.id}: non-finite corrected effect\n`);
    continue;
  }

  const anchorShift = expectedEffect - globalRun.mean;
  rows.set(item.id, {
    id: item.id,
    expectedEffect,
    minEffect: globalRun.min + anchorShift,
    p05Effect: globalRun.p05 + anchorShift,
    p25Effect: globalRun.p25 + anchorShift,
    medianEffect: globalRun.median + anchorShift,
    p75Effect: globalRun.p75 + anchorShift,
    p95Effect: globalRun.p95 + anchorShift,
    maxEffect: globalRun.max + anchorShift,
    stddevEffect: globalRun.stddev,
    samples,
    seed: item.seed,
    mechanicsHash: item.hash,
    source: 'utools-delta-global',
    methodVersion: METHOD_VERSION,
    rangeMethod: 'Global Umalator distribution shifted to the live U-tools-anchored corrected mean',
    referenceExpectedEffect: Number(item.ref.expectedEffect),
    referenceSourceUpdatedAt: item.ref.sourceUpdatedAt || null,
    simulatedJpEffect: jpRun.mean,
    simulatedGlobalEffect: globalRun.mean,
    simulatedDelta: correction,
    simulatedRatio: Number.isFinite(ratio) ? ratio : null,
    jpEnvironment: item.jpEnv,
    globalEnvironment: item.globalEnv,
    contextFlags: item.flags,
    evaluator: EVALUATOR,
    evaluatorRevision,
    evaluatedAt: new Date().toISOString(),
  });
  completed += 1;
  process.stdout.write(`${item.id}: ${Number(item.ref.expectedEffect).toFixed(4)} + (${globalRun.mean.toFixed(4)} - ${jpRun.mean.toFixed(4)}) = ${expectedEffect.toFixed(4)}; p05-p95 ${(globalRun.p05 + anchorShift).toFixed(4)}..${(globalRun.p95 + anchorShift).toFixed(4)}\n`);
}

const out = normalizeEffectFile({
  server: 'global',
  courseId,
  style,
  generatedAt: new Date().toISOString(),
  profile: {
    evaluator: EVALUATOR,
    globalDifferenceMethod: 'live U-tools JP expected effect + paired condition-aware modern-Umalator(Global - JP)',
    rangeMethod: 'Global Umalator P05-P95 distribution shifted to the corrected live-U-tools-anchored mean',
    evaluatorRevision,
    methodVersion: METHOD_VERSION,
    samples,
  },
  skills: [...rows.values()],
});
writeJson(dest, out);
process.stdout.write(`done: ${completed} corrected, ${skillIds.length - candidates.length} not applicable/current, ${failures.size} failed\n`);
if (failures.size) process.exitCode = 1;
