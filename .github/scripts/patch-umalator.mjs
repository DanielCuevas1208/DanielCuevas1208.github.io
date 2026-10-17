import fs from 'node:fs';
import path from 'node:path';

const target = path.resolve(process.argv[2] || 'RaceSolverBuilder.ts');
let source = fs.readFileSync(target, 'utf8');
let changed = false;

const enhancedPattern = /^.*EnhancedHpPolicy.*(?:\r?\n|$)/gm;
if (enhancedPattern.test(source)) {
  source = source.replace(enhancedPattern, '');
  changed = true;
}

const unsafeOriginWisdom = 'originWisdom: this._skills[sdi].originWisdom';
const safeOriginWisdom = "originWisdom: this._skills.find(({id, p}) => id === sd.skillId && p === sd.perspective)?.originWisdom";

if (source.includes(unsafeOriginWisdom)) {
  source = source.replace(unsafeOriginWisdom, safeOriginWisdom);
  changed = true;
} else if (!source.includes(safeOriginWisdom)) {
  throw new Error('Umalator RaceSolverBuilder.ts no longer matches the expected originWisdom source shape; audit upstream before refreshing data.');
}

if (source.includes('this._skills[sdi].originWisdom')) {
  throw new Error('Unsafe positional originWisdom lookup remains after patch.');
}

if (/EnhancedHpPolicy/.test(source)) {
  throw new Error('EnhancedHpPolicy compatibility reference remains after patch.');
}

if (changed) fs.writeFileSync(target, source, 'utf8');
process.stdout.write(`Umalator compatibility patch ${changed ? 'applied' : 'already present'}: ${target}\n`);

const conditionsFile=path.join(path.dirname(target),'ActivationConditions.ts');
let conditions=fs.readFileSync(conditionsFile,'utf8');
if(!conditions.includes('random_lot_shared:')){
  const anchor='\trandom_lot: immediate({';
  if(!conditions.includes(anchor)) throw new Error('Cannot locate upstream random lottery condition');
  conditions=conditions.replace(anchor,`\trandom_lot_shared: immediate({
    filterEq(regions: RegionList, lot: number) {
      return [regions, (s: RaceState) => s.randomLot < lot] as [RegionList, DynamicCondition];
    }
  }),
${anchor}`);
}
if(conditions.includes('popularity: noopImmediate,')){
  const comparisons={Eq:'===',Neq:'!==',Lt:'<',Lte:'<=',Gt:'>',Gte:'>='};
  const filters=Object.entries(comparisons).map(([name,op])=>`
    filter${name}(regions: RegionList, value: number, _0: CourseData, _1: HorseParameters, extra: RaceParameters) {
      return extra.popularity ${op} value ? regions : new RegionList();
    }`).join(',');
  conditions=conditions.replace('popularity: noopImmediate,',`popularity: immediate({${filters}\n  }),`);
}else if(!conditions.includes('return extra.popularity === value')){
  throw new Error('Upstream popularity condition changed; audit compatibility patch');
}
fs.writeFileSync(conditionsFile,conditions,'utf8');
console.log('Umalator shared lottery and popularity compatibility verified.');
