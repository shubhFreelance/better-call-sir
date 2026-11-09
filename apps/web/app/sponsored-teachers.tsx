"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";
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
  const { appText } = useAppTranslation();
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
  if (result.isPending)
    return (
      <p className="promotion-loading" role="status">
        {appText("Loading sponsored teachers…")}
      </p>
    );
  if (result.error) return null;
  if (!result.data?.items?.length) return null;
  return (
    <section
      className="sponsored-teachers"
      aria-label={appText("Sponsored teachers")}
    >
      <header>
        <div>
          <Megaphone size={18} aria-hidden="true" />
          <h2>{appText("Sponsored teachers")}</h2>
        </div>
        <p>
          {appText(
            new URLSearchParams(query).get("promotionPlacement") === "HOME"
              ? "Paid placement · reviewed teaching profiles"
              : "Paid placement · matched to your selected criteria",
          )}
        </p>
      </header>
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
  const { appText, appCurriculum } = useAppTranslation(),
    [selected, setSelected] = useState("");
  const space = spaces.find((s) => s.subject === selected) || spaces[0];
  if (!space || disabled) return null;
  const query = new URLSearchParams({
    promotionPlacement: "SPACE",
    learnerId,
    subject: space.subject,
    ...(space.language ? { language: space.language } : {}),
  });
  return (
    <section className="space-promotions">
      <label>
        {appText("Discover sponsored teachers for a subject space")}
        <select
          value={space.subject}
          onChange={(e) => setSelected(e.target.value)}
        >
          {spaces.map((s) => (
            <option key={s.subject} value={s.subject}>
              {appCurriculum(s.subject)}
            </option>
          ))}
        </select>
      </label>
      <SponsoredTeachers
        key={learnerId + space.subject}
        scope={learnerId}
        query={query.toString()}
        context={
          "?" +
          new URLSearchParams({
            learner: learnerId,
            subject: space.subject,
            ...(space.language ? { language: space.language } : {}),
          })
        }
      />
    </section>
  );
}
