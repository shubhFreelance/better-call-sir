"use client";
import type {Session} from "@bcs/api-client";
import {useHistory,HistoryPages} from "./history";
import {useAppTranslation} from "./locale";
import {Button} from "../components/ui/button";
export function TeacherPendingEnquiries({session}:{session:Session}){
 const {appText,appCurriculum}=useAppTranslation();
 const history=useHistory<{items:{id:string;subject:string;mode:"ONLINE"|"HOME";createdAt:string}[];nextCursor:string|null}>({queryKey:["teacher-pending-enquiries",session.account.id],path:"/teacher/pending-enquiries?limit=10"});
 return <section className="care-card teacher-pending-enquiries" aria-label={appText("Direct enquiries awaiting review")}><h2>{appText("Direct enquiries awaiting review")}</h2><p>{appText("These guardians chose your profile. Staff must review and publish the match before you can respond. No child identity or contact details are shared here.")}</p>
 {history.isPending&&<p role="status">{appText("Loading enquiries…")}</p>}
 {history.error?<p role="alert">{appText("Pending enquiries could not be loaded.")} <Button variant="outline" onClick={()=>history.refetch()}>{appText("Try again")}</Button></p>:<>{!history.isPending&&!history.data?.items.length&&<p>{appText("No direct enquiries are waiting for staff review.")}</p>}<ul className="learner-education-list">{history.data?.items.map(item=><li className="saved-learner-card" key={item.id}><h3>{appCurriculum(item.subject)} · {appText(item.mode==="ONLINE"?"Online":"At home")}</h3><p className="hiring-state">{appText("Awaiting staff review — response not open yet")}</p><small>{appText("Enquiry reference")}: {item.id}</small></li>)}</ul></>}
 <HistoryPages history={history} label={appText("Pending direct enquiry history")}/></section>;
}
