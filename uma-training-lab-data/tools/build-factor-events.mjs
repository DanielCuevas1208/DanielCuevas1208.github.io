import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '..', 'factor-score');
const outFile = path.join(outDir, 'support-events.json');
const BASE = 'https://gametora.com';
const USER_AGENT = 'uma-training-lab-factor-events/1.0';
const REWARD_OFFSET = 36;

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

function manifestUrl(manifest, key) {
  const hash = manifest[key];
  if (!hash) throw new Error(`GameTora manifest has no "${key}" entry`);
  return `${BASE}/data/umamusume/${key}.${hash}.json`;
}

function decodeSkillReward(rewardId, rewards) {
  const row = rewards?.[Number(rewardId) - REWARD_OFFSET];
  if (!Array.isArray(row) || row[0] !== 'sk') return null;
  const id = Number(row[2]);
  if (!Number.isInteger(id) || id <= 0) return null;
  const level = Math.max(1, Math.min(5, Math.abs(Number(row[1])) || 1));
  return { id, level };
}

function buildCards(entries, rewards) {
  const cards = {};
  for (const entry of entries || []) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const supportId = Number(entry[0]);
    if (!Number.isInteger(supportId) || supportId <= 0) continue;

    const events = [];
    for (const event of entry[1] || []) {
      if (!Array.isArray(event) || !Array.isArray(event[1])) continue;
      const choices = [];
      for (const choice of event[1]) {
        if (!Array.isArray(choice) || !Array.isArray(choice[1])) continue;
        const seen = new Set();
        const hints = [];
        for (const rewardId of choice[1]) {
          const reward = decodeSkillReward(rewardId, rewards);
          if (!reward) continue;
          const key = `${reward.id}:${reward.level}`;
          if (seen.has(key)) continue;
          seen.add(key);
          hints.push(reward);
        }
        if (hints.length) choices.push(hints);
      }
      if (choices.length) events.push({ choices });
    }
    if (events.length) cards[String(supportId)] = events;
  }
  return Object.fromEntries(Object.entries(cards).sort(([a],[b]) => Number(a) - Number(b)));
}

const manifest = await fetchJson(`${BASE}/data/manifests/umamusume.json`);
const [rewards, ssr, sr] = await Promise.all([
  fetchJson(manifestUrl(manifest, 'dict/evrew')),
  fetchJson(manifestUrl(manifest, 'training_events/ssr')),
  fetchJson(manifestUrl(manifest, 'training_events/sr')),
]);

const source = {
  provider: 'GameTora',
  manifest: {
    evrew: manifest['dict/evrew'],
    ssr: manifest['training_events/ssr'],
    sr: manifest['training_events/sr'],
  },
};
const cards = buildCards([...(ssr || []), ...(sr || [])], rewards);
const stable = { schemaVersion: 1, source, cards };

let previous = null;
try {
  previous = JSON.parse(fs.readFileSync(outFile, 'utf8'));
} catch {}

const previousStable = previous
  ? { schemaVersion: previous.schemaVersion, source: previous.source, cards: previous.cards }
  : null;

fs.mkdirSync(outDir, { recursive: true });
if (previousStable && JSON.stringify(previousStable) === JSON.stringify(stable)) {
  process.stdout.write(`Factor event topology already current: ${Object.keys(cards).length} cards.\n`);
} else {
  const output = {
    ...stable,
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(outFile, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  const eventCount = Object.values(cards).reduce((sum, events) => sum + events.length, 0);
  const choiceCount = Object.values(cards).flat().reduce((sum, event) => sum + event.choices.length, 0);
  process.stdout.write(
    `Wrote factor event topology: ${Object.keys(cards).length} cards, ${eventCount} skill-bearing events, ${choiceCount} choices.\n`,
  );
}
