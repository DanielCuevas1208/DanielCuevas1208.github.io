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
    rows.push({
      id,
      expectedEffect,
      minEffect: null,
      maxEffect: null,
      displayEfficiency: null,
      activationRate: null,
    });
  }
  rows.sort((a, b) => b.expectedEffect - a.expectedEffect || a.id - b.id);
  return rows;
}

function cleanMarkdownName(text) {
  return String(text || '')
    .trim()
    .replace(/^#+\s*/, '')
    .replace(/^\*\*(.*)\*\*$/, '$1')
    .replace(/^\[([^\]]+)\]\([^)]*\)$/, '$1')
    .replace(/\\([*_\`~[\]<>])/g, '$1')
    .trim();
}

function resolveNameId(name, nameToIds, { preferInherited = false } = {}) {
  const found = nameToIds?.get(name);
  const ids = Array.isArray(found) ? found : found == null ? [] : [found];
  if (!ids.length) return null;
  const normalized = ids.map((entry) => {
    if (typeof entry === 'object') return { id: Number(entry.id), inherited: !!entry.inherited };
    return { id: Number(entry), inherited: false };
  }).filter((entry) => Number.isInteger(entry.id) && entry.id > 0);
  if (!normalized.length) return null;
  const preferred = normalized.find((entry) => entry.inherited === preferInherited);
  return Number((preferred || normalized[0]).id);
}

export function parseUtoolsReaderText(text, nameToIds, options = {}) {
  const lines = String(text).split(/\r?\n/);
  const rows = [];
  const seen = new Set();
  const valueRe = /^(-?\d+(?:\.\d+)?)\[バ\](?:、(-?\d+(?:\.\d+)?)\[バ\/Pt\])?/;
  const rangeRe = /(?:^|、)(-?\d+(?:\.\d+)?)\s*~\s*(-?\d+(?:\.\d+)?)\[バ\]/;
  const activationRe = /(?:^|、)(\d+(?:\.\d+)?)%/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const valueMatch = line.match(valueRe);
    if (!valueMatch) continue;
    let name = '';
    for (let j = i - 1; j >= 0; j--) {
      const candidate = cleanMarkdownName(lines[j]);
      if (!candidate || /^\[(?:Input|Button|Image)/.test(candidate)) continue;
      if (/^(?:最大|最小|即時速度上昇|加速度_最大|速度_最大)$/.test(candidate)) continue;
      name = candidate;
      break;
    }
    const id = resolveNameId(name, nameToIds, options);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    const expectedEffect = Number(valueMatch[1]);
    if (!Number.isFinite(expectedEffect)) continue;
    const rangeMatch = line.match(rangeRe);
    const activationMatch = line.match(activationRe);
    const displayEfficiency = valueMatch[2] == null ? null : Number(valueMatch[2]);
    seen.add(id);
    rows.push({
      id,
      expectedEffect,
      minEffect: rangeMatch ? Number(rangeMatch[1]) : null,
      maxEffect: rangeMatch ? Number(rangeMatch[2]) : null,
      displayEfficiency: Number.isFinite(displayEfficiency) ? displayEfficiency : null,
      activationRate: activationMatch ? Number(activationMatch[1]) : null,
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

function mergeReaderMetadata(primaryRows, readerRows) {
  const out = new Map((primaryRows || []).map((row) => [Number(row.id), { ...row }]));
  for (const reader of readerRows || []) {
    const id = Number(reader.id);
    const current = out.get(id);
    if (!current) {
      out.set(id, { ...reader });
      continue;
    }
    out.set(id, {
      ...current,
      minEffect: reader.minEffect ?? current.minEffect ?? null,
      maxEffect: reader.maxEffect ?? current.maxEffect ?? null,
      displayEfficiency: reader.displayEfficiency ?? current.displayEfficiency ?? null,
      activationRate: reader.activationRate ?? current.activationRate ?? null,
      readerExpectedEffect: Number(reader.expectedEffect),
    });
  }
  return [...out.values()].sort((a, b) => b.expectedEffect - a.expectedEffect || a.id - b.id);
}

export async function fetchUtoolsExpectedEffects(courseId, style, nameToIds = null) {
  const url = `${UTOOLS_SITE_BASE}/${Number(courseId)}/effects/${style}`;
  const fetchedAt = new Date().toISOString();
  let directRows = null;
  let directError = null;
  try {
    const html = await fetchText(url, {
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'ja,en;q=0.7',
      'user-agent': 'Mozilla/5.0 (compatible; UmaTrainingLab/1.0; +https://github.com/DanielCuevas1208/DanielCuevas1208.github.io)',
    });
    directRows = parseUtoolsExpectedEffects(html);
    if (directRows.length < 10) throw new Error(`U-tools raw parse returned only ${directRows.length} rows`);
  } catch (error) {
    directRows = null;
    directError = error;
  }

  let readerRows = null;
  let readerError = null;
  if (nameToIds) {
    try {
      const readerUrl = `https://r.jina.ai/${url}`;
      const text = await fetchText(readerUrl, {
        accept: 'text/plain',
        'user-agent': 'uma-training-lab-skill-db/1.0',
      });
      readerRows = parseUtoolsReaderText(text, nameToIds);
      if (readerRows.length < 10) throw new Error(`reader matched only ${readerRows.length} skill rows`);
    } catch (error) {
      readerRows = null;
      readerError = error;
    }
  }

  if (directRows) {
    return {
      url,
      rows: readerRows ? mergeReaderMetadata(directRows, readerRows) : directRows,
      fetchedAt,
      transport: readerRows ? 'direct-rsc + Jina Reader metadata' : 'direct-rsc',
      readerError: readerError?.message || null,
    };
  }
  if (readerRows) {
    return {
      url,
      rows: readerRows,
      fetchedAt,
      transport: 'Jina Reader proxy of live U-tools',
      directError: directError?.message || null,
    };
  }
  throw new Error(`direct U-tools failed (${directError?.message || 'unknown'}); reader fallback failed (${readerError?.message || 'unavailable'})`);
}
