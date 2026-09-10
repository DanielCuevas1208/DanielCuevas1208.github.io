import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  DEFAULT_SKILLS_URL,
  STYLES,
  effectFile,
  indexSkills,
  isGlobalReleased,
  loadSkills,
  mechanicsEqualAcrossServers,
  mechanicsHash,
  parseArgs,
  readJson,
} from './lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', 'skill-effects');

export async function findGlobalPending({ skillsUrl = DEFAULT_SKILLS_URL, course = null, style = null } = {}) {
  const skillIndex = indexSkills(await loadSkills(skillsUrl));
  const jpRoot = path.join(root, 'jp');
  const groups = [];
  if (!fs.existsSync(jpRoot)) return groups;

  for (const courseDir of fs.readdirSync(jpRoot, { withFileTypes: true })) {
    if (!courseDir.isDirectory() || !/^\d+$/.test(courseDir.name)) continue;
    const courseId = Number(courseDir.name);
    if (course && Number(course) !== courseId) continue;
    for (const runStyle of style ? [style] : STYLES) {
      const jpFile = effectFile(root, 'jp', courseId, runStyle);
      if (!fs.existsSync(jpFile)) continue;
      const jp = readJson(jpFile);
      const globalFile = effectFile(root, 'global', courseId, runStyle);
      const global = fs.existsSync(globalFile) ? readJson(globalFile) : { skills: [] };
      const globalRows = new Map((global.skills || []).map((row) => [Number(row.id), row]));
      const pending = [];

      for (const jpRow of jp.skills || []) {
        const id = Number(jpRow.id);
        const skill = skillIndex.get(id);
        if (!isGlobalReleased(skill)) continue;
        if (mechanicsEqualAcrossServers(skill)) continue;
        const expectedHash = mechanicsHash(skill, 'global');
        const row = globalRows.get(id);
        if (!row || row.mechanicsHash !== expectedHash || !Number.isFinite(Number(row.expectedEffect))) {
          pending.push(id);
        }
      }

      if (pending.length) groups.push({ courseId, style: runStyle, skillIds: pending });
    }
  }
  return groups;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  const groups = await findGlobalPending({
    skillsUrl: args['skills-url'] || DEFAULT_SKILLS_URL,
    course: args.course ? Number(args.course) : null,
    style: args.style || null,
  });
  const count = groups.reduce((sum, group) => sum + group.skillIds.length, 0);
  if (args.json) {
    process.stdout.write(`${JSON.stringify({ count, groups })}\n`);
  } else if (!groups.length) {
    process.stdout.write('No missing/stale Global-different values.\n');
  } else {
    for (const group of groups) {
      process.stdout.write(`${group.courseId}/${group.style}: ${group.skillIds.join(',')}\n`);
    }
    process.stdout.write(`\n${count} evaluations across ${groups.length} course/style groups.\n`);
  }
}
