// Run from the evaluator checkout with ts-node --transpile-only.
import assert from 'node:assert/strict';
import {getParser} from './ConditionParser';
import {Region,RegionList} from './Region';
const parser=getParser();
function evaluate(condition:string,popularity:number,lot:number){
  const regions=new RegionList(new Region(0,100));
  const [allowed,dynamic]=parser.parse(parser.tokenize(condition)).apply(regions,{} as any,{} as any,{popularity} as any);
  return allowed.length>0 && dynamic({randomLot:lot} as any);
}
assert.equal(evaluate('popularity>=4&random_lot_shared==60',1,10),false);
assert.equal(evaluate('popularity<=3&random_lot_shared==30',1,29),true);
assert.equal(evaluate('popularity<=3&random_lot_shared==30',1,30),false);
assert.equal(evaluate('popularity>=4&random_lot_shared==60',4,59),true);
assert.equal(evaluate('popularity>=4&random_lot_shared==60',4,60),false);
assert.equal(evaluate('popularity<=3&random_lot_shared==30',4,10),false);
assert.equal(evaluate('random_lot==30',1,29),evaluate('random_lot_shared==30',1,29));
console.log('Popularity branches and shared lottery conditions passed.');
