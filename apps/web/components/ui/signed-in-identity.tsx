"use client";
import { useQuery } from "@tanstack/react-query";
import { api, type Session, type components } from "@bcs/api-client";
import { GraduationCap, ShieldCheck } from "lucide-react";
import { useAppTranslation } from "../../app/locale";
import { learningModes } from "../../app/learning-management";
import { LearningManagementBadge } from "./learning-management-badge";

export function SignedInIdentity({ session }: { session: Session }) {
  const { appText } = useAppTranslation();
  const student = session.account.role === "STUDENT", pending = !!session.account.studentSetupPending;
  const context = useQuery({queryKey:["student-setup",session.account.id],queryFn:({signal})=>api<components["schemas"]["StudentSetupContext"]>("/onboarding/student/context",{signal}),enabled:student,retry:false});
  const learner = !context.error ? context.data?.learner : undefined;
  const management = useQuery({queryKey:["learning-management",session.account.id,learner?.id],queryFn:({signal})=>api<components["schemas"]["LearningManagement"]>(`/children/${learner!.id}/learning-management`,{signal}),enabled:student&&!!learner,retry:false});
  const Icon = student || pending || session.account.role === "INDEPENDENT_STUDENT" ? GraduationCap : ShieldCheck;
  const label = pending ? "Student setup pending" : student || session.account.role === "INDEPENDENT_STUDENT" ? "Student account" : session.account.role === "GUARDIAN" ? "Parent or guardian" : session.account.role === "TEACHER" ? "Teacher account" : "Staff account";
  return <div className="signed-in-identity" aria-label={appText("Signed in as {0}",[session.account.name])}>
    <span className="signed-in-name">{session.account.name}</span>
    <span className="signed-in-role" data-pending={pending}><Icon size={16} aria-hidden="true" />{appText(label)}</span>
    {student && !management.error && learner && management.data && <LearningManagementBadge label={appText(learningModes[management.data.mode].title)} items={[appText(learningModes[management.data.mode].help)]} />}
  </div>;
}
