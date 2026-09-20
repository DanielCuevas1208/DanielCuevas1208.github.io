import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GAMETORA_MANIFEST_URL,
  fetchJson,
  loadGameToraDataset,
  writeJson,
} from './lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', 'catalog');

const manifest = await fetchJson(GAMETORA_MANIFEST_URL);
const [skills, supports, characters] = await Promise.all([
  loadGameToraDataset('skills'),
  loadGameToraDataset('support-cards'),
  loadGameToraDataset('character-cards'),
]);

if (!Array.isArray(skills) || !skills.length) throw new Error('GameTora skills dataset is empty');
if (!Array.isArray(supports) || !supports.length) throw new Error('GameTora support-cards dataset is empty');
if (!Array.isArray(characters) || !characters.length) throw new Error('GameTora character-cards dataset is empty');

const globalSupportIds = supports
  .filter((row) => !!row?.release_en)
  .map((row) => Number(row.support_id))
  .filter(Number.isInteger)
  .sort((a, b) => a - b);

const globalCharacterIds = characters
  .filter((row) => !!row?.release_en)
  .map((row) => Number(row.card_id))
  .filter(Number.isInteger)
  .sort((a, b) => a - b);

writeJson(path.join(root, 'skills.json'), skills);
writeJson(path.join(root, 'availability.json'), {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  meta: {
    source: 'GameTora direct',
    manifestUrl: GAMETORA_MANIFEST_URL,
    hashes: {
      skills: manifest.skills || null,
      supportCards: manifest['support-cards'] || null,
      characterCards: manifest['character-cards'] || null,
    },
  },
  globalSupportIds,
  globalCharacterIds,
});

process.stdout.write(
  `GameTora catalog: ${skills.length} skills, ${globalSupportIds.length} Global supports, ${globalCharacterIds.length} Global character cards\n`,
);
