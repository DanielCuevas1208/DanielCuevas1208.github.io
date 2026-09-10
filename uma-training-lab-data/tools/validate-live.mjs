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
  parseArgs,
  readJson,
} from './lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', 'skill-effects');
const args = parseArgs(process.argv.slice(2));
const skillsUrl = args['skills-url'] || DEFAULT_SKILLS_URL;
const skills = indexSkills(await loadSkills(skillsUrl));
const errors = [];
const warnings = [];
let rowsChecked = 0;
const CURRENT_DELTA_EVALUATOR = 'kachi-dev/uma-tools/uma-skill-tools';
const CURRENT_DELTA_METHOD_VERSION = 3;

for (const server of ['jp', 'global']) {
  const serverRoot = path.join(root, server);
  if (!fs.existsSync(serverRoot)) continue;
  for (const courseDir of fs.readdirSync(serverRoot, { withFileTypes: true })) {
    if (!courseDir.isDirectory() || !/^\d+$/.test(courseDir.name)) continue;
    const courseId = Number(courseDir.name);
    for (const style of STYLES) {
      const file = effectFile(root, server, courseId, style);
      if (!fs.existsSync(file)) continue;
      const data = readJson(file);
      for (const row of data.skills || []) {
        rowsChecked += 1;
        const id = Number(row.id);
        const skill = skills.get(id);
        if (!skill) {
          errors.push(`${server}/${courseId}/${style}/${id}: skill missing from current source`);
          continue;
        }
        if (server === 'global' && !isGlobalReleased(skill)) {
          errors.push(`global/${courseId}/${style}/${id}: skill is not currently released on Global`);
          continue;
        }
        const expectedHash = mechanicsHash(skill, server);
        if (!row.mechanicsHash) {
          errors.push(`${server}/${courseId}/${style}/${id}: mechanicsHash missing`);
        } else if (row.mechanicsHash !== expectedHash) {
          errors.push(`${server}/${courseId}/${style}/${id}: stale mechanics hash ${row.mechanicsHash} != ${expectedHash}`);
        }
        if (server === 'global' && row.source === 'utools-compatible' && !mechanicsEqualAcrossServers(skill)) {
          errors.push(`global/${courseId}/${style}/${id}: U-tools-compatible row no longer has identical JP/Global mechanics`);
        }
        if (server === 'global' && row.source === 'utools-delta-global') {
          if (row.evaluator !== CURRENT_DELTA_EVALUATOR) {
            errors.push(`global/${courseId}/${style}/${id}: legacy delta evaluator ${row.evaluator || 'missing'}`);
          }
          if (Number(row.methodVersion) < CURRENT_DELTA_METHOD_VERSION) {
            errors.push(`global/${courseId}/${style}/${id}: legacy delta method ${row.methodVersion || 'missing'}`);
          }
          if (!Number.isInteger(Number(row.samples))) {
            errors.push(`global/${courseId}/${style}/${id}: delta row has no sample count`);
          }
        }
        if (row.source === 'simulation' && !Number.isInteger(Number(row.samples))) {
          warnings.push(`${server}/${courseId}/${style}/${id}: simulation row has no sample count`);
        }
      }
    }
  }
}

for (const warning of warnings) process.stderr.write(`WARN ${warning}\n`);
if (errors.length) {
  for (const error of errors) process.stderr.write(`ERROR ${error}\n`);
  process.stderr.write(`FAIL · ${errors.length} live-data error(s), ${warnings.length} warning(s), ${rowsChecked} row(s) checked\n`);
  process.exit(1);
}
process.stdout.write(`OK · ${rowsChecked} live row(s), ${warnings.length} warning(s)\n`);
