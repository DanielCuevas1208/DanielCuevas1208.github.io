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
const server = String(args.server || '').toLowerCase();
const courseId = Number(args.course);
const style = String(args.style || '').toLowerCase();
const toolsDir = args['tools-dir'] ? path.resolve(args['tools-dir']) : null;
const samples = Math.max(1, Number(args.samples || args.nsamples || 1000));
const skillsUrl = args['skills-url'] || DEFAULT_SKILLS_URL;
const force = !!args.force;
const seedBase = Number.isInteger(Number(args.seed)) ? Number(args.seed) >>> 0 : 0x6d2b79f5;

if (!['global', 'jp'].includes(server)) throw new Error('--server must be global or jp');
if (!Number.isInteger(courseId) || courseId <= 0) throw new Error('--course is required');
if (!STYLES.includes(style)) throw new Error(`--style must be one of ${STYLES.join(', ')}`);
if (!toolsDir) throw new Error('--tools-dir is required');
if (!fs.existsSync(path.join(toolsDir, 'tools', 'gain.ts'))) throw new Error('tools/gain.ts was not found under --tools-dir');

const skillIds = loadSkillIds(args);
if (!skillIds.length) throw new Error('Provide --skills 201342,201... or --skills-file path');
const sourceHorsePath = args.horse
  ? path.resolve(args.horse)
  : path.join(toolsDir, 'tools', `${STYLE_PROFILE[style]}.json`);
if (!fs.existsSync(sourceHorsePath)) throw new Error(`Horse profile not found: ${sourceHorsePath}`);

function prepareHorseProfile(sourcePath) {
  const evaluatorSkillsPath = path.join(toolsDir, 'data', 'skill_data.json');
  if (!fs.existsSync(evaluatorSkillsPath)) return sourcePath;
  const evaluatorSkills = readJson(evaluatorSkillsPath);
  const horse = readJson(sourcePath);
  const original = Array.isArray(horse.skills) ? horse.skills : [];
  const filtered = original.filter((id) => Object.prototype.hasOwnProperty.call(evaluatorSkills, String(id)));
  if (filtered.length === original.length) return sourcePath;
  const dest = path.join(toolsDir, `.training-lab-${server}-${style}-horse.json`);
  writeJson(dest, { ...horse, skills: filtered });
  const removed = original.filter((id) => !filtered.includes(id));
  process.stdout.write(`profile: removed unavailable presupposed skill(s): ${removed.join(',')}\n`);
  return dest;
}

const horsePath = prepareHorseProfile(sourceHorsePath);
const skillIndex = indexSkills(await loadSkills(skillsUrl));
const dest = effectFile(dbRoot, server, courseId, style);
const existing = fs.existsSync(dest)
  ? readJson(dest)
  : normalizeEffectFile({ server, courseId, style, skills: [] });
const rows = new Map((existing.skills || []).map((row) => [Number(row.id), row]));

let evaluatorRevision = null;
try {
  evaluatorRevision = execFileSync('git', ['-C', toolsDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {}

function derivedSeed(skillId) {
  let x = (seedBase ^ courseId ^ skillId) >>> 0;
  for (const ch of style) x = Math.imul(x ^ ch.charCodeAt(0), 16777619) >>> 0;
  return x >>> 0;
}

function runGain(skillId, seed) {
  const cliArgs = [
    'ts-node',
    'tools/gain.ts',
    horsePath,
    '-c',
    String(courseId),
    '-s',
    String(skillId),
    '-N',
    String(samples),
    '--seed',
    String(seed),
    '--csv',
    String(skillId),
  ];
  const stdout = execFileSync('npx', cliArgs, {
    cwd: toolsDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const line = stdout.split(/\r?\n/).filter(Boolean).at(-1) || '';
  const cols = line.split(',');
  if (cols.length < 5 || Number(cols[0]) !== Number(skillId)) throw new Error(`Unexpected gain.ts output: ${line}`);
  const [minEffect, maxEffect, medianEffect, expectedEffect] = cols.slice(1, 5).map(Number);
  if (![minEffect, maxEffect, medianEffect, expectedEffect].every(Number.isFinite)) {
    throw new Error(`Non-numeric gain.ts output: ${line}`);
  }
  const samplePolicy = cols.at(-1) || null;
  return { minEffect, maxEffect, medianEffect, expectedEffect, samplePolicy };
}

let completed = 0;
let skipped = 0;
let failed = 0;

for (const skillId of skillIds) {
  const skill = skillIndex.get(Number(skillId));
  if (!skill) {
    process.stderr.write(`skip ${skillId}: missing from skills source\n`);
    skipped += 1;
    continue;
  }
  if (server === 'global' && !isGlobalReleased(skill)) {
    process.stderr.write(`skip ${skillId}: not available on Global\n`);
    skipped += 1;
    continue;
  }
  const hash = mechanicsHash(skill, server);
  const current = rows.get(Number(skillId));
  if (
    !force &&
    current?.source === 'simulation' &&
    current.mechanicsHash === hash &&
    Number(current.samples) === samples &&
    current.evaluatorRevision === evaluatorRevision
  ) {
    process.stdout.write(`skip ${skillId}: current\n`);
    skipped += 1;
    continue;
  }
  try {
    const seed = derivedSeed(skillId);
    const result = runGain(skillId, seed);
    rows.set(Number(skillId), {
      id: Number(skillId),
      ...result,
      samples,
      seed,
      mechanicsHash: hash,
      source: 'simulation',
      evaluator: 'alpha123/uma-skill-tools',
      evaluatorRevision,
      evaluatedAt: new Date().toISOString(),
    });
    const out = normalizeEffectFile({
      server,
      courseId,
      style,
      generatedAt: new Date().toISOString(),
      profile: {
        evaluator: 'alpha123/uma-skill-tools',
        evaluatorRevision,
        horse: path.basename(horsePath),
        samples,
      },
      skills: [...rows.values()],
    });
    writeJson(dest, out);
    completed += 1;
    process.stdout.write(`${skillId}: ${result.expectedEffect.toFixed(2)} lengths\n`);
  } catch (error) {
    failed += 1;
    process.stderr.write(`FAIL ${skillId}: ${error.message}\n`);
  }
}

process.stdout.write(`done: ${completed} evaluated, ${skipped} skipped, ${failed} failed\n`);
if (failed) process.exitCode = 1;
