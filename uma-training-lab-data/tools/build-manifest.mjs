import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STYLES, fnv1a64, readJson, writeJson } from './lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', 'skill-effects');
const servers = {};
const revisionParts = [];

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
        const data = readJson(file);
        if (!Array.isArray(data.skills) || data.skills.length === 0) continue;
        styles.push(style);
        revisionParts.push(`${server}/${courseId}/${style}:${data.generatedAt || ''}:${data.skills.length}`);
      }
      if (styles.length) courses[String(courseId)] = styles;
    }
  }
  servers[server] = { courses };
}

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  revision: fnv1a64(revisionParts.sort().join('|')),
  pathTemplate: '{server}/{courseId}/{style}.json',
  servers,
};

writeJson(path.join(root, 'manifest.json'), manifest);
process.stdout.write(`manifest ${manifest.revision}\n`);
