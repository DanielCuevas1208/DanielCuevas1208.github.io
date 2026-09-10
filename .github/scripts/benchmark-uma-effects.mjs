import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const toolsDir = path.resolve(arg('tools-dir'));
const dbFile = path.resolve(arg('db'));
const samples = Math.max(50, Number(arg('samples', '500')));
const limit = Math.max(1, Number(arg('limit', '96')));
const profile = arg('profile', 'senkou');
const runner = arg('runner', '.training-lab-current-gain.ts');
const outFile = path.resolve(arg('out', 'uma-effect-benchmark.json'));
const data = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
const courseId = Number(data.courseId);
const server = data.server || 'unknown';
const rows = (data.skills || [])
  .filter((row) => String(row.source || '').startsWith('utools') && Number.isFinite(Number(row.expectedEffect)))
  .slice(0, limit);

const skillDataPath = path.join(toolsDir, 'data', 'skill_data.json');
const skillData = JSON.parse(fs.readFileSync(skillDataPath, 'utf8'));
const sourceHorse = path.join(toolsDir, 'tools', `${profile}.json`);
const horseData = JSON.parse(fs.readFileSync(sourceHorse, 'utf8'));
horseData.skills = [];
const horse = path.join(toolsDir, `.training-lab-benchmark-${profile}.json`);
fs.writeFileSync(horse, `${JSON.stringify(horseData)}\n`);

