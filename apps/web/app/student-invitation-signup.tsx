"use client";
import {useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {api,type Session} from "@bcs/api-client";
import {Link2,KeyRound,Check,LoaderCircle} from "lucide-react";
import {FilterButton,FilterButtonGroup} from "../components/ui/filter-button";
import {StepProgress} from "../components/ui/step-progress";
import {InfoTooltip} from "../components/ui/info-tooltip";
import {Input} from "../components/ui/input";
import {EmailLogin} from "./email-login";
import {useAppTranslation} from "./locale";
export function StudentInvitationSignup({session,onSessionChange,hindi,onLanguageChange}:{session:Session|null;onSessionChange:(s:Session)=>void;hindi:boolean;onLanguageChange:(v:boolean)=>void}){
 const {appText,appError}=useAppTranslation(),router=useRouter();
 const [token,setToken]=useState(""),[checked,setChecked]=useState(false),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function check(){setBusy(true);setError("");try{const result=await api<{status:string}>("/invitations/check",{method:"POST",body:{token:token.trim()}});if(result.status!=="READY")throw new Error("Invitation could not be checked.");setChecked(true);}catch(e){setError(e instanceof Error?e.message:"Invitation could not be checked.");}finally{setBusy(false);}}
 async function link(){if(!session||!confirmed)return;setBusy(true);setError("");try{const next=await api<Session>("/invitations/link-email",{method:"POST",csrf:session.csrfToken,body:{token:token.trim(),confirmed:true}});if(next.account.role!=="STUDENT")throw new Error("Linking could not be confirmed. Retry with the same code and email.");setToken("");onSessionChange(next);router.push("/onboarding/student?mode=together");}catch(e){setError(e instanceof Error?e.message:"Linking could not be confirmed. Retry with the same code and email.");}finally{setBusy(false);}}
 const signIn=<FilterButton asChild disabled={busy}><Link href="/login?next=%2Fonboarding%2Fstudent%3Fmode%3Dtogether" aria-disabled={busy} onClick={event=>{if(busy)event.preventDefault();}}>{appText("Already activated? Sign in to your student profile")}</Link></FilterButton>;
 const step=!checked?0:!session?1:2;
 return <main className="container narrow section"><section className="student-invitation-signup" aria-labelledby="student-invitation-title">
 <header className="invitation-signup-header"><span className="invitation-signup-icon"><Link2 size={26} aria-hidden="true"/></span><div><h1 id="student-invitation-title">{appText("Join your guardian’s learning profile")}</h1><p>{appText("Connect your invitation to your own student account.")}</p></div><InfoTooltip label={appText("About your student invitation")} items={[appText("Invitation code → your own email → linked student dashboard. Your guardian does not need to create another child profile.")]}/></header>
 <div className="invitation-signup-body">
 <StepProgress steps={[appText("Invitation code"),appText("Your own email"),appText("Student dashboard")]} currentStep={step} label={appText("Invitation setup")}/>
 {!checked?<form className="invitation-code-form" onSubmit={e=>{e.preventDefault();check();}}>
 <div className="invitation-code-entry"><div className="invitation-code-label"><KeyRound size={18} aria-hidden="true"/><label htmlFor="student-join-code">{appText("Invitation code")}</label></div><Input id="student-join-code" type="password" autoComplete="off" maxLength={100} required value={token} disabled={busy} onChange={e=>setToken(e.target.value)}/><p>{appText("Enter the private code shared by your guardian.")}</p></div>
 <FilterButtonGroup><FilterButton accent disabled={busy||!token.trim()} type="submit">{busy&&<LoaderCircle size={16} className="invitation-check-spinner" aria-hidden="true"/>}{appText("Check my invitation")}</FilterButton>{signIn}</FilterButtonGroup>
 </form>:<><p className="invitation-checked"><Check size={18} aria-hidden="true"/>{appText("Invitation checked. Use the student’s own email, not the guardian’s email.")}</p>{!session?<><EmailLogin purpose="student-signup" hindi={hindi} onLanguageChange={onLanguageChange} onSignedIn={onSessionChange}/><div className="invitation-signin-return">{signIn}</div></>:<div className="invitation-link-confirmation"><label className="wizard-checkbox"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/><span>{appText("My guardian gave me this code for my own learning profile. I agree to link this email account.")}</span></label><FilterButtonGroup><FilterButton accent disabled={busy||!confirmed} onClick={link}>{busy&&<LoaderCircle size={16} className="invitation-check-spinner" aria-hidden="true"/>}{appText("Link my student profile")}</FilterButton>{signIn}</FilterButtonGroup></div>}</>}
 {busy&&<p role="status" className="invitation-signup-status">{appText("Please wait…")}</p>}
 {error&&<p className="invitation-signup-error" role="alert">{appError(error)}</p>}
 </div></section></main>;
}
