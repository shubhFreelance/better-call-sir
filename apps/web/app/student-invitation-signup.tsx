"use client";
import {useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {api,type Session} from "@bcs/api-client";
import {Button} from "../components/ui/button";
import {Input} from "../components/ui/input";
import {EmailLogin} from "./email-login";
import {useAppTranslation} from "./locale";
export function StudentInvitationSignup({session,onSessionChange,hindi,onLanguageChange}:{session:Session|null;onSessionChange:(s:Session)=>void;hindi:boolean;onLanguageChange:(v:boolean)=>void}){
 const {appText,appError}=useAppTranslation(),router=useRouter();
 const [token,setToken]=useState(""),[checked,setChecked]=useState(false),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function check(){setBusy(true);setError("");try{const result=await api<{status:string}>("/invitations/check",{method:"POST",body:{token:token.trim()}});if(result.status!=="READY")throw new Error("Invitation could not be checked.");setChecked(true);}catch(e){setError(e instanceof Error?e.message:"Invitation could not be checked.");}finally{setBusy(false);}}
 async function link(){if(!session||!confirmed)return;setBusy(true);setError("");try{const next=await api<Session>("/invitations/link-email",{method:"POST",csrf:session.csrfToken,body:{token:token.trim(),confirmed:true}});if(next.account.role!=="STUDENT")throw new Error("Linking could not be confirmed. Retry with the same code and email.");setToken("");onSessionChange(next);router.push("/onboarding/student?mode=together");}catch(e){setError(e instanceof Error?e.message:"Linking could not be confirmed. Retry with the same code and email.");}finally{setBusy(false);}}
 return <main className="container narrow section"><section className="care-card student-invitation-signup"><h1>{appText("Join your guardian’s learning profile")}</h1><p>{appText("Invitation code → your own email → linked student dashboard. Your guardian does not need to create another child profile.")}</p>
 {!checked?<form onSubmit={e=>{e.preventDefault();check();}}><label htmlFor="student-join-code">{appText("Invitation code")}</label><Input id="student-join-code" type="password" autoComplete="off" maxLength={100} required value={token} onChange={e=>setToken(e.target.value)}/><Button disabled={busy||!token.trim()} type="submit">{appText("Check my invitation")}</Button></form>:<><p>{appText("Invitation checked. Use the student’s own email, not the guardian’s email.")}</p>{!session?<EmailLogin purpose="student-signup" hindi={hindi} onLanguageChange={onLanguageChange} onSignedIn={onSessionChange}/>:<><label className="wizard-checkbox"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/><span>{appText("My guardian gave me this code for my own learning profile. I agree to link this email account.")}</span></label><Button disabled={busy||!confirmed} onClick={link}>{appText("Link my student profile")}</Button></>}</>}
 {error&&<p role="alert">{appError(error)}</p>}
 <Link className="inline-link" href="/login?next=%2Fonboarding%2Fstudent%3Fmode%3Dtogether">{appText("Already activated? Sign in to your student profile")}</Link>
 </section></main>;
}
