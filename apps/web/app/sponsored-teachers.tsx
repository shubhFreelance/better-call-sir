"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Megaphone, ArrowUpRight } from "lucide-react";
import { api, rupees, type Teacher } from "@bcs/api-client";
import { LayeredSummaryCard } from "../components/ui/layered-summary-card";
import { FilterButton } from "../components/ui/filter-button";
import { RefreshButton } from "../components/ui/refresh-button";
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
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();
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
  if (result.error)
    return (
      <div className="promotion-loading" role="status">
        <span>
          {appText(
            "Sponsored teachers are unavailable. You can still browse the regular results.",
          )}
        </span>
        <RefreshButton
          label={appText("Refresh")}
          onClick={() => result.refetch()}
          disabled={result.isFetching}
        />
      </div>
    );
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
          <LayeredSummaryCard
            key={t.id}
            className="sponsored-teacher"
            header={
              <>
                <h3>{t.name}</h3>
                <span className="promotion-sponsored-label">
                  {appText("Sponsored")}
                </span>
              </>
            }
            footer={
              <>
                <strong>
                  {rupees(t.monthlyPaise, appLocale)}{" "}
                  <small>{appText("/ month · tuition paid directly")}</small>
                </strong>
                <FilterButton asChild>
                  <Link href={"/teachers/" + t.slug + context}>
                    {appText("View profile")}
                    <ArrowUpRight size={15} aria-hidden="true" />
                  </Link>
                </FilterButton>
              </>
            }
          >
            <p>{t.headline}</p>
            <p>{t.subjects.map(appCurriculum).join(" · ")}</p>
          </LayeredSummaryCard>
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
