import fs from 'node:fs';
import path from 'node:path';

const args=process.argv.slice(2);
const selfTest=args.includes('--self-test');
const input=args.find(arg=>!arg.startsWith('--'));
const outputArg=input?args.slice(args.indexOf(input)+1).find(arg=>!arg.startsWith('--')):null;

function replaceOnce(text,needle,replacement,label){
  const index=text.indexOf(needle);
  if(index<0) throw new Error('Missing patch marker: '+label);
  if(text.indexOf(needle,index+needle.length)>=0) throw new Error('Patch marker is not unique: '+label);
  return text.slice(0,index)+replacement+text.slice(index+needle.length);
}
function insertBeforeOnce(text,marker,insertion,label){
  const index=text.indexOf(marker);
  if(index<0) throw new Error('Missing insert marker: '+label);
  return text.slice(0,index)+insertion+text.slice(index);
}

function patchHtml(source){
  let html=source;

  if(!html.includes('SKILL_FACTOR_EXACT_INDEX_URLS')){
    html=insertBeforeOnce(
      html,
      '      const SKILL_EFFECT_MANIFEST_URLS = [',
      `      const SKILL_FACTOR_DATA_ROOT =
        "https://raw.githubusercontent.com/DanielCuevas1208/DanielCuevas1208.github.io/main/uma-training-lab-data/factor-score/";
      const SKILL_FACTOR_MODEL_URLS = [
        "./data/factor-score/model.json",
        SKILL_FACTOR_DATA_ROOT + "model.json",
      ];
      const SKILL_FACTOR_EXACT_INDEX_URLS = [
        "./data/factor-score/exact-pages/index.json",
        SKILL_FACTOR_DATA_ROOT + "exact-pages/index.json",
      ];
`,
      'factor exact data URLs',
    );
  }

  if(!html.includes('factorExactIndex: null')){
    html=replaceOnce(
      html,
      '        effectSource: null,',
      `        effectSource: null,
        factorModel: null,
        factorExactIndex: null,
        factorExact: null,
        factorExactCache: new Map(),`,
      'SKILL_DB exact factor fields',
    );
  }

  html=replaceOnce(
    html,
    '          const [skills, courseData, effectManifest, effectIndex, globalRaces, globalSupports, courseGeometry] = await Promise.all([',
    '          const [skills, courseData, effectManifest, effectIndex, globalRaces, globalSupports, courseGeometry, factorModel, factorExactIndex] = await Promise.all([',
    'ensureSkillData exact factor destructuring',
  );
  html=replaceOnce(
    html,
    '            fetchOptionalFirstJson(SKILL_COURSE_GEOMETRY_URLS, 22000),',
    `            fetchOptionalFirstJson(SKILL_COURSE_GEOMETRY_URLS, 22000),
            fetchOptionalFirstJson(SKILL_FACTOR_MODEL_URLS, 12000),
            fetchOptionalFirstJson(SKILL_FACTOR_EXACT_INDEX_URLS, 12000),`,
    'ensureSkillData exact factor fetches',
  );
  html=replaceOnce(
    html,
    '          SKILL_DB.effectManifest = effectManifest?.schemaVersion === 1 ? effectManifest : null;',
    `          SKILL_DB.effectManifest = effectManifest?.schemaVersion === 1 ? effectManifest : null;
          SKILL_DB.factorModel = factorModel?.schemaVersion === 1 ? factorModel : null;
          SKILL_DB.factorExactIndex = factorExactIndex?.schemaVersion === 1 ? factorExactIndex : null;`,
    'exact factor data assignment',
  );

  const loader=`      async function loadSkillFactorExact(courseId, style) {
        const meta = SKILL_DB.factorExactIndex?.courses?.[String(courseId)]?.styles?.[style];
        if (!meta?.path) {
          SKILL_DB.factorExact = null;
          return null;
        }
        const key = String(courseId) + "/" + style;
        if (SKILL_DB.factorExactCache.has(key)) {
          SKILL_DB.factorExact = SKILL_DB.factorExactCache.get(key);
          return SKILL_DB.factorExact;
        }
        const data = await fetchOptionalFirstJson([
          "./data/factor-score/" + meta.path,
          SKILL_FACTOR_DATA_ROOT + meta.path,
        ], 16000);
        if (!data?.courseEffectSet?.effects || !Array.isArray(data?.cards)) {
          SKILL_DB.factorExact = null;
          return null;
        }
        SKILL_DB.factorExactCache.set(key, data);
        SKILL_DB.factorExact = data;
        return data;
      }
`;
  if(!html.includes('async function loadSkillFactorExact')){
    html=insertBeforeOnce(
      html,
      '      async function loadSkillEffects() {',
      loader,
      'exact factor page loader',
    );
  }

  if(!html.includes('await loadSkillFactorExact(courseId, style);')){
    html=replaceOnce(
      html,
      '        const key = `${server}/${courseId}/${style}`;',
      `        await loadSkillFactorExact(courseId, style);
        const key = \`\${server}/\${courseId}/\${style}\`;`,
      'load exact factor page with course effects',
    );
  }

  const exactBlock=`      function skillFactorRound2(value) {
        return Math.round(100 * Number(value || 0)) / 100;
      }
      function skillFactorHintPointMultiplier(level) {
        const discounts = [1, 0.9, 0.8, 0.7, 0.65, 0.6];
        const factor = discounts[Math.max(0, Math.min(5, Math.floor(Number(level) || 0)))] || 1;
        return Math.round(1000 / factor) / 1000;
      }
      function skillFactorExactSupportSkillIds(card) {
        const eventIds = (infos) => (infos || []).flatMap((event) =>
          (event?.choiceis || []).flatMap((choice) =>
            (choice?.results || []).flatMap((result) =>
              (result || []).map((reward) => Number(reward?.skillId)).filter(Number.isInteger),
            ),
          ),
        );
        return [
          ...(card?.hintSkillIds || []).map(Number),
          ...eventIds(card?.randomSkillInfos),
          ...eventIds(card?.sequenceSkillInfos),
        ].filter((id) => Number.isInteger(id) && id > 0);
      }
      function skillFactorExactDeckMap(cardsByExactId) {
        const map = {};
        for (const entry of skillDeckCards) {
          const card = cardsByExactId.get(Number(entry.id));
          if (!card) continue;
          for (const id of skillFactorExactSupportSkillIds(card)) map[id] = true;
        }
        return map;
      }
      function skillFactorExactCourseSkill(id, courseEffects, deckMap) {
        const skillId = Number(id);
        const current = courseEffects?.[String(skillId)] || courseEffects?.[skillId];
        if (!current) return { point: 0, score: 0, effect: 0, baseId: null };
        const baseId = Number(current.baseId) || null;
        const base = baseId
          ? (courseEffects?.[String(baseId)] || courseEffects?.[baseId])
          : current;
        const point = Number(current.point) || 0;
        const baseEffect = Number(base?.effect) || 0;
        const covered = !!(deckMap?.[skillId] || (baseId && deckMap?.[baseId]));
        return {
          point,
          score: skillFactorRound2(
            (covered ? 0.5 * baseEffect : baseEffect) *
            (baseId ? 1.4999999999999998 : 1),
          ),
          effect: skillFactorRound2(Number(current.effect) || 0),
          baseId,
          covered,
        };
      }
      function skillFactorExactHintScore(card, courseEffects, deckMap, details) {
        const rows = (card?.hintSkillIds || []).map((id) => ({
          id: Number(id),
          ...skillFactorExactCourseSkill(id, courseEffects, deckMap),
        }));
        const padded = [...rows];
        while (padded.length < 7) padded.push({ point: 0, score: 0 });
        if (!padded.length) return 0;
        const hintLv = Math.max(0, Math.min(5, Number(card?.hintLv) || 0));
        const scale =
          (hintLv === 4 ? 8.4 : 7) *
          skillFactorHintPointMultiplier(hintLv) /
          padded.length;
        for (const row of rows) {
          const raw = row.score && row.point ? 1000 * row.score / row.point : -2;
          const name = SKILL_DB.factorExact?.skillMap?.[String(row.id)]?.name || ("Skill #" + row.id);
          details.push({
            id: row.id,
            name,
            value: row.effect,
            source: { id: Number(card.id), hint: true, event: false },
            contribution: raw * scale,
            factor: {
              kind: "hint",
              hint: true,
              event: false,
              hintLevel: hintLv,
              hintTable: padded.length,
              covered: row.covered,
            },
          });
        }
        const average = padded.reduce(
          (sum, row) => sum + (row.score && row.point ? 1000 * row.score / row.point : -2),
          0,
        ) / padded.length;
        return skillFactorRound2(
          (hintLv === 4 ? 8.4 : 7) *
          average *
          skillFactorHintPointMultiplier(hintLv),
        );
      }
      function skillFactorExactChoiceRewards(choice) {
        const results = Array.isArray(choice?.results) ? choice.results : [];
        const bySkill = new Map();
        for (const result of results) {
          for (const reward of result || []) {
            const id = Number(reward?.skillId);
            if (!Number.isInteger(id) || id <= 0) continue;
            if (!bySkill.has(id)) bySkill.set(id, []);
            bySkill.get(id).push(Number(reward?.hintLv) || 0);
          }
        }
        return [...bySkill.entries()].map(([id, levels]) => ({
          id,
          hintLv: levels.reduce((a, b) => a + b, 0) / Math.max(1, levels.length),
          dropRate: levels.length / Math.max(1, results.length),
        }));
      }
      function skillFactorExactEventScore(card, infos, rate, courseEffects, deckMap, details) {
        let total = 0;
        for (const event of infos || []) {
          let best = { score: 0, rows: [] };
          for (const choice of event?.choiceis || []) {
            let score = 0;
            const rows = [];
            for (const reward of skillFactorExactChoiceRewards(choice)) {
              const course = skillFactorExactCourseSkill(reward.id, courseEffects, deckMap);
              if (!course.point || !course.score) continue;
              const contribution =
                course.score *
                reward.dropRate *
                skillFactorHintPointMultiplier(Math.floor(reward.hintLv)) *
                rate *
                750 /
                course.point;
              score += contribution;
              rows.push({ reward, course, contribution });
            }
            if (score > best.score) best = { score, rows };
          }
          total += best.score;
          for (const row of best.rows) {
            const name = SKILL_DB.factorExact?.skillMap?.[String(row.reward.id)]?.name || ("Skill #" + row.reward.id);
            details.push({
              id: row.reward.id,
              name,
              value: row.course.effect,
              source: { id: Number(card.id), hint: false, event: true },
              contribution: row.contribution,
              factor: {
                kind: "event",
                hint: false,
                event: true,
                hintLevel: Math.floor(row.reward.hintLv),
                hintTable: 0,
                dropRate: row.reward.dropRate,
                covered: row.course.covered,
              },
            });
          }
        }
        return skillFactorRound2(total);
      }
      function skillFactorExactCardScore(card, courseEffects, deckMap) {
        const details = [];
        const hint = skillFactorExactHintScore(card, courseEffects, deckMap, details);
        const random = skillFactorExactEventScore(
          card, card?.randomSkillInfos, 0.5, courseEffects, deckMap, details,
        );
        const sequence = skillFactorExactEventScore(
          card, card?.sequenceSkillInfos, 0.9, courseEffects, deckMap, details,
        );
        return {
          id: Number(card.id),
          score: skillFactorRound2(10 + hint + random + sequence),
          hint,
          random,
          sequence,
          skills: details,
          hintCount: (card?.hintSkillIds || []).length,
          eventCount: details.filter((row) => row.factor?.kind === "event").length,
        };
      }
      function buildSkillFactorExactRanking(server, deckIds) {
        if (server !== "jp") return [];
        const page = SKILL_DB.factorExact;
        const selectedCourse = Number($("skillCourse")?.value);
        const selectedStyle = $("skillStyle")?.value || "runner";
        if (
          !page ||
          Number(page.courseId) !== selectedCourse ||
          String(page.style) !== selectedStyle
        ) return [];
        const cardsByExactId = new Map((page.cards || []).map((card) => [Number(card.id), card]));
        const deckMap = skillFactorExactDeckMap(cardsByExactId);
        const courseEffects = page.courseEffectSet?.effects || {};
        return (page.cards || [])
          .filter((card) => !deckIds.has(Number(card.id)))
          .filter((card) => skillSourceAllowed(Number(card.id), server))
          .map((card) => skillFactorExactCardScore(card, courseEffects, deckMap))
          .sort((a, b) => b.score - a.score || b.id - a.id)
          .slice(0, 8);
      }
      function renderSkillFactorExactRecommendations(server, deckIds, section, grid, formulaEl) {
        const ranked = buildSkillFactorExactRanking(server, deckIds);
        if (!ranked.length) return false;
        section.classList.remove("hidden");
        $("skillRecTitle").textContent = "Factor-farm support ranking";
        $("skillRecMeta").textContent = "U-tools exact";
        if (formulaEl) {
          formulaEl.classList.remove("hidden");
          formulaEl.textContent =
            "JP U-tools exact: literal hint table with 7-slot minimum, Hint Lv Pt discounts, 0.5× main-deck overlap penalty, exact random/sequence event outcome rates, and the selected event course's factor-specific effect set. Global uses the Lab fallback.";
        }
        grid.innerHTML = ranked.map((card) => {
          const group = cardsById.get(card.id);
          const detail = [
            card.hintCount ? (card.hintCount + " hints") : "",
            card.eventCount ? (card.eventCount + " event rewards") : "",
          ].filter(Boolean).join(" · ");
          const label = group ? cardLabel(group) : ("Support #" + card.id);
          const art = group ? cardArt(group, "lg") : ('<span class="cardart lg">#' + card.id + '</span>');
          return '<button class="skillRecCard" data-skill-rec="' + card.id + '" title="' + esc(label) + '">' +
            art + '<b>' + card.score.toFixed(2) + '</b><small>' + esc(detail) + '</small></button>';
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
        return true;
      }
`;

  if(!html.includes('function skillFactorExactCardScore')){
    html=insertBeforeOnce(
      html,
      '      function renderSkillRecommendations(allRows) {',
      exactBlock,
      'exact factor scorer',
    );
  }

  const deckMarker='        const deckIds = new Set(skillDeckCards.map((entry) => Number(entry.id)));';
  if(!html.includes('renderSkillFactorExactRecommendations(server, deckIds, section, grid, formula)')){
    html=replaceOnce(
      html,
      deckMarker,
      `${deckMarker}
        if (
          STATE.skillRecMode === "factor" &&
          renderSkillFactorExactRecommendations(server, deckIds, section, grid, formula)
        ) return;`,
      'exact factor recommendation branch',
    );
  }

  html=html.replace(
    'Transparent Lab estimate: course lengths + SP efficiency, weighted by direct event access or hint-table dilution, support hint level/frequency, and extra-hint count. U-tools describes the same broad inputs but does not publish the exact scoring equation, so this mode is intentionally labeled as a Lab score.',
    'Lab fallback for courses without an imported U-tools factor effect set. The exact U-tools formula is used automatically on supported event courses; this fallback uses the normal course-value dataset and is only an approximation.',
  );

  html=html.replace(
    'STATE.skillRecMode === "factor" ? "Lab factor-farming score contribution" : "Unique remaining-skill course value"',
    'STATE.skillRecMode === "factor" ? (SKILL_DB.factorExact ? "U-tools exact factor-farming score contribution" : "Lab factor-farming score contribution") : "Unique remaining-skill course value"',
  );

  html=replaceOnce(
    html,
    '        const p05 = Number(row.p05Effect), p95 = Number(row.p95Effect), median = Number(row.medianEffect);',
    `        const p05 = row.p05Effect != null ? Number(row.p05Effect) : NaN;
        const p95 = row.p95Effect != null ? Number(row.p95Effect) : NaN;
        const median = row.medianEffect != null ? Number(row.medianEffect) : NaN;`,
    'inspector p05/p95/median null handling',
  );
  html=replaceOnce(
    html,
    '        const min = Number(row.minEffect), max = Number(row.maxEffect), average = Number(row.averageEffect), activationRate = Number(row.activationRate);',
    `        const min = row.minEffect != null ? Number(row.minEffect) : NaN;
        const max = row.maxEffect != null ? Number(row.maxEffect) : NaN;
        const average = row.averageEffect != null ? Number(row.averageEffect) : NaN;
        const activationRate = row.activationRate != null ? Number(row.activationRate) : NaN;`,
    'inspector min/max/average/activation null handling',
  );
  html=replaceOnce(
    html,
    '        const displayEfficiency = Number.isFinite(Number(row.pointEfficiency)) ? `${Number(row.pointEfficiency).toFixed(2)}/100` : Number.isFinite(econ.totalEfficiency) ? `${econ.totalEfficiency.toFixed(2)}/100` : "—";',
    '        const displayEfficiency = row.pointEfficiency != null && Number.isFinite(Number(row.pointEfficiency)) ? `${Number(row.pointEfficiency).toFixed(2)}/100` : Number.isFinite(econ.totalEfficiency) ? `${econ.totalEfficiency.toFixed(2)}/100` : "—";',
    'inspector efficiency null handling',
  );

  return html;
}

