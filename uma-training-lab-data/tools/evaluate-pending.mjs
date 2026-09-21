import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SKILLS_URL, parseArgs } from './lib.mjs';
import { findGlobalPending } from './pending.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const toolsDir = args['tools-dir'] ? path.resolve(args['tools-dir']) : null;
const jpData = args['jp-data'];
const globalData = args['global-data'];
if (!toolsDir) throw new Error('--tools-dir is required');
if (!jpData) throw new Error('--jp-data is required');
if (!globalData) throw new Error('--global-data is required');
const samples = Math.max(1, Number(args.samples || args.nsamples || 2000));
const jobs = Math.max(1, Math.floor(Number(args.jobs || 1)));
const skillsUrl = args['skills-url'] || DEFAULT_SKILLS_URL;
const groups = await findGlobalPending({
  skillsUrl,
  course: args.course ? Number(args.course) : null,
  style: args.style || null,
});

if (!groups.length) {
  process.stdout.write('No pending Global-different values.\n');
  process.exit(0);
}

function prepareWorkerTools(workerId) {
  if (jobs === 1) return toolsDir;
  const repoRoot = path.dirname(toolsDir);
  const workerRoot = path.join(repoRoot, `.training-lab-worker-${workerId}`);
  const workerTools = path.join(workerRoot, 'uma-skill-tools');
  fs.rmSync(workerRoot, { recursive: true, force: true });
  fs.mkdirSync(workerRoot, { recursive: true });
  const rootNodeModules = path.join(toolsDir, 'node_modules');
  fs.cpSync(toolsDir, workerTools, {
    recursive: true,
    filter: (source) => path.resolve(source) !== path.resolve(rootNodeModules),
  });
  if (fs.existsSync(rootNodeModules)) {
    fs.symlinkSync(rootNodeModules, path.join(workerTools, 'node_modules'), 'dir');
  }
  return workerTools;
}

function cleanupWorkerTools(workerTools) {
  if (workerTools === toolsDir) return;
  fs.rmSync(path.dirname(workerTools), { recursive: true, force: true });
}

function runGroup(group, workerTools) {
  return new Promise((resolve) => {
    process.stdout.write(`\n== ${group.courseId}/${group.style} · ${group.skillIds.length} skill(s) ==\n`);
    const child = spawn(process.execPath, [
      path.join(here, 'evaluate-global-delta.mjs'),
      '--tools-dir', workerTools,
      '--jp-data', jpData,
      '--global-data', globalData,
      '--course', String(group.courseId),
      '--style', group.style,
      '--skills', group.skillIds.join(','),
      '--samples', String(samples),
      '--skills-url', skillsUrl,
    ], { stdio: 'inherit' });
    child.on('error', (error) => {
      process.stderr.write(`FAIL ${group.courseId}/${group.style}: ${error.message}\n`);
      resolve(false);
    });
    child.on('exit', (code, signal) => {
      if (code !== 0) {
        process.stderr.write(`FAIL ${group.courseId}/${group.style}: evaluator exited ${signal ? `from ${signal}` : `with code ${code}`}\n`);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

let nextIndex = 0;
let failed = 0;
async function worker(workerId) {
  const workerTools = prepareWorkerTools(workerId);
  try {
    while (true) {
      const index = nextIndex++;
      if (index >= groups.length) return;
      if (!await runGroup(groups[index], workerTools)) failed += 1;
    }
  } finally {
    cleanupWorkerTools(workerTools);
  }
}

const workerCount = Math.min(jobs, groups.length);
process.stdout.write(`Evaluating ${groups.length} course/style group(s) with ${workerCount} isolated worker(s), ${samples} samples per skill.\n`);
await Promise.all(Array.from({ length: workerCount }, (_, workerId) => worker(workerId)));

if (failed) {
  process.stderr.write(`${failed} course/style group(s) had one or more failed delta evaluations.\n`);
  process.exit(1);
}
process.stdout.write('\nAll pending Global-different values evaluated with U-tools-anchored JP→Global deltas.\n');
