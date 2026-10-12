import {test} from 'node:test';
import assert from 'node:assert/strict';
import {intervals} from '@bcs/scheduling';
test('recurring materialization uses local weekdays and bounds complete intervals to the rolling horizon',()=>{
 const now=new Date('2026-10-12T00:00:00Z'),schedule={validFrom:new Date('2026-10-12'),validUntil:new Date('2027-01-01'),slots:[{weekday:1,startMinute:780,endMinute:820}]};
 const slots=intervals(schedule,now);assert(slots.length>=8);assert.equal(slots[0].startsAt.toISOString(),'2026-10-12T07:30:00.000Z');
 assert(slots.every(s=>s.startsAt.getTime()>=now.getTime()+3600000&&s.endsAt.getTime()<=now.getTime()+60*86400000));
 assert.equal(intervals({...schedule,validUntil:new Date('2026-10-11')},now).length,0);
});
