export const UTOOLS_SITE_BASE = 'https://xn--gck1f423k.xn--1bvt37a.tools/race/courses';

const STYLE_JP = Object.freeze({
  '逃げ': 'runner',
  '大逃げ': 'runner',
  '先行': 'leader',
  '差し': 'betweener',
  '追込': 'chaser',
});

function cleanLine(value) {
  return String(value || '').trim();
}

function parseLengths(value) {
  const match = cleanLine(value).match(/^(-?\d+(?:\.\d+)?)\[バ\]$/);
  return match ? Number(match[1]) : null;
}

function parseRecoveryLabel(value) {
  const text = cleanLine(value);
  const match = text.match(/^([+-]\d+(?:\.\d+)?)\[回復\](.+)$/);
  if (!match) return { label: text, recoveryAdjustment: null };
  return {
    label: cleanLine(match[2]),
    recoveryAdjustment: Number(match[1]),
  };
}

export function parseUtoolsCharacterEffects(text) {
  const lines = String(text).split(/\r?\n/);
  const rows = [];
  const seen = new Set();

  for (let i = 0; i < lines.length; i++) {
    const cardMatch = lines[i].match(/\]\(https?:\/\/[^)]+\/cards\/(\d+)\)/);
    if (!cardMatch) continue;
    const cardId = Number(cardMatch[1]);
    if (!Number.isInteger(cardId) || cardId <= 0) continue;

    const window = [];
    for (let j = i + 1; j < Math.min(lines.length, i + 40); j++) {
      const line = cleanLine(lines[j]);
      if (!line) continue;
      if (/\]\(https?:\/\/[^)]+\/cards\/(\d+)\)/.test(line)) break;
      window.push(line);
    }

    const strategyIndex = window.findIndex((line) => Object.prototype.hasOwnProperty.call(STYLE_JP, line));
    if (strategyIndex < 0) continue;
    const style = STYLE_JP[window[strategyIndex]];

    let totalIndex = -1;
    for (let j = strategyIndex + 1; j < window.length; j++) {
      if (parseLengths(window[j]) != null) {
        totalIndex = j;
        break;
      }
    }
    if (totalIndex < 0 || totalIndex + 1 >= window.length) continue;
    const totalEffect = parseLengths(window[totalIndex]);
    const parsedLabel = parseRecoveryLabel(window[totalIndex + 1]);

    const components = [];
    for (let j = totalIndex + 2; j < window.length && components.length < 3; j++) {
      const value = parseLengths(window[j]);
      if (value != null) components.push(value);
    }
    if (components.length < 1) continue;

    const key = `${cardId}:${style}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      cardId,
      style,
      label: parsedLabel.label,
      recoveryAdjustment: parsedLabel.recoveryAdjustment,
      totalEffect,
      fullUniqueEffect: components[0],
      evolved1Effect: components[1] ?? null,
      evolved2Effect: components[2] ?? null,
    });
  }

  rows.sort((a, b) => b.totalEffect - a.totalEffect || a.cardId - b.cardId);
  return rows;
}

async function fetchText(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.text();
}

export async function fetchUtoolsCharacterEffects(courseId) {
  const sourceUrl = `${UTOOLS_SITE_BASE}/${Number(courseId)}/effects`;
  const readerUrl = `https://r.jina.ai/${sourceUrl}`;
  const fetchedAt = new Date().toISOString();
  const text = await fetchText(readerUrl, {
    accept: 'text/plain',
    'user-agent': 'uma-training-lab-skill-db/1.0',
  });
  const rows = parseUtoolsCharacterEffects(text);
  if (rows.length < 5) throw new Error(`U-tools character reader matched only ${rows.length} rows`);
  return {
    url: sourceUrl,
    fetchedAt,
    transport: 'Jina Reader proxy of live U-tools character ranking',
    rows,
  };
}
