"use client";
import {CalendarDays} from "lucide-react";
import {Input} from "../components/ui/input";
import {useAppTranslation} from "./locale";
import {weeklyPreferences,weeklyRows,clock,weekdays,type Weekly} from "./weekly-availability";
export type ProposalSchedule=Weekly|{timezone:"Asia/Kolkata";slots:{startsAt:string;endsAt:string}[]};
export function readProposalSchedule(value:unknown):ProposalSchedule|null{
 if(!value||typeof value!=="object")return null;
 const row=value as ProposalSchedule;
 if(row.timezone!=="Asia/Kolkata")return null;
 if("weekly" in row&&Array.isArray(row.weekly)&&row.weekly.length>0&&row.weekly.length<=14&&row.weekly.every(w=>w&&typeof w.weekday==="number"&&typeof w.startMinute==="number"&&typeof w.endMinute==="number"))return row;
 if("slots" in row&&Array.isArray(row.slots)&&row.slots.length>0&&row.slots.length<=6&&row.slots.every(w=>w&&Number.isFinite(Date.parse(w.startsAt))&&Number.isFinite(Date.parse(w.endsAt))))return row;
 return null;
}
export function requestedProposalSchedule(value:string):ProposalSchedule|null{try{return readProposalSchedule(JSON.parse(value));}catch{return null;}}
const dateOf=(value:string)=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata"}).format(new Date(value));
export function matchesRequestedSchedule(original:string,value:unknown){
 const base=requestedProposalSchedule(original),next=readProposalSchedule(value);
 if(!base||!next)return false;
 if("weekly" in base&&"weekly" in next)return base.weekly.length===next.weekly.length;
 return "slots" in base&&"slots" in next&&base.slots.length===next.slots.length&&base.slots.every((slot,i)=>dateOf(slot.startsAt)===dateOf(next.slots[i].startsAt)&&dateOf(slot.endsAt)===dateOf(next.slots[i].endsAt));
}
export function validProposalSchedule(value:ProposalSchedule|null){
 if(!value)return false;
 if("weekly" in value)return !!weeklyPreferences(weeklyRows(value));
 return value.slots.every((slot,i)=>Date.parse(slot.endsAt)-Date.parse(slot.startsAt)>=20*60000&&(!i||Date.parse(value.slots[i-1].endsAt)<=Date.parse(slot.startsAt)));
}
export function ProposalScheduleFields({value,onChange,readOnly=false}:{value:ProposalSchedule;onChange?:(value:ProposalSchedule)=>void;readOnly?:boolean}){
 const {appText,appLocale}=useAppTranslation();
 const timeOf=(value:string)=>new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(value));
 const minute=(value:string)=>value?Number(value.slice(0,2))*60+Number(value.slice(3)):NaN;
 return <section className="proposal-calendar" aria-label={appText("Proposed tuition time")}>
  <div className="proposal-calendar-heading"><CalendarDays size={20} aria-hidden="true"/><strong>{appText(readOnly?"Proposed tuition time":"Edit requested availability")}</strong><span>{appText("(IST)")}</span></div>
  {"weekly" in value?value.weekly.map((row,i)=><div className="proposal-calendar-fields proposal-weekly-row" key={i}>
   <label>{appText("Preferred day")} {i+1}{readOnly?<strong>{appText(weekdays[row.weekday])}</strong>:<select value={row.weekday} onChange={event=>onChange?.({...value,weekly:value.weekly.map((w,n)=>n===i?{...w,weekday:Number(event.target.value)}:w)})}>{weekdays.map((day,index)=><option key={day} value={index}>{appText(day)}</option>)}</select>}</label>
   {(["startMinute","endMinute"] as const).map(key=><label key={key}>{appText(key==="startMinute"?"Available from":"Available until")} {i+1}{readOnly?<strong>{clock(row[key])}</strong>:<Input type="time" required value={Number.isFinite(row[key])?clock(row[key]):""} onChange={event=>{const changed=minute(event.target.value);onChange?.({...value,weekly:value.weekly.map((w,n)=>n===i?{...w,[key]:key==="endMinute"&&changed===0?1440:changed}:w)});}}/>}</label>)}
  </div>):value.slots.map((row,i)=><div className="proposal-calendar-fields proposal-dated-row" key={i}>
   <div><strong>{new Intl.DateTimeFormat(appLocale,{dateStyle:"full",timeZone:"Asia/Kolkata"}).format(new Date(row.startsAt))}</strong><small>{appText("Date from the family request")}</small></div>
   {(["startsAt","endsAt"] as const).map(key=><label key={key}>{appText(key==="startsAt"?"Available from":"Available until")} {i+1}{readOnly?<strong>{timeOf(row[key])}</strong>:<Input type="time" required value={timeOf(row[key])} onChange={event=>{if(!event.target.value)return;const changed=new Date(dateOf(row[key])+"T"+event.target.value+":00+05:30").toISOString();onChange?.({...value,slots:value.slots.map((w,n)=>n===i?{...w,[key]:changed}:w)});}}/>}</label>)}
  </div>)}
  {!readOnly&&<p>{appText("Edit the family's requested rows. No extra dates or time ranges will be added.")}</p>}
  {!readOnly&&!validProposalSchedule(value)&&<p role="alert">{appText("Choose valid, nonoverlapping time ranges.")}</p>}
 </section>;
}
