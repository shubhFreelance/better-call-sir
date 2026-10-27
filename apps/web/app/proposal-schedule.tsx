"use client";
import { CalendarDays } from "lucide-react";
import { Input } from "../components/ui/input";
import { useAppTranslation } from "./locale";

export type ProposalSchedule = {date:string; startTime:string; endTime:string; timezone:"Asia/Kolkata"};
export function ProposalScheduleFields({value,onChange,readOnly=false}:{value:ProposalSchedule;onChange?:(value:ProposalSchedule)=>void;readOnly?:boolean}) {
  const {appText,appLocale}=useAppTranslation();
  const day=value.date && new Date(value.date+"T00:00:00Z");
  return <section className="proposal-calendar" aria-label={appText("Proposed tuition time")}>
    <div className="proposal-calendar-heading"><CalendarDays size={20} aria-hidden="true"/><strong>{appText(readOnly ? "Proposed tuition time" : "Choose an alternative time")}</strong><span>{appText("(IST)")}</span></div>
    <div className="proposal-calendar-fields">
      <label>{appText("Date")}<Input type="date" required value={value.date} readOnly={readOnly} min={new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata"}).format(new Date())} onChange={e=>onChange?.({...value,date:e.target.value})}/></label>
      <label>{appText("Start time")}<Input type="time" required value={value.startTime} readOnly={readOnly} onChange={e=>onChange?.({...value,startTime:e.target.value})}/></label>
      <label>{appText("End time")}<Input type="time" required value={value.endTime} readOnly={readOnly} onChange={e=>onChange?.({...value,endTime:e.target.value})}/></label>
    </div>
    {day && !Number.isNaN(day.getTime()) && <p>{new Intl.DateTimeFormat(appLocale,{weekday:"long",timeZone:"UTC"}).format(day)} · {value.startTime}–{value.endTime} {appText("(IST)")}</p>}
    {!readOnly && value.startTime && value.endTime && value.endTime<=value.startTime && <p role="alert">{appText("End time must be after start time.")}</p>}
  </section>;
}
