"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, type Session, type components } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Notice, Feedback, useDecision } from "./tuition-workflow";
import { useAppTranslation } from "./locale";
type Mode = components["schemas"]["LearningManagement"]["mode"];
export const learningModes: Record<Mode, { title: string; help: string }> = {
  GUARDIAN_ONLY: {
    title: "Guardian manages learning",
    help: "Your guardian sends enquiries, chooses teachers and manages tuition decisions. You can follow your own progress.",
  },
  SHARED: {
    title: "We manage learning together",
    help: "Both of you can send enquiries, choose teachers and manage tuition decisions. Your guardian can change this permission.",
  },
  STUDENT_LED: {
    title: "Student leads; guardian stays involved",
    help: "You take the lead in choosing teachers. Your guardian can follow progress, step in and change this permission.",
  },
};
export function LearningManagementWorkspace({ session }: { session: Session }) {
  const { appText } = useAppTranslation(),
    params = useSearchParams(),
    heading = useRef<HTMLHeadingElement>(null);
  const [cursors, setCursors] = useState<string[]>([]),
    [chosen, setChosen] = useState(params.get("learner") || ""),
    [mode, setMode] = useState<Mode | null>(null),
    [review, setReview] = useState(false),
    [ack, setAck] = useState(false);
  const profiles = useQuery({
    queryKey: ["management-profiles", session.account.id, cursors.at(-1) || ""],
    queryFn: ({ signal }) =>
      api<components["schemas"]["LearnerProfiles"]>(
        "/learner-profiles?limit=20" +
          (cursors.at(-1) ? "&cursor=" + cursors.at(-1) : ""),
        { signal },
      ),
    retry: false,
  });
  const selected =
    profiles.data?.items.find((p) => p.id === chosen) ||
    (!chosen ? profiles.data?.items[0] : undefined);
  const state = useQuery({
    queryKey: ["learning-management", session.account.id, selected?.id],
    queryFn: ({ signal }) =>
      api<components["schemas"]["LearningManagement"]>(
        `/children/${selected!.id}/learning-management`,
        { signal },
      ),
    enabled: !!selected && !profiles.error,
    retry: false,
    refetchOnWindowFocus: false,
  });
  async function refresh() {
    const r = await state.refetch();
    if (r.error) throw r.error;
    setReview(false);
    setAck(false);
  }
  const decision = useDecision(
    session,
    refresh,
    (r) =>
      !!r &&
      typeof r === "object" &&
      "childId" in r &&
      r.childId === selected?.id,
  );
  const locked = !!mode || decision.locked,
    visible = !profiles.error && !state.error ? state.data : undefined;
  const editing = !!mode;
  useEffect(() => {
    if (editing) heading.current?.focus();
  }, [editing]);
  return (
    <section className="care-workspace learning-management-workspace">
      <header>
        <p className="eyebrow">{appText("LEARNING TOGETHER")}</p>
        <h1>{appText("Who manages learning?")}</h1>
        <p>
          {appText(
            "A clear choice for your family. Learning decisions stay separate from consent, account access and financial commitments.",
          )}
        </p>
      </header>
      {profiles.isPending && (
        <p role="status">{appText("Loading learner profiles…")}</p>
      )}
      {profiles.error && (
        <Notice error>
          {appText(
            "Your learner profiles could not be loaded. Private details are hidden.",
          )}{" "}
          <Button
            variant="outline"
            disabled={decision.busy}
            onClick={() => profiles.refetch()}
          >
            {appText("Retry learner profiles")}
          </Button>
        </Notice>
      )}
      {!profiles.error && profiles.data && (
        <>
          {profiles.data.items.length > 0 ? (
            <label className="field">
              {appText("Choose a learner")}
              <select
                value={selected?.id || chosen}
                disabled={locked || state.isFetching}
                onChange={(e) => {
                  setChosen(e.target.value);
                  setAck(false);
                }}
              >
                {profiles.data.items.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.alias}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <Notice>
              {appText("No learner profiles are available yet.")}{" "}
              <Link className="inline-link" href="/dashboard/learners">
                {appText("Review learner profiles")}
              </Link>
            </Notice>
          )}
          {(cursors.length > 0 || !!profiles.data.nextCursor) && (
            <nav
              aria-label={appText("Learner history pages")}
              className="care-actions"
            >
              <Button
                variant="outline"
                disabled={locked || !cursors.length || profiles.isFetching}
                onClick={() => {
                  setChosen("");
                  setCursors((c) => c.slice(0, -1));
                }}
              >
                {appText("Previous")}
              </Button>
              <Button
                variant="outline"
                disabled={
                  locked || !profiles.data.nextCursor || profiles.isFetching
                }
                onClick={() => {
                  setChosen("");
                  setCursors((c) => [...c, profiles.data!.nextCursor!]);
                }}
              >
                {appText("Next")}
              </Button>
            </nav>
          )}
          {chosen && !selected && (
            <Notice>
              {appText(
                "This learner is unavailable on the current page. Choose an available learner or reload the first page.",
              )}{" "}
              <Button
                variant="outline"
                disabled={locked}
                onClick={() => {
                  setChosen("");
                  setCursors([]);
                }}
              >
                {appText("Return to first page")}
              </Button>
            </Notice>
          )}
        </>
      )}
      {selected && state.isPending && (
        <p role="status">{appText("Loading learning permissions…")}</p>
      )}
      {selected && state.error && (
        <Notice error>
          {appText(
            "Current learning permissions could not be loaded. Private details are hidden.",
          )}{" "}
          <Button
            variant="outline"
            disabled={decision.busy || decision.uncertain}
            onClick={() =>
              decision.conflict ? decision.reload() : state.refetch()
            }
          >
            {appText("Reload learning permissions")}
          </Button>
        </Notice>
      )}
      {visible && selected && (
        <article className="care-card">
          <p className="eyebrow">{appText("CURRENT FAMILY CHOICE")}</p>
          <h2>{selected.alias}</h2>
          <div className="management-current">
            <h3>{appText(learningModes[visible.mode].title)}</h3>
            <p>{appText(learningModes[visible.mode].help)}</p>
          </div>
          <Notice>
            {appText(
              "Under 15, guardian guidance can help with learning decisions. Age or class alone does not grant adult account rights. Guardian authorization and learning-data consent remain separate.",
            )}
          </Notice>
          <p>
            {appText(
              "Only the guardian can change this permission, manage consent or confirm a financial commitment. A student can still ask their guardian to decide for one enquiry.",
            )}
          </p>
          {visible.canChangeManagement && !mode && (
            <Button
              disabled={decision.locked || state.isFetching}
              onClick={() => {
                setMode(visible.mode);
                setReview(false);
                setAck(false);
              }}
            >
              {appText("Review management choice")}
            </Button>
          )}
          {mode && (
            <form
              className="care-editor"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!review) {
                  setReview(true);
                  setAck(false);
                  return;
                }
                if (!ack) return;
                await decision.run({
                  path: `/children/${selected.id}/learning-management`,
                  body: {
                    mode,
                    expectedVersion: visible.version,
                    confirmed: true,
                  },
                  message:
                    "Learning management saved. The student will see this choice.",
                  onSaved: () => {
                    setMode(null);
                    setReview(false);
                    setAck(false);
                  },
                });
              }}
            >
              <h3 ref={heading} tabIndex={-1}>
                {appText(
                  review
                    ? "Review the permission change"
                    : "Choose how you manage learning",
                )}
              </h3>
              <fieldset disabled={decision.locked || state.isFetching}>
                <legend>{appText("Learning management")}</legend>
                {(
                  Object.entries(learningModes) as [
                    Mode,
                    { title: string; help: string },
                  ][]
                ).map(([key, item]) => (
                  <label key={key} className="management-option">
                    <input
                      type="radio"
                      name="learning-management"
                      checked={mode === key}
                      disabled={review}
                      onChange={() => setMode(key)}
                    />
                    <span>
                      <strong>{appText(item.title)}</strong>
                      <small>{appText(item.help)}</small>
                    </span>
                  </label>
                ))}
                {review && (
                  <>
                    <Notice>
                      {appText(
                        "This changes who can make new learning decisions. Existing teacher choices and records remain. Guardian-only mode also blocks saved student retries; it does not cancel an arrangement or change consent.",
                      )}
                    </Notice>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={ack}
                        onChange={(e) => setAck(e.target.checked)}
                      />
                      {appText(
                        "I reviewed this permission and how it affects the student's learning decisions.",
                      )}
                    </label>
                  </>
                )}
                <div className="care-actions">
                  <Button type="submit" disabled={review && !ack}>
                    {appText(
                      review
                        ? "Confirm management choice"
                        : "Review this choice",
                    )}
                  </Button>
                  {review && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setReview(false);
                        setAck(false);
                      }}
                    >
                      {appText("Back to editing")}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setMode(null);
                      setReview(false);
                    }}
                  >
                    {appText("Discard changes")}
                  </Button>
                </div>
              </fieldset>
            </form>
          )}
          {session.account.role === "STUDENT" && (
            <Link href="/dashboard/learning-choices" className="button">
              {appText("Open my teacher choices")}
            </Link>
          )}
        </article>
      )}
      <Feedback decision={decision} />
      {decision.uncertain && (
        <Button disabled={decision.busy} onClick={() => decision.run()}>
          {appText("Retry the same decision")}
        </Button>
      )}
      {decision.conflict && (
        <Button disabled={decision.busy} onClick={() => decision.reload()}>
          {appText("Reload learning permissions")}
        </Button>
      )}
    </section>
  );
}
