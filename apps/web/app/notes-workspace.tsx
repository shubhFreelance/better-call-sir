"use client";
import { educationLabel } from "./learner-education";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  LockKeyhole,
  NotebookPen,
  ShieldCheck,
  UserRound,
  Check,
} from "lucide-react";
import {
  api,
  type components,
  type Dashboard,
  type Session,
} from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Feedback, Notice, useDecision } from "./tuition-workflow";
type Note = components["schemas"]["NoteRecord"];
const date = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
export function NotesWorkspace({
  session,
  dashboard: d,
}: {
  session: Session;
  dashboard: Dashboard;
}) {
  const allowed = ["GUARDIAN", "TEACHER"].includes(session.account.role),
    guardian = session.account.role === "GUARDIAN";
  const query = useQuery({
    queryKey: ["notes", session.account.id],
    queryFn: ({ signal }) =>
      api<components["schemas"]["NoteRecords"]>("/notes", { signal }),
    enabled: allowed,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const decision = useDecision(session, async () => {
    const result = await query.refetch();
    if (result.error) throw result.error;
  });
  const [mode, setMode] = useState<
      "create" | "edit" | "share" | "withdraw" | "ack" | null
    >(null),
    [selected, setSelected] = useState<string | null>(null),
    [childId, setChildId] = useState(d.children?.[0]?.id || ""),
    [text, setText] = useState(""),
    [recipient, setRecipient] = useState(""),
    [reviewing, setReviewing] = useState(false),
    [agreed, setAgreed] = useState(false);
  const pending = useRef(false),
    editor = useRef<HTMLDivElement>(null),
    note = query.data?.items.find((n) => n.id === selected);
  const permitted =
      guardian &&
      session.account.verified &&
      !!d.consent &&
      !d.consent.withdrawnAt,
    blocked = decision.locked || !!query.error;
  const launchBlocked = blocked || mode !== null || query.isPending;
  const canCreate = permitted && (d.children?.length || 0) > 0;
  const teachers = Array.from(
    new Map(
      (d.placements || [])
        .filter((p) => p.status === "ACTIVE" && p.childId === note?.childId)
        .flatMap((p) => {
          const teacher = d.teachers?.find((t) => t.id === p.teacherId);
          return teacher ? [[teacher.id, teacher] as const] : [];
        }),
    ).values(),
  );
  useEffect(() => {
    if (mode) {
      editor.current?.focus();
      editor.current?.scrollIntoView({ block: "nearest" });
    }
  }, [mode]);
  function open(next: typeof mode, current?: Note) {
    if (launchBlocked) return;
    setMode(next);
    setSelected(current?.id || null);
    setText(next === "edit" ? current?.text || "" : "");
    setRecipient("");
    setReviewing(false);
    setAgreed(false);
    decision.invalid("");
  }
  function close() {
    setMode(null);
    setReviewing(false);
    setAgreed(false);
  }
  async function save() {
    if (pending.current || blocked || !mode) return;
    if (!agreed) {
      decision.invalid("Review this decision and confirm before saving.");
      return;
    }
    if (
      (mode === "create" || mode === "edit") &&
      (!text.trim() || text.trim().length > 5000)
    ) {
      decision.invalid("Write a note of up to 5,000 characters.");
      return;
    }
    if (mode === "create" && !d.children?.some((c) => c.id === childId)) {
      decision.invalid("Choose one of your learners.");
      return;
    }
    if (mode !== "create" && !note) {
      decision.invalid("This note is no longer available. Refresh the notes.");
      return;
    }
    if (mode === "share" && !teachers.some((t) => t.id === recipient)) {
      decision.invalid("Choose a named active teacher for this learner.");
      return;
    }
    const path =
      mode === "create"
        ? "/notes"
        : `/notes/${note!.id}/${mode === "edit" ? "updates" : mode === "ack" ? "acknowledgements" : "shares"}`;
    const body =
      mode === "create"
        ? { childId, text: text.trim() }
        : mode === "edit"
          ? { expectedVersion: note!.version, text: text.trim() }
          : mode === "ack"
            ? { expectedVersion: note!.version }
            : {
                expectedVersion: note!.version,
                teacherId: mode === "share" ? recipient : null,
              };
    pending.current = true;
    try {
      await decision.run({
        path,
        body,
        message:
          mode === "create" || mode === "edit"
            ? "Note saved privately."
            : mode === "share"
              ? "Sharing saved for the named teacher."
              : mode === "withdraw"
                ? "Teacher access withdrawn."
                : "Your acknowledgement is recorded.",
        onSaved: () => {
          close();
          setText("");
        },
      });
    } finally {
      pending.current = false;
    }
  }
  if (!allowed)
    return (
      <Notice>
        Private notes are available to guardians and the teacher they choose to
        share with.
      </Notice>
    );
  const writing = mode === "create" || mode === "edit";
  return (
    <div className="notes-workspace">
      <section className="notes-intro">
        <div>
          <NotebookPen size={30} aria-hidden="true" />
          <h2>
            {guardian
              ? "Small details. Thoughtful support."
              : "A little context for your next lesson."}
          </h2>
          <p>
            {guardian
              ? "Keep learning preferences in one private place. You choose what to share and which teacher can read it."
              : "Read only the notes a guardian has chosen to share with you. Acknowledge them once you’ve reviewed the current version."}
          </p>
        </div>
        <aside>
          <LockKeyhole size={24} aria-hidden="true" />
          <strong>
            {guardian ? "Private comes first" : "Shared by invitation"}
          </strong>
          <p>
            {guardian
              ? "Every new or edited note stays private until you name an active teacher."
              : "Access depends on an active placement and guardian consent."}
          </p>
        </aside>
      </section>
      {!guardian && (
        <Notice>
          Use these notes only to support the learner’s teaching. Avoid copying
          them into personal messages or documents.
        </Notice>
      )}
      {guardian && !permitted && (
        <Notice>
          Verified guardian access and active consent are required to create,
          edit or share notes.{" "}
          <Link href="/dashboard/family">Review learner access</Link>.
        </Notice>
      )}
      {guardian && permitted && !d.children?.length && (
        <Notice>
          Add a learner before writing a private learning note.{" "}
          <Link href="/onboarding/parent">Complete learner onboarding</Link>.
        </Notice>
      )}
      <div className="notes-toolbar">
        <div>
          <h3>{guardian ? "Your learning notes" : "Notes shared with you"}</h3>
          <p>Up to 50 most recent notes, with current sharing status.</p>
        </div>
        <div>
          <Button
            variant="outline"
            disabled={decision.locked || query.isFetching || mode !== null}
            onClick={() => query.refetch()}
          >
            Refresh notes
          </Button>
          {guardian && (
            <Button
              disabled={!canCreate || launchBlocked}
              onClick={() => open("create")}
            >
              Write a private note
            </Button>
          )}
        </div>
      </div>
      <Feedback decision={decision} />
      {decision.conflict && (
        <Button
          variant="outline"
          disabled={decision.busy}
          onClick={() => decision.reload()}
        >
          Refresh current note
        </Button>
      )}
      {query.isPending && <p role="status">Loading your notes…</p>}
      {query.error && (
        <Notice error>
          Notes could not be loaded. Your edits stay here.{" "}
          <Button variant="outline" onClick={() => query.refetch()}>
            Retry notes
          </Button>
        </Notice>
      )}
      {mode && (
        <div className="notes-editor" ref={editor} tabIndex={-1}>
          <header>
            <span className="notes-step">
              {writing
                ? reviewing
                  ? "Review before saving"
                  : "Learning context"
                : "Review access"}
            </span>
            <h3>
              {mode === "create"
                ? "Write a private note"
                : mode === "edit"
                  ? "Edit your note"
                  : mode === "share"
                    ? "Choose who can read this note"
                    : mode === "withdraw"
                      ? "Withdraw teacher access"
                      : "Acknowledge the shared note"}
            </h3>
          </header>
          {mode !== "create" && !note && (
            <Notice error>
              The note is no longer in your current notes. Cancel this decision
              and refresh.
            </Notice>
          )}
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (writing && !reviewing) {
                if (!text.trim() || text.trim().length > 5000) {
                  decision.invalid("Write a note of up to 5,000 characters.");
                  return;
                }
                if (
                  mode === "create" &&
                  !d.children?.some((c) => c.id === childId)
                ) {
                  decision.invalid("Choose one of your learners.");
                  return;
                }
                setReviewing(true);
                setAgreed(false);
                return;
              }
              void save();
            }}
          >
            <fieldset disabled={blocked}>
              {writing && !reviewing ? (
                <>
                  <div className="notes-field">
                    {mode === "create" ? (
                      <label htmlFor="note-learner">Learner</label>
                    ) : (
                      <span>Learner</span>
                    )}
                    {mode === "create" ? (
                      <select
                        id="note-learner"
                        value={childId}
                        onChange={(e) => setChildId(e.target.value)}
                      >
                        <option value="">Choose a learner</option>
                        {d.children?.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.alias} · {educationLabel(c)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="notes-learner">
                        {note?.learner.alias}
                      </span>
                    )}
                  </div>
                  <div className="notes-field">
                    <label htmlFor="learning-note">Learning note</label>
                    <Textarea
                      id="learning-note"
                      value={text}
                      maxLength={5000}
                      rows={6}
                      onChange={(e) => setText(e.target.value)}
                      aria-describedby="note-help"
                    />
                  </div>
                  <small id="note-help">
                    {text.length}/5,000 characters. Include practical learning
                    preferences; leave out passwords, contact details and
                    unnecessary sensitive information.
                  </small>
                  {mode === "edit" && note?.sharedTeacherId && (
                    <Notice>
                      Saving edits withdraws the existing teacher’s access and
                      clears their acknowledgement. Review sharing again after
                      saving.
                    </Notice>
                  )}
                </>
              ) : (
                <div className="notes-review">
                  <div className="notes-review-title">
                    <ShieldCheck size={22} aria-hidden="true" />
                    <strong>
                      {writing
                        ? "Saved privately"
                        : mode === "share"
                          ? "Only the teacher you select"
                          : mode === "withdraw"
                            ? "Future access will stop"
                            : "Confirm you reviewed this version"}
                    </strong>
                  </div>
                  <p className="notes-preview">{writing ? text : note?.text}</p>
                  {mode === "share" && (
                    <label>
                      Teacher to share with
                      <select
                        value={recipient}
                        onChange={(e) => setRecipient(e.target.value)}
                      >
                        <option value="">Choose a named teacher</option>
                        {teachers.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {mode === "share" &&
                    (!teachers.length ? (
                      <p>
                        No named active teacher is available for this learner.
                        Keep the note private and review your tuition agreement.
                      </p>
                    ) : (
                      <p>
                        The selected teacher can read the entire note and
                        acknowledge it. Other teachers and students cannot
                        access it.
                      </p>
                    ))}
                  {mode === "withdraw" && (
                    <p>
                      Access for{" "}
                      {note?.sharedTeacher?.name ||
                        "the previously named teacher"}{" "}
                      will stop. This cannot recall information they already
                      read.
                    </p>
                  )}
                  {mode === "edit" && (
                    <p>
                      The edited note will be private. Its previous sharing and
                      acknowledgement will be cleared.
                    </p>
                  )}
                  <label className="notes-check">
                    <input
                      type="checkbox"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                    />
                    <span>
                      {writing
                        ? "I reviewed this note and want to save it privately."
                        : mode === "share"
                          ? "I reviewed the full note and want to share it with this named teacher."
                          : mode === "withdraw"
                            ? "I want to withdraw this teacher’s access to the note."
                            : "I have read this shared note and understand its learning context."}
                    </span>
                  </label>
                </div>
              )}
              <div className="notes-actions">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    writing && reviewing ? setReviewing(false) : close()
                  }
                >
                  {writing && reviewing ? "Back to editing" : "Cancel"}
                </Button>
                <Button
                  type="submit"
                  disabled={
                    (mode !== "create" && !note) ||
                    (mode === "share" && !teachers.length)
                  }
                >
                  {writing
                    ? reviewing
                      ? "Save note privately"
                      : "Review private note"
                    : mode === "share"
                      ? "Confirm sharing"
                      : mode === "withdraw"
                        ? "Withdraw access"
                        : "Confirm acknowledgement"}
                </Button>
              </div>
            </fieldset>
          </form>
        </div>
      )}
      {!query.isPending && !query.error && !query.data?.items.length && (
        <div className="notes-empty">
          <LockKeyhole size={30} aria-hidden="true" />
          <h3>
            {guardian
              ? "A private place to start."
              : "No notes shared with you yet."}
          </h3>
          <p>
            {guardian
              ? "Write a short note about what helps your learner. Sharing is always a separate decision."
              : "Guardians choose which learning notes to share. No private notes appear here."}
          </p>
        </div>
      )}
      <div className="notes-list">
        {query.data?.items.map((n) => (
          <article className="notes-card" key={n.id}>
            <header>
              <div className="notes-owner">
                <UserRound size={19} aria-hidden="true" />
                <h3>{n.learner.alias}</h3>
                <span>
                  Class {n.learner.grade} · {n.learner.board}
                </span>
              </div>
              <span
                className={`notes-state ${n.sharingActive ? "shared" : "private"}`}
              >
                {!n.sharedTeacherId
                  ? "Private · only you"
                  : n.sharingActive
                    ? `Shared with ${n.sharedTeacher?.name || "your named teacher"}`
                    : "Sharing paused"}
              </span>
            </header>
            <p className="notes-text">{n.text}</p>
            <footer>
              <small>Created {date(n.createdAt)}</small>
              {n.acknowledgedAt && n.sharingActive ? (
                <span className="notes-ack">
                  <Check size={16} aria-hidden="true" />
                  Acknowledged {date(n.acknowledgedAt)}
                </span>
              ) : n.sharingActive ? (
                <span className="notes-awaiting">
                  Awaiting teacher acknowledgement
                </span>
              ) : null}
            </footer>
            {(guardian || !n.acknowledgedAt) && (
              <div className="notes-actions">
                {guardian ? (
                  <>
                    <Button
                      variant="outline"
                      disabled={launchBlocked || !permitted}
                      onClick={() => open("edit", n)}
                    >
                      Edit note
                    </Button>
                    <Button
                      variant={n.sharedTeacherId ? "outline" : "default"}
                      disabled={launchBlocked || !permitted}
                      onClick={() =>
                        open(n.sharedTeacherId ? "withdraw" : "share", n)
                      }
                    >
                      {n.sharedTeacherId
                        ? "Review withdrawal"
                        : "Review sharing"}
                    </Button>
                  </>
                ) : (
                  !n.acknowledgedAt && (
                    <Button
                      disabled={launchBlocked}
                      onClick={() => open("ack", n)}
                    >
                      Acknowledge note
                    </Button>
                  )
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
