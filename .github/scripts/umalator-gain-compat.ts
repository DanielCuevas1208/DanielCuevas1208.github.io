import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

function option(shortName: string, longName: string, fallback: string | null = null) {
  let i = process.argv.indexOf(shortName);
  if (i < 0) i = process.argv.indexOf(longName);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const horse = process.argv[2];
const course = option('-c', '--course');
const skill = option('-s', '--skill');
const samples = option('-N', '--nsamples', '500');
const seed = option('--seed', '--seed', '1');
const csv = option('--csv', '--csv', skill);
if (!horse || !course || !skill) throw new Error('Expected horse file, -c course, and -s skill');

const DEFAULT_ENV = { season: 'spring', weather: 'sunny', ground: 'good', time: 'midday', grade: 'g1' };
const ENV_FIELDS: Record<string, { arg: string, values: Record<number, string> }> = {
  season: { arg: 'season', values: { 1: 'spring', 2: 'summer', 3: 'autumn', 4: 'winter', 5: 'sakura' } },
  weather: { arg: 'weather', values: { 1: 'sunny', 2: 'cloudy', 3: 'rainy', 4: 'snowy' } },
  ground_condition: { arg: 'ground', values: { 1: 'good', 2: 'yielding', 3: 'soft', 4: 'heavy' } },
  time: { arg: 'time', values: { 0: 'notime', 1: 'morning', 2: 'midday', 3: 'evening', 4: 'night' } },
  grade: { arg: 'grade', values: { 100: 'g1', 200: 'g2', 300: 'g3', 400: 'op', 700: 'preop', 800: 'maiden', 900: 'debut', 999: 'daily' } },
};

function environmentForSkill(skillId: string) {
  const all = JSON.parse(fs.readFileSync('data/skill_data.json', 'utf8'));
  const record = all[String(skillId)];
  let best = { score: -1, env: { ...DEFAULT_ENV } };
  for (const alt of record?.alternatives || []) {
    for (const branch of String(alt?.condition || '').split('@')) {
      const env: Record<string, string> = { ...DEFAULT_ENV };
      let score = 0;
      let conflict = false;
      for (const [field, info] of Object.entries(ENV_FIELDS)) {
        const match = branch.match(new RegExp(`(?:^|&)${field}==(-?\\d+)(?:&|$)`));
        if (!match) continue;
        const value = info.values[Number(match[1])];
        if (!value) {
          conflict = true;
          break;
        }
        env[info.arg] = value;
        score += 1;
      }
      if (!conflict && score > best.score) best = { score, env };
    }
  }
  return best.env;
}

const env = environmentForSkill(skill);
const stdout = execFileSync('npx', [
  'ts-node', '--transpile-only', '.training-lab-current-gain.ts',
  '--horse', horse,
  '--course', course,
  '--skill', skill,
  '--samples', samples!,
  '--seed', seed!,
  '--csv', csv!,
  '--season', env.season,
  '--weather', env.weather,
  '--ground', env.ground,
  '--time', env.time,
  '--grade', env.grade,
  '--assume-activation-counts', 'true',
], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const line = stdout.split(/\r?\n/).filter(Boolean).at(-1) || '';
const cols = line.split(',');
if (cols.length < 10) throw new Error(`Unexpected current evaluator output: ${line}`);
const legacy = [cols[0], cols[1], cols[2], cols[5], cols[6], cols[10] || 'RaceSolverBuilder'];
console.log(legacy.join(','));
