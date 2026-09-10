import fs from 'node:fs';

import { RaceSolverBuilder, Perspective } from './RaceSolverBuilder';
import { PosKeepMode, RaceSolver } from './RaceSolver';

function arg(name: string, fallback: string | null = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function required(name: string) {
  const value = arg(name);
  if (value == null) throw new Error(`Missing --${name}`);
  return value;
}

function boolArg(name: string, fallback = true) {
  const value = arg(name, fallback ? 'true' : 'false');
  return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase());
}

const horseFile = required('horse');
const courseId = Number(required('course'));
const skillId = required('skill');
const nsamples = Math.max(1, Number(arg('samples', '500')));
const seed = Number(arg('seed', '1')) >>> 0;
const timestepText = arg('timestep', '1/60')!;
const timestep = timestepText.includes('/')
  ? timestepText.split('/').map(Number).reduce((a, b) => a / b)
  : Number(timestepText);
const firstCol = arg('csv', skillId)!;
const ground = arg('ground', 'good')!;
const weather = arg('weather', 'sunny')!;
const season = arg('season', 'spring')!;
const raceTime = arg('time', 'midday')!;
const grade = arg('grade', 'g1')!;
const assumeActivationCounts = boolArg('assume-activation-counts', true);

if (!Number.isFinite(courseId) || !Number.isFinite(nsamples) || !Number.isFinite(timestep) || timestep <= 0) {
  throw new Error('Invalid numeric benchmark argument');
}

const rawHorse = JSON.parse(fs.readFileSync(horseFile, 'utf8'));
const baselineSkillIds = (rawHorse.skills || []).map((id: string | number) => String(id));
const horse = {
  speed: Number(rawHorse.speed),
  stamina: Number(rawHorse.stamina),
  power: Number(rawHorse.power),
  guts: Number(rawHorse.guts),
  wisdom: Number(rawHorse.wisdom),
  strategy: rawHorse.strategy,
  distanceAptitude: rawHorse.distanceAptitude,
  surfaceAptitude: rawHorse.surfaceAptitude,
  strategyAptitude: rawHorse.strategyAptitude,
  mood: 2 as const,
};

function makeBuilder(includeTestSkill: boolean) {
  const builder = new RaceSolverBuilder(nsamples)
    .seed(seed)
    .course(courseId)
    .horse(horse)
    .ground(ground)
    .weather(weather)
    .season(season)
    .time(raceTime)
    .grade(grade)
    .posKeepMode(PosKeepMode.Approximate)
    .skillWisdomCheck(false);

  if (assumeActivationCounts) builder.withActivateCountsAsRandom();
  for (const id of baselineSkillIds) builder.addSkill(id, Perspective.Self);
  if (includeTestSkill) builder.addSkill(skillId, Perspective.Self);
  return builder;
}

const skilled = makeBuilder(true).build();
const baseline = makeBuilder(false).build();
const gain: number[] = [];

for (let i = 0; i < nsamples; ++i) {
  const skilledNext = skilled.next();
  const baselineNext = baseline.next();
  if (skilledNext.done || baselineNext.done) throw new Error(`Builder stopped after ${i} samples`);

  const s = skilledNext.value as RaceSolver;
  const s0 = baselineNext.value as RaceSolver;
  while (s.pos < s.course.distance) s.step(timestep);
  while (s0.accumulatetime.t < s.accumulatetime.t) s0.step(timestep);
  gain.push((s.pos - s0.pos) / 2.5);
}

gain.sort((a, b) => a - b);
function quantile(p: number) {
  if (gain.length === 1) return gain[0];
  const x = (gain.length - 1) * p;
  const lo = Math.floor(x);
  const hi = Math.ceil(x);
  const t = x - lo;
  return gain[lo] * (1 - t) + gain[hi] * t;
}

const min = gain[0];
const max = gain[gain.length - 1];
const p05 = quantile(0.05);
const p25 = quantile(0.25);
const median = quantile(0.50);
const p75 = quantile(0.75);
const p95 = quantile(0.95);
const mean = gain.reduce((a, b) => a + b, 0) / gain.length;
const variance = gain.reduce((sum, x) => sum + (x - mean) ** 2, 0) / gain.length;
const stddev = Math.sqrt(variance);

console.log([
  firstCol,
  min.toFixed(6),
  max.toFixed(6),
  p05.toFixed(6),
  p25.toFixed(6),
  median.toFixed(6),
  mean.toFixed(6),
  p75.toFixed(6),
  p95.toFixed(6),
  stddev.toFixed(6),
  'RaceSolverBuilder',
  'PosKeepMode.Approximate',
  `${season}/${weather}/${ground}/${raceTime}/${grade}`,
].join(','));
