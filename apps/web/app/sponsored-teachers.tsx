"use client";
import { useQuery } from "@tanstack/react-query";
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
  if (!spaces.length || disabled) return null;
  return <div className="space-promotions">
    {spaces.map(space => {
      const query = new URLSearchParams({
        promotionPlacement: "SPACE", learnerId, subject: space.subject,
        ...(space.language ? { language: space.language } : {}),
      });
      const context = new URLSearchParams({
        learner: learnerId, subject: space.subject,
        ...(space.language ? { language: space.language } : {}),
      });
      return <SponsoredTeachers key={learnerId + ":" + space.subject} scope={learnerId} query={query.toString()} context={"?" + context} />;
    })}
  </div>;
}
