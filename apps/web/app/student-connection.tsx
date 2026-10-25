"use client";
import { RefreshButton } from "../components/ui/refresh-button";
import Link from "next/link";
import {useState} from "react";
import {useInfiniteQuery, useQuery} from "@tanstack/react-query";
import {api, type Session, type components} from "@bcs/api-client";
import {Button} from "../components/ui/button";
import {FilterButton,FilterButtonGroup} from "../components/ui/filter-button";
import {LearningManagementBadge} from "../components/ui/learning-management-badge";
import {InfoTooltip} from "../components/ui/info-tooltip";
import {Link2} from "lucide-react";
import {useAppTranslation} from "./locale";
import {guardianManagementLabels} from "./guardian-verification";

export function StudentConnection({session, onSessionChange, compact=false}: {session:Session; onSessionChange:(session:Session)=>void; compact?:boolean}) {
  const {appText}=useAppTranslation();
  const [refreshing,setRefreshing]=useState(false),[refreshError,setRefreshError]=useState(false);
  const linked=session.account.role === "STUDENT";
  const invitations=useInfiniteQuery({
    queryKey:["student-connection-invitations",session.account.id],
    initialPageParam:null as string|null,
    queryFn:({pageParam,signal})=>api<{items:components["schemas"]["GuardianVerificationInvitation"][];nextCursor:string|null}>("/guardian-verification-invitations?limit=20"+(pageParam?"&cursor="+pageParam:""),{signal}),
    getNextPageParam:page=>page.nextCursor??undefined,
    enabled:session.account.role === "GUARDIAN",
    retry:false,
  });
  const context=useQuery({queryKey:["student-setup",session.account.id],queryFn:({signal})=>api<components["schemas"]["StudentSetupContext"]>("/onboarding/student/context",{signal}),enabled:linked,retry:false});
  const learner=context.data?.learner;
  const management=useQuery({queryKey:["learning-management",session.account.id,learner?.id],queryFn:({signal})=>api<components["schemas"]["LearningManagement"]>(`/children/${learner!.id}/learning-management`,{signal}),enabled:linked&&!!learner&&!context.error,retry:false});
  async function refresh(){
    setRefreshing(true);setRefreshError(false);
    try {onSessionChange(await api<Session>("/auth/session")); await (linked?context.refetch():invitations.refetch()); if(linked&&learner) await management.refetch();}
    catch {setRefreshError(true);} finally {setRefreshing(false);}
  }
  const rows=invitations.data?.pages.flatMap(page=>page.items)??[];
  if(compact&&!linked&&(!rows.length||invitations.error))return null;
  return <section className="care-card student-connection" aria-label={appText("Your student access")}>
    <header className="student-access-header"><span className="student-access-symbol" aria-hidden="true"><Link2 size={24} /></span><h2>{appText(linked&&learner&&!context.error?"Your learning profile is ready":"Your student access")}</h2><InfoTooltip label={appText("Your student access")} items={[appText("Acknowledgment confirms the relationship you recognize. It does not make you an adult or replace separate guardian consent."),appText("Relationship approval is separate from learning permission and profile setup.")]} /></header>
    <p className="student-access-note">{appText("Use your own email every time. A matching name alone never links accounts.")}</p>
    {(linked?context.isPending:invitations.isPending)&&<p role="status">{appText("Checking your profile connection…")}</p>}
    {(refreshError||(linked?context.error:invitations.error))&&<p role="alert">{appText("We couldn’t confirm your access. Refresh before continuing; your account has not been changed.")}</p>}
    {linked&&learner&&!context.error&&<section className="student-access-ready">
      <h3>{learner.alias}</h3>
      <p>{appText("Your guardian has completed your education profile. Review your details and current permissions before choosing a teacher.")}</p>
      {management.error?<p role="alert">{appText("Your learning permissions could not be confirmed. Open your permissions page before making decisions.")}</p>:management.data&&<p><strong>{appText("Who manages learning?")}: </strong><LearningManagementBadge label={appText(guardianManagementLabels[management.data.mode])} items={[appText("Learning consent, account access and financial commencement remain with your guardian.")]} /></p>}
      <div className="wizard-actions"><Button asChild><Link href="/dashboard">{appText("Open dashboard")}</Link></Button><Button asChild variant="outline"><Link href="/dashboard/learning-management">{appText("Review learning permissions")}</Link></Button><Button asChild variant="outline"><Link href="/onboarding/student">{appText("Review education details")}</Link></Button></div>
    </section>}
    {!linked&&!invitations.error&&rows.map(row=>{
      const confirm=["DRAFT","PENDING"].includes(row.status)&&!row.studentAcknowledgedAt;
      const waiting=["DRAFT","PENDING","APPROVED","CHANGES_REQUESTED"].includes(row.status);
      return <article key={row.id} className="care-card student-access-request"><h3>{row.guardianName} · {row.learnerName}</h3>
        <p><strong>{appText(confirm?"Confirm your guardian":waiting?"Your guardian is completing setup":"This relationship needs attention")}</strong></p>
        <p>{appText(confirm?"Confirm only a guardian you recognize. This does not grant learning-data consent.":waiting?"Your guardian must finish relationship review, learning permission and education setup. Refresh here when they are done.":"This request is not active. Ask your guardian or support for help; it does not grant learning access.")}</p>
        <p>{appText("Requested management")}: <LearningManagementBadge label={appText(guardianManagementLabels[row.managementMode])} items={[appText("Acknowledgment confirms the relationship you recognize. It does not make you an adult or replace separate guardian consent.")]} /></p>
        <Button asChild variant="outline"><Link href="/guardian-verification?view=student">{appText("Review relationship request")}</Link></Button>
      </article>;
    })}
    {!linked&&!invitations.error&&!invitations.isPending&&!rows.length&&<section className="student-access-empty"><h3>{appText("No linked learning profile yet")}</h3><p>{appText("Ask your guardian to enter this exact email in your relationship request. You will confirm them here; after approval and setup, sign in with the same email to use your profile.")}</p><Button asChild><Link href="/signup/guardian">{appText("My parent or guardian needs an account")}</Link></Button></section>}
    {invitations.hasNextPage&&<Button disabled={invitations.isFetchingNextPage} variant="outline" onClick={()=>invitations.fetchNextPage()}>{appText("Load more records")}</Button>}
    <FilterButtonGroup className="student-access-actions"><RefreshButton disabled={refreshing} onClick={refresh} label={appText(refreshing?"Checking your profile connection…":"Refresh my access")} />{!compact&&<FilterButton asChild accent><Link href="/onboarding/student?mode=invitation">{appText("I have a private invitation code")}</Link></FilterButton>}</FilterButtonGroup>
  </section>;
}
