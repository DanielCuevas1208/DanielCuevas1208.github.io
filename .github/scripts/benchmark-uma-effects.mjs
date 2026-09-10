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
const limit = Math.max(1, Number(arg('limit', '24')));
const profile = arg('profile', 'senkou');
const data = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
const courseId = Number(data.courseId);
const rows = (data.skills || [])
  .filter((row) => row.source === 'utools-compatible' && Number.isFinite(Number(row.expectedEffect)))
  .slice(0, limit);
const horse = path.join(toolsDir, 'tools', `${profile}.json`);
const results = [];

for (const row of rows) {
  const id = Number(row.id);
  const seed = (0x6d2b79f5 ^ courseId ^ id) >>> 0;
  try {
    const stdout = execFileSync('npx', [
      'ts-node', 'tools/gain.ts', horse,
      '-c', String(courseId),
      '-s', String(id),
      '-N', String(samples),
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
    console.log(`${id}\tU-tools=${reference.toFixed(4)}\tgain.ts=${simulated.toFixed(4)}\tdelta=${error >= 0 ? '+' : ''}${error.toFixed(4)}`);
  } catch (error) {
    console.error(`${id}\tFAILED\t${error.message}`);
  }
}

if (!results.length) throw new Error('No benchmark rows succeeded');
const mae = results.reduce((sum, row) => sum + row.absError, 0) / results.length;
const bias = results.reduce((sum, row) => sum + row.error, 0) / results.length;
const rmse = Math.sqrt(results.reduce((sum, row) => sum + row.error * row.error, 0) / results.length);
const meanRef = results.reduce((sum, row) => sum + row.reference, 0) / results.length;
const meanSim = results.reduce((sum, row) => sum + row.simulated, 0) / results.length;
let cov = 0, varRef = 0, varSim = 0;
for (const row of results) {
  const a = row.reference - meanRef;
  const b = row.simulated - meanSim;
  cov += a * b;
  varRef += a * a;
  varSim += b * b;
}
const correlation = varRef && varSim ? cov / Math.sqrt(varRef * varSim) : null;
const summary = { courseId, profile, samples, count: results.length, mae, bias, rmse, correlation, results };
console.log('\nSUMMARY');
console.log(JSON.stringify({ courseId, profile, samples, count: results.length, mae, bias, rmse, correlation }, null, 2));
fs.writeFileSync('uma-effect-benchmark.json', `${JSON.stringify(summary, null, 2)}\n`);
