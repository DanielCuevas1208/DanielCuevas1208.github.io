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
const limit = Math.max(1, Number(arg('limit', '48')));
const profile = arg('profile', 'senkou');
const runner = arg('runner', '.training-lab-current-gain.ts');
const data = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
const courseId = Number(data.courseId);
const server = data.server || 'unknown';
const rows = (data.skills || [])
  .filter((row) => String(row.source || '').startsWith('utools') && Number.isFinite(Number(row.expectedEffect)))
  .slice(0, limit);

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

const results = [];
const failures = [];
for (const row of rows) {
  const id = Number(row.id);
  const seed = (0x6d2b79f5 ^ courseId ^ id) >>> 0;
  try {
    const stdout = execFileSync('npx', [
      'ts-node', runner,
      '--horse', horse,
      '--course', String(courseId),
      '--skill', String(id),
      '--samples', String(samples),
      '--seed', String(seed),
      '--csv', String(id),
    ], { cwd: toolsDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const line = stdout.split(/\r?\n/).filter(Boolean).at(-1) || '';
    const cols = line.split(',');
    const simulated = Number(cols[4]);
    if (!Number.isFinite(simulated)) throw new Error(`bad output: ${line}`);
    const reference = Number(row.expectedEffect);
    const error = simulated - reference;
    results.push({ id, reference, simulated, error, absError: Math.abs(error) });
    console.log(`${id}\tU-tools=${reference.toFixed(4)}\tUmalator=${simulated.toFixed(4)}\tdelta=${error >= 0 ? '+' : ''}${error.toFixed(4)}`);
  } catch (error) {
    failures.push({ id, error: error.message });
    console.error(`${id}\tFAILED\t${error.message}`);
  }
}

if (!results.length) throw new Error('No benchmark rows succeeded');

function mean(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function rmseFor(predict) {
  return Math.sqrt(mean(results.map((row) => {
    const e = predict(row.simulated) - row.reference;
    return e * e;
  })));
}

function maeFor(predict) {
  return mean(results.map((row) => Math.abs(predict(row.simulated) - row.reference)));
}

const mae = mean(results.map((row) => row.absError));
const bias = mean(results.map((row) => row.error));
const rmse = Math.sqrt(mean(results.map((row) => row.error * row.error)));
const meanRef = mean(results.map((row) => row.reference));
const meanSim = mean(results.map((row) => row.simulated));
let cov = 0, varRef = 0, varSim = 0;
for (const row of results) {
  const a = row.reference - meanRef;
  const b = row.simulated - meanSim;
  cov += a * b;
  varRef += a * a;
  varSim += b * b;
}
const correlation = varRef && varSim ? cov / Math.sqrt(varRef * varSim) : null;

const throughOriginDenom = results.reduce((sum, row) => sum + row.simulated * row.simulated, 0);
const multiplicativeScale = throughOriginDenom
  ? results.reduce((sum, row) => sum + row.simulated * row.reference, 0) / throughOriginDenom
  : null;
const linearSlope = varSim ? cov / varSim : null;
const linearIntercept = linearSlope == null ? null : meanRef - linearSlope * meanSim;

const calibration = {
  raw: { mae, rmse },
  multiplicative: multiplicativeScale == null ? null : {
    scale: multiplicativeScale,
    mae: maeFor((x) => x * multiplicativeScale),
    rmse: rmseFor((x) => x * multiplicativeScale),
  },
  affine: linearSlope == null ? null : {
    intercept: linearIntercept,
    slope: linearSlope,
    mae: maeFor((x) => linearIntercept + linearSlope * x),
    rmse: rmseFor((x) => linearIntercept + linearSlope * x),
  },
};

const worst = [...results].sort((a, b) => b.absError - a.absError).slice(0, 10);
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
  mae,
  bias,
  rmse,
  correlation,
  calibration,
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
  mae,
  bias,
  rmse,
  correlation,
  calibration,
  worst,
}, null, 2));
fs.writeFileSync('uma-effect-benchmark.json', `${JSON.stringify(summary, null, 2)}\n`);
