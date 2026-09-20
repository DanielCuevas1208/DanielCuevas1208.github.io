import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_UTOOLS_EFFECT_ROOT,
  STYLES,
  effectFile,
  fetchJson,
  readJson,
  writeJson,
} from './lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', 'skill-effects');
const jpRoot = path.join(root, 'jp');

function roundedDisplay(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function sameNumber(a, b) {
  return Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Math.abs(Number(a) - Number(b)) <= 1e-12;
}

let verified = 0;
let liveOnly = 0;
let directExact = 0;
let filesChanged = 0;
let mirrorFailures = 0;

for (const courseDir of fs.readdirSync(jpRoot, { withFileTypes: true })) {
  if (!courseDir.isDirectory() || !/^\d+$/.test(courseDir.name)) continue;
  const courseId = Number(courseDir.name);
  for (const style of STYLES) {
    const file = effectFile(root, 'jp', courseId, style);
    if (!fs.existsSync(file)) continue;
    const data = readJson(file);
    if (String(data?.profile?.importedFrom || '').startsWith('direct-rsc')) {
      directExact += (data.skills || []).length;
      continue;
    }

    let mirror;
    try {
      mirror = await fetchJson(`${DEFAULT_UTOOLS_EFFECT_ROOT}/${courseId}/${style}.json`);
    } catch (error) {
      mirrorFailures += 1;
      process.stderr.write(`mirror unavailable ${courseId}/${style}: ${error.message}\n`);
      continue;
    }
    const mirrorById = new Map((mirror.skills || []).map((row) => [Number(row.id), Number(row.expectedEffect)]));
    let changed = false;
    let fileVerified = 0;
    let fileLiveOnly = 0;
    for (const row of data.skills || []) {
      const exact = mirrorById.get(Number(row.id));
      const displayed = Number(row.expectedEffect);
      if (Number.isFinite(exact) && roundedDisplay(exact) === roundedDisplay(displayed)) {
        if (!sameNumber(row.expectedEffect, exact)) {
          row.expectedEffect = exact;
          changed = true;
        }
        row.referencePrecision = 'mirror-full-precision-live-display-verified';
        row.referenceVerifiedAgainstLive = true;
        fileVerified += 1;
      } else {
        row.referencePrecision = 'live-display';
        row.referenceVerifiedAgainstLive = true;
        fileLiveOnly += 1;
      }
    }
    verified += fileVerified;
    liveOnly += fileLiveOnly;
    const nextPrecision = 'Live U-tools is authoritative; mirror full precision is retained only when it rounds exactly to the current live displayed value.';
    if (data.profile?.precision !== nextPrecision
        || data.profile?.mirrorVerifiedExactRows !== fileVerified
        || data.profile?.liveDisplayOnlyRows !== fileLiveOnly) changed = true;
    data.profile = {
      ...(data.profile || {}),
      precision: nextPrecision,
      mirrorVerifiedExactRows: fileVerified,
      liveDisplayOnlyRows: fileLiveOnly,
    };
    if (changed) {
      writeJson(file, data);
      filesChanged += 1;
    }
  }
}

process.stdout.write(`U-tools precision verification: ${verified} mirror-exact rows verified against live display, ${liveOnly} live-display-only rows, ${directExact} direct-RSC exact rows; ${filesChanged} file(s) updated, ${mirrorFailures} mirror fetch failure(s).\n`);
