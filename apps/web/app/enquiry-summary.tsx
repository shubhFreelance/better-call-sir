"use client";
import { useAppTranslation } from "./locale";
import { WeeklySummary, type Weekly } from "./weekly-availability";
import { LayeredSummaryCard } from "../components/ui/layered-summary-card";

export function EnquirySummary({ learner, education, teacher, subject, mode, language, locality, budgetPaise, preferences }: {
  learner: string; education?: string; teacher?: string; subject: string; mode: string;
  language: string; locality: string; budgetPaise: number; preferences: Weekly;
}) {
  const { appText, appCurriculum, appLocale } = useAppTranslation();
  return <LayeredSummaryCard className="enquiry-summary" aria-label={appText("Enquiry summary")}
    header={<><h3>{learner}</h3>{education && <p>{education}</p>}</>}
    footer={<div className="enquiry-summary-times"><strong>{appText("Weekly learning preferences")}</strong><WeeklySummary preferences={preferences} /></div>}>
    <dl>
      <div><dt>{appText("Teacher")}</dt><dd>{teacher || appText("Let us search for you")}</dd></div>
      <div><dt>{appText("Subject")}</dt><dd>{appCurriculum(subject)}</dd></div>
      <div><dt>{appText("Learning format")}</dt><dd>{appText(mode === "HOME" ? "At home" : "Online")}</dd></div>
      <div><dt>{appText("Teaching language")}</dt><dd>{appCurriculum(language)}</dd></div>
      <div><dt>{appText("City or area")}</dt><dd>{locality}</dd></div>
      <div><dt>{appText("Monthly budget")}</dt><dd className="enquiry-budget">{new Intl.NumberFormat(appLocale, { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(budgetPaise / 100)}</dd></div>
    </dl>
  </LayeredSummaryCard>;
}
