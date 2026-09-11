import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STYLES, effectFile, readJson, writeJson } from './lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', 'skill-effects');
const globalRoot = path.join(root, 'global');
const METHOD_VERSION = 6;
const CALIBRATION_VERSION = 2;
const CONTEXT_FLAGS = new Set(['activation-count', 'opponents', 'race-order', 'lane-state']);
const EPSILON = 1e-9;

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

function needsRatioFallback(anchor, jp, global, additiveExpected) {
  return anchor >= 0 && jp > EPSILON && global >= 0 && additiveExpected < 0;
}

const rangeKeys = ['minEffect', 'p05Effect', 'p25Effect', 'medianEffect', 'p75Effect', 'p95Effect', 'maxEffect'];
let rowsChanged = 0;
let filesChanged = 0;
let ratioFallbacks = 0;
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
      const additiveExpected = anchor + appliedDelta;
      const oldExpected = Number(row.expectedEffect);
      let nextExpected = additiveExpected;
      let calibrationMode = 'scaled-delta';
      let calibrationBasis = basis;

      if (needsRatioFallback(anchor, jp, global, additiveExpected)) {
        nextExpected = anchor * (global / jp);
        calibrationMode = 'ratio-fallback';
        calibrationBasis = 'ratio fallback: additive correction crossed below zero while both simulator means remained non-negative';
        ratioFallbacks += 1;
      }

      if (!Number.isFinite(nextExpected)) continue;

      if (calibrationMode === 'ratio-fallback' && global > EPSILON) {
        if (row.calibrationMode !== 'ratio-fallback' || Number(row.calibrationVersion) < CALIBRATION_VERSION) {
          const previousShift = Number.isFinite(oldExpected) ? oldExpected - global : 0;
          const rangeScale = nextExpected / global;
          for (const key of rangeKeys) {
            if (Number.isFinite(Number(row[key]))) {
              const rawGlobalValue = Number(row[key]) - previousShift;
              row[key] = rawGlobalValue * rangeScale;
            }
          }
          if (Number.isFinite(Number(row.stddevEffect))) row.stddevEffect = Number(row.stddevEffect) * Math.abs(rangeScale);
        }
      } else {
        const shift = Number.isFinite(oldExpected) ? nextExpected - oldExpected : 0;
        for (const key of rangeKeys) {
          if (Number.isFinite(Number(row[key]))) row[key] = Number(row[key]) + shift;
        }
      }

      row.expectedEffect = nextExpected;
      row.simulatedDelta = rawDelta;
      row.simulatedDeltaRaw = rawDelta;
      row.simulatedDeltaApplied = appliedDelta;
      row.deltaScale = scale;
      row.calibrationMode = calibrationMode;
      row.calibrationBasis = calibrationBasis;
      row.calibrationVersion = CALIBRATION_VERSION;
      row.methodVersion = METHOD_VERSION;
      row.rangeMethod = calibrationMode === 'ratio-fallback'
        ? 'Global Umalator distribution multiplicatively scaled to the live-U-tools JP anchor using the paired Global/JP simulator ratio; P05-P95 is the preferred typical range'
        : 'Global Umalator distribution shifted to the calibrated live-U-tools-anchored Global mean; P05-P95 is the preferred typical range';
      rowsChanged += 1;
      scales.set(scale, (scales.get(scale) || 0) + 1);
      changed = true;
    }
    if (changed) {
      data.profile = {
        ...(data.profile || {}),
        globalDifferenceMethod: 'live U-tools JP anchor + calibrated condition-aware modern-Umalator JP→Global response',
        calibration: '0.90× delta for ordinary simple skills; 0.60× delta for unique simple skills; 1.00× delta for context-dependent skills; positive simulator pairs use a ratio fallback if additive anchoring would cross below zero',
        calibrationVersion: CALIBRATION_VERSION,
        methodVersion: METHOD_VERSION,
        rangeMethod: 'Calibrated mean with shifted Global Umalator distribution; ratio-fallback rows use multiplicatively scaled Global distributions; P05-P95 is the preferred typical range',
      };
      writeJson(file, data);
      filesChanged += 1;
    }
  }
}

process.stdout.write(`calibrated ${rowsChanged} Global-difference row(s) in ${filesChanged} file(s); `);
process.stdout.write([...scales.entries()].sort((a,b)=>a[0]-b[0]).map(([scale,count]) => `${scale.toFixed(2)}×=${count}`).join(', '));
process.stdout.write(`; ratio fallback=${ratioFallbacks}\n`);
