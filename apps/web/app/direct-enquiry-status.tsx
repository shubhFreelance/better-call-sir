"use client";
import { lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Session, type paths } from "@bcs/api-client";
import { CircleCheck, CircleMinus, CircleX, Clock3, Eye, MessageSquare } from "lucide-react";
import { Button } from "../components/ui/button";
import { Modal } from "../components/ui/modal";
import { RefreshButton } from "../components/ui/refresh-button";
import { StatusBadge } from "../components/ui/status-controls";
import { useAppTranslation } from "./locale";

const Conversation = lazy(() => import("./direct-enquiries").then(module => ({default: module.DirectEnquiries})));
const stages = {
  CLOSED: {label:"Closed", description:"View the recorded enquiry and decision.", tone:"neutral", icon:CircleMinus},
  PROPOSED: {label:"Alternative proposed", description:"Awaiting family confirmation of the teacher's alternative time or format.", tone:"accent", icon:MessageSquare},
  FAMILY_CONFIRMED: {label:"Proposal confirmed by family", description:"Waiting for the teacher to confirm the agreed time and accept.", tone:"warning", icon:Clock3},
  PENDING: {label:"Awaiting teacher reply", description:"Your enquiry is with the selected teacher.", tone:"warning", icon:Clock3},
  ACCEPTED: {label:"Accepted", description:"The teacher has accepted this enquiry.", tone:"success", icon:CircleCheck},
  DECLINED: {label:"Declined", description:"This enquiry was declined. Review the recorded decision.", tone:"danger", icon:CircleX},
} as const;

export function DirectEnquiryStatus({session, enquiryId, disabled = false}:{session:Session; enquiryId:string; disabled?:boolean}) {
  const {appText} = useAppTranslation(), [open,setOpen] = useState(false);
  const query = useQuery({queryKey:["direct-enquiries",session.account.id,undefined,enquiryId,"ALL"], queryFn:({signal})=>api<paths["/direct-enquiries"]["get"]["responses"][200]["content"]["application/json"]>("/direct-enquiries?limit=10&id="+encodeURIComponent(enquiryId),{signal}),retry:false,staleTime:0});
  const item = !query.error && query.data?.items.find(row=>row.id===enquiryId);
  if(query.isPending)return <p role="status">{appText("Loading enquiries…")}</p>;
  if(!item)return <div role="alert">{appText("Current enquiry status could not be loaded.")}<RefreshButton label={appText("Refresh enquiries")} disabled={disabled||query.isFetching} onClick={()=>query.refetch()}/></div>;
  const stage = !item.sourceOpen && ["PENDING","PROPOSED"].includes(item.status) ? stages.CLOSED : item.status==="PENDING" && item.proposal?.familyConfirmed ? stages.FAMILY_CONFIRMED : stages[item.status];
  return <>
    <div className="direct-stage-summary"><StatusBadge label={appText(stage.label)} tone={stage.tone} icon={stage.icon}/><p>{appText(stage.description)}</p><Button type="button" variant="ghost" size="icon" className="evidence-preview-trigger" aria-label={appText("View current enquiry status")} title={appText("View current enquiry status")} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={()=>setOpen(true)}><Eye size={18} aria-hidden="true"/></Button></div>
    <Modal open={open} onOpenChange={setOpen} title={appText("Current enquiry status")}>
      <Suspense fallback={<p role="status">{appText("Loading enquiries…")}</p>}><Conversation session={session} enquiryId={enquiryId}/></Suspense>
    </Modal>
  </>;
}
