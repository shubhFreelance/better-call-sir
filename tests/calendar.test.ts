import {test} from 'node:test';
import assert from 'node:assert/strict';
import {patternInterval,slotStarts,availableIn} from '../apps/api/src/modules/scheduling/calendar';
const pattern={id:'30000000-0000-4000-8000-000000000009',teacherId:'30000000-0000-4000-8000-000000000001',kind:'REVISION',weekday:1,startMinute:540,endMinute:600,timezone:'Asia/Kolkata',validFrom:new Date('2026-10-01'),validUntil:new Date('2026-10-31'),active:true,version:1};
test('weekly IST patterns convert to UTC and align slots to the teacher window',()=>{
 const from=new Date('2026-10-12T03:30:00Z'),to=new Date('2026-10-12T04:30:00Z');
 assert.equal(patternInterval(pattern,from)?.startsAt.toISOString(),from.toISOString());assert.deepEqual(slotStarts([pattern],from,to,20).map(t=>t.toISOString()),['2026-10-12T03:30:00.000Z','2026-10-12T03:50:00.000Z','2026-10-12T04:10:00.000Z']);
 assert.equal(patternInterval(pattern,new Date('2026-10-13T03:30:00Z')),null);assert.equal(patternInterval({...pattern,active:false},from),null);
});
test('half-open occupancy leaves adjacent slots available and blocks shifted overlap',()=>{
 const snapshot={patterns:[pattern],blocks:[{startsAt:new Date('2026-10-12T03:50:00Z'),endsAt:new Date('2026-10-12T04:10:00Z')}]},now=new Date('2026-10-12T00:00:00Z');
 assert(availableIn(snapshot,new Date('2026-10-12T03:30:00Z'),new Date('2026-10-12T03:50:00Z'),now));assert.equal(availableIn(snapshot,new Date('2026-10-12T03:40:00Z'),new Date('2026-10-12T04:00:00Z'),now),null);assert(availableIn(snapshot,new Date('2026-10-12T04:10:00Z'),new Date('2026-10-12T04:30:00Z'),now));
});
