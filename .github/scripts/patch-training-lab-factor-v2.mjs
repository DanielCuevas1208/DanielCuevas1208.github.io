import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const selfTest = args.includes('--self-test');
const input = args.find((arg) => !arg.startsWith('--'));
const outputArg = input ? args.slice(args.indexOf(input) + 1).find((arg) => !arg.startsWith('--')) : null;

function replaceOnce(text, needle, replacement, label) {
  const index = text.indexOf(needle);
  if (index < 0) throw new Error(`Missing patch marker: ${label}`);
  if (text.indexOf(needle, index + needle.length) >= 0) {
    throw new Error(`Patch marker is not unique: ${label}`);
  }
  return text.slice(0, index) + replacement + text.slice(index + needle.length);
}

function insertBeforeOnce(text, marker, insertion, label) {
  const index = text.indexOf(marker);
  if (index < 0) throw new Error(`Missing insert marker: ${label}`);
  return text.slice(0, index) + insertion + text.slice(index);
}

function replaceBetween(text, startMarker, endMarker, replacement, label) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`Missing block markers: ${label}`);
  return text.slice(0, start) + replacement + text.slice(end);
}

function patchHtml(source) {
  let html = source;

  if (!html.includes('SKILL_FACTOR_DATA_ROOT')) {
    html = insertBeforeOnce(
      html,
      '      const SKILL_EFFECT_MANIFEST_URLS = [',
      `      const SKILL_FACTOR_DATA_ROOT =
        "https://raw.githubusercontent.com/DanielCuevas1208/DanielCuevas1208.github.io/main/uma-training-lab-data/factor-score/";
      const SKILL_FACTOR_MODEL_URLS = [
        "./data/factor-score/model.json",
        SKILL_FACTOR_DATA_ROOT + "model.json",
      ];
      const SKILL_FACTOR_EVENTS_URLS = [
        "./data/factor-score/support-events.json",
        SKILL_FACTOR_DATA_ROOT + "support-events.json",
      ];
`,
      'factor data URLs',
    );
  }

  if (!html.includes('factorModel: null')) {
    html = replaceOnce(
      html,
      '        effectSource: null,',
      `        effectSource: null,
        factorModel: null,
        factorEvents: null,`,
      'SKILL_DB factor fields',
    );
  }

  html = replaceOnce(
    html,
    '          const [skills, courseData, effectManifest, effectIndex, globalRaces, globalSupports, courseGeometry] = await Promise.all([',
    '          const [skills, courseData, effectManifest, effectIndex, globalRaces, globalSupports, courseGeometry, factorModel, factorEvents] = await Promise.all([',
    'ensureSkillData destructuring',
  );

  html = replaceOnce(
    html,
    '            fetchOptionalFirstJson(SKILL_COURSE_GEOMETRY_URLS, 22000),',
    `            fetchOptionalFirstJson(SKILL_COURSE_GEOMETRY_URLS, 22000),
            fetchOptionalFirstJson(SKILL_FACTOR_MODEL_URLS, 12000),
            fetchOptionalFirstJson(SKILL_FACTOR_EVENTS_URLS, 18000),`,
    'ensureSkillData factor fetches',
  );

  html = replaceOnce(
    html,
    '          SKILL_DB.effectManifest = effectManifest?.schemaVersion === 1 ? effectManifest : null;',
    `          SKILL_DB.effectManifest = effectManifest?.schemaVersion === 1 ? effectManifest : null;
          SKILL_DB.factorModel = factorModel?.schemaVersion === 1 ? factorModel : null;
          SKILL_DB.factorEvents = factorEvents?.schemaVersion === 1 ? factorEvents : null;`,
    'factor data assignment',
  );

  const factorBlock=`      function skillHintDiscount(level) {
        const discounts = [0, 0.10, 0.20, 0.30, 0.35, 0.40];
        return discounts[Math.max(0, Math.min(5, Math.floor(Number(level) || 0)))] || 0;
      }
      function skillFactorFormula() {
        const formula = SKILL_DB.factorModel?.formula || {};
        return {
          valueExponent: Number.isFinite(Number(formula.valueExponent)) ? Number(formula.valueExponent) : 0,
          efficiencyExponent: Number.isFinite(Number(formula.efficiencyExponent)) ? Number(formula.efficiencyExponent) : 0.65,
          tableExponent: Number.isFinite(Number(formula.tableExponent)) ? Number(formula.tableExponent) : 1.10,
          hintFrequencyExponent: Number.isFinite(Number(formula.hintFrequencyExponent)) ? Number(formula.hintFrequencyExponent) : 0.60,
          eventWeight: Number.isFinite(Number(formula.eventWeight)) ? Number(formula.eventWeight) : 0.015,
          deckCoveredMultiplier: Number.isFinite(Number(formula.deckCoveredMultiplier)) ? Number(formula.deckCoveredMultiplier) : 0.80,
          scale: Number.isFinite(Number(formula.scale)) ? Number(formula.scale) : 62.795762,
        };
      }
      function skillFactorCardContext(cardId) {
        const group = cardsById.get(Number(cardId));
        if (!group) return null;
        const entry = {
          key: \`factor-\${cardId}\`,
          id: Number(cardId),
          lb: bestLb(group),
          relation: 100,
          friendCount: 0,
          tempSpecialty: 0,
        };
        const card = getCard(entry);
        if (!card) return null;
        const hintLevelBonus =
          (Number(card.status?.hintLevel) || 0) +
          (Number(card.unique?.hintLevel) || 0);
        const hintFreq =
          (Number(card.status?.hintFrequency) || 0) +
          (Number(card.unique?.hintFrequency) || 0);
        return {
          group,
          entry,
          card,
          hintLevel: Math.min(5, 1 + Math.max(0, hintLevelBonus)),
          hintFreq: Math.max(0, hintFreq),
          hintTable: Array.isArray(card.skills) ? card.skills.length : 0,
        };
      }
      function skillFactorIndexes(server) {
        const rows = skillEligibleRows({
          applySearch: false,
          applyView: false,
          applyKinds: false,
        }).allForCounts;
        const byId = new Map();
        const whiteByJpName = new Map();
        for (const item of rows) {
          const value = Number(item.row.expectedEffect);
          if (!Number.isFinite(value) || value <= 0) continue;
          byId.set(Number(item.row.id), item);
          if (skillDisplayKind(item.skill) !== "white") continue;
          const jpName = String(item.skill?.jpname || "").trim();
          if (!jpName) continue;
          const current = whiteByJpName.get(jpName);
          if (!current || value > Number(current.row.expectedEffect)) {
            whiteByJpName.set(jpName, item);
          }
        }
        return { rows, byId, whiteByJpName };
      }
      function skillFactorUtility(item, hintLevel, formula, server) {
        if (!item) return null;
        const value = Number(item.row.expectedEffect);
        if (!Number.isFinite(value) || value <= 0) return null;
        const baseCost = Number(
          skillServerField(item.skill, server, "cost") ??
          item.row.needSkillPoint,
        );
        const effectiveCost =
          Number.isFinite(baseCost) && baseCost > 0
            ? baseCost * (1 - skillHintDiscount(hintLevel))
            : NaN;
        const publishedEfficiency = item.row.pointEfficiency != null
          ? Number(item.row.pointEfficiency)
          : NaN;
        const efficiency =
          Number.isFinite(effectiveCost) && effectiveCost > 0
            ? (value / effectiveCost) * 100
            : publishedEfficiency;
        if (!Number.isFinite(efficiency) || efficiency <= 0) return null;
        return {
          value,
          baseCost,
          effectiveCost,
          efficiency,
          utility:
            Math.pow(value, formula.valueExponent) *
            Math.pow(efficiency, formula.efficiencyExponent),
        };
      }
      function skillFactorDeckHintNames() {
        const names = new Set();
        for (const entry of skillDeckCards) {
          const card = getCard(entry);
          for (const name of card?.skills || []) {
            const normalized = String(name || "").trim();
            if (normalized) names.add(normalized);
          }
        }
        return names;
      }
      function buildSkillFactorRanking(server, deckIds) {
        const formula = skillFactorFormula();
        const indexes = skillFactorIndexes(server);
        const deckHintNames = skillFactorDeckHintNames();
        const ranked = [];
        for (const [rawId] of cardsById) {
          const id = Number(rawId);
          if (!Number.isInteger(id) || deckIds.has(id)) continue;
          if (!skillSourceAllowed(id, server)) continue;
          const ctx = skillFactorCardContext(id);
          if (!ctx || !ctx.hintTable || Number(ctx.card?.rarity) < 2) continue;

          const hintFrequencyMultiplier = Math.pow(
            1 + ctx.hintFreq / 100,
            formula.hintFrequencyExponent,
          );
          let score = 0;
          const details = [];

          for (const rawName of ctx.card.skills || []) {
            const jpName = String(rawName || "").trim();
            if (!jpName) continue;
            const item = indexes.whiteByJpName.get(jpName);
            const utility = skillFactorUtility(item, ctx.hintLevel, formula, server);
            if (!item || !utility) continue;
            const deckMultiplier = deckHintNames.has(jpName)
              ? formula.deckCoveredMultiplier
              : 1;
            const contribution =
              (utility.utility / Math.pow(ctx.hintTable, formula.tableExponent)) *
              hintFrequencyMultiplier *
              deckMultiplier *
              formula.scale;
            score += contribution;
            details.push({
              id: Number(item.row.id),
              name: item.name,
              value: utility.value,
              source: { id, hint: true, event: false },
              contribution,
              factor: {
                kind: "hint",
                hint: true,
                event: false,
                hintLevel: ctx.hintLevel,
                hintTable: ctx.hintTable,
                efficiency: utility.efficiency,
                deckMultiplier,
              },
            });
          }

          const events = SKILL_DB.factorEvents?.cards?.[String(id)] || [];
          for (const event of events) {
            let best = null;
            for (const choice of event.choices || []) {
              let rawChoiceScore = 0;
              const choiceDetails = [];
              for (const reward of choice || []) {
                const item = indexes.byId.get(Number(reward.id));
                const utility = skillFactorUtility(
                  item,
                  Math.max(1, Math.min(5, Number(reward.level) || 1)),
                  formula,
                  server,
                );
                if (!item || !utility) continue;
                const jpName = String(item.skill?.jpname || "").trim();
                const deckMultiplier =
                  jpName && deckHintNames.has(jpName)
                    ? formula.deckCoveredMultiplier
                    : 1;
                const rawContribution = utility.utility * deckMultiplier;
                rawChoiceScore += rawContribution;
                choiceDetails.push({
                  id: Number(item.row.id),
                  name: item.name,
                  value: utility.value,
                  source: { id, hint: false, event: true },
                  rawContribution,
                  factor: {
                    kind: "event",
                    hint: false,
                    event: true,
                    hintLevel: Math.max(1, Math.min(5, Number(reward.level) || 1)),
                    hintTable: ctx.hintTable,
                    efficiency: utility.efficiency,
                    deckMultiplier,
                  },
                });
              }
              if (!best || rawChoiceScore > best.rawChoiceScore) {
                best = { rawChoiceScore, details: choiceDetails };
              }
            }
            if (!best || best.rawChoiceScore <= 0) continue;
            const eventScale = formula.eventWeight * formula.scale;
            score += best.rawChoiceScore * eventScale;
            for (const detail of best.details) {
              details.push({
                ...detail,
                contribution: detail.rawContribution * eventScale,
              });
            }
          }

          if (!(score > 0)) continue;
          ranked.push({
            id,
            score,
            skills: details,
            hintCount: details.filter((row) => row.factor?.kind === "hint").length,
            eventCount: details.filter((row) => row.factor?.kind === "event").length,
          });
        }
        return ranked
          .sort((a, b) =>
            b.score - a.score ||
            b.hintCount - a.hintCount ||
            b.id - a.id
          )
          .slice(0, 8);
      }
      function renderSkillFactorRecommendations(server, deckIds, section, grid, formulaEl) {
        const ranked = buildSkillFactorRanking(server, deckIds);
        if (!ranked.length) {
          section.classList.add("hidden");
          grid.innerHTML = "";
          formulaEl?.classList.add("hidden");
          return;
        }
        section.classList.remove("hidden");
        $("skillRecTitle").textContent = "Factor-farm support ranking";
        const validation = SKILL_DB.factorModel?.validation;
        $("skillRecMeta").textContent = validation
          ? \`Lab v3 · CV ρ \${Number(validation.leaveOneStyleOutSpearman).toFixed(2)}\`
          : "Lab v3";
        if (formulaEl) {
          formulaEl.classList.remove("hidden");
          const eventState = SKILL_DB.factorEvents ? "exact event choices" : "hint-only fallback";
          formulaEl.textContent =
            \`Factor Lab v3: SR/SSR only, literal hint tables (no version double-counting), course length-per-SP efficiency^0.65 ÷ table size^1.10, Hint Frequency^0.60, 0.80× for deck-covered hints, plus \${eventState} at 0.015×. Live-calibrated to the current four Longchamp U-tools style rankings; experimental, not U-tools' published formula.\`;
        }
        grid.innerHTML = ranked.map((card) => {
          const group = cardsById.get(card.id);
          const detail = [
            card.hintCount ? \`\${card.hintCount} hints\` : "",
            card.eventCount ? \`\${card.eventCount} event rewards\` : "",
          ].filter(Boolean).join(" · ");
          return \`<button class="skillRecCard" data-skill-rec="\${card.id}" title="\${esc(group ? cardLabel(group) : \`Support #\${card.id}\`)}">\${group ? cardArt(group, "lg") : \`<span class="cardart lg">#\${card.id}</span>\`}<b>\${card.score.toFixed(2)}</b><small>\${esc(detail)}</small></button>\`;
        }).join("");
        grid.querySelectorAll("[data-skill-rec]").forEach((button) => {
          const enter = () =>
            showSkillRecommendationTooltip(
              Number(button.dataset.skillRec),
              ranked,
              button,
            );
          button.addEventListener("mouseenter", enter);
          button.addEventListener("focus", enter);
          button.addEventListener("mouseleave", hideSkillTooltip);
          button.addEventListener("blur", hideSkillTooltip);
          button.addEventListener("click", () => {
            if (skillDeckCards.length >= 6) return;
            STATE.pickerPurpose = "skilldeck";
            addCard(Number(button.dataset.skillRec));
          });
        });
      }
`;

  html = replaceBetween(
    html,
    '      const SKILL_FACTOR_CACHE = new Map();',
    '      function renderSkillRecommendations(allRows) {',
    factorBlock,
    'factor scoring block',
  );

  const deckMarker =
    '        const deckIds = new Set(skillDeckCards.map((entry) => Number(entry.id)));';
  if (!html.includes('renderSkillFactorRecommendations(server, deckIds, section, grid, formula);')) {
    html = replaceOnce(
      html,
      deckMarker,
      `${deckMarker}
        if (STATE.skillRecMode === "factor") {
          renderSkillFactorRecommendations(server, deckIds, section, grid, formula);
          return;
        }`,
      'factor recommendation branch',
    );
  }

  html = replaceOnce(
    html,
    '        const p05 = Number(row.p05Effect), p95 = Number(row.p95Effect), median = Number(row.medianEffect);',
    `        const p05 = row.p05Effect != null ? Number(row.p05Effect) : NaN;
        const p95 = row.p95Effect != null ? Number(row.p95Effect) : NaN;
        const median = row.medianEffect != null ? Number(row.medianEffect) : NaN;`,
    'inspector p05/p95/median null handling',
  );

  html = replaceOnce(
    html,
    '        const min = Number(row.minEffect), max = Number(row.maxEffect), average = Number(row.averageEffect), activationRate = Number(row.activationRate);',
    `        const min = row.minEffect != null ? Number(row.minEffect) : NaN;
        const max = row.maxEffect != null ? Number(row.maxEffect) : NaN;
        const average = row.averageEffect != null ? Number(row.averageEffect) : NaN;
        const activationRate = row.activationRate != null ? Number(row.activationRate) : NaN;`,
    'inspector min/max/average/activation null handling',
  );

  html = replaceOnce(
    html,
    '        const displayEfficiency = Number.isFinite(Number(row.pointEfficiency)) ? `${Number(row.pointEfficiency).toFixed(2)}/100` : Number.isFinite(econ.totalEfficiency) ? `${econ.totalEfficiency.toFixed(2)}/100` : "—";',
    '        const displayEfficiency = row.pointEfficiency != null && Number.isFinite(Number(row.pointEfficiency)) ? `${Number(row.pointEfficiency).toFixed(2)}/100` : Number.isFinite(econ.totalEfficiency) ? `${econ.totalEfficiency.toFixed(2)}/100` : "—";',
    'inspector efficiency null handling',
  );

  return html;
}

