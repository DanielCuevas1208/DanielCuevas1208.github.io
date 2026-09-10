import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_SKILLS_URL,
  STYLES,
  effectFile,
  indexSkills,
  isGlobalReleased,
  loadSkills,
  mechanicsEqualAcrossServers,
  mechanicsHash,
  normalizeEffectFile,
  parseArgs,
  readJson,
  writeJson,
} from './lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', 'skill-effects');
const args = parseArgs(process.argv.slice(2));
const skillsUrl = args['skills-url'] || DEFAULT_SKILLS_URL;
const onlyCourse = args.course ? Number(args.course) : null;
const onlyStyle = args.style || null;
const skills = indexSkills(await loadSkills(skillsUrl));
const jpRoot = path.join(root, 'jp');
let written = 0;
let droppedStale = 0;
let droppedLegacySimulation = 0;

if (!fs.existsSync(jpRoot)) throw new Error('No JP files found. Run bootstrap-utools.mjs first or add JP data.');

for (const courseDir of fs.readdirSync(jpRoot, { withFileTypes: true })) {
  if (!courseDir.isDirectory() || !/^\d+$/.test(courseDir.name)) continue;
  const courseId = Number(courseDir.name);
  if (onlyCourse && courseId !== onlyCourse) continue;
  for (const style of onlyStyle ? [onlyStyle] : STYLES) {
    const jpFile = effectFile(root, 'jp', courseId, style);
    if (!fs.existsSync(jpFile)) continue;
    const jp = readJson(jpFile);
    const rows = [];
    for (const row of jp.skills || []) {
      const skill = skills.get(Number(row.id));
      if (!isGlobalReleased(skill) || !mechanicsEqualAcrossServers(skill)) continue;
      rows.push({
        ...row,
        mechanicsHash: mechanicsHash(skill, 'global'),
        source: row.source === 'utools' ? 'utools-compatible' : row.source,
      });
    }

    const dest = effectFile(root, 'global', courseId, style);
    const existing = fs.existsSync(dest) ? readJson(dest) : null;
    const byId = new Map(rows.map((row) => [Number(row.id), row]));
    const preservedSources = new Set(['utools-delta-global', 'manual']);

    for (const row of existing?.skills || []) {
      if (row.source === 'simulation') {
        droppedLegacySimulation += 1;
        continue;
      }
      if (!preservedSources.has(row.source)) continue;
      const skill = skills.get(Number(row.id));
      const currentHash = isGlobalReleased(skill) ? mechanicsHash(skill, 'global') : null;
      if (!currentHash || row.mechanicsHash !== currentHash) {
        droppedStale += 1;
        continue;
      }
      byId.set(Number(row.id), row);
    }

    const out = normalizeEffectFile({
      server: 'global',
      courseId,
      style,
      generatedAt: new Date().toISOString(),
      profile: {
        evaluator: 'mixed',
        note: 'Mechanically identical JP rows bridge directly from U-tools; changed Global mechanics use U-tools-anchored JP→Global simulation deltas.',
      },
      skills: [...byId.values()],
    });
    writeJson(dest, out);
    written += 1;
    process.stdout.write(`global ${courseId}/${style}: ${out.skills.length}\n`);
  }
}

process.stdout.write(`wrote ${written} Global bridge files; dropped ${droppedStale} stale row(s) and ${droppedLegacySimulation} legacy absolute-simulation row(s)\n`);
