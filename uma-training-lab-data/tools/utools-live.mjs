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

function numericField(window, names) {
  for (const name of names) {
    const match = window.match(new RegExp(`"${name}":(-?(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:[eE][+-]?\\d+)?)`));
    if (match) return Number(match[1]);
  }
  return null;
}

export function parseUtoolsExpectedEffects(html) {
  const joined = decodeRscChunks(html);
  if (!joined.includes('"expectedEffect":')) throw new Error('U-tools page did not contain expectedEffect data');
  const rows = [];
  const seen = new Set();
  const re = /"expectedEffect":(-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)/g;
  const matches = [...joined.matchAll(re)];
  for (let mi = 0; mi < matches.length; mi++) {
    const match = matches[mi];
    const expectedEffect = Number(match[1]);
    const searchStart = Math.max(0, match.index - 8000);
    const before = joined.slice(searchStart, match.index);
    const idMatch = lastMatch(before, /"id":(\d+)/g);
    if (!idMatch) continue;
    const id = Number(idMatch[1]);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id) || !Number.isFinite(expectedEffect)) continue;
    const absoluteIdIndex = searchStart + (idMatch.index || 0);
    const nextExpected = mi + 1 < matches.length ? matches[mi + 1].index : joined.length;
    const rowEnd = Math.min(nextExpected, match.index + 8000);
    const window = joined.slice(absoluteIdIndex, rowEnd);
    const minEffect = numericField(window, ['minEffect', 'minimumEffect']);
    const maxEffect = numericField(window, ['maxEffect', 'maximumEffect']);
    const averageEffect = numericField(window, ['averageEffect', 'avgEffect', 'meanEffect']);
    const medianEffect = numericField(window, ['medianEffect']);
    const activationRate = numericField(window, ['activationRate', 'activateRate', 'activationProbability', 'activateProbability']);
    const pointEfficiency = numericField(window, ['pointEfficiency', 'ptEfficiency', 'efficiency']);
    seen.add(id);
    rows.push({ id, expectedEffect, minEffect, maxEffect, averageEffect, medianEffect, activationRate, pointEfficiency });
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
  const efficiencyRe = /(?:^|、)(-?\d+(?:\.\d+)?)\[バ\/Pt\]/;
  const activationRe = /(?:^|、)(-?\d+(?:\.\d+)?)%/;

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
    const rendered = lines[i].trim();
    const rangeMatch = rendered.match(rangeRe);
    const efficiencyMatch = rendered.match(efficiencyRe);
    const activationMatch = rendered.match(activationRe);
    seen.add(id);
    rows.push({
      id,
      expectedEffect,
      minEffect: rangeMatch ? Number(rangeMatch[1]) : null,
      maxEffect: rangeMatch ? Number(rangeMatch[2]) : null,
      averageEffect: null,
      medianEffect: null,
      activationRate: activationMatch ? Number(activationMatch[1]) : null,
      pointEfficiency: efficiencyMatch ? Number(efficiencyMatch[1]) : null,
    });
  }
  rows.sort((a, b) => b.expectedEffect - a.expectedEffect || a.id - b.id);
  return rows;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url, headers = {}, attempts = 4) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, { headers });
      if (response.ok) return response.text();
      const retryable = response.status === 403 || response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
      lastError = new Error(`${response.status} ${response.statusText}: ${url}`);
      if (!retryable || attempt === attempts) throw lastError;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) throw error;
    }
    await sleep(700 * attempt + Math.floor(Math.random() * 250));
  }
  throw lastError || new Error(`Unable to fetch ${url}`);
}

function mergeRows(primary, enrichment) {
  const byId = new Map(primary.map((row) => [Number(row.id), { ...row }]));
  for (const extra of enrichment || []) {
    const id = Number(extra.id);
    const current = byId.get(id);
    if (!current) {
      byId.set(id, { ...extra });
      continue;
    }
    for (const key of ['minEffect', 'maxEffect', 'averageEffect', 'medianEffect', 'activationRate', 'pointEfficiency']) {
      if (current[key] == null && extra[key] != null) current[key] = extra[key];
    }
  }
  return [...byId.values()].sort((a, b) => b.expectedEffect - a.expectedEffect || a.id - b.id);
}

async function fetchReaderRows(url, nameToId) {
  if (!nameToId) return [];
  const text = await fetchText(`https://r.jina.ai/${url}`, {
    accept: 'text/plain',
    'user-agent': 'uma-training-lab-skill-db/1.0',
  });
  return parseUtoolsReaderText(text, nameToId);
}

export async function fetchUtoolsExpectedEffects(courseId, style, nameToId = null) {
  const url = `${UTOOLS_SITE_BASE}/${Number(courseId)}/effects/${style}`;
  const fetchedAt = new Date().toISOString();
  let directError = null;
  let directRows = [];

  try {
    const html = await fetchText(url, {
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'ja,en;q=0.7',
      'user-agent': 'Mozilla/5.0 (compatible; UmaTrainingLab/1.0; +https://github.com/DanielCuevas1208/DanielCuevas1208.github.io)',
    });
    directRows = parseUtoolsExpectedEffects(html);
    if (directRows.length < 10) throw new Error(`U-tools raw parse returned only ${directRows.length} rows`);
  } catch (error) {
    directError = error;
    directRows = [];
  }

  if (directRows.length) {
    if (!nameToId) return { url, rows: directRows, fetchedAt, transport: 'direct-rsc' };
    try {
      const readerRows = await fetchReaderRows(url, nameToId);
      const rows = mergeRows(directRows, readerRows);
      return {
        url,
        rows,
        fetchedAt,
        transport: 'direct-rsc + reader-enrichment',
        directRows: directRows.length,
        readerRows: readerRows.length,
        readerOnlyRows: Math.max(0, rows.length - directRows.length),
      };
    } catch (readerError) {
      return {
        url,
        rows: directRows,
        fetchedAt,
        transport: 'direct-rsc',
        enrichmentError: readerError.message,
      };
    }
  }

  if (!nameToId) throw directError;
  const rows = await fetchReaderRows(url, nameToId);
  if (rows.length < 10) {
    throw new Error(`direct U-tools failed (${directError?.message || 'unknown'}); reader fallback matched only ${rows.length} skill rows`);
  }
  return {
    url,
    rows,
    fetchedAt,
    transport: 'Jina Reader proxy of live U-tools',
    directError: directError?.message || null,
  };
}
