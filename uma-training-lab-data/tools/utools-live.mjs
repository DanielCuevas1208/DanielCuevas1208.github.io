export const UTOOLS_SITE_BASE = 'https://xn--gck1f423k.xn--1bvt37a.tools/race/courses';

function decodeRscChunks(html) {
  const chunks = [...String(html).matchAll(/self\.__next_f\.push\(\[1,"((?:\\.|[^"\\])*)"\]\)/g)];
  return chunks
    .map(([, chunk]) => chunk
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\\\/g, '\\'))
    .join('');
}

function lastMatch(text, re) {
  return [...text.matchAll(re)].at(-1) || null;
}

export function parseUtoolsExpectedEffects(html) {
  const joined = decodeRscChunks(html);
  if (!joined.includes('"expectedEffect":')) {
    throw new Error('U-tools page did not contain expectedEffect data');
  }

  const rows = [];
  const seen = new Set();
  const re = /"expectedEffect":(-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)/g;
  let match;
  while ((match = re.exec(joined))) {
    const expectedEffect = Number(match[1]);
    const before = joined.slice(Math.max(0, match.index - 8000), match.index);
    const idMatch = lastMatch(before, /"id":(\d+)/g);
    if (!idMatch) continue;
    const id = Number(idMatch[1]);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id) || !Number.isFinite(expectedEffect)) continue;
    seen.add(id);
    rows.push({ id, expectedEffect });
  }

  rows.sort((a, b) => b.expectedEffect - a.expectedEffect || a.id - b.id);
  return rows;
}

export async function fetchUtoolsExpectedEffects(courseId, style) {
  const url = `${UTOOLS_SITE_BASE}/${Number(courseId)}/effects/${style}`;
  const response = await fetch(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'ja,en;q=0.7',
      'user-agent': 'uma-training-lab-skill-db/1.0 (+https://github.com/DanielCuevas1208/DanielCuevas1208.github.io)',
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  const html = await response.text();
  const rows = parseUtoolsExpectedEffects(html);
  if (rows.length < 10) throw new Error(`U-tools parse returned only ${rows.length} rows: ${url}`);
  return {
    url,
    rows,
    fetchedAt: new Date().toISOString(),
  };
}