function runSelfTest() {
  const fixture = `<script>
      const SKILL_EFFECT_DB_ROOT = "x";
      const SKILL_EFFECT_MANIFEST_URLS = [
      ];
      const SKILL_DB = {
        effectSource: null,
      };
      async function ensureSkillData() {
          const [skills, courseData, effectManifest, effectIndex, globalRaces, globalSupports, courseGeometry] = await Promise.all([
            fetchOptionalFirstJson(SKILL_COURSE_GEOMETRY_URLS, 22000),
          ]);
          SKILL_DB.effectManifest = effectManifest?.schemaVersion === 1 ? effectManifest : null;
      }
      const SKILL_FACTOR_CACHE = new Map();
      function skillHintDiscount(level) { return 0; }
      function skillFactorCardStats() {}
      function skillFactorContribution() {}
      function renderSkillRecommendations(allRows) {
        const section = $("skillRecommendations");
        const grid = $("skillRecGrid");
        const formula = $("skillRecFormula");
        const server = "jp";
        const deckIds = new Set(skillDeckCards.map((entry) => Number(entry.id)));
      }
      function openSkillInspector() {
        const p05 = Number(row.p05Effect), p95 = Number(row.p95Effect), median = Number(row.medianEffect);
        const min = Number(row.minEffect), max = Number(row.maxEffect), average = Number(row.averageEffect), activationRate = Number(row.activationRate);
        const displayEfficiency = Number.isFinite(Number(row.pointEfficiency)) ? \`\${Number(row.pointEfficiency).toFixed(2)}/100\` : Number.isFinite(econ.totalEfficiency) ? \`\${econ.totalEfficiency.toFixed(2)}/100\` : "—";
      }
</script>`;
  const patched = patchHtml(fixture);
  for (const expected of [
    'SKILL_FACTOR_MODEL_URLS',
    'factorModel: null',
    'renderSkillFactorRecommendations(server, deckIds, section, grid, formula);',
    'row.p05Effect != null ? Number(row.p05Effect) : NaN',
    'Factor Lab v3: SR/SSR only, literal hint tables (no version double-counting)',
  ]) {
    if (!patched.includes(expected)) throw new Error(`Self-test missing: ${expected}`);
  }
  process.stdout.write('Factor v2 HTML patcher self-test passed.\n');
}

if (selfTest) {
  runSelfTest();
  process.exit(0);
}
if (!input) {
  process.stderr.write('Usage: node patch-training-lab-factor-v2.mjs <input.html> [output.html]\n');
  process.exit(2);
}
const source = fs.readFileSync(input, 'utf8');
const patched = patchHtml(source);
const output = outputArg || path.join(
  path.dirname(input),
  path.basename(input, path.extname(input)) + '_factor_v2.html',
);
fs.writeFileSync(output, patched, 'utf8');
process.stdout.write(`Wrote ${output}\n`);
