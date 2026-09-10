import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_SKILLS_URL,
  DEFAULT_UTOOLS_EFFECT_ROOT,
  STYLES,
  effectFile,
  fetchJson,
  indexSkills,
  loadSkills,
  mechanicsHash,
  normalizeEffectFile,
  parseArgs,
  writeJson,
} from './lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', 'skill-effects');
const args = parseArgs(process.argv.slice(2));
const skillsUrl = args['skills-url'] || DEFAULT_SKILLS_URL;
const sourceRoot = args['source-root'] || DEFAULT_UTOOLS_EFFECT_ROOT;
const onlyCourse = args.course ? Number(args.course) : null;
const onlyStyle = args.style || null;

const skills = indexSkills(await loadSkills(skillsUrl));
const index = await fetchJson(`${sourceRoot}/available.json`);
const courseIds = (index.courseIds || [])
  .map(Number)
  .filter((id) => Number.isInteger(id) && (!onlyCourse || id === onlyCourse));
const styles = onlyStyle ? [onlyStyle] : STYLES;
let written = 0;

for (const courseId of courseIds) {
  for (const style of styles) {
    try {
      const source = await fetchJson(`${sourceRoot}/${courseId}/${style}.json`);
      const rows = (source.skills || []).map((row) => {
        const skill = skills.get(Number(row.id));
        return {
          id: Number(row.id),
          expectedEffect: Number(row.expectedEffect),
          minEffect: null,
          medianEffect: null,
          maxEffect: null,
          samples: null,
          mechanicsHash: mechanicsHash(skill, 'jp'),
          source: 'utools',
          sourceUpdatedAt: source.fetchedAt || null,
        };
      });
      const out = normalizeEffectFile({
        server: 'jp',
        courseId,
        style,
        generatedAt: new Date().toISOString(),
        profile: {
          evaluator: 'U-tools',
          sourceUrl: source.source || null,
          importedFrom: `${sourceRoot}/${courseId}/${style}.json`,
        },
        skills: rows,
      });
      writeJson(effectFile(root, 'jp', courseId, style), out);
      written += 1;
      process.stdout.write(`jp ${courseId}/${style}: ${rows.length}\n`);
    } catch (error) {
      process.stderr.write(`skip ${courseId}/${style}: ${error.message}\n`);
    }
  }
}

process.stdout.write(`wrote ${written} JP course/style files\n`);
