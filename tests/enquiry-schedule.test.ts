import {test} from 'node:test';
import assert from 'node:assert/strict';
import {editedSchedule,scheduleTiming} from '../apps/api/src/modules/direct-enquiries/enquiry-schedule';
test('specific-date edits keep the family dates and row count; only the times change',()=>{
 const day=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
 const original={timezone:'Asia/Kolkata' as const,slots:[{startsAt:day+'T16:00:00+05:30',endsAt:day+'T17:00:00+05:30'}]};
 const next={...original,slots:[{startsAt:day+'T18:00:00+05:30',endsAt:day+'T19:00:00+05:30'}]};
 const edited=editedSchedule(original,next);assert(edited);assert.match(scheduleTiming(edited),/18:00–19:00/);
 assert.equal(editedSchedule(original,{...next,slots:[...next.slots,...next.slots]}),null);
 const otherDay=new Date(Date.now()+4*86400000).toISOString().slice(0,10);
 assert.equal(editedSchedule(original,{...next,slots:[{startsAt:otherDay+'T18:00:00+05:30',endsAt:otherDay+'T19:00:00+05:30'}]}),null);
 assert.equal(editedSchedule(original,{timezone:'Asia/Kolkata',weekly:[{weekday:1,startMinute:1080,endMinute:1140}]}),null);
});
