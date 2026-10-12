import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ruleRanker} from '../apps/api/src/modules/matching/eligibility';
test('rules rank only the supplied eligible pool with stable reasons and deterministic tie ordering',()=>{
 const request={budgetPaise:400000},pool=[{teacherId:'b',monthlyPaise:300000,windows:[{}]},{teacherId:'a',monthlyPaise:300000,windows:[{}]},{teacherId:'c',monthlyPaise:250000,windows:[{},{}]}];
 const ranked=ruleRanker.rank(request,pool,{mode:'HOME'});assert.deepEqual(ranked.items.map(t=>t.teacherId),['c','a','b']);assert.equal(ranked.rankerVersion,'rules-v2');assert(ranked.items.every(t=>t.reasonCodes.includes('CONFIRMED_SCHEDULE')&&t.reasonCodes.includes('SERVICE_AREA_TRAVEL_ACCEPTED')));assert.deepEqual(ruleRanker.rank(request,[],{mode:'ONLINE'}).items,[]);
});
