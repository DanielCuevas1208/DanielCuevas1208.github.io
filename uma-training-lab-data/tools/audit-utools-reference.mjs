import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { effectFile, readJson } from './lib.mjs';
import { parseUtoolsReaderText } from './utools-live.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', 'skill-effects');

function rounded(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * scale) / scale;
}

function requireRow(courseId, style, id) {
  const file = effectFile(root, 'jp', courseId, style);
  if (!fs.existsSync(file)) throw new Error(`Missing reference file ${courseId}/${style}`);
  const data = readJson(file);
  const row = (data.skills || []).find((candidate) => Number(candidate.id) === Number(id));
  if (!row) throw new Error(`Missing U-tools reference skill ${id} in ${courseId}/${style}`);
  return row;
}

const checks = [
  {
    label: 'Ride the Momentum Tokyo 2400 leader',
    courseId: 10606,
    style: 'leader',
    id: 204082,
    expectedEffect: 1.27,
    minEffect: 0.33,
    maxEffect: 3.56,
  },
  {
    label: 'Inherited Seirios Tokyo 2400 leader',
    courseId: 10606,
    style: 'leader',
    id: 900701,
    expectedEffect: 3.50,
  },
];

for (const check of checks) {
  const row = requireRow(check.courseId, check.style, check.id);
  for (const key of ['expectedEffect', 'minEffect', 'maxEffect']) {
    if (check[key] == null) continue;
    if (!Number.isFinite(Number(row[key]))) throw new Error(`${check.label}: ${key} is missing`);
    if (rounded(row[key]) !== rounded(check[key])) {
      throw new Error(`${check.label}: ${key} ${row[key]} no longer matches current U-tools display ${check[key]}`);
    }
  }
  process.stdout.write(`PASS ${check.label}: expected=${row.expectedEffect}${row.minEffect != null ? `, min=${row.minEffect}` : ''}${row.maxEffect != null ? `, max=${row.maxEffect}` : ''}\n`);
}

const duplicateNames = new Map([['同名ユニーク', [101091, 901091]]]);
const resolved = parseUtoolsReaderText(
  '同名ユニーク\n0.25[バ]、0.10 ~ 0.40[バ]、0.12[バ/Pt]\n',
  duplicateNames,
  [
    { id: 101091, expectedEffect: 0.251 },
    { id: 901091, expectedEffect: 0.051 },
  ],
);
if (resolved.length !== 1 || resolved[0].id !== 101091 || resolved[0].minEffect !== 0.10 || resolved[0].maxEffect !== 0.40) {
  throw new Error(`Duplicate-name reader resolver attached enrichment to the wrong row: ${JSON.stringify(resolved)}`);
}
const ambiguous = parseUtoolsReaderText(
  '同名ユニーク\n0.25[バ]、0.10 ~ 0.40[バ]\n',
  duplicateNames,
  [
    { id: 101091, expectedEffect: 0.251 },
    { id: 901091, expectedEffect: 0.249 },
  ],
);
if (ambiguous.length !== 0) {
  throw new Error(`Ambiguous duplicate-name reader row should be skipped, got ${JSON.stringify(ambiguous)}`);
}
process.stdout.write('PASS duplicate full/inherited reader disambiguation.\n');

process.stdout.write('U-tools reference audit passed.\n');