let evaluatorRevision = null;
try {
  evaluatorRevision = execFileSync('git', ['-C', toolsDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {}

if (!rows.length) throw new Error(`No U-tools reference rows found in ${dbFile}`);

const DEFAULT_ENV = Object.freeze({
  season: 'spring',
  weather: 'sunny',
  ground: 'good',
  time: 'midday',
  grade: 'g1',
});
const ENV_FIELDS = Object.freeze({
  season: { arg: 'season', values: { 1: 'spring', 2: 'summer', 3: 'autumn', 4: 'winter', 5: 'sakura' } },
  weather: { arg: 'weather', values: { 1: 'sunny', 2: 'cloudy', 3: 'rainy', 4: 'snowy' } },
  ground_condition: { arg: 'ground', values: { 1: 'good', 2: 'yielding', 3: 'soft', 4: 'heavy' } },
  time: { arg: 'time', values: { 0: 'notime', 1: 'morning', 2: 'midday', 3: 'evening', 4: 'night' } },
  grade: { arg: 'grade', values: { 100: 'g1', 200: 'g2', 300: 'g3', 400: 'op', 700: 'preop', 800: 'maiden', 900: 'debut', 999: 'daily' } },
});

function conditionText(record) {
  return (record?.alternatives || []).map((alt) => String(alt?.condition || '')).filter(Boolean).join('@');
}

function staticEnvironment(record) {
  const alternatives = record?.alternatives || [];
  let best = { score: -1, env: { ...DEFAULT_ENV } };
  for (const alt of alternatives) {
    const branches = String(alt?.condition || '').split('@');
    for (const branch of branches) {
      const env = { ...DEFAULT_ENV };
      let score = 0;
      let conflict = false;
      for (const [field, info] of Object.entries(ENV_FIELDS)) {
        const re = new RegExp(`(?:^|&)${field}==(-?\\d+)(?:&|$)`);
        const match = branch.match(re);
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
  const text = conditionText(record);
  const flags = [];
  if (/\b(season|weather|ground_condition|time|grade)\b/.test(text)) flags.push('static-environment');
  if (/\bactivate_count/.test(text)) flags.push('activation-count');
  if (/\b(near_count|visiblehorse|bashin_diff|blocked_|behind_near_lane|infront_near_lane|is_surrounded|same_skill_horse_count|running_style_count)/.test(text)) flags.push('opponents');
  if (/\b(order|order_rate|change_order|overtake|is_overtake)/.test(text)) flags.push('race-order');
  if (/\b(lane|is_move_lane)/.test(text)) flags.push('lane-state');
  return [...new Set(flags)];
}

function simulate(row, smoke = false) {
  const id = Number(row.id);
  const seed = (0x6d2b79f5 ^ courseId ^ id) >>> 0;
  const record = skillData[String(id)];
  const env = staticEnvironment(record);
  const stdout = execFileSync('npx', [
    'ts-node', '--transpile-only', runner,
    '--horse', horse,
    '--course', String(courseId),
    '--skill', String(id),
    '--samples', String(smoke ? Math.min(samples, 50) : samples),
    '--seed', String(seed),
    '--csv', String(id),
    '--season', env.season,
    '--weather', env.weather,
    '--ground', env.ground,
    '--time', env.time,
    '--grade', env.grade,
    '--assume-activation-counts', 'true',
  ], { cwd: toolsDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const line = stdout.split(/\r?\n/).filter(Boolean).at(-1) || '';
  const cols = line.split(',');
  if (cols.length < 10 || Number(cols[0]) !== id) throw new Error(`bad output: ${line}`);
  const [min, max, p05, p25, median, mean, p75, p95, stddev] = cols.slice(1, 10).map(Number);
  if (![min, max, p05, p25, median, mean, p75, p95, stddev].every(Number.isFinite)) {
    throw new Error(`non-numeric output: ${line}`);
  }
  return { min, max, p05, p25, median, mean, p75, p95, stddev, env, contextFlags: contextFlags(record) };
}

try {
  simulate(rows[0], true);
} catch (error) {
  console.error(`Benchmark runner preflight failed: ${error.message}`);
  throw error;
}

const results = [];
const failures = [];
for (const row of rows) {
  const id = Number(row.id);
  try {
    const sim = simulate(row);
    const reference = Number(row.expectedEffect);
    const error = sim.mean - reference;
    results.push({ id, reference, simulated: sim.mean, error, absError: Math.abs(error), ...sim });
    console.log(`${id}\tU-tools=${reference.toFixed(4)}\tUmalator=${sim.mean.toFixed(4)}\tdelta=${error >= 0 ? '+' : ''}${error.toFixed(4)}\tp05-p95=${sim.p05.toFixed(3)}..${sim.p95.toFixed(3)}\t${sim.contextFlags.join(',') || 'simple'}`);
  } catch (error) {
    failures.push({ id, error: error.message });
    console.error(`${id}\tFAILED\t${error.message}`);
  }
}

if (!results.length) throw new Error('No benchmark rows succeeded');

function mean(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function metrics(rowsForMetrics) {
  if (!rowsForMetrics.length) return null;
  const mae = mean(rowsForMetrics.map((row) => row.absError));
  const bias = mean(rowsForMetrics.map((row) => row.error));
  const rmse = Math.sqrt(mean(rowsForMetrics.map((row) => row.error * row.error)));
  const meanRef = mean(rowsForMetrics.map((row) => row.reference));
  const meanSim = mean(rowsForMetrics.map((row) => row.simulated));
  let cov = 0, varRef = 0, varSim = 0;
  for (const row of rowsForMetrics) {
    const a = row.reference - meanRef;
    const b = row.simulated - meanSim;
    cov += a * b;
    varRef += a * a;
    varSim += b * b;
  }
  const correlation = varRef && varSim ? cov / Math.sqrt(varRef * varSim) : null;
  const sortedAe = rowsForMetrics.map((row) => row.absError).sort((a, b) => a - b);
  const medianAe = sortedAe[Math.floor(sortedAe.length / 2)];
  const within05 = rowsForMetrics.filter((row) => row.absError <= 0.05).length / rowsForMetrics.length;
  const within10 = rowsForMetrics.filter((row) => row.absError <= 0.10).length / rowsForMetrics.length;
  return { count: rowsForMetrics.length, mae, medianAe, bias, rmse, correlation, within05, within10 };
}

const rawMetrics = metrics(results);
const coreRows = results.filter((row) => !row.contextFlags.some((flag) => ['activation-count', 'opponents', 'race-order', 'lane-state'].includes(flag)));
const coreMetrics = metrics(coreRows);
const worst = [...results].sort((a, b) => b.absError - a.absError).slice(0, 12);
const summary = {
  evaluator: 'kachi-dev/uma-tools/uma-skill-tools',
  evaluatorRevision,
  evaluatorPath: 'RaceSolverBuilder',
  positionKeepMode: 'Approximate',
  server,
  courseId,
  profile,
  samples,
  attempted: rows.length,
  count: results.length,
  failureCount: failures.length,
  assumptions: {
    staticEnvironment: 'auto-satisfy exact season/weather/ground/time/grade requirements per skill',
    activationCounts: 'RaceSolverBuilder.withActivateCountsAsRandom()',
    wisdomChecks: false,
  },
  raw: rawMetrics,
  core: coreMetrics,
  worst,
  results,
  failures,
};
console.log('\nSUMMARY');
console.log(JSON.stringify({
  evaluator: summary.evaluator,
  evaluatorRevision,
  evaluatorPath: summary.evaluatorPath,
  positionKeepMode: summary.positionKeepMode,
  server,
  courseId,
  profile,
  samples,
  attempted: rows.length,
  count: results.length,
  failureCount: failures.length,
  assumptions: summary.assumptions,
  raw: rawMetrics,
  core: coreMetrics,
  worst,
}, null, 2));
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(summary, null, 2)}\n`);
