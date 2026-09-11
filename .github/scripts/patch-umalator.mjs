import fs from 'node:fs';
import path from 'node:path';

const target = path.resolve(process.argv[2] || 'RaceSolverBuilder.ts');
let source = fs.readFileSync(target, 'utf8');
let changed = false;

const enhancedPattern = /^.*EnhancedHpPolicy.*(?:\r?\n|$)/gm;
if (enhancedPattern.test(source)) {
  source = source.replace(enhancedPattern, '');
  changed = true;
}

const unsafeOriginWisdom = 'originWisdom: this._skills[sdi].originWisdom';
const safeOriginWisdom = "originWisdom: this._skills.find(({id, p}) => id === sd.skillId && p === sd.perspective)?.originWisdom";

if (source.includes(unsafeOriginWisdom)) {
  source = source.replace(unsafeOriginWisdom, safeOriginWisdom);
  changed = true;
} else if (!source.includes(safeOriginWisdom)) {
  throw new Error('Umalator RaceSolverBuilder.ts no longer matches the expected originWisdom source shape; audit upstream before refreshing data.');
}

if (source.includes('this._skills[sdi].originWisdom')) {
  throw new Error('Unsafe positional originWisdom lookup remains after patch.');
}

if (/EnhancedHpPolicy/.test(source)) {
  throw new Error('EnhancedHpPolicy compatibility reference remains after patch.');
}

if (changed) fs.writeFileSync(target, source, 'utf8');
process.stdout.write(`Umalator compatibility patch ${changed ? 'applied' : 'already present'}: ${target}\n`);
