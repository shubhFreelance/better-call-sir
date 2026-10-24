"use client";
import {useId,useState,useRef} from "react";
import Link from "next/link";
import {useQuery} from "@tanstack/react-query";
import {api,type Session,type components} from "@bcs/api-client";
import {Button} from "../components/ui/button";
import {useAppTranslation} from "./locale";
type Verification=components["schemas"]["GuardianVerification"];
export function GuardianPriorities({session,indicator=false}:{session:Session;indicator?:boolean}) {
 const {appText}=useAppTranslation(),panel=useId();
 const [open,setOpen]=useState(false);
 const trigger=useRef<HTMLButtonElement>(null);
 const query=useQuery({queryKey:["guardian-critical-steps",session.account.id],queryFn:async({signal})=>{
   const setup=await api<components["schemas"]["GuardianSetup"]>("/onboarding/guardian",{signal});
   const items:Verification[]=[];const seen=new Set<string>();let cursor:string|null=null;
   do {const page:{items:Verification[];nextCursor:string|null}=await api<{items:Verification[];nextCursor:string|null}>("/guardian-verifications?limit=50"+(cursor?"&cursor="+cursor:""),{signal});items.push(...page.items);cursor=page.nextCursor;if(cursor&&seen.has(cursor))throw new Error("Invalid history cursor");if(cursor)seen.add(cursor);}while(cursor);
   return {setup,items};
 },enabled:session.account.role==="GUARDIAN",retry:false,staleTime:0,refetchOnMount:"always",refetchInterval:60000,refetchOnWindowFocus:true});
 if(session.account.role!=="GUARDIAN")return null;
 const tasks=(query.data?.items??[]).flatMap(row=>{
   const href="/guardian-verification?request="+row.id;
   if(row.status==="APPROVED")return row.learnerId?[]:[{id:row.id,name:row.learnerName,label:"Child profile setup is remaining — step 6",href}];
   if(["DRAFT","PENDING","CHANGES_REQUESTED","REJECTED","REVOKED"].includes(row.status))return [{id:row.id,name:row.learnerName,label:row.status==="PENDING"?"Your verification is pending":row.status==="DRAFT"?"Finish your verification request":"Your verification needs attention",href},...(row.status==="PENDING"&&row.acknowledgmentMethod==="STUDENT_ACCOUNT"&&!row.studentAcknowledgedAt?[{id:row.id+"-ack",name:row.learnerName,label:"Student confirmation is remaining",href}]:[])];
   return [];
 });
 if(query.data?.setup.gate==="CONSENT_REQUIRED")tasks.unshift({id:"consent",name:"",label:"Learning permission is remaining",href:"/onboarding/guardian"});
 if(query.data?.setup.gate==="PRIVACY_PAUSED")tasks.unshift({id:"privacy",name:"",label:"Learner setup is paused.",href:"/dashboard/privacy"});
 if(query.data?.setup.gate==="VERIFICATION_REQUIRED"&&!tasks.length)tasks.push({id:"verification",name:"",label:"Start guardian verification",href:"/guardian-verification"});
 const unavailable=!!query.error;
 const title=query.isPending?appText("Checking remaining steps…"):unavailable?appText("Remaining steps could not be checked."):tasks.map(t=>(t.name?t.name+": ":"")+appText(t.label)).join("\n");
 const details=<>{query.isPending?<p role="status">{appText("Checking remaining steps…")}</p>:unavailable?<p role="alert">{appText("Remaining steps could not be checked.")}</p>:<ul>{tasks.map(task=><li key={task.id}><strong>{task.name}</strong><p>{appText(task.label)}</p><Link href={task.href}>{appText(task.label==="Your verification is pending"?"View progress":"Continue setup")}</Link></li>)}</ul>}<Button variant="outline" disabled={query.isFetching} onClick={()=>query.refetch()}>{appText("Refresh remaining steps")}</Button></>;
 if(!query.isPending&&!unavailable&&!tasks.length)return null;
 if(indicator)return <div className="guardian-priority-indicator" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}} onKeyDown={event=>{if(event.key==="Escape"){setOpen(false);trigger.current?.focus();}}}><button ref={trigger} type="button" className="guardian-priority-dot" aria-label={appText("View remaining crucial steps")} title={title} aria-expanded={open} aria-controls={panel} onClick={()=>setOpen(!open)}>{query.isPending?"…":unavailable?"!":tasks.length}</button>{open&&<div id={panel} className="guardian-priority-popover" role="region" aria-label={appText("Remaining crucial steps")}>{details}</div>}</div>;
 return <section className="guardian-priorities" aria-label={appText("Remaining crucial steps")}><h2>{appText("Your next important steps")}</h2><p>{appText("Complete these steps for each child. Pending staff review does not need another submission.")}</p>{details}</section>;
}
