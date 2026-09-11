import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STYLES, effectFile, readJson, writeJson } from './lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', 'skill-effects');
const globalRoot = path.join(root, 'global');
const METHOD_VERSION = 5;
const CALIBRATION_VERSION = 1;
const CONTEXT_FLAGS = new Set(['activation-count', 'opponents', 'race-order', 'lane-state']);

function calibrationFor(row) {
  const id = Number(row.id);
  const contextual = (row.contextFlags || []).some((flag) => CONTEXT_FLAGS.has(flag));
  if (contextual) return { scale: 1.0, basis: 'context-dependent: preserve paired JP→Global delta' };
  if (id >= 100000 && id < 200000) return { scale: 0.60, basis: 'unique-skill cross-context calibration' };
  if ((id >= 200000 && id < 300000) || (id >= 400000 && id < 500000)) {
    return { scale: 0.90, basis: 'ordinary-skill JP benchmark calibration' };
  }
  return { scale: 0.90, basis: 'default JP benchmark calibration' };
}

const rangeKeys = ['minEffect', 'p05Effect', 'p25Effect', 'medianEffect', 'p75Effect', 'p95Effect', 'maxEffect'];
let rowsChanged = 0;
let filesChanged = 0;
const scales = new Map();

for (const courseDir of fs.readdirSync(globalRoot, { withFileTypes: true })) {
  if (!courseDir.isDirectory() || !/^\d+$/.test(courseDir.name)) continue;
  const courseId = Number(courseDir.name);
  for (const style of STYLES) {
    const file = effectFile(root, 'global', courseId, style);
    if (!fs.existsSync(file)) continue;
    const data = readJson(file);
    let changed = false;
    for (const row of data.skills || []) {
      if (row.source !== 'utools-delta-global') continue;
      const jp = Number(row.simulatedJpEffect);
      const global = Number(row.simulatedGlobalEffect);
      const anchor = Number(row.referenceExpectedEffect);
      if (![jp, global, anchor].every(Number.isFinite)) continue;
      const rawDelta = global - jp;
      const { scale, basis } = calibrationFor(row);
      const appliedDelta = rawDelta * scale;
      const nextExpected = anchor + appliedDelta;
      const oldExpected = Number(row.expectedEffect);
      const shift = Number.isFinite(oldExpected) ? nextExpected - oldExpected : 0;
      if (!Number.isFinite(nextExpected)) continue;
      for (const key of rangeKeys) {
        if (Number.isFinite(Number(row[key]))) row[key] = Number(row[key]) + shift;
      }
      row.expectedEffect = nextExpected;
      row.simulatedDelta = rawDelta;
      row.simulatedDeltaRaw = rawDelta;
      row.simulatedDeltaApplied = appliedDelta;
      row.deltaScale = scale;
      row.calibrationBasis = basis;
      row.calibrationVersion = CALIBRATION_VERSION;
      row.methodVersion = METHOD_VERSION;
      row.rangeMethod = 'Global Umalator distribution shifted to the calibrated live-U-tools-anchored Global mean; P05-P95 is the preferred typical range';
      rowsChanged += 1;
      scales.set(scale, (scales.get(scale) || 0) + 1);
      changed = true;
    }
    if (changed) {
      data.profile = {
        ...(data.profile || {}),
        globalDifferenceMethod: 'live U-tools JP anchor + calibrated condition-aware modern-Umalator JP→Global delta',
        calibration: '0.90× for ordinary simple skills; 0.60× for unique simple skills; 1.00× for context-dependent skills',
        calibrationVersion: CALIBRATION_VERSION,
        methodVersion: METHOD_VERSION,
        rangeMethod: 'Calibrated mean with shifted Global Umalator distribution; P05-P95 is the preferred typical range',
      };
      writeJson(file, data);
      filesChanged += 1;
    }
  }
}

process.stdout.write(`calibrated ${rowsChanged} Global-difference row(s) in ${filesChanged} file(s); `);
process.stdout.write([...scales.entries()].sort((a,b)=>a[0]-b[0]).map(([scale,count]) => `${scale.toFixed(2)}×=${count}`).join(', '));
process.stdout.write('\n');
