"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Session, type components } from "@bcs/api-client";
import {
  BarChart3,
  CircleAlert,
  CircleCheck,
  CircleX,
  Clock3,
  Eye,
  MousePointer2,
  Users,
} from "lucide-react";
import { useAppTranslation } from "./locale";
import { promotionLabels } from "./promotions-workspace";
import {
  FilterButton,
  FilterButtonGroup,
} from "../components/ui/filter-button";
import { InfoTooltip } from "../components/ui/info-tooltip";
import { LayeredSummaryCard } from "../components/ui/layered-summary-card";
import { RefreshButton } from "../components/ui/refresh-button";
import { StatusBadge } from "../components/ui/status-controls";

type Report = components["schemas"]["PromotionAnalytics"];
const campaignStatus: Record<string, string> = {
  PENDING: "Awaiting review",
  ACTIVE: "Active",
  PAUSED: "Paused",
  EXPIRED: "Expired",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};
const enquiryStatus: Record<string, string> = {
  PENDING: "Awaiting teacher reply",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  PROPOSED: "Alternative proposed",
  PROPOSAL_ACCEPTED: "Proposal confirmed",
};
const currentMonth = () =>
  new Date(Date.now() + 330 * 60000).toISOString().slice(0, 7);
function useInsights(
  session: Session,
  month: string,
  teacherId = "",
  page = 1,
  leadPage = 1,
) {
  const params = new URLSearchParams({
    month,
    page: String(page),
    leadPage: String(leadPage),
    ...(teacherId ? { teacherId } : {}),
  });
  return useQuery({
    queryKey: ["promotion-insights", session.account.id, params.toString()],
    enabled: ["TEACHER", "ADMIN"].includes(session.account.role),
    retry: false,
    refetchInterval: 60000,
    queryFn: async ({ signal }) => {
      const report = await api<Report>("/promotions/analytics?" + params, {
        signal,
      });
      if (
        !report.summary ||
        !report.teachers ||
        !report.enquiries ||
        !Array.isArray(report.daily)
      )
        throw new Error("Promotion insights are unavailable. Please retry.");
      return report;
    },
  });
}

export function PromotionPerformanceCard({ session }: { session: Session }) {
  const { appText, appLocale } = useAppTranslation(),
    report = useInsights(session, currentMonth());
  const n = (value: number) => value.toLocaleString(appLocale);
  return (
    <section className="care-card promotion-performance-card">
      <div>
        <BarChart3 size={22} aria-hidden="true" />
        <h2>{appText("Promotion insights")}</h2>
      </div>
      {report.data && !report.error ? (
        <dl>
          <div>
            <dt>{appText("Active promotions")}</dt>
            <dd>{n(report.data.summary.active)}</dd>
          </div>
          <div>
            <dt>{appText("Sponsored clicks this month")}</dt>
            <dd>{n(report.data.summary.clicksMonth)}</dd>
          </div>
          <div>
            <dt>{appText("Profile visits this month")}</dt>
            <dd>{n(report.data.summary.visitsMonth)}</dd>
          </div>
        </dl>
      ) : (
        <p>
          {appText(
            report.isPending
              ? "Loading promotion insights…"
              : "Open insights to check your promotion activity.",
          )}
        </p>
      )}
      <FilterButton asChild accent>
        <Link href="/dashboard/promotion-insights">
          {appText("View promotion insights")}
        </Link>
      </FilterButton>
    </section>
  );
}

function ReportPages({
  page,
  total,
  onChange,
  disabled,
  label,
}: {
  page: number;
  total: number;
  onChange: (p: number) => void;
  disabled: boolean;
  label: string;
}) {
  const { appText } = useAppTranslation(),
    pages = Math.max(1, Math.ceil(total / 10));
  return (
    <div className="insight-pagination" role="group" aria-label={label}>
      <span>{appText("Page {0} of {1}", [page, pages])}</span>
      <FilterButtonGroup>
        <FilterButton
          disabled={disabled || page <= 1}
          onClick={() => onChange(page - 1)}
        >
          {appText("Previous")}
        </FilterButton>
        <FilterButton
          disabled={disabled || page >= pages}
          onClick={() => onChange(page + 1)}
        >
          {appText("Next")}
        </FilterButton>
      </FilterButtonGroup>
    </div>
  );
}

