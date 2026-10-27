"use client";
import Link from "next/link";
import {useEffect,useRef} from "react";
import {useQuery} from "@tanstack/react-query";
import {api,type Child,type Session,type TuitionRequest,type paths} from "@bcs/api-client";
import {BookOpen,CheckCircle2,Clock3,Plus} from "lucide-react";
import {FilterButton,FilterButtonGroup} from "../components/ui/filter-button";
import {StatusBadge} from "../components/ui/status-controls";
import {RefreshButton} from "../components/ui/refresh-button";
import {useHistory,HistoryPages} from "./history";
import {useMonthlyBooking} from "./monthly-hiring";
import {useAppTranslation} from "./locale";

type Conversations=paths["/direct-enquiries"]["get"]["responses"][200]["content"]["application/json"];
type Conversation=Conversations["items"][number];
export function GuardianEnquiryOverview({session,completedId,subject,learnerId,teacherId,teacherName,selectedIntent,justSubmitted,hasDraft=false,busy,onContinue}:{session:Session;completedId:string;subject:string;learnerId:string;teacherId:string;teacherName?:string;selectedIntent:boolean;justSubmitted:boolean;hasDraft?:boolean;busy:boolean;onContinue:()=>void}){
 const {appText,appCurriculum}=useAppTranslation(),heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{heading.current?.focus();},[]);
 const requests=useHistory<{items:TuitionRequest[];nextCursor?:string|null}>({queryKey:["guardian-subject-enquiries",session.account.id],path:"/requests?limit=10"});
 const conversations=useHistory<Conversations>({queryKey:["direct-enquiries",session.account.id,"subject-overview"],path:"/direct-enquiries?limit=10"});
 const learners=useQuery({queryKey:["children",session.account.id],queryFn:({signal})=>api<{items:Child[]}>("/children",{signal}),retry:false});
 const learnerName=(id:string)=>!learners.error?learners.data?.items.find(row=>row.id===id)?.alias:undefined;
 const current=useQuery({queryKey:["guardian-submitted-request",session.account.id,completedId],queryFn:({signal})=>api<TuitionRequest>("/requests/"+completedId,{signal}),enabled:!!completedId,retry:false});
 const submitted=!current.error?current.data:undefined;
 const newSelection=selectedIntent&&!justSubmitted&&(!completedId||!!submitted&&((submitted.preferredTeacherId||"")!==teacherId||!!learnerId&&submitted.childId!==learnerId||!!subject&&submitted.subject!==subject));
 const checking=selectedIntent&&!justSubmitted&&!!completedId&&current.isPending;
 const rows=[...(submitted?[submitted]:[]),...(requests.data?.items??[])].filter((row,index,all)=>all.findIndex(item=>item.id===row.id)===index);
 return <section className="guardian-enquiry-overview">
  <header className="guardian-enquiry-overview-heading"><BookOpen size={24} aria-hidden="true"/><div><h1 ref={heading} tabIndex={-1}>{appText(justSubmitted?"Your tuition request is saved.":"Your subject enquiries")}</h1><p>{appText("Each subject has its own enquiry. Saved requests stay unchanged when you start another.")}</p></div></header>
  {checking&&<p role="status">{appText("Checking your selected subject…")}</p>}
  <div className="student-spaces-grid">
  {newSelection&&<article className="student-subject-card enquiry-selection-card" aria-label={appText("New enquiry: {0}",[appCurriculum(subject)])}>
   <StatusBadge label={appText("Not submitted")} tone="accent" icon={Plus}/><h2>{appCurriculum(subject)}</h2>{learnerName(learnerId)&&<p><strong>{learnerName(learnerId)}</strong></p>}<p>{teacherName||appText(teacherId?"Selected teacher":"Let us search for you")}</p><p>{appText("Continue with this subject to review the learner, tuition needs and availability before sending.")}</p><FilterButton accent disabled={busy} onClick={onContinue}>{appText("Continue with {0}",[appCurriculum(subject)])}</FilterButton>
  </article>}
   {rows.map(row=><SubmittedEnquiryCard key={row.id} session={session} request={row} learnerName={learnerName(row.childId)} current={row.id===completedId} conversation={!conversations.error?conversations.data?.items.find(item=>item.kind==="GUARDIAN"&&item.sourceId===row.id):undefined}/>)}
  </div>
  {requests.isPending&&<p role="status">{appText("Loading your subject enquiries…")}</p>}
  {(requests.error||current.error)&&<div role="alert"><p>{appText("Some saved enquiries could not be loaded. Refresh to check their current status.")}</p><RefreshButton label={appText("Refresh enquiries")} disabled={busy} onClick={()=>{void requests.refetch();if(completedId)void current.refetch();}}/></div>}
  {conversations.error&&<div role="alert"><p>{appText("Teacher reply status could not be loaded. Open an enquiry to check its latest progress.")}</p><RefreshButton label={appText("Refresh enquiries")} disabled={busy} onClick={()=>void conversations.refetch()}/></div>}
  <HistoryPages history={requests} label="Subject enquiry history" disabled={busy}/>
  {conversations.hasNextPage&&<HistoryPages history={conversations} label="Teacher reply history" disabled={busy}/>}
  <FilterButtonGroup><FilterButton asChild accent><Link href="/dashboard/requests">{appText("View tuition requests")}</Link></FilterButton>{newSelection?<FilterButton asChild><Link href="/teachers">{appText("Explore teachers")}</Link></FilterButton>:<FilterButton disabled={busy||checking||selectedIntent&&!justSubmitted&&!!current.error} onClick={onContinue}>{appText(busy?"Starting enquiry…":hasDraft?"Resume saved enquiry":"Create another request")}</FilterButton>}</FilterButtonGroup>
 </section>;
}
function SubmittedEnquiryCard({session,request,current,conversation,learnerName}:{session:Session;request:TuitionRequest;current:boolean;conversation?:Conversation;learnerName?:string}){
 const {appText,appLocale,appCurriculum}=useAppTranslation();
 const booking=useMonthlyBooking(session,"PLACEMENT",conversation?.arrangementId??"",conversation?.status==="ACCEPTED");
 const booked=!booking.error&&booking.data?.confirmed;
 const closed=request.status==="CLOSED"||!booking.error&&booking.data?.closed;
 const label=closed?appText("Closed"):booked?appText("Teacher booked for {0}",[new Intl.DateTimeFormat(appLocale,{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(booking.data!.month+"-01T00:00:00Z"))]):appText(conversation?.status==="ACCEPTED"?"Accepted":conversation?.status==="DECLINED"?"Declined":conversation?.status==="PROPOSED"?"Alternative proposed":conversation?.status==="PENDING"?"Awaiting teacher reply":"Enquiry saved");
 return <article className={"student-subject-card submitted-enquiry-card"+(current?" is-current":"")} aria-label={appText("{0} enquiry",[appCurriculum(request.subject)])}>
  <StatusBadge label={label} tone={closed?"neutral":booked||conversation?.status==="ACCEPTED"?"success":conversation?.status==="DECLINED"?"danger":"neutral"} icon={booked||conversation?.status==="ACCEPTED"?CheckCircle2:Clock3}/><h2>{appCurriculum(request.subject)}</h2>
  {current&&<p className="enquiry-current-label">{appText("Latest saved enquiry")}</p>}
  {(conversation||learnerName)&&<p><strong>{conversation?.learner.name||learnerName}</strong></p>}{conversation&&<p>{conversation.teacherName}</p>}
  <p>{appText("Request")} <strong>{request.id.slice(0,8)}</strong></p><FilterButton asChild><Link href={"/dashboard/requests?request="+request.id}>{appText("View enquiry")}</Link></FilterButton>
 </article>;
}
