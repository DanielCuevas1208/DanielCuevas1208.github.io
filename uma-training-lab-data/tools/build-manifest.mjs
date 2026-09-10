import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STYLES, fnv1a64, writeJson } from './lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', 'skill-effects');
const servers = {};
const revisionParts = [];
const generatedTimes = [];

for (const server of ['global', 'jp']) {
  const serverRoot = path.join(root, server);
  const courses = {};
  if (fs.existsSync(serverRoot)) {
    for (const courseDir of fs.readdirSync(serverRoot, { withFileTypes: true })) {
      if (!courseDir.isDirectory() || !/^\d+$/.test(courseDir.name)) continue;
      const courseId = Number(courseDir.name);
      const styles = [];
      for (const style of STYLES) {
        const file = path.join(serverRoot, courseDir.name, `${style}.json`);
        if (!fs.existsSync(file)) continue;
        const raw = fs.readFileSync(file, 'utf8');
        const data = JSON.parse(raw);
        if (!Array.isArray(data.skills) || data.skills.length === 0) continue;
        styles.push(style);
        revisionParts.push(`${server}/${courseId}/${style}:${fnv1a64(raw)}`);
        const time = Date.parse(data.generatedAt || '');
        if (Number.isFinite(time)) generatedTimes.push(time);
      }
      if (styles.length) courses[String(courseId)] = styles;
    }
  }
  servers[server] = { courses };
}

const manifest = {
  schemaVersion: 1,
  generatedAt: generatedTimes.length ? new Date(Math.max(...generatedTimes)).toISOString() : null,
  revision: fnv1a64(revisionParts.sort().join('|')),
  pathTemplate: '{server}/{courseId}/{style}.json',
  servers,
};

writeJson(path.join(root, 'manifest.json'), manifest);
process.stdout.write(`manifest ${manifest.revision}\n`);
