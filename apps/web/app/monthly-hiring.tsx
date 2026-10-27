"use client";
import {useEffect,useState,useId,useCallback,type ReactNode} from "react";
import Link from "next/link";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {api,type paths,type Session} from "@bcs/api-client";
import {CalendarDays,Check,ChevronDown,Clock3,LockKeyhole} from "lucide-react";
import {LayeredSummaryCard} from "../components/ui/layered-summary-card";
import {FilterButton,FilterButtonGroup} from "../components/ui/filter-button";
import {InfoTooltip} from "../components/ui/info-tooltip";
import {Input} from "../components/ui/input";
import {Modal} from "../components/ui/modal";
import {RefreshButton} from "../components/ui/refresh-button";
import {StatusBadge} from "../components/ui/status-controls";
import {useAppTranslation} from "./locale";
import {Feedback,useDecision} from "./tuition-workflow";

type Booking=paths["/tuition-bookings/{kind}/{id}"]["get"]["responses"][200]["content"]["application/json"];
export function TuitionArrangementCard({title,subtitle,footer,onLockChange,...props}:{title:ReactNode;subtitle:ReactNode;footer:ReactNode;session:Session;kind:"PLACEMENT"|"INDEPENDENT";id:string;disabled?:boolean;onLockChange?:(locked:boolean,id:string)=>void}){
 const [locked,setLocked]=useState(false);
 const lock=useCallback((value:boolean,id:string)=>{setLocked(value);onLockChange?.(value,id);},[onLockChange]);
 return <LayeredSummaryCard collapsible className="tuition-arrangement-card" aria-label={typeof title==='string'?title:undefined} onClick={event=>{if(locked&&(event.target as HTMLElement).closest('summary')===event.currentTarget.firstElementChild)event.preventDefault();}} header={<><div><h4>{title}</h4><p>{subtitle}</p></div><ChevronDown size={18} aria-hidden="true"/></>} footer={footer}>
  <MonthlyHiring {...props} onLockChange={lock}/>
 </LayeredSummaryCard>;
}
export function MonthlyHiring({session,kind,id,disabled=false,onLockChange}:{session:Session;kind:"PLACEMENT"|"INDEPENDENT";id:string;disabled?:boolean;onLockChange?:(locked:boolean,id:string)=>void}){
 const {appText,appError,appLocale}=useAppTranslation(),client=useQueryClient();
 const [month,setMonth]=useState(""),[ack,setAck]=useState(false),[date,setDate]=useState<string|null>(null),[completionAck,setCompletionAck]=useState(false);
 const path=`/tuition-bookings/${kind}/${id}`;
 const query=useQuery({queryKey:["tuition-booking",session.account.id,kind,id],queryFn:({signal})=>api<Booking>(path,{signal}),retry:false,staleTime:0});
 async function refresh(){const result=await query.refetch();if(result.error)throw result.error;await client.invalidateQueries({queryKey:["hiring-dashboard"]});await client.invalidateQueries({queryKey:["student-arrangements"]});await client.invalidateQueries({queryKey:["direct-enquiries",session.account.id]});}
 const decision=useDecision(session,refresh),data=!query.error?query.data:undefined;
 useEffect(()=>{onLockChange?.(decision.locked,id);return()=>onLockChange?.(false,id);},[decision.locked,id,onLockChange]);
 useEffect(()=>{if(data){setMonth(data.month);setAck(false);}},[data?.version,data?.bookingVersion]);
 if(query.isPending)return <p role="status">{appText("Loading monthly tuition…")}</p>;
 if(!data)return <div role="alert" className="monthly-hiring-error"><Feedback decision={decision} floating/><p>{appText("Monthly tuition could not be loaded.")} {query.error&&appError(query.error.message)}</p><RefreshButton label={appText("Refresh enquiries")} disabled={decision.busy||decision.uncertain} onClick={()=>decision.reload()}/></div>;
 const monthLabel=(value:string)=>new Intl.DateTimeFormat(appLocale,{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(value+"-01T00:00:00Z"));
 const ownConfirmed=session.account.role==="TEACHER"?data.teacherConfirmed:data.familyConfirmed;
 const locked=disabled||decision.locked||query.isFetching;
 const support=kind==="PLACEMENT"?`/support?placement=${id}`:"/support";
 const selected=date?data.completions.find(row=>row.date===date):undefined;
 return <section className="monthly-hiring" aria-label={appText("Monthly tuition confirmation")}>
  <header className="monthly-hiring-heading"><CalendarDays size={22} aria-hidden="true"/><div><h3>{appText(data.closed?"Closed":data.confirmed?"Teacher booked for {0}":"Confirm tuition for {0}",[monthLabel(data.month)])}</h3><p>{appText(data.confirmed?"Both parties confirmed this month. Tuition is paid directly to the teacher.":"Confirm the month and monthly tuition here. No extra page or class booking is needed.")}</p></div><RefreshButton label={appText("Refresh enquiries")} disabled={disabled||decision.busy||decision.uncertain||query.isFetching} onClick={()=>decision.reload()}/></header>
  <div className="monthly-hiring-facts">
   {data.monthlyPaise!==undefined&&<div><span>{appText("Monthly tuition")}</span><strong>{new Intl.NumberFormat(appLocale,{style:"currency",currency:"INR",minimumFractionDigits:0,maximumFractionDigits:2}).format(data.monthlyPaise/100)}</strong></div>}
   <div><span>{appText("Family confirmation")}</span><StatusBadge label={appText(data.familyConfirmed?"Confirmed":"Pending")} tone={data.familyConfirmed?"success":"warning"} icon={data.familyConfirmed?Check:Clock3}/></div>
   <div><span>{appText("Teacher confirmation")}</span><StatusBadge label={appText(data.teacherConfirmed?"Confirmed":"Pending")} tone={data.teacherConfirmed?"success":"warning"} icon={data.teacherConfirmed?Check:Clock3}/></div>
  </div>
  {!date&&<Feedback decision={decision} floating/>}
  {!data.closed&&!data.confirmed&&data.canConfirm&&!ownConfirmed&&<form onSubmit={event=>{event.preventDefault();if(!ack||locked||!data.policyVersion)return;void decision.run({path:path+"/confirmations",body:{expectedVersion:data.version,expectedBookingVersion:data.bookingVersion,month,policyVersion:data.policyVersion,confirmed:true,contactShareAccepted:true},message:"Your monthly tuition confirmation was recorded.",onSaved:()=>setAck(false)});}}>
   <div className="monthly-hiring-month"><label>{appText("Tuition month")}<Input type="month" required value={month} readOnly={data.bookingVersion>0} onChange={event=>{setMonth(event.target.value);setAck(false);}} disabled={locked}/></label><InfoTooltip label={appText("Monthly tuition details")} items={[appText("Recorded policy: {0}",[data.policyVersion??""]),appText("Tuition is paid directly to the teacher. Confirming does not charge you or confirm that classes have started."),appText("Both parties confirm the same month. Coordination email is shared only after mutual confirmation."),...(data.placementFeePaise!==undefined?[appText("Proposed teacher placement fee: {0}. It requires separate service-start and receipt evidence; live commercial approval remains pending.",[new Intl.NumberFormat(appLocale,{style:"currency",currency:"INR"}).format(data.placementFeePaise/100)])]:[])]}/></div>
   <label className="monthly-hiring-ack"><input type="checkbox" checked={ack} disabled={locked} onChange={event=>setAck(event.target.checked)}/><span>{appText("I agree to the displayed monthly tuition, policy and month, and to sharing coordination email after both parties confirm.")}</span></label>
   <FilterButtonGroup><FilterButton accent type="submit" disabled={!ack||locked||!data.policyVersion}>{appText("Confirm monthly tuition")}</FilterButton><FilterButton asChild disabled={locked}><Link href={support} aria-disabled={locked} onClick={event=>{if(locked)event.preventDefault();}}>{appText("Ask for help")}</Link></FilterButton></FilterButtonGroup>
  </form>}
  {!data.closed&&!data.confirmed&&(ownConfirmed||!data.canConfirm)&&<p className="monthly-hiring-wait" role="status">{appText("Waiting for the other party to confirm this month.")}</p>}
  {data.confirmed&&<ClassCompletionCalendar data={data} disabled={locked} onSelect={value=>{setDate(value);setCompletionAck(false);}}/>}
  <Modal open={!!date} onOpenChange={open=>{if(!open&&!decision.locked)setDate(null);}} title={appText("Record class completion")}>
   <div className="class-completion-review"><Feedback decision={decision}/><strong>{date&&new Intl.DateTimeFormat(appLocale,{dateStyle:"full",timeZone:"UTC"}).format(new Date(date+"T00:00:00Z"))}</strong><p>{appText(selected?.completed?"Remove this completion mark only if it was recorded by mistake.":"Mark this date only after the class has taken place.")}</p><label className="monthly-hiring-ack"><input type="checkbox" checked={completionAck} disabled={decision.locked} onChange={e=>setCompletionAck(e.target.checked)}/>{appText("I confirm this class record is correct.")}</label><FilterButtonGroup><FilterButton accent disabled={!completionAck||decision.locked} onClick={()=>{if(!date)return;void decision.run({path:path+"/completions",body:{date,completed:!selected?.completed,expectedVersion:selected?.version??0,confirmed:true},message:"Class record saved.",onSaved:()=>setDate(null)});}}>{appText("Confirm")}</FilterButton><FilterButton disabled={decision.locked} onClick={()=>setDate(null)}>{appText("Cancel")}</FilterButton></FilterButtonGroup></div>
  </Modal>
 </section>;
}

function ClassCompletionCalendar({data,disabled,onSelect}:{data:Booking;disabled:boolean;onSelect:(date:string)=>void}){
 const {appText,appLocale}=useAppTranslation(),[year,setYear]=useState(Number(data.month.slice(0,4))),[selectedMonth,setSelectedMonth]=useState<string|null>(null),panelId=useId();
 const month=selectedMonth?Number(selectedMonth.slice(5,7)):1,days=new Date(Date.UTC(year,month,0)).getUTCDate(),offset=(new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7;
 const recordedMonth=selectedMonth===data.month,completed=recordedMonth&&data.proActive?data.completions.filter(row=>row.completed).length:0;
 const lastYear=Math.max(new Date().getFullYear(),Number(data.month.slice(0,4)))+1;
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date());
 const weekdays=Array.from({length:7},(_,index)=>new Intl.DateTimeFormat(appLocale,{weekday:'short',timeZone:'UTC'}).format(new Date(Date.UTC(2024,0,index+1))));
 return <section className={"class-calendar"+(!data.proActive?" class-calendar-locked":"")} aria-label={appText("Class completion calendar")}>
  <div className="class-calendar-heading"><h4>{appText("Class tracking")}</h4><StatusBadge label="Pro" tone="accent" icon={data.proActive?CalendarDays:LockKeyhole}/><InfoTooltip label={appText("About class tracking")} items={[appText("Lavender dates show classes recorded as completed by the teacher. This is not independent attendance or payment evidence."),appText("Dates follow the actual calendar month. Future dates cannot be marked complete.")]}/></div>
  {!data.proActive&&<p>{appText("An active Pro membership is required to track completed classes.")}</p>}
  <label className="class-calendar-year">{appText("Year")}<select aria-label={appText("Year")} value={year} disabled={disabled} onChange={event=>{setYear(Number(event.target.value));setSelectedMonth(null);}}>{Array.from({length:lastYear-Math.min(2020,Number(data.month.slice(0,4)))+1},(_,i)=>lastYear-i).map(value=><option key={value} value={value}>{value}</option>)}</select></label>
  <div className="class-calendar-months" role="group" aria-label={appText("Tuition months")}>
   {Array.from({length:12},(_,index)=>{const value=`${year}-${String(index+1).padStart(2,'0')}`,active=value===data.month;return <button type="button" key={value} disabled={disabled} className={active?"has-tuition":""} aria-label={new Intl.DateTimeFormat(appLocale,{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value+'-01T00:00:00Z'))} aria-expanded={selectedMonth===value} aria-controls={panelId} onClick={()=>setSelectedMonth(selectedMonth===value?null:value)}>{new Intl.DateTimeFormat(appLocale,{month:'short',timeZone:'UTC'}).format(new Date(value+'-01T00:00:00Z'))}{active&&<span className="class-month-dot" aria-label={appText("Tuition recorded")}/>}</button>;})}
  </div>
  <p className="class-month-legend">{appText("Lavender months have recorded tuition.")}</p>
  <div id={panelId} hidden={!selectedMonth}>
  {selectedMonth&&<section className="class-month-detail" key={selectedMonth} aria-label={appText("Monthly class records")}>
  <header><h5>{new Intl.DateTimeFormat(appLocale,{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(selectedMonth+'-01T00:00:00Z'))}</h5>{data.proActive&&<strong>{appText("Classes recorded complete: {0}",[String(completed)])}</strong>}</header>
  {!recordedMonth&&<p>{appText("No tuition is recorded for this month.")}</p>}
  <div className="class-calendar-grid" role="group" aria-label={appText("Class completion calendar")}>
   {weekdays.map((day,index)=><span className="class-calendar-weekday" key={index}>{day}</span>)}
   {Array.from({length:offset},(_,index)=><span aria-hidden="true" key={"blank"+index}/>)}
   {Array.from({length:days},(_,index)=>{const date=`${selectedMonth}-${String(index+1).padStart(2,'0')}`,done=recordedMonth&&data.proActive&&data.completions.some(row=>row.date===date&&row.completed);return <button key={date} type="button" className={done?"is-completed":""} disabled={disabled||!recordedMonth||!data.canMarkCompleted||date>today} aria-label={appText("{0}: {1}",[new Intl.DateTimeFormat(appLocale,{dateStyle:'full',timeZone:'UTC'}).format(new Date(date+'T00:00:00Z')),appText(done?"Completed":"Not recorded")])} aria-pressed={done} onClick={()=>onSelect(date)}><span>{index+1}</span>{done&&<Check size={12} aria-hidden="true"/>}</button>;})}
  </div>
  <p className="class-calendar-legend"><span aria-hidden="true"/>{appText("Completed class")}</p>
  </section>}
  </div>
 </section>;
}
