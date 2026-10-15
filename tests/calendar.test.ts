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

test('existing holds can confirm inside the initial lead time without bypassing occupancy',()=>{
 const now=new Date('2026-10-12T03:00:00Z'),start=new Date('2026-10-12T03:30:00Z'),end=new Date('2026-10-12T03:50:00Z');
 assert.equal(availableIn({patterns:[pattern],blocks:[]},start,end,now),null);
 assert.equal(availableIn({patterns:[pattern],blocks:[]},start,end,now,0)?.id,pattern.id);
 assert.equal(availableIn({patterns:[pattern],blocks:[{startsAt:start,endsAt:end}]},start,end,now,0),null);
});

import {weeklyFit} from '../apps/api/src/modules/matching/weekly-fit';
import {preferenceSchema,normalizedPreferences} from '../apps/api/src/modules/requests/request-schedule';
test('weekly enquiry ranges validate without mixing dated input or overlapping weekdays',()=>{
 const p={timezone:'Asia/Kolkata' as const,weekly:[{weekday:1,startMinute:900,endMinute:1200}]};assert(preferenceSchema.safeParse(p).success);assert(normalizedPreferences(p));assert(!preferenceSchema.safeParse({...p,slots:[]}).success);assert(!preferenceSchema.safeParse({...p,weekly:[{...p.weekly[0],weekday:7}]}).success);assert.equal(normalizedPreferences({...p,weekly:[...p.weekly,{weekday:1,startMinute:1000,endMinute:1050}]}),null);assert.equal(normalizedPreferences({...p,weekly:[{weekday:1,startMinute:1200,endMinute:900}]}),null);
});
test('broad weekly fit finds odd-minute overlap after occupancy without inventing a timetable',()=>{
 const p={...pattern,kind:'RECURRING',startMinute:905,endMinute:965},now=new Date('2026-10-12T00:00:00Z'),blocks=[{startsAt:new Date('2026-10-12T09:35:00Z'),endsAt:new Date('2026-10-12T09:57:00Z')}],weekly=[{weekday:1,startMinute:900,endMinute:1200}];
 const fit=weeklyFit({patterns:[p],blocks},weekly,now);assert.equal(fit.length,1);assert.equal(fit[0].startsAt,'2026-10-12T09:57:00.000Z');assert.equal(fit[0].endsAt,'2026-10-12T10:17:00.000Z');assert.equal(weeklyFit({patterns:[{...p,active:false}],blocks},weekly,now).length,0);
 assert.equal(weeklyFit({patterns:[{...p,validUntil:new Date('2026-10-12')}],blocks:[{startsAt:new Date('2026-10-12T09:00:00Z'),endsAt:new Date('2026-10-12T15:00:00Z')}]},weekly,now).length,0);
});