function runSelfTest(){
  const fixture=`<script>
      const SKILL_EFFECT_DB_ROOT = "x";
      const SKILL_EFFECT_MANIFEST_URLS = [];
      const SKILL_DB = {
        effectSource: null,
      };
      async function ensureSkillData() {
          const [skills, courseData, effectManifest, effectIndex, globalRaces, globalSupports, courseGeometry] = await Promise.all([
            fetchOptionalFirstJson(SKILL_COURSE_GEOMETRY_URLS, 22000),
          ]);
          SKILL_DB.effectManifest = effectManifest?.schemaVersion === 1 ? effectManifest : null;
      }
      function skillRemoteEffectUrl(server, courseId, style) { return ""; }
      async function loadSkillEffects() {
        const courseId = Number($("skillCourse")?.value);
        const style = $("skillStyle")?.value || "runner";
        const server = $("skillServer")?.value || "global";
        if (!courseId) {
          SKILL_DB.effect = null;
          SKILL_DB.effectSource = null;
          renderSkillPlanner();
          return;
        }
        await ensureSkillData();
        const key = \`\${server}/\${courseId}/\${style}\`;
      }
      function renderSkillRecommendations(allRows) {
        const section = $("skillRecommendations");
        const grid = $("skillRecGrid");
        const formula = $("skillRecFormula");
        const server = $("skillServer")?.value || "global";
        const deckIds = new Set(skillDeckCards.map((entry) => Number(entry.id)));
      }
      function inspect() {
        const p05 = Number(row.p05Effect), p95 = Number(row.p95Effect), median = Number(row.medianEffect);
        const min = Number(row.minEffect), max = Number(row.maxEffect), average = Number(row.averageEffect), activationRate = Number(row.activationRate);
        const displayEfficiency = Number.isFinite(Number(row.pointEfficiency)) ? \`\${Number(row.pointEfficiency).toFixed(2)}/100\` : Number.isFinite(econ.totalEfficiency) ? \`\${econ.totalEfficiency.toFixed(2)}/100\` : "—";
      }
</script>`;
  const patched=patchHtml(fixture);
  for(const expected of[
    'SKILL_FACTOR_EXACT_INDEX_URLS',
    'factorExactIndex: null',
    'async function loadSkillFactorExact',
    'function skillFactorExactCardScore',
    'renderSkillFactorExactRecommendations(server, deckIds, section, grid, formula)',
    'U-tools exact',
    'row.p05Effect != null ? Number(row.p05Effect) : NaN',
  ]){
    if(!patched.includes(expected)) throw new Error('Self-test missing: '+expected);
  }
  process.stdout.write('Exact factor HTML patcher self-test passed.\n');
}

if(selfTest){
  runSelfTest();
  process.exit(0);
}
if(!input){
  process.stderr.write('Usage: node patch-training-lab-factor-exact.mjs <input.html> [output.html]\n');
  process.exit(2);
}
const source=fs.readFileSync(input,'utf8');
const patched=patchHtml(source);
const output=outputArg || path.join(
  path.dirname(input),
  path.basename(input,path.extname(input))+'_factor_exact.html',
);
fs.writeFileSync(output,patched,'utf8');
process.stdout.write('Wrote '+output+'\n');
