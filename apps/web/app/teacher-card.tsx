"use client";
import Link from "next/link";
import { ArrowUpRight, BookOpen, Check, Languages, MapPin, ShieldCheck } from "lucide-react";
import { rupees, type Teacher, type Session } from "@bcs/api-client";
import { recordPromotionActivity } from "./promotion-activity";
import { useAppTranslation } from "./locale";
import { TeacherLockIn } from "./teacher-lock-in";
import { TeachingCoverageSummary } from "./teaching-coverage";

export function TeacherCard({ teacher, context = "", sponsored = false, session }: { teacher: Teacher; context?: string; sponsored?: boolean; session?: Session | null }) {
  const { appText, appLocale, appCurriculum } = useAppTranslation();
  const href = `/teachers/${teacher.slug}${context}` + (sponsored && teacher.promotionId ? `${context.includes("?") ? "&" : "?"}promotion=${encodeURIComponent(teacher.promotionId)}` : "");
  const clicked = () => { if (sponsored && teacher.promotionId) recordPromotionActivity(session,teacher.id,"CARD_CLICK",teacher.promotionId); };

  return (
    <article className="teacher-card">
      <div className="teacher-top">
        <div className="avatar" style={{ background: teacher.avatarColor }}>
          {teacher.name.split(" ").slice(0, 2).map(part => part[0]).join("")}
          <span>
            <Check size={11} />
          </span>
        </div>
        <div className="teacher-card-badges">
          {sponsored && <span className="teacher-sponsored-badge">{appText("Sponsored")}</span>}
          <span className="badge">
            <ShieldCheck size={12} /> {appText("Reviewed coverage")}{" "}
          </span>
        </div>
      </div>
      <Link href={href} onClick={clicked} onAuxClick={e=>{if(e.button===1)clicked();}} className="teacher-name">
        <h3>{teacher.name}</h3>
        <ArrowUpRight size={19} />
      </Link>
      <p className="teacher-headline">{teacher.headline}</p>
      {teacher.demoAvailable && (
        <span className="teacher-demo-badge">
          <Check size={14} aria-hidden="true" />{" "}
          {appText("Demo available")}{" "}
        </span>
      )}
      <TeacherLockIn days={teacher.lockInDays} />
      <div className="teacher-tags">
        {teacher.subjects.map((s) => (
          <span key={s}>{appCurriculum(s)}</span>
        ))}
      </div>
      <TeachingCoverageSummary profile={teacher} compact />
      <div className="teacher-details">
        {teacher.boards.length > 0 && (
          <span>
            <BookOpen size={15} />
            {teacher.boards.join(" · ")}
          </span>
        )}
        <span>
          <MapPin size={15} />
          {teacher.modes.includes("HOME")
            ? teacher.modes.includes("ONLINE")
              ? appText("Raipur · At home & online")
              : appText("Raipur · Home tuition")
            : appText("Online tuition")}
        </span>
        <span>
          <Languages size={15} />
          {teacher.languages
            .map((value) => appCurriculum(value))
            .join(" & ")} · {teacher.experience}{" "}
          {appText("years teaching")}{" "}
        </span>
      </div>
      <div className="teacher-bottom">
        <div>
          <strong>{rupees(teacher.monthlyPaise, appLocale)}</strong>
          <small> {appText("/ month · tuition paid directly")}</small>
        </div>
        <Link
          href={href}
          onClick={clicked}
          onAuxClick={e=>{if(e.button===1)clicked();}}
          className="round-link"
          aria-label={appText("View {0}", [teacher.name])}
        >
          <ArrowUpRight size={20} />
        </Link>
      </div>
    </article>
  );
}
