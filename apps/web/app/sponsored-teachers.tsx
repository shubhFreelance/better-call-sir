"use client";
import { useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { StatusFilters } from "../components/ui/status-controls";
import { api, type Teacher } from "@bcs/api-client";
import { TeacherCard } from "./teacher-card";
import { useAppTranslation } from "./locale";
export function SponsoredTeachers({
  query,
  context = "",
  scope = "public",
}: {
  query: string;
  context?: string;
  scope?: string;
}) {
  const { appText, appCurriculum } = useAppTranslation();
  const subject = new URLSearchParams(query).get("subject");
  const result = useQuery({
    queryKey: ["sponsored-teachers", scope, query],
    retry: false,
    staleTime: 0,
    refetchInterval: 60000,
    queryFn: ({ signal }) =>
      api<{ items: Teacher[] }>("/sponsored-teachers?" + query, {
        signal,
      }),
  });
  if (result.isPending) return null;
  if (result.error) return null;
  if (!result.data?.items?.length) return null;
  return (
    <section
      className="sponsored-teachers"
      aria-label={appText("Sponsored teachers") + (subject ? " · " + appCurriculum(subject) : "")}
    >
      <div className="sponsored-teacher-grid">
        {result.data.items.map((t) => (
          <TeacherCard key={t.id} teacher={t} context={context} sponsored />
        ))}
      </div>
    </section>
  );
}
export function SpacePromotions({
  learnerId,
  spaces,
  disabled,
}: {
  learnerId: string;
  spaces: { subject: string; language?: string }[];
  disabled: boolean;
}) {
  const { appText, appCurriculum } = useAppTranslation();
  const [selection, setSelection] = useState({ learnerId, subject: "" });
  const subject = selection.learnerId === learnerId && spaces.some(space => space.subject === selection.subject) ? selection.subject : "";
  const queries = spaces.map(space => new URLSearchParams({
    promotionPlacement: "SPACE", learnerId, subject: space.subject,
    ...(space.language ? { language: space.language } : {}),
  }).toString());
  const results = useQueries({ queries: queries.map(query => ({
    queryKey: ["sponsored-teachers", learnerId, query],
    enabled: !disabled,
    retry: false,
    staleTime: 0,
    refetchInterval: 60000,
    queryFn: ({ signal }: { signal: AbortSignal }) => api<{ items: Teacher[] }>("/sponsored-teachers?" + query, { signal }),
  })) });
  if (disabled || !spaces.length || !results.some(result => !result.error && result.data?.items.length)) return null;
  const teachers = new Map<string, { teacher: Teacher; context: string }>();
  spaces.forEach((space, index) => {
    if (subject && subject !== space.subject || results[index].error) return;
    const context = "?" + new URLSearchParams({ learner: learnerId, subject: space.subject, ...(space.language ? { language: space.language } : {}) });
    for (const teacher of results[index].data?.items || []) {
      if (!teachers.has(teacher.id)) teachers.set(teacher.id, { teacher, context });
    }
  });
  return <section className="space-promotions space-suggestions" aria-label={appText("Suggested teachers for you")}>
    <header className="space-suggestions-heading">
      <div><h2>{appText("Suggested teachers for you")}</h2><p>{appText("Matched to your saved subject spaces.")}</p></div>
      <StatusFilters label={appText("Filter suggested teachers")} value={subject} onChange={subject => setSelection({ learnerId, subject })} options={[{ value: "", label: appText("All") }, ...spaces.map(space => ({ value: space.subject, label: appCurriculum(space.subject) }))]} />
    </header>
    <div className="sponsored-teacher-grid">
      {[...teachers.values()].map(({ teacher, context }) => <TeacherCard key={teacher.id} teacher={teacher} context={context} sponsored />)}
    </div>
    {!teachers.size && subject && results[spaces.findIndex(space => space.subject === subject)]?.isSuccess && <p className="space-suggestions-empty">{appText("No suggested teachers for this subject yet.")}</p>}
  </section>;
}
