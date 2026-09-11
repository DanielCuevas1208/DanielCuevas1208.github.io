import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STYLES, readJson } from './lib.mjs';
import { isGlobalCourseAvailable } from './course-policy.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', 'skill-effects');
const manifestFile = path.join(root, 'manifest.json');
const errors = [];
const warnings = [];
const EPSILON = 1e-9;

if (!fs.existsSync(manifestFile)) errors.push('manifest.json is missing');
const manifest = fs.existsSync(manifestFile) ? readJson(manifestFile) : null;
if (manifest && manifest.schemaVersion !== 1) errors.push(`Unsupported manifest schema ${manifest.schemaVersion}`);

for (const server of ['global', 'jp']) {
  const courses = manifest?.servers?.[server]?.courses || {};
  for (const [courseId, styles] of Object.entries(courses)) {
    if (!/^\d+$/.test(courseId)) errors.push(`${server}: invalid course id ${courseId}`);
    if (server === 'global' && !isGlobalCourseAvailable(Number(courseId))) {
      errors.push(`${server}/${courseId}: course is not available under the current Global course policy`);
    }
    for (const style of styles) {
      if (!STYLES.includes(style)) {
        errors.push(`${server}/${courseId}: invalid style ${style}`);
        continue;
      }
      const file = path.join(root, server, courseId, `${style}.json`);
      if (!fs.existsSync(file)) {
        errors.push(`${server}/${courseId}/${style}: file missing`);
        continue;
      }
      let data;
      try {
        data = readJson(file);
      } catch (error) {
        errors.push(`${server}/${courseId}/${style}: invalid JSON: ${error.message}`);
        continue;
      }
      if (data.schemaVersion !== 1) errors.push(`${server}/${courseId}/${style}: schemaVersion must be 1`);
      if (data.server !== server) errors.push(`${server}/${courseId}/${style}: server field mismatch`);
      if (Number(data.courseId) !== Number(courseId)) errors.push(`${server}/${courseId}/${style}: courseId field mismatch`);
      if (data.style !== style) errors.push(`${server}/${courseId}/${style}: style field mismatch`);
      if (!Array.isArray(data.skills)) {
        errors.push(`${server}/${courseId}/${style}: skills must be an array`);
        continue;
      }
      const seen = new Set();
      for (const row of data.skills) {
        const id = Number(row.id);
        const expected = Number(row.expectedEffect);
        if (!Number.isInteger(id) || id <= 0) errors.push(`${server}/${courseId}/${style}: invalid skill id ${row.id}`);
        if (seen.has(id)) errors.push(`${server}/${courseId}/${style}: duplicate skill ${id}`);
        seen.add(id);
        if (!Number.isFinite(expected)) errors.push(`${server}/${courseId}/${style}/${id}: expectedEffect must be numeric`);
        if (row.mechanicsHash && !/^fnv1a64:[0-9a-f]{16}$/.test(row.mechanicsHash)) warnings.push(`${server}/${courseId}/${style}/${id}: unusual mechanicsHash`);
        if (!row.source) warnings.push(`${server}/${courseId}/${style}/${id}: source missing`);

        if (server === 'global' && row.source === 'utools-delta-global' && Number(row.calibrationVersion) >= 2) {
          const anchor = Number(row.referenceExpectedEffect);
          const jp = Number(row.simulatedJpEffect);
          const global = Number(row.simulatedGlobalEffect);
          if ([anchor, jp, global, expected].every(Number.isFinite)
              && anchor >= 0 && jp > EPSILON && global >= 0 && expected < -EPSILON) {
            errors.push(`${server}/${courseId}/${style}/${id}: calibrated effect crossed below zero despite non-negative anchor and paired simulator means`);
          }
          if (row.calibrationMode === 'ratio-fallback' && [anchor, jp, global, expected].every(Number.isFinite) && jp > EPSILON) {
            const ratioExpected = anchor * (global / jp);
            if (Math.abs(expected - ratioExpected) > 1e-9) {
              errors.push(`${server}/${courseId}/${style}/${id}: ratio-fallback effect does not match anchor × (Global/JP)`);
            }
          }
        }
      }
    }
  }
}

for (const line of warnings) process.stderr.write(`WARN ${line}\n`);
if (errors.length) {
  for (const line of errors) process.stderr.write(`ERROR ${line}\n`);
  process.exit(1);
}
process.stdout.write(`OK · ${warnings.length} warning(s)\n`);