export function PromotionInsights({ session }: { session: Session }) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation(),
    params = useSearchParams();
  const admin = session.account.role === "ADMIN",
    allowed = admin || session.account.role === "TEACHER";
  const teacherId = admin ? params.get("teacher") || "" : "";
  const [month, setMonth] = useState(currentMonth);
  const [pagination, setPagination] = useState({
    teacherId,
    page: 1,
    leadPage: 1,
  });
  const page = pagination.teacherId === teacherId ? pagination.page : 1,
    leadPage = pagination.teacherId === teacherId ? pagination.leadPage : 1;
  const report = useInsights(session, month, teacherId, page, leadPage),
    data = report.error ? undefined : report.data;
  const n = (value: number) => value.toLocaleString(appLocale);
  const date = (value: string) =>
    new Intl.DateTimeFormat(appLocale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    }).format(new Date(value));
  const months = Array.from({ length: 4 }, (_, i) => {
    const d = new Date(currentMonth() + "-01T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() - i);
    return {
      value: d.toISOString().slice(0, 7),
      label: new Intl.DateTimeFormat(appLocale, {
        month: "long",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      }).format(d),
    };
  });
  const manage =
    "/dashboard/promotions" +
    (teacherId ? "?teacher=" + encodeURIComponent(teacherId) : "");
  if (!allowed)
    return (
      <p role="alert">{appText("Your role cannot perform this action.")}</p>
    );
  return (
    <div className="promotion-insights">
      <header className="insight-intro">
        <span className="promotion-icon">
          <BarChart3 size={25} aria-hidden="true" />
        </span>
        <div>
          <h1>{appText("Promotion insights")}</h1>
          <p>
            {appText(
              admin
                ? "Compare teacher promotions, review interest and manage visibility."
                : "See how families discover your teaching profile.",
            )}
          </p>
        </div>
        <FilterButton asChild>
          <Link href={manage}>{appText("Manage promotions")}</Link>
        </FilterButton>
      </header>
      <div className="insight-toolbar">
        <div>
          <strong>
            {data?.teacher?.name ||
              appText(admin ? "All teachers" : "Your teaching profile")}
          </strong>
          {admin && teacherId && (
            <Link href="/dashboard/promotion-insights">
              {appText("Back to all teachers")}
            </Link>
          )}
        </div>
        <label>
          {appText("Activity month")}
          <select
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setPagination({ teacherId, page: 1, leadPage: 1 });
            }}
          >
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <RefreshButton
          label={appText("Refresh promotion insights")}
          disabled={report.isFetching}
          onClick={() => {
            void report.refetch();
          }}
        />
      </div>
      {report.isPending && (
        <p role="status">{appText("Loading promotion insights…")}</p>
      )}
      {report.error && (
        <div className="promotion-load-error" role="alert">
          <CircleAlert size={22} aria-hidden="true" />
          <div>
            <strong>{appText("Promotion insights unavailable")}</strong>
            <p>{appError(report.error.message)}</p>
          </div>
          <RefreshButton
            label={appText("Retry promotion insights")}
            disabled={report.isFetching}
            onClick={() => {
              void report.refetch();
            }}
          />
        </div>
      )}
      {data && (
        <>
          <div
            className="insight-summary"
            aria-label={appText("Promotion summary")}
          >
            <section className="insight-campaign-counts">
              <h2>{appText("Your promotions")}</h2>
              <dl>
                <div>
                  <dt>{appText("Promotion requests")}</dt>
                  <dd>{n(data.summary.requests)}</dd>
                </div>
                <div>
                  <dt>{appText("Approved requests")}</dt>
                  <dd>{n(data.summary.approved)}</dd>
                </div>
                <div>
                  <dt>{appText("Active promotions")}</dt>
                  <dd>{n(data.summary.active)}</dd>
                </div>
              </dl>
              <p>
                {appText(
                  "Awaiting review: {0} · Paused: {1} · Expired: {2} · Rejected: {3} · Cancelled: {4}",
                  [
                    data.summary.pending,
                    data.summary.paused,
                    data.summary.expired,
                    data.summary.rejected,
                    data.summary.cancelled,
                  ],
                )}
              </p>
            </section>
            <section className="insight-reach">
              <h2>{appText("Profile activity")}</h2>
              <dl>
                <div>
                  <dt>{appText("Sponsored clicks this month")}</dt>
                  <dd>{n(data.summary.clicksMonth)}</dd>
                </div>
                <div>
                  <dt>{appText("Profile visits today")}</dt>
                  <dd>{n(data.summary.visitsToday)}</dd>
                </div>
                <div>
                  <dt>{appText("Profile visits this month")}</dt>
                  <dd>{n(data.summary.visitsMonth)}</dd>
                </div>
              </dl>
              <p>
                {appText("Direct enquiries received: {0}", [
                  n(data.summary.enquiries),
                ])}
              </p>
            </section>
          </div>
          <div className="insight-definition">
            <p>
              {appText("Signed-in activity only · Last 90 days")}
              {data.firstRecordedAt && (
                <span>
                  {appText("First recorded activity: {0}", [
                    date(data.firstRecordedAt),
                  ])}
                </span>
              )}
            </p>
            <InfoTooltip
              label={appText("How promotion activity is counted")}
              items={[
                appText(
                  "Clicks count once per account and promotion each day. Visits count once per account and teacher each day, including regular profile visits. Times use IST.",
                ),
                appText(
                  "Only signed-in parent and student accounts are counted. Privacy settings, blocked tracking and failed requests can reduce totals. Older traffic is not backfilled.",
                ),
                appText(
                  "Approved requests include previously activated promotions. Active status does not guarantee delivery when screening, fit or capacity changes.",
                ),
                appText(
                  "Browsing is not consent to contact. Names below come only from existing enquiries; no private viewer contacts are shared.",
                ),
              ]}
            />
          </div>
          {admin && !teacherId && (
            <LayeredSummaryCard
              className="insight-panel"
              header={<h2>{appText("Teacher performance")}</h2>}
              footer={
                <ReportPages
                  label={appText("Teacher performance pages")}
                  page={page}
                  total={data.teachers.total}
                  disabled={report.isFetching}
                  onChange={(page) =>
                    setPagination({ teacherId, page, leadPage })
                  }
                />
              }
            >
              {data.teachers.items.length ? (
                <div className="insight-table-scroll insight-teachers-table" tabIndex={0} role="region" aria-label={appText("Teacher performance")}>
                  <table>
                    <caption>
                      {appText("Selected month · Up to 10 teachers per page")}
                    </caption>
                    <thead>
                      <tr>
                        <th>{appText("Teacher")}</th>
                        <th>{appText("Requests / approved")}</th>
                        <th>{appText("Sponsored clicks")}</th>
                        <th>{appText("Profile visits")}</th>
                        <th>{appText("Actions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.teachers.items.map((t) => (
                        <tr key={t.id}>
                          <th scope="row">
                            <strong>{t.name}</strong>
                            <small>
                              {appText(
                                t.status === "APPROVED"
                                  ? "Approved"
                                  : t.status === "SUSPENDED"
                                    ? "Suspended"
                                    : "Awaiting review",
                              )}
                            </small>
                          </th>
                          <td>
                            {n(t.requests)} / {n(t.approved)}
                          </td>
                          <td>{n(t.clicks)}</td>
                          <td>{n(t.visits)}</td>
                          <td>
                            <Link
                              className="insight-eye"
                              href={
                                "/dashboard/promotion-insights?teacher=" + t.id
                              }
                              aria-label={appText("View insights for {0}", [
                                t.name,
                              ])}
                              title={appText("View insights for {0}", [t.name])}
                            >
                              <Eye size={18} aria-hidden="true" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="insight-empty">
                  {appText("No teachers have requested a promotion yet.")}
                </p>
              )}
            </LayeredSummaryCard>
          )}
          <div className="insight-columns">
            <LayeredSummaryCard
              className="insight-panel"
              header={
                <>
                  <MousePointer2 size={18} aria-hidden="true" />
                  <h2>{appText("Most-clicked promotions")}</h2>
                </>
              }
              footer={
                <p>
                  {appText(
                    "Top 10 for the selected month. Visits with a promotion reference are shown separately; these are not paid conversions.",
                  )}
                </p>
              }
            >
              {data.campaigns.length ? (
                <ol className="insight-ranking">
                  {data.campaigns.map((c) => (
                    <li key={c.id}>
                      <div>
                        <strong>{appText(promotionLabels[c.placement])}</strong>
                        <small>
                          {admin
                            ? c.teacherName
                            : appText(campaignStatus[c.status] || c.status)}
                          {admin &&
                            " · " +
                              appText(campaignStatus[c.status] || c.status)}
                        </small>
                        <small>
                          {appText("Request {0}", [c.id.slice(0, 8)])}
                        </small>
                      </div>
                      <div>
                        <strong>{n(c.clicks)}</strong>
                        <span>{appText("clicks")}</span>
                        <small>
                          {appText("{0} sponsored visits", [n(c.visits)])}
                        </small>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="insight-empty">
                  {appText("Create a promotion to start comparing placements.")}
                </p>
              )}
            </LayeredSummaryCard>
            <LayeredSummaryCard
              className="insight-panel"
              header={
                <>
                  <Users size={18} aria-hidden="true" />
                  <h2>{appText("Your audience")}</h2>
                </>
              }
              footer={
                <p>
                  {appText(
                    "Account counts cover the last 90 days. A click shows interest in viewing a profile, not permission to call.",
                  )}
                </p>
              }
            >
              <dl className="insight-audience">
                <div>
                  <dt>{appText("Parent accounts that clicked")}</dt>
                  <dd>{n(data.summary.parents)}</dd>
                </div>
                <div>
                  <dt>{appText("Student accounts that clicked")}</dt>
                  <dd>{n(data.summary.students)}</dd>
                </div>
                <div>
                  <dt>{appText("Recorded sponsored clicks")}</dt>
                  <dd>{n(data.summary.clicks)}</dd>
                </div>
                <div>
                  <dt>{appText("Recorded profile visits")}</dt>
                  <dd>{n(data.summary.visits)}</dd>
                </div>
              </dl>
            </LayeredSummaryCard>
          </div>
          <LayeredSummaryCard
            className="insight-panel"
            header={<h2>{appText("Daily activity")}</h2>}
            footer={
              <p>
                {appText(
                  "Only days with recorded activity appear. Visits and clicks are separate measures; they are not added together.",
                )}
              </p>
            }
          >
            {data.daily.length ? (
              <div className="insight-table-scroll">
                <table>
                  <caption>
                    {appText("Daily profile visits and sponsored clicks · IST")}
                  </caption>
                  <thead>
                    <tr>
                      <th>{appText("Date")}</th>
                      <th>{appText("Profile visits")}</th>
                      <th>{appText("Sponsored clicks")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.daily.map((d) => (
                      <tr key={d.day}>
                        <th scope="row">{date(d.day)}</th>
                        <td>
                          <span className="insight-number">{n(d.visits)}</span>
                          <span
                            className="insight-bar"
                            aria-hidden="true"
                            style={{
                              width:
                                (d.visits /
                                  Math.max(
                                    1,
                                    ...data.daily.map((v) => v.visits),
                                  )) *
                                  120 +
                                "px",
                            }}
                          />
                        </td>
                        <td>{n(d.clicks)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="insight-empty">
                {appText(
                  "No recorded activity for this month yet. Activity appears after signed-in families visit or click.",
                )}
              </p>
            )}
          </LayeredSummaryCard>
          <LayeredSummaryCard
            className="insight-panel"
            header={
              <div>
                <h2>{appText("Families who sent an enquiry")}</h2>
                <p>
                  {appText(
                    "Explicit interest from your existing direct enquiries.",
                  )}
                </p>
              </div>
            }
            footer={
              <ReportPages
                label={appText("Interested family pages")}
                page={leadPage}
                total={data.enquiries.total}
                disabled={report.isFetching}
                onChange={(leadPage) =>
                  setPagination({ teacherId, page, leadPage })
                }
              />
            }
          >
            <div className="insight-lead-totals">
              <span>
                {appText("Interested parents: {0}", [
                  n(data.summary.interestedParents),
                ])}
              </span>
              <span>
                {appText("Interested students: {0}", [
                  n(data.summary.interestedStudents),
                ])}
              </span>
            </div>
            {data.enquiries.items.length ? (
              <ul className="insight-leads">
                {data.enquiries.items.map((e) => (
                  <li key={e.id}>
                    <div>
                      <strong>{e.name}</strong>
                      <small>
                        {appText(
                          e.audience === "GUARDIAN"
                            ? "Parent or guardian"
                            : "Student",
                        )}{" "}
                        · {appCurriculum(e.subject)}
                        {admin && " · " + e.teacherName}
                      </small>
                      <small>{date(e.createdAt)}</small>
                    </div>
                    <StatusBadge
                      icon={
                        e.status === "ACCEPTED"
                          ? CircleCheck
                          : e.status === "DECLINED"
                            ? CircleX
                            : Clock3
                      }
                      tone={
                        e.status === "ACCEPTED"
                          ? "success"
                          : e.status === "DECLINED"
                            ? "danger"
                            : "neutral"
                      }
                      label={appText(enquiryStatus[e.status] || e.status)}
                    />
                    <Link
                      className="insight-eye"
                      href={"/dashboard/enquiries?conversation=" + e.id}
                      aria-label={appText("View enquiry from {0}", [e.name])}
                      title={appText("View enquiry from {0}", [e.name])}
                    >
                      <Eye size={18} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="insight-empty">
                {appText(
                  "No enquiries to show yet. Profile viewers remain private until they send an enquiry.",
                )}
              </p>
            )}
          </LayeredSummaryCard>
        </>
      )}
    </div>
  );
}
