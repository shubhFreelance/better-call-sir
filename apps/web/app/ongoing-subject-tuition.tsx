"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck } from "lucide-react";
import { api, type Session, type components, type paths } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { RefreshButton } from "../components/ui/refresh-button";
import { useAppTranslation } from "./locale";

type S = components["schemas"];
type Booking = paths["/tuition-bookings/{kind}/{id}"]["get"]["responses"][200]["content"]["application/json"];
export function OngoingSubjectTuition({ session, learnerId, learnerName, subject }: { session: Session; learnerId: string; learnerName: string; subject: string }) {
  const { appText, appCurriculum } = useAppTranslation();
  const independent = session.account.role === "INDEPENDENT_STUDENT";
  const query = useQuery({
    queryKey: ["ongoing-subject-tuition", session.account.id, learnerId, subject],
    retry: false,
    queryFn: async ({ signal }) => {
      const sameSubject = (value: string) => value.trim().toLowerCase() === subject.trim().toLowerCase();
      let candidates: { id: string; started: boolean }[];
      if (independent) {
        const rows: S["StudentArrangement"][] = [];
        let cursor: string | null = null;
        do {
          const page: S["StudentArrangementList"] = await api("/student-arrangements?limit=50" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""), { signal });
          rows.push(...page.items);
          cursor = page.nextCursor;
        } while (cursor);
        candidates = rows.filter(row => row.status === "CONFIRMED" && sameSubject(row.terms.subject)).map(row => ({ id: row.id, started: false }));
      } else {
        const data = await api<{ placements?: S["Placement"][] }>("/dashboard", { signal });
        const matches = await Promise.all((data.placements || []).filter(row => row.childId === learnerId && row.status === "ACTIVE").map(async row => {
          const request = await api<S["TuitionRequest"]>("/requests/" + row.requestId, { signal });
          return request.childId === learnerId && sameSubject(request.subject) ? { id: row.id, started: row.guardianStarted && row.teacherReceiptConfirmed } : null;
        }));
        candidates = matches.filter((row): row is { id: string; started: boolean } => row !== null);
      }
      const started = await Promise.all(candidates.map(async row => {
        if (row.started) return true;
        const booking = await api<Booking>(`/tuition-bookings/${independent ? "INDEPENDENT" : "PLACEMENT"}/${row.id}`, { signal });
        return booking.completions.some(day => day.completed);
      }));
      return started.filter(Boolean).length;
    },
  });
  if (query.isPending) return <p className="ongoing-subject-loading" role="status">{appText("Checking ongoing tuition…")}</p>;
  if (query.error) return <div className="ongoing-subject-error" role="status"><span>{appText("Ongoing tuition could not be checked.")}</span><RefreshButton label={appText("Retry ongoing tuition check")} onClick={() => query.refetch()} disabled={query.isFetching} /></div>;
  if (!query.data) return null;
  return <section className="ongoing-subject-tuition" aria-label={appText("Ongoing tuition for this subject")}>
    <span className="ongoing-subject-icon"><CalendarCheck size={23} aria-hidden="true" /></span>
    <div><h3>{appText(query.data === 1 ? "1 class is ongoing for {0}" : "{1} classes are ongoing for {0}", [appCurriculum(subject), query.data])}</h3>
      <p>{appText("{0} already has started tuition for this subject. You can review it or continue exploring teachers.", [learnerName])}</p></div>
    <Button asChild variant="outline"><Link href={independent ? "/dashboard/student-arrangements" : "/dashboard/arrangements"}>{appText("View arrangements")}</Link></Button>
  </section>;
}
