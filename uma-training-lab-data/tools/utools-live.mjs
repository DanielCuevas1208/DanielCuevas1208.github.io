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
  if (!joined.includes('"expectedEffect":')) throw new Error('U-tools page did not contain expectedEffect data');
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
    rows.push({ id, expectedEffect, minEffect: null, maxEffect: null });
  }
  rows.sort((a, b) => b.expectedEffect - a.expectedEffect || a.id - b.id);
  return rows;
}

function cleanMarkdownName(text) {
  return String(text || '')
    .trim()
    .replace(/^#+\s*/, '')
    .replace(/^\*\*(.*)\*\*$/, '$1')
    .replace(/\\([*_`~[\]<>])/g, '$1')
    .trim();
}

export function parseUtoolsReaderText(text, nameToId) {
  const lines = String(text).split(/\r?\n/);
  const rows = [];
  const seen = new Set();
  const valueRe = /^(-?\d+(?:\.\d+)?)\[バ\]/;
  const rangeRe = /(?:^|、)(-?\d+(?:\.\d+)?)\s*~\s*(-?\d+(?:\.\d+)?)\[バ\]/;

  for (let i = 0; i < lines.length; i++) {
    const valueMatch = lines[i].trim().match(valueRe);
    if (!valueMatch) continue;
    let name = '';
    for (let j = i - 1; j >= 0; j--) {
      const candidate = cleanMarkdownName(lines[j]);
      if (!candidate || /^\[(?:Input|Button|Image)/.test(candidate)) continue;
      if (/^(?:最大|最小|即時速度上昇|加速度_最大|速度_最大)$/.test(candidate)) continue;
      name = candidate;
      break;
    }
    const id = Number(nameToId?.get(name));
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    const expectedEffect = Number(valueMatch[1]);
    const rangeMatch = lines[i].trim().match(rangeRe);
    seen.add(id);
    rows.push({
      id,
      expectedEffect,
      minEffect: rangeMatch ? Number(rangeMatch[1]) : null,
      maxEffect: rangeMatch ? Number(rangeMatch[2]) : null,
    });
  }
  rows.sort((a, b) => b.expectedEffect - a.expectedEffect || a.id - b.id);
  return rows;
}

async function fetchText(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.text();
}

export async function fetchUtoolsExpectedEffects(courseId, style, nameToId = null) {
  const url = `${UTOOLS_SITE_BASE}/${Number(courseId)}/effects/${style}`;
  const fetchedAt = new Date().toISOString();
  try {
    const html = await fetchText(url, {
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'ja,en;q=0.7',
      'user-agent': 'Mozilla/5.0 (compatible; UmaTrainingLab/1.0; +https://github.com/DanielCuevas1208/DanielCuevas1208.github.io)',
    });
    const rows = parseUtoolsExpectedEffects(html);
    if (rows.length < 10) throw new Error(`U-tools raw parse returned only ${rows.length} rows`);
    return { url, rows, fetchedAt, transport: 'direct-rsc' };
  } catch (directError) {
    if (!nameToId) throw directError;
    const readerUrl = `https://r.jina.ai/${url}`;
    const text = await fetchText(readerUrl, {
      accept: 'text/plain',
      'user-agent': 'uma-training-lab-skill-db/1.0',
    });
    const rows = parseUtoolsReaderText(text, nameToId);
    if (rows.length < 10) {
      throw new Error(`direct U-tools failed (${directError.message}); reader fallback matched only ${rows.length} skill rows`);
    }
    return { url, rows, fetchedAt, transport: 'Jina Reader proxy of live U-tools', directError: directError.message };
  }
}
