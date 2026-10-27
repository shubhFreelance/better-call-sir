import {preferenceSchema,normalizedPreferences} from '../requests/request-schedule';
import type {z} from 'zod';
export {preferenceSchema as enquiryScheduleSchema};
export type EnquirySchedule=z.infer<typeof preferenceSchema>;
export function requestedSchedule(value:string):EnquirySchedule|null {
 try{const parsed=preferenceSchema.safeParse(JSON.parse(value));return parsed.success?parsed.data:null;}catch{return null;}
}
const localDate=(value:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date(value));
export function editedSchedule(original:EnquirySchedule,next:EnquirySchedule){
 if('weekly' in original&&'weekly' in next&&original.weekly.length===next.weekly.length)return normalizedPreferences(next);
 if('slots' in original&&'slots' in next&&original.slots.length===next.slots.length&&original.slots.every((slot,index)=>localDate(slot.startsAt)===localDate(next.slots[index].startsAt)&&localDate(slot.endsAt)===localDate(next.slots[index].endsAt)))return normalizedPreferences(next);
 return null;
}
export function scheduleTiming(value:EnquirySchedule){
 const clock=(minute:number)=>`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
 if('weekly' in value)return value.weekly.map(row=>`${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][row.weekday]} ${clock(row.startMinute)}–${clock(row.endMinute)} IST`).join('; ');
 return value.slots.map(row=>`${localDate(row.startsAt)} ${new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(row.startsAt))}–${new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(row.endsAt))} IST`).join('; ');
}
