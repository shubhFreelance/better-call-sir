"use client";
import { privacyText, privacyError } from "./privacy-copy";
import { useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import {
  api,
  type Session,
  type Dashboard,
  type components,
} from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Notice, Feedback, useDecision } from "./tuition-workflow";
type Record = components["schemas"]["PrivacyRequest"];
const status = {
  PENDING: "Awaiting review",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
};
export function PrivacyWorkspace({
  session,
  dashboard: d,
  hindi = false,
  onLanguageChange,
}: {
  session: Session;
  dashboard?: Dashboard;
  hindi?: boolean;
  onLanguageChange: (hindi: boolean) => void;
}) {
  const t = (text: string) => privacyText(hindi, text);
  const allowed = ["GUARDIAN", "TEACHER", "INDEPENDENT_STUDENT"].includes(
      session.account.role,
    ),
    guardian = session.account.role === "GUARDIAN",
    client = useQueryClient();
  const history = useQuery({
    queryKey: ["owner-privacy", session.account.id],
    queryFn: ({ signal }) =>
      api<components["schemas"]["PrivacyRequestList"]>("/privacy-requests", {
        signal,
      }),
    enabled: allowed,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [composing, setComposing] = useState(false),
    [kind, setKind] = useState("CORRECTION"),
    [scope, setScope] = useState("ACCOUNT"),
    [resource, setResource] = useState(session.account.id),
    [reason, setReason] = useState(""),
    [correction, setCorrection] = useState(""),
    [review, setReview] = useState(false),
    [agreed, setAgreed] = useState(false);
  const notes = useQuery({
      queryKey: ["privacy-owned-notes", session.account.id],
      queryFn: ({ signal }) =>
        api<components["schemas"]["NoteRecords"]>("/notes", { signal }),
      enabled: guardian && composing && scope === "NOTE",
      retry: false,
      refetchOnWindowFocus: false,
    }),
    sending = useRef(false);
  async function refresh() {
    const [records, next] = await Promise.all([
      history.refetch(),
      session.account.role === "INDEPENDENT_STUDENT"
        ? Promise.resolve(null)
        : api<Dashboard>("/dashboard"),
    ]);
    if (records.error) throw records.error;
    if (next) client.setQueryData(["dashboard", session.account.id], next);
    await client.invalidateQueries({ queryKey: ["independent-profile"] });
    await client.invalidateQueries({ queryKey: ["independent-signup"] });
  }
  const decision = useDecision(session, refresh),
    duplicate = history.data?.items.some(
      (r) =>
        r.status === "PENDING" &&
        r.kind === kind &&
        r.scope === scope &&
        r.resourceId === resource,
    ),
    limit = scope === "NOTE" ? 5000 : 80;
  const target =
    scope === "ACCOUNT"
      ? t("Your account")
      : scope === "CHILD"
        ? d?.children?.find((c) => c.id === resource)?.alias || t("Learner")
        : notes.data?.items.find((n) => n.id === resource)?.learner.alias ||
          t("Learning note");
  function body() {
    if (
      !resource ||
      !reason.trim() ||
      reason.trim().length > 1000 ||
      (kind === "CORRECTION" &&
        (!correction.trim() || correction.trim().length > limit)) ||
      history.error ||
      duplicate ||
      (scope === "NOTE" && notes.error)
    ) {
      decision.invalid(
        duplicate
          ? "A matching request is already awaiting review. Follow its status below."
          : "Choose an owned record, add a reason and supply the proposed correction within the stated limit. Refresh unavailable records before sending.",
      );
      return null;
    }
    return {
      kind,
      scope,
      resourceId: resource,
      reason: reason.trim(),
      ...(kind === "CORRECTION" ? { correction: correction.trim() } : {}),
    };
  }
  async function save() {
    if (decision.locked || sending.current) return;
    const payload = body();
    if (!payload || !agreed) {
      if (payload)
        decision.invalid("Review and acknowledge this request before sending.");
      return;
    }
    sending.current = true;
    try {
      await decision.run({
        path: "/privacy-requests",
        body: payload,
        message:
          "Your privacy request is recorded for review. This does not confirm completion.",
        onSaved: () => {
          setComposing(false);
          setReview(false);
          setReason("");
          setCorrection("");
          setAgreed(false);
        },
      });
    } finally {
      sending.current = false;
    }
  }
  if (!allowed)
    return (
      <div className="privacy-workspace" lang={hindi ? "hi" : "en"}>
        <Notice>
          {t(
            "Privacy requests are available to guardians, teachers and independent adult students for records they own. Guardian-linked students can ask their guardian for help.",
          )}{" "}
          <Link href="/support">{t("Help & safety")}</Link>.
        </Notice>
      </div>
    );
  const pause = history.data?.items.some(
    (r) =>
      r.kind === "DELETION" && r.status === "PENDING" && r.scope !== "NOTE",
  );
  return (
    <div
      className="care-workspace privacy-workspace"
      lang={hindi ? "hi" : "en"}
    >
      <div className="independent-language">
        <label htmlFor="privacy-language">Language / भाषा</label>
        <select
          id="privacy-language"
          value={hindi ? "hi" : "en"}
          onChange={(e) => onLanguageChange(e.target.value === "hi")}
        >
          <option value="en">English</option>
          <option value="hi">हिन्दी</option>
        </select>
      </div>
      <section className="care-intro">
        <ShieldCheck size={28} aria-hidden="true" />
        <h2>{t("Your information, with a clear record.")}</h2>
        <p>
          {t(
            "Request a correction or reviewed deletion and follow the outcome. Requests are private; financial, learning, safety and audit evidence may require approved retention.",
          )}
        </p>
      </section>
      <Feedback
        decision={{ ...decision, error: privacyError(hindi, decision.error) }}
        translate={t}
      />
      {decision.conflict && (
        <Button
          variant="outline"
          disabled={decision.busy}
          onClick={() => decision.reload()}
        >
          {t("Refresh privacy records")}
        </Button>
      )}
      {guardian && (pause || d?.consent?.withdrawnAt) && (
        <Notice>
          {t(
            "Family processing is paused or guardian consent is withdrawn. Learner/account deletion requests withdraw family consent, revoke student sessions and remove teacher access to shared notes. Completion or rejection does not automatically restore consent or access.",
          )}
        </Notice>
      )}
      {session.account.role === "INDEPENDENT_STUDENT" && pause && (
        <Notice>
          {t(
            "Profile changes are paused while your account deletion request is reviewed.",
          )}
        </Notice>
      )}
      {session.account.role === "TEACHER" &&
        (pause || d?.profile?.status === "SUSPENDED") && (
          <Notice>
            {t(
              "Your teacher profile is suspended. Account deletion requests immediately pause discovery; a rejected request does not automatically restore approval.",
            )}
          </Notice>
        )}
      <div className="care-actions">
        <Button
          disabled={
            decision.locked || composing || history.isPending || !!history.error
          }
          onClick={() => {
            setComposing(true);
            setReview(false);
            setAgreed(false);
            decision.invalid("");
          }}
        >
          {t("Create privacy request")}
        </Button>
        <Button
          variant="outline"
          disabled={decision.locked || composing}
          onClick={() => decision.reload()}
        >
          {t("Refresh request history")}
        </Button>
      </div>
      {history.isPending && (
        <p role="status">{t("Loading privacy requests…")}</p>
      )}
      {history.error && (
        <Notice error>
          {t("Privacy history could not be loaded.")}{" "}
          <Button
            variant="outline"
            disabled={decision.uncertain}
            onClick={() => history.refetch()}
          >
            {t("Retry privacy history")}
          </Button>
        </Notice>
      )}
      {composing && (
        <section className="care-card care-editor">
          <h3>
            {review
              ? t("Review your privacy request")
              : t("Choose the record and requested change")}
          </h3>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (review) {
                void save();
                return;
              }
              if (body()) {
                setReview(true);
                setAgreed(false);
              }
            }}
          >
            <fieldset disabled={decision.locked}>
              {!review ? (
                <>
                  <div className="care-fields">
                    <div>
                      <label htmlFor="privacy-kind">{t("Request type")}</label>
                      <select
                        id="privacy-kind"
                        value={kind}
                        onChange={(e) => setKind(e.target.value)}
                      >
                        <option value="CORRECTION">{t("Correction")}</option>
                        <option value="DELETION">{t("Deletion")}</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="privacy-scope">{t("Record type")}</label>
                      <select
                        id="privacy-scope"
                        value={scope}
                        onChange={(e) => {
                          setScope(e.target.value);
                          setResource(
                            e.target.value === "ACCOUNT"
                              ? session.account.id
                              : "",
                          );
                          setCorrection("");
                        }}
                      >
                        <option value="ACCOUNT">{t("My account")}</option>
                        {guardian && (
                          <>
                            <option value="CHILD">{t("Learner")}</option>
                            <option value="NOTE">
                              {t("Private learning note")}
                            </option>
                          </>
                        )}
                      </select>
                    </div>
                  </div>
                  {scope === "ACCOUNT" ? (
                    <p>
                      {t("Account:")} {session.account.name}
                      {t(
                        ". Correction changes the display name; this form does not change email, login or role.",
                      )}
                    </p>
                  ) : (
                    <>
                      <label htmlFor="privacy-resource">
                        {scope === "CHILD"
                          ? t("Owned learner")
                          : t("Owned learning note")}
                      </label>
                      <select
                        id="privacy-resource"
                        value={resource}
                        onChange={(e) => setResource(e.target.value)}
                      >
                        <option value="">{t("Choose a record")}</option>
                        {scope === "CHILD"
                          ? d?.children?.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.alias}
                              </option>
                            ))
                          : notes.data?.items.map((n) => (
                              <option key={n.id} value={n.id}>
                                {n.learner.alias} {t("— Note")}{" "}
                                {n.id.slice(0, 8)}
                              </option>
                            ))}
                      </select>
                      {notes.isFetching && scope === "NOTE" && (
                        <p role="status">{t("Loading owned notes…")}</p>
                      )}
                      {notes.error && scope === "NOTE" && (
                        <Notice error>
                          {t("Owned notes could not be loaded.")}{" "}
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => notes.refetch()}
                          >
                            {t("Retry owned notes")}
                          </Button>
                        </Notice>
                      )}
                    </>
                  )}
                  <label htmlFor="privacy-reason">
                    {t("Reason for request")}
                  </label>
                  <Textarea
                    id="privacy-reason"
                    value={reason}
                    rows={3}
                    maxLength={1000}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  {kind === "CORRECTION" && (
                    <>
                      <label htmlFor="privacy-correction">
                        {t("Proposed")}{" "}
                        {scope === "NOTE"
                          ? t("note text")
                          : t("display name or learner alias")}
                      </label>
                      <Textarea
                        id="privacy-correction"
                        rows={scope === "NOTE" ? 5 : 2}
                        maxLength={limit}
                        value={correction}
                        onChange={(e) => setCorrection(e.target.value)}
                      />
                      <small>
                        {correction.length}/{limit}{" "}
                        {t(
                          "characters. Approved note corrections become private and clear acknowledgement.",
                        )}
                      </small>
                    </>
                  )}
                </>
              ) : (
                <div className="care-review">
                  <h4>
                    {kind === "DELETION"
                      ? t("Reviewed deletion")
                      : t("Correction")}{" "}
                    · {target}
                  </h4>
                  <p>{reason}</p>
                  {kind === "CORRECTION" ? (
                    <>
                      <p>{correction}</p>
                      <p>
                        {t(
                          "The change is applied only after authorized review. Corrected notes become private.",
                        )}
                      </p>
                    </>
                  ) : (
                    <>
                      <p>
                        {session.account.role === "INDEPENDENT_STUDENT"
                          ? t(
                              "This request immediately pauses education changes, withdraws open enquiries, closes arrangements and removes optional supporter access. Account deletion and session revocation happen only after authorized review.",
                            )
                          : scope === "NOTE"
                            ? t("This note stops being shared immediately.")
                            : t(
                                "This request immediately pauses processing: family consent is withdrawn, student sessions are revoked and shared note access is removed. Teacher account requests also suspend discovery.",
                              )}
                      </p>
                      <p>
                        {t(
                          "Deletion requires review. Financial, learning, safeguarding and audit records may be retained under approved policy. Backups and private files require separate deletion processing; this request does not promise instant or complete erasure.",
                        )}
                      </p>
                    </>
                  )}
                  <label className="care-check">
                    <input
                      type="checkbox"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                    />
                    <span>
                      {t(
                        "I reviewed the record, requested change and immediate effects, and want to send this request.",
                      )}
                    </span>
                  </label>
                </div>
              )}
              <div className="care-actions">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() =>
                    review
                      ? setReview(false)
                      : (setComposing(false), setReason(""), setCorrection(""))
                  }
                >
                  {review ? t("Back to editing") : t("Cancel request")}
                </Button>
                <Button type="submit">
                  {review
                    ? t("Send privacy request")
                    : t("Review privacy request")}
                </Button>
              </div>
            </fieldset>
          </form>
        </section>
      )}
      <section className="care-card">
        <h3>{t("Your request history")}</h3>
        <p>
          {t(
            "Latest 50 requests. A pending request is not a completed correction or deletion.",
          )}
        </p>
        {!history.isPending &&
          !history.error &&
          !history.data?.items.length && <p>{t("No privacy requests yet.")}</p>}
        {history.data?.items.map((r) => (
          <article className="privacy-record" key={r.id}>
            <span className="care-status">{t(status[r.status])}</span>
            <h4>
              {r.kind === "DELETION" ? t("Deletion") : t("Correction")} ·{" "}
              {r.scope === "ACCOUNT"
                ? t("Account")
                : r.scope === "CHILD"
                  ? t("Learner")
                  : t("Learning note")}
            </h4>
            <p>{r.reason}</p>
            {r.correction && (
              <p>
                {t("Proposed correction:")} {r.correction}
              </p>
            )}
            {r.resolution && (
              <p>
                {t("Review outcome:")} {r.resolution}
              </p>
            )}
            {r.policyVersion && (
              <small>
                {t("Policy:")} {r.policyVersion}
              </small>
            )}
            <p>
              <small>
                {t("Request")} {r.id.slice(0, 8)} ·{" "}
                {new Date(r.createdAt).toLocaleString(
                  hindi ? "hi-IN" : "en-IN",
                  {
                    timeZone: "Asia/Kolkata",
                  },
                )}{" "}
                IST
              </small>
            </p>
          </article>
        ))}
      </section>
      <Notice>
        {t("For urgent concerns use")}{" "}
        <Link href="/support">{t("Help & safety")}</Link>
        {t(
          ". This development service has no live privacy operator or notification delivery. Retention rules and off-site backup deletion remain subject to live qualification.",
        )}
      </Notice>
    </div>
  );
}
