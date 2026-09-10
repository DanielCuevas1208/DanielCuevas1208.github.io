import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SKILLS_URL, parseArgs } from './lib.mjs';
import { findGlobalPending } from './pending.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const toolsDir = args['tools-dir'];
const jpData = args['jp-data'];
const globalData = args['global-data'];
if (!toolsDir) throw new Error('--tools-dir is required');
if (!jpData) throw new Error('--jp-data is required');
if (!globalData) throw new Error('--global-data is required');
const samples = Math.max(1, Number(args.samples || args.nsamples || 2000));
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

let failed = 0;
for (const group of groups) {
  process.stdout.write(`\n== ${group.courseId}/${group.style} · ${group.skillIds.length} skill(s) ==\n`);
  try {
    execFileSync(process.execPath, [
      path.join(here, 'evaluate-global-delta.mjs'),
      '--tools-dir', toolsDir,
      '--jp-data', jpData,
      '--global-data', globalData,
      '--course', String(group.courseId),
      '--style', group.style,
      '--skills', group.skillIds.join(','),
      '--samples', String(samples),
      '--skills-url', skillsUrl,
    ], { stdio: 'inherit' });
  } catch {
    failed += 1;
  }
}

if (failed) {
  process.stderr.write(`${failed} course/style group(s) had one or more failed delta evaluations.\n`);
  process.exit(1);
}
process.stdout.write('\nAll pending Global-different values evaluated with U-tools-anchored JP→Global deltas.\n');
