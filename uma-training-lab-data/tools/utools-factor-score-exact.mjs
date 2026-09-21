export const UTOOLS_HINT_DISCOUNT = Object.freeze({
  0: 1,
  1: 0.9,
  2: 0.8,
  3: 0.7,
  4: 0.65,
  5: 0.6,
});

export function round2(value) {
  return Math.round(100 * Number(value || 0)) / 100;
}

export function hintPointMultiplier(level) {
  const factor = UTOOLS_HINT_DISCOUNT[Math.max(0, Math.min(5, Math.floor(Number(level) || 0)))] ?? 1;
  return Math.round(1000 / factor) / 1000;
}

export function scoreCourseSkill({
  id,
  courseEffects,
  deckSupportSkillMap = {},
  baseIdResolver = null,
}) {
  const skillId = Number(id);
  const current = courseEffects?.[skillId] || courseEffects?.[String(skillId)] || null;
  let baseId = Number(current?.baseId) || null;
  if (!baseId && typeof baseIdResolver === 'function') {
    const resolved = Number(baseIdResolver(skillId));
    if (Number.isInteger(resolved) && resolved > 0 && resolved !== skillId) baseId = resolved;
  }
  const base = baseId
    ? (courseEffects?.[baseId] || courseEffects?.[String(baseId)] || null)
    : current;
  const point = Number(current?.point) || 0;
  const effect = Number(current?.effect) || 0;
  const baseEffect = Number(base?.effect) || 0;
  const covered = Boolean(
    deckSupportSkillMap?.[skillId] ||
    (baseId && deckSupportSkillMap?.[baseId]),
  );
  return {
    point,
    score: round2((covered ? 0.5 * baseEffect : baseEffect) * (baseId ? 1.5 : 1)),
    effect: round2(effect),
    baseId,
    covered,
  };
}

export function scoreHintTable({
  hintLv,
  hintSkillIds,
  courseEffects,
  deckSupportSkillMap = {},
  baseIdResolver = null,
}) {
  const rows = (hintSkillIds || []).map((id) =>
    scoreCourseSkill({ id, courseEffects, deckSupportSkillMap, baseIdResolver }));
  while (rows.length < 7) rows.push({ score: 0, point: 0 });
  if (!rows.length) return 0;
  const average = rows.reduce(
    (sum, row) => sum + (row.score && row.point ? 1000 * row.score / row.point : -2),
    0,
  ) / rows.length;
  const coefficient = Number(hintLv) === 4 ? 8.4 : 7;
  return round2(coefficient * average * hintPointMultiplier(hintLv));
}

function averageEventChoice(choice) {
  const results = Array.isArray(choice?.results) ? choice.results : [];
  const bySkill = new Map();
  for (const result of results) {
    for (const reward of result || []) {
      const skillId = Number(reward?.skillId);
      if (!Number.isInteger(skillId) || skillId <= 0) continue;
      const levels = bySkill.get(skillId) || [];
      levels.push(Number(reward?.hintLv) || 0);
      bySkill.set(skillId, levels);
    }
  }
  return [...bySkill.entries()].map(([skillId, levels]) => ({
    skillId,
    hintLv: levels.reduce((a, b) => a + b, 0) / Math.max(1, levels.length),
    dropRate: levels.length / Math.max(1, results.length),
  }));
}

export function scoreEventSkills({
  skillInfos,
  courseEffects,
  eventTypeRate,
  deckSupportSkillMap = {},
  baseIdResolver = null,
}) {
  let total = 0;
  for (const event of skillInfos || []) {
    let bestChoice = 0;
    for (const choice of event?.choiceis || []) {
      let choiceScore = 0;
      for (const reward of averageEventChoice(choice)) {
        const course = courseEffects?.[reward.skillId] || courseEffects?.[String(reward.skillId)];
        if (!course) continue;
        const row = scoreCourseSkill({
          id: reward.skillId,
          courseEffects,
          deckSupportSkillMap,
          baseIdResolver,
        });
        const hintMultiplier = hintPointMultiplier(Math.floor(reward.hintLv));
        if (row.score && row.point) {
          choiceScore += row.score * reward.dropRate * hintMultiplier * Number(eventTypeRate) * 750 / row.point;
        }
      }
      if (choiceScore > bestChoice) bestChoice = choiceScore;
    }
    total += bestChoice;
  }
  return round2(total);
}

export function scoreSupportCardExact({
  supportCard,
  courseEffects,
  deckSupportSkillMap = {},
  baseIdResolver = null,
}) {
  const hint = scoreHintTable({
    hintLv: supportCard?.hintLv,
    hintSkillIds: supportCard?.hintSkillIds,
    courseEffects,
    deckSupportSkillMap,
    baseIdResolver,
  });
  const random = scoreEventSkills({
    skillInfos: supportCard?.randomSkillInfos,
    courseEffects,
    eventTypeRate: 0.5,
    deckSupportSkillMap,
    baseIdResolver,
  });
  const sequence = scoreEventSkills({
    skillInfos: supportCard?.sequenceSkillInfos,
    courseEffects,
    eventTypeRate: 0.9,
    deckSupportSkillMap,
    baseIdResolver,
  });
  return {
    hint,
    random,
    sequence,
    total: round2(10 + hint + random + sequence),
  };
}

export function supportSkillIds(supportCard) {
  const eventIds = (infos) => (infos || []).flatMap((event) =>
    (event?.choiceis || []).flatMap((choice) =>
      (choice?.results || []).flatMap((result) =>
        (result || []).map((reward) => Number(reward?.skillId)).filter(Number.isInteger),
      ),
    ),
  );
  return [
    ...(supportCard?.hintSkillIds || []).map(Number),
    ...eventIds(supportCard?.randomSkillInfos),
    ...eventIds(supportCard?.sequenceSkillInfos),
  ].filter((id) => Number.isInteger(id) && id > 0);
}

export function buildDeckSupportSkillMap(deckCards) {
  const map = {};
  for (const card of deckCards || []) {
    for (const id of supportSkillIds(card)) map[id] = true;
  }
  return map;
}
