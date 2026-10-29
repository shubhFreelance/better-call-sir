"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, rupees, type Session, type components } from "@bcs/api-client";
import { Megaphone, Search, House, BookOpen, Clock } from "lucide-react";
import { useAppTranslation } from "./locale";
import { useHistory, HistoryPages } from "./history";
import { useDecision, Feedback } from "./tuition-workflow";
import { LayeredSummaryCard } from "../components/ui/layered-summary-card";
import {
  FilterButton,
  FilterButtonGroup,
} from "../components/ui/filter-button";
import { RefreshButton } from "../components/ui/refresh-button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Modal } from "../components/ui/modal";
import { StepProgress } from "../components/ui/step-progress";
import { StatusBadge } from "../components/ui/status-controls";
type Plan = components["schemas"]["PromotionPlan"];
type Campaign = components["schemas"]["TeacherPromotion"];
export const promotionLabels = {
  SEARCH: "Search results",
  HOME: "Homepage",
  SPACE: "Subject spaces",
} as const;
const descriptions = {
  SEARCH:
    "Be seen alongside relevant search results. Organic results keep their own order.",
  HOME: "Reach people exploring teachers on the homepage.",
  SPACE:
    "Appear for matching subjects and education levels in a learner’s spaces. Private learner details are never shared with advertisers.",
};
const statuses = {
  PENDING: "Awaiting review",
  ACTIVE: "Active",
  PAUSED: "Paused",
  EXPIRED: "Expired",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};
const actionNames = {
  APPROVE: "Approve and activate",
  REJECT: "Reject request",
  PAUSE: "Pause promotion",
  RESUME: "Resume promotion",
  CANCEL: "Cancel promotion",
};
const icons = { SEARCH: Search, HOME: House, SPACE: BookOpen };
export function PromotionsWorkspace({ session }: { session: Session }) {
  const client = useQueryClient();
  const { appText, appError, appLocale } = useAppTranslation(),
    admin = session.account.role === "ADMIN",
    allowed = admin || session.account.role === "TEACHER";
  const [status, setStatus] = useState(""),
    [selected, setSelected] = useState<Plan | null>(null),
    [confirmed, setConfirmed] = useState(false);
  const plans = useQuery({
    queryKey: ["promotion-plans", session.account.id],
    enabled: allowed,
    retry: false,
    queryFn: ({ signal }) =>
      api<components["schemas"]["PromotionPlans"]>("/promotion-plans", {
        signal,
      }),
  });
  const history = useHistory<components["schemas"]["TeacherPromotions"]>({
    queryKey: ["promotions", session.account.id, status],
    path: "/promotions?limit=10" + (status ? "&status=" + status : ""),
    enabled: allowed,
  });
  const decision = useDecision(session, async () => {
    const results = await Promise.all([plans.refetch(), history.restart()]);
    if (results.some((r) => r && "error" in r && r.error))
      throw new Error("Unable to load promotion details.");
  });
  const blocked = decision.locked || history.isFetching || plans.isFetching;
  if (!allowed)
    return (
      <p role="alert">{appText("Your role cannot perform this action.")}</p>
    );
  return (
    <div className="promotion-workspace">
      <header className="promotion-intro">
        <span className="promotion-icon">
          <Megaphone size={26} aria-hidden="true" />
        </span>
        <div>
          <h1>
            {appText(
              admin ? "Sponsored teacher placements" : "Promote your teaching",
            )}
          </h1>
          <p>
            {appText(
              admin
                ? "Review requests, confirm payments and control sponsored visibility."
                : "Choose where families discover your reviewed teaching profile.",
            )}
          </p>
        </div>
      </header>
      <div className="promotion-guidance">
        <strong>{appText("Visibility, without compromising fit")}</strong>
        <p>
          {appText(
            "Every placement is labelled Sponsored. Approval, current screening and relevant teaching coverage are always required. Hiring is never guaranteed.",
          )}
        </p>
        <p>
          {appText(
            "No online payment is collected here. Submit a request first; staff review payment separately before activation. Do not send payment without confirmed instructions.",
          )}
        </p>
      </div>
      <Feedback decision={decision} floating />
      <section aria-label={appText("Promotion packages")}>
        <div className="promotion-section-title">
          <h2>
            {appText(
              admin ? "Pricing and availability" : "Choose your placement",
            )}
          </h2>
          <RefreshButton
            label={appText("Refresh")}
            disabled={blocked}
            onClick={() => decision.reload()}
          />
        </div>
        {plans.isPending && (
          <p role="status">{appText("Loading promotion packages…")}</p>
        )}
        {plans.error && <p role="alert">{appError(plans.error.message)}</p>}
        {!plans.error && (
          <div className="promotion-plans">
            {plans.data?.items.map((plan) => {
              const Icon = icons[plan.id];
              return (
                <LayeredSummaryCard
                  key={plan.id + ":" + plan.version}
                  className={
                    "promotion-plan promotion-plan-" + plan.id.toLowerCase()
                  }
                  header={
                    <>
                      <Icon size={21} aria-hidden="true" />
                      <h3>{appText(promotionLabels[plan.id])}</h3>
                    </>
                  }
                  footer={
                    admin ? (
                      <PlanEditor
                        plan={plan}
                        session={session}
                        onSaved={async () => {
                          await plans.refetch();
                        }}
                      />
                    ) : (
                      <FilterButton
                        accent
                        disabled={blocked || !plan.enabled}
                        onClick={() => {
                          setSelected(plan);
                          setConfirmed(false);
                        }}
                      >
                        {appText(
                          plan.enabled
                            ? "Review promotion"
                            : "Currently unavailable",
                        )}
                      </FilterButton>
                    )
                  }
                >
                  <p className="promotion-price">
                    {rupees(plan.amountPaise, appLocale)}{" "}
                    <small>{appText("for {0} days", [plan.days])}</small>
                  </p>
                  <p>{appText(descriptions[plan.id])}</p>
                  <small>
                    {appText("One-time price · no automatic renewal")}
                  </small>
                </LayeredSummaryCard>
              );
            })}
          </div>
        )}
      </section>
      <section className="care-card promotion-history">
        <div className="promotion-section-title">
          <h2>{appText(admin ? "Campaign review" : "Your promotions")}</h2>
          <label>
            {appText("Status")}
            <select
              value={status}
              disabled={blocked}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">{appText("All")}</option>
              {Object.entries(statuses).map(([key, label]) => (
                <option key={key} value={key}>
                  {appText(label)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {history.isPending && (
          <p role="status">{appText("Loading promotions…")}</p>
        )}
        {history.error ? (
          <p role="alert">{appError(history.error.message)}</p>
        ) : (
          <>
            {history.data?.items.length === 0 && (
              <p>
                {appText(
                  "No promotions here yet. Choose a placement to send your first request.",
                )}
              </p>
            )}
            {history.data?.items.map((c) => (
              <CampaignCard
                key={c.id + ":" + c.version}
                campaign={c}
                session={session}
                blocked={blocked}
                onSaved={async () => {
                  await history.restart();
                }}
              />
            ))}
          </>
        )}
        <HistoryPages
          history={history}
          disabled={decision.locked}
          label={appText("Promotion history")}
        />
      </section>
      <Modal
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !decision.locked) setSelected(null);
        }}
        title={appText("Review your promotion")}
        description={appText(
          "Your price is saved when you submit. The promotion starts only after staff approval and payment review.",
        )}
      >
        {selected && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void decision.run({
                path: "/promotions",
                body: {
                  placement: selected.id,
                  planVersion: selected.version,
                  confirmed: true,
                },
                message: "Promotion request saved. Staff review is next.",
                onSaved: () => setSelected(null),
              });
            }}
          >
            <StepProgress
              steps={[
                appText("Choose placement"),
                appText("Review request"),
                appText("Staff review"),
              ]}
              currentStep={1}
              label={appText("Promotion progress")}
            />
            <div className="promotion-quote">
              <h3>{appText(promotionLabels[selected.id])}</h3>
              <strong>{rupees(selected.amountPaise, appLocale)}</strong>
              <p>{appText("for {0} days", [selected.days])}</p>
            </div>
            <p>
              {appText(
                "Promotions rotate with other eligible teachers. Pausing does not extend the end date. Cancellation does not automatically refund a recorded payment; contact support for review.",
              )}
            </p>
            <label className="check-row">
              <input
                type="checkbox"
                required
                checked={confirmed}
                disabled={decision.locked}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              {appText(
                "I understand the placement, price and promotion terms.",
              )}
            </label>
            <Feedback decision={decision} />
            <FilterButtonGroup>
              <RefreshButton
                label={appText("Refresh quote")}
                disabled={decision.busy || decision.uncertain}
                onClick={async () => {
                  await decision.reload();
                  const current = client.getQueryData<
                    components["schemas"]["PromotionPlans"]
                  >(["promotion-plans", session.account.id]);
                  if (current) {
                    setSelected(
                      current.items.find((p) => p.id === selected.id) || null,
                    );
                    setConfirmed(false);
                  }
                }}
              />
              <FilterButton
                disabled={decision.locked}
                onClick={() => setSelected(null)}
              >
                {appText("Back")}
              </FilterButton>
              <FilterButton
                type="submit"
                accent
                disabled={!confirmed || blocked || !selected.enabled}
              >
                {appText("Submit promotion request")}
              </FilterButton>
            </FilterButtonGroup>
          </form>
        )}
      </Modal>
    </div>
  );
}
function PlanEditor({
  plan,
  session,
  onSaved,
}: {
  plan: Plan;
  session: Session;
  onSaved: () => Promise<void>;
}) {
  const { appText } = useAppTranslation(),
    [amount, setAmount] = useState(String(plan.amountPaise / 100)),
    [days, setDays] = useState(String(plan.days)),
    [enabled, setEnabled] = useState(plan.enabled),
    [confirmed, setConfirmed] = useState(false),
    decision = useDecision(session, onSaved);
  return (
    <details className="promotion-pricing-editor">
      <summary>
        {appText("Edit pricing")}
        {!plan.enabled && <span>{appText("Currently unavailable")}</span>}
      </summary>
      <form
        className="promotion-edit-form"
        onSubmit={(e) => {
          e.preventDefault();
          void decision.run({
            path: "/admin/promotion-plans/" + plan.id,
            body: {
              expectedVersion: plan.version,
              amountPaise: Math.round(Number(amount) * 100),
              days: Number(days),
              enabled,
              confirmed: true,
            },
            message: "Promotion pricing saved.",
          });
        }}
      >
        <label>
          {appText("Price in INR")}
          <Input
            type="number"
            min="1"
            max="10000"
            step="0.01"
            required
            value={amount}
            disabled={decision.locked}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label>
          {appText("Duration in days")}
          <Input
            type="number"
            min="1"
            max="30"
            step="1"
            required
            value={days}
            disabled={decision.locked}
            onChange={(e) => setDays(e.target.value)}
          />
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={enabled}
            disabled={decision.locked}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          {appText("Allow this placement")}
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            required
            checked={confirmed}
            disabled={decision.locked}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          {appText(
            "Apply to new requests only; existing quotes stay unchanged.",
          )}
        </label>
        <p className="promotion-fineprint">
          {appText(
            "Disabling a placement hides active campaigns. Their end dates do not change.",
          )}
        </p>
        <FilterButtonGroup>
          <RefreshButton
            label={appText("Refresh")}
            disabled={decision.busy || decision.uncertain}
            onClick={() => decision.reload()}
          />
          <FilterButton
            type="submit"
            accent
            disabled={!confirmed || decision.locked}
          >
            {appText("Save pricing")}
          </FilterButton>
        </FilterButtonGroup>
        <Feedback decision={decision} />
      </form>
    </details>
  );
}
function CampaignCard({
  campaign: c,
  session,
  onSaved,
  blocked,
}: {
  campaign: Campaign;
  session: Session;
  onSaved: () => Promise<void>;
  blocked: boolean;
}) {
  const { appText, appLocale } = useAppTranslation(),
    admin = session.account.role === "ADMIN",
    options =
      c.status === "PENDING"
        ? admin
          ? ["APPROVE", "REJECT", "CANCEL"]
          : ["CANCEL"]
        : c.status === "ACTIVE"
          ? ["PAUSE", "CANCEL"]
          : c.status === "PAUSED"
            ? c.pausedByAdmin && !admin
              ? ["CANCEL"]
              : ["RESUME", "CANCEL"]
            : [];
  const [action, setAction] = useState(options[0] || ""),
    [reason, setReason] = useState(""),
    [reference, setReference] = useState(""),
    [paid, setPaid] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    decision = useDecision(session, onSaved);
  const locked = blocked || decision.locked,
    date = (value: string) =>
      new Intl.DateTimeFormat(appLocale, {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
      }).format(new Date(value));
  return (
    <LayeredSummaryCard
      collapsible
      className="promotion-campaign"
      header={
        <>
          <div>
            <h3>
              {admin ? c.teacherName : appText(promotionLabels[c.placement])}
            </h3>
            <small>
              {admin
                ? appText(promotionLabels[c.placement])
                : date(c.createdAt)}
            </small>
          </div>
          <StatusBadge
            icon={Clock}
            tone={
              c.status === "ACTIVE"
                ? "success"
                : c.status === "PENDING"
                  ? "accent"
                  : "neutral"
            }
            label={appText(statuses[c.status])}
          />
        </>
      }
      footer={
        <p>
          {c.endsAt
            ? appText("Ends {0}", [date(c.endsAt)])
            : appText("Not active · awaiting review")}{" "}
          · {rupees(c.amountPaise, appLocale)}
        </p>
      }
    >
      <p>{appText("Quoted duration: {0} days", [c.days])}</p>
      {c.reviewNote && (
        <p>
          <strong>{appText("Review note")}: </strong>
          {c.reviewNote}
        </p>
      )}
      {c.paymentReference && (
        <p>
          <strong>{appText("Payment reference")}: </strong>
          {c.paymentReference}
        </p>
      )}
      {options.length > 0 && (
        <form
          className="promotion-edit-form"
          onSubmit={(e) => {
            e.preventDefault();
            void decision.run({
              path: "/promotions/" + c.id + "/decision",
              body: {
                expectedVersion: c.version,
                action,
                reason,
                confirmed: true,
                ...(action === "APPROVE"
                  ? { paymentReference: reference, paymentConfirmed: paid }
                  : {}),
              },
              message: "Promotion updated.",
            });
          }}
        >
          <label>
            {appText("Action")}
            <select
              value={action}
              disabled={locked}
              onChange={(e) => {
                setAction(e.target.value);
                setConfirmed(false);
              }}
            >
              {options.map((a) => (
                <option value={a} key={a}>
                  {appText(actionNames[a as keyof typeof actionNames])}
                </option>
              ))}
            </select>
          </label>
          <label>
            {appText("Review note")}
            <Textarea
              required
              maxLength={300}
              value={reason}
              disabled={locked}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {action === "APPROVE" && (
            <>
              <label>
                {appText("Payment reference")}
                <Input
                  required
                  minLength={6}
                  maxLength={100}
                  value={reference}
                  disabled={locked}
                  onChange={(e) => setReference(e.target.value)}
                />
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  required
                  checked={paid}
                  disabled={locked}
                  onChange={(e) => setPaid(e.target.checked)}
                />
                {appText(
                  "I independently confirmed the full quoted payment. This action does not collect money.",
                )}
              </label>
            </>
          )}
          <p className="promotion-fineprint">
            {appText(
              "Promotions rotate with other eligible teachers. Pausing does not extend the end date. Cancellation does not automatically refund a recorded payment; contact support for review.",
            )}
          </p>
          <label className="check-row">
            <input
              type="checkbox"
              required
              checked={confirmed}
              disabled={locked}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            {appText("I reviewed this campaign and the selected action.")}
          </label>
          <FilterButtonGroup>
            <RefreshButton
              label={appText("Refresh")}
              disabled={decision.busy || decision.uncertain}
              onClick={() => decision.reload()}
            />
            <FilterButton
              type="submit"
              accent
              disabled={
                locked ||
                !confirmed ||
                !reason.trim() ||
                (action === "APPROVE" && (!paid || !reference.trim()))
              }
            >
              {appText("Confirm action")}
            </FilterButton>
          </FilterButtonGroup>
          <Feedback decision={decision} />
        </form>
      )}
    </LayeredSummaryCard>
  );
}
