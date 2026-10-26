"use client";
import { RefreshButton } from "../components/ui/refresh-button";
import { useAppTranslation } from "./locale";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, Pencil, Plus } from "lucide-react";
import { InfoTooltip } from "../components/ui/info-tooltip";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type Session, type components } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Alert, AlertDescription } from "../components/ui/alert";
import { EducationSummary } from "./learner-profiles";
import { LearningManagementBadge } from "../components/ui/learning-management-badge";
import { learningModes } from "./learning-management";
import { FilterButton, FilterButtonGroup } from "../components/ui/filter-button";
import { ActionToast } from "../components/ui/action-toast";
import { emptyTeacherFilters, useTeacherSearchState } from "./teacher-search-state";
type Context = components["schemas"]["StudentSetupContext"];
type Preferences = components["schemas"]["StudentLearningPreferences"];
type Confirmation = components["schemas"]["StudentSetupConfirmation"];
type Progress = components["schemas"]["OnboardingProgress"];
type Space = components["schemas"]["StudentSubjectSpace"];
function savedSpaces(progress: Progress): Space[] {
  const draft = progress.draft as Preferences;
  return draft.spaces ?? (draft.subjects || []).map(subject => ({subject,...(draft.language ? {language:draft.language} : {}),...(draft.learningPreferences ? {learningPreferences:draft.learningPreferences} : {})}));
}
const splitSubjects = (text: string) =>
  text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
export function StudentWelcome({ session }: { session: Session }) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();
  const client = useQueryClient(), [notice, setNotice] = useState({id:0,message:"",error:false});
  const [editor, setEditor] = useState<{subject?:string; saved?:boolean} | null>(null);

  const query = useQuery({
    queryKey: ["student-setup", session.account.id],
    queryFn: ({ signal }) =>
      api<Context>("/onboarding/student/context", { signal }),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const denied =
    query.error instanceof ApiError && [401, 403].includes(query.error.status);
  return (
    <div className="student-welcome">
      <ActionToast key={notice.id} message={notice.message ? appText(notice.message) : ""} error={notice.error} />
      <header className="wizard-title">
        <h1>{appText("Set up your student space.")}</h1>
        <p>
          {appText(
            "Review your education and learning preferences before saving.",
          )}{" "}
        </p>
      </header>
      <div>
        <div className="student-welcome-main">
          {query.isPending ? (
            <p role="status">{appText("Loading your student setup…")}</p>
          ) : !query.data || denied ? (
            <section className="wizard-card">
              <Alert variant="destructive">
                <AlertDescription>
                  {denied
                    ? appText(
                        "Your student access or guardian permission needs review. Ask your guardian for help before continuing.",
                      )
                    : appText(
                        "We couldn’t load your saved student setup. Try again before entering details.",
                      )}
                </AlertDescription>
              </Alert>
              <Button
                disabled={query.isFetching}
                onClick={() => query.refetch()}
              >
                {appText("Retry loading student setup")}{" "}
              </Button>
              <Link href="/dashboard" className="inline-link">
                {appText("Open dashboard")}{" "}
              </Link>
            </section>
          ) : (
            <div>
              {query.error && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {appText(
                      "We couldn’t refresh your setup. Your edits are retained; reload the latest details before saving.",
                    )}{" "}
                    <Button
                      variant="outline"
                      disabled={query.isFetching}
                      onClick={() => query.refetch()}
                    >
                      {appText("Retry loading student setup")}{" "}
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              {editor ? <StudentSetupForm
                key={query.data.progress.version + ":" + query.data.learner.version + ":" + editor.subject + ":" + !!editor.saved}
                session={session} context={query.data}
                originalSubject={editor.subject} startSaved={!!editor.saved}
                readBlocked={!!query.error || query.isFetching}
                onReload={() => query.refetch()}
                onClose={() => setEditor(null)}
                onDuplicate={() => setNotice(current=>({id:current.id+1,message:"You cannot change the subject because you have already created a space for it.",error:true}))}
                onSaved={(progress, subject) => {
                  setNotice(current=>({id:current.id+1,message:"Your student setup is saved.",error:false}));
                  setEditor({subject,saved:true});
                  client.setQueryData<Context>(["student-setup",session.account.id], current => current ? {...current,progress,spacesVersion:(current.spacesVersion||0)+1} : current);
                }}
              /> : <StudentSpaceCards context={query.data} disabled={!!query.error || query.isFetching} onEdit={subject => setEditor({subject})} />}

            </div>
          )}
        </div>

      </div>
    </div>
  );
}
export function StudentSpaceCards({context, disabled, onEdit,guardian=false}:{context:Context; disabled:boolean; onEdit:(subject?:string)=>void;guardian?:boolean}) {
  const {appText,appCurriculum} = useAppTranslation();
  const [,setSearch] = useTeacherSearchState();
  const spaces = savedSpaces(context.progress);
  const e = context.learner.education;
  return <section aria-label={appText("Your subject spaces")}>
    <div className="student-spaces-heading"><h2>{appText("Your subject spaces")}</h2><InfoTooltip label={appText("About subject spaces")} items={[appText("Create one space per subject, with its own language and learning preferences."),appText("Saving these preferences does not change who manages learning.")]} /></div>
    <div className="student-spaces-grid">
      {spaces.map(space => <article className="student-subject-card" key={space.subject}>
        <div className="student-space-top"><BookOpen size={25} aria-hidden="true"/><button type="button" className="student-space-edit" disabled={disabled} onClick={()=>onEdit(space.subject)} aria-label={appText("Edit {0} space",[appCurriculum(space.subject)])} title={appText("Edit {0} space",[appCurriculum(space.subject)])}><Pencil size={18} aria-hidden="true"/></button></div>
        <h3><Link href={"/teachers?"+new URLSearchParams({learner:context.learner.id,subject:space.subject})} onClick={()=>setSearch({filters:{...emptyTeacherFilters,subject:space.subject,language:space.language || ""}})}>{appCurriculum(space.subject)}</Link></h3>
        <p className="student-space-education">{e.stage === "SCHOOL" ? appText("Class {0} · {1}",[e.grade,e.board]) : e.stage === "COLLEGE" ? e.courseName : appText(e.level || "Early years")}</p>
        <p>{e.institutionName}</p>
        <p className="student-space-language">{appText("Language")}: <strong>{space.language ? appText(space.language) : appText("No language preference")}</strong></p>
      </article>)}
      <button type="button" className="student-subject-card student-space-add" disabled={disabled || spaces.length >= 20 || !context.learner.enquiryEligible} onClick={()=>onEdit()}><Plus size={32} aria-hidden="true"/><span>{appText("Add a subject space")}</span></button>
    </div>
    {!context.learner.enquiryEligible && <p role="status">{appText(guardian ? "Complete this learner’s education details before creating a subject space." : "Some education details are missing. Ask your guardian to complete your profile, then reload your setup.")}{guardian && <> <Link href="/dashboard/learners">{appText("Open education profiles")}</Link></>}</p>}
  </section>;
}
export function StudentSetupForm({
  session,
  context,
  readBlocked,
  onReload,
  onSaved,
  originalSubject, startSaved, onClose, onDuplicate, saveSpaces,
}: {
  session: Session;
  context: Context;
  readBlocked: boolean;
  onReload: () => Promise<unknown>;
  onSaved: (progress: Progress, subject:string) => void;
  originalSubject?:string;
  startSaved:boolean;
  onClose:()=>void;
  onDuplicate:()=>void;
  saveSpaces?:(body:Confirmation,key:string)=>Promise<Progress>;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const spaces = savedSpaces(context.progress);
  const selected = spaces.find(space => space.subject === originalSubject);
  const initial:Preferences = selected ? {subjects:[selected.subject],language:selected.language,learningPreferences:selected.learningPreferences} : {};
  const suggestions = context.learner.education.subjects;
  const completed = startSaved;
  const [, setTeacherSearch] = useTeacherSearchState();
  const management = useQuery({queryKey:["learning-management",session.account.id,context.learner.id],queryFn:({signal})=>api<components["schemas"]["LearningManagement"]>(`/children/${context.learner.id}/learning-management`,{signal}),retry:false});
  const currentManagement = !management.error && management.data ? learningModes[management.data.mode] : undefined;
  const [subjects, setSubjects] = useState(
      (initial.subjects || []).filter((s) => suggestions.includes(s)),
    ),
    [other, setOther] = useState(
      (initial.subjects || [])
        .filter((s) => !suggestions.includes(s))
        .join(", "),
    );
  const [correct, setCorrect] = useState(false),
    [language, setLanguage] = useState(initial.language || ""),
    [notes, setNotes] = useState(initial.learningPreferences || "");
  const [review, setReview] = useState<Confirmation["draft"] | null>(completed ? initial : null),
    [version, setVersion] = useState(context.progress.version),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [conflict, setConflict] = useState(false),
    [saved, setSaved] = useState(completed),
    [error, setError] = useState(""),
    [errors, setErrors] = useState<Record<string, string>>({});
  const pending = useRef<{ body: Confirmation; key: string } | null>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const locked = busy || uncertain || conflict || readBlocked;
  useEffect(() => { if (saved) heading.current?.focus(); }, [saved]);
  const teacherSearch = "/teachers?" + new URLSearchParams({learner:context.learner.id,...(review?.subjects?.length === 1 ? {subject:review.subjects[0]} : {})});
  function chooseSubject(subject:string) {
    if (spaces.some(space => space.subject !== originalSubject && space.subject.toLowerCase() === subject.toLowerCase())) {
      onDuplicate();
      return;
    }
    setSubjects([subject]);
    setOther("");
  }
  function prepare() {
    const chosen = [...subjects, ...splitSubjects(other)],
      invalid: Record<string, string> = {};
    if (chosen.some(subject => spaces.some(space => space.subject !== originalSubject && space.subject.toLowerCase() === subject.toLowerCase()))) {
      onDuplicate();
      return;
    }
    if (!correct)
      invalid.education =
        "Review your education details and confirm they are correct.";
    if (chosen.length !== 1) invalid.subjects = "Choose one subject for this space.";
    if (
      chosen.length > 20 ||
      chosen.some((s) => s.length > 60) ||
      new Set(chosen.map((s) => s.toLowerCase())).size !== chosen.length
    )
      invalid.subjects =
        "Choose up to 20 distinct subjects, with up to 60 characters each.";
    if (notes.trim().length > 500)
      invalid.notes = "Use 500 characters or fewer.";
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      document
        .getElementById(
          {
            education: "student-education-correct",
            subjects: "student-other-subjects",
            notes: "student-learning-notes",
          }[Object.keys(invalid)[0]] || "student-education-correct",
        )
        ?.focus();
      return;
    }
    setReview({
      subjects: chosen,
      ...(language ? { language: language as "English" | "Hindi" } : {}),
      ...(notes.trim() ? { learningPreferences: notes.trim() } : {}),
    });
    setError("");
    requestAnimationFrame(() => heading.current?.focus());
  }
  async function save() {
    if (!review || busy || conflict || readBlocked) return;
    const attempt = pending.current || {
      body: {
        expectedVersion: version,
        educationVersion: context.learner.version,
        spacesVersion:context.spacesVersion || 0,
        confirmed: true as const,
        draft: {spaces:[...spaces.filter(space => space.subject !== originalSubject),{subject:review.subjects![0],...(review.language ? {language:review.language} : {}),...(review.learningPreferences ? {learningPreferences:review.learningPreferences} : {})}]},
      },
      key: crypto.randomUUID(),
    };
    pending.current = attempt;
    setBusy(true);
    setError("");
    try {
      const result = saveSpaces ? await saveSpaces(attempt.body,attempt.key) : await api<Progress>("/onboarding/student/confirmations", {
        method: "POST",
        body: attempt.body,
        key: attempt.key,
        csrf: session.csrfToken,
      });
      if (
        result.kind !== "STUDENT" ||
        result.state !== "READY" ||
        result.completedResourceId !== context.learner.id ||
        !Number.isInteger(result.version) ||
        result.version <= version
      )
        throw new Error("Setup was not confirmed.");
      const confirmedSpace = savedSpaces(result).find(space=>space.subject === review.subjects![0]);
      if (!confirmedSpace) throw new Error("Setup was not confirmed.");
      pending.current = null;
      setVersion(result.version);
      setUncertain(false);
      setSaved(true);
      const confirmed:Preferences = {subjects:[confirmedSpace.subject],language:confirmedSpace.language,learningPreferences:confirmedSpace.learningPreferences};
      setSubjects(
        (confirmed.subjects || []).filter((s) => suggestions.includes(s)),
      );
      setOther(
        (confirmed.subjects || [])
          .filter((s) => !suggestions.includes(s))
          .join(", "),
      );
      setLanguage(confirmed.language || "");
      setNotes(confirmed.learningPreferences || "");
      setReview(confirmed as Confirmation["draft"]);
      onSaved(result, confirmedSpace.subject);
    } catch (e) {
      const unknown =
        !(e instanceof ApiError) ||
        e.code === "INVALID_RESPONSE" ||
        e.status >= 500;
      setUncertain(unknown);
      setConflict(e instanceof ApiError && e.status === 409);
      if (!unknown) pending.current = null;
      setError(
        unknown
          ? "We couldn’t confirm whether your setup was saved. Retry the same setup before changing details."
          : (e as Error).message,
      );
      if (e instanceof ApiError && [401, 403].includes(e.status))
        await onReload();
    } finally {
      setBusy(false);
    }
  }
  if (!context.learner.enquiryEligible)
    return (
      <section className="wizard-card">
        <h2>{appText("Review your education details.")}</h2>
        <EducationSummary education={context.learner.education} />
        <Alert>
          <AlertDescription>
            {appText(session.account.role === "GUARDIAN"
              ? "Complete this learner’s education details before creating a subject space."
              : "Some education details are missing. Ask your guardian to complete your profile, then reload your setup.") }{" "}
          </AlertDescription>
        </Alert>
        <RefreshButton variant="outline" disabled={readBlocked} onClick={onReload} label={appText("Reload student setup")} />
      </section>
    );
  return (
    <section
      className="wizard-card student-setup-form"
      aria-label={appText("Student onboarding")}
    >
      <Button type="button" variant="ghost" disabled={locked} onClick={onClose}>{appText("Back to subject spaces")}</Button>
      <ol
        className="student-setup-steps"
        aria-label={appText("Student setup progress")}
      >
        <li aria-current={!review && !saved ? "step" : undefined}>
          {appText("1 · Details and preferences")}{" "}
        </li>
        <li aria-current={review && !saved ? "step" : undefined}>
          {appText("2 · Review and save")}
        </li>
        <li aria-current={saved ? "step" : undefined}>{appText("3 · Setup saved")}</li>
      </ol>
      <h2 ref={heading} tabIndex={-1}>
        {saved
          ? appText("Your student setup is saved.")
          : review
            ? appText("Review your student setup")
            : appText("What helps you learn?")}
      </h2>
      {saved && <p className="student-saved-prompt">{review?.subjects?.length
        ? appText("Your {0} space is saved. Add another subject from your subject spaces.",[review.subjects.map(subject => appCurriculum(subject)).join(", ")])
        : appText("Your preferences are saved. You can update your setup to add subjects.")}</p>}
      {review ? (
        <div className="student-setup-review">
          <section className="student-review-education">
          <p className="student-review-label">{appText("Your education details")}</p>
          <h3>{context.learner.alias}</h3>
          <EducationSummary education={context.learner.education} />
          </section>
          <section className="student-review-preferences">
          <h3>{appText("Learning preferences")}</h3>
          <dl><div><dt>{appText("Subjects")}</dt><dd>
            {review.subjects?.length
              ? review.subjects.map((value) => appCurriculum(value)).join(", ")
              : appText("No subjects selected")}
          </dd></div><div><dt>{appText("Language")}</dt><dd>{review.language ? appText(review.language) : appText("No language preference")}</dd></div>
          {review.learningPreferences && <div className="student-review-notes"><dt>{appText("Learning preferences")}</dt><dd>{review.learningPreferences}</dd></div>}
          </dl></section>
          <div className="student-review-authority" role="note">
          {currentManagement && <LearningManagementBadge label={appText(currentManagement.title)} items={[appText(currentManagement.help)]} />}
          <p>
            {appText(
              "Saving these preferences does not change who manages learning.",
            )}{" "}
          </p>
          </div>
        </div>
      ) : (
        <form
          id="student-setup-details"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!locked) prepare();
          }}
        >
          <fieldset disabled={locked} className="wizard-fields">
            <div className="student-education-review">
              <h3>{appText("Your education details")}</h3>
              <strong>{context.learner.alias}</strong>
              <EducationSummary education={context.learner.education} />
              <label className="wizard-checkbox">
                <input
                  id="student-education-correct"
                  type="checkbox"
                  checked={correct}
                  onChange={(e) => setCorrect(e.target.checked)}
                  aria-invalid={!!errors.education}
                  aria-describedby={
                    errors.education
                      ? "student-education-error"
                      : "student-education-help"
                  }
                />
                <span>{appText("These education details are correct")}</span>
              </label>
              <small className="wizard-help" id="student-education-help">
                {appText(
                  "If anything is wrong, ask your guardian to review it before continuing.",
                )}{" "}
              </small>
              {errors.education && (
                <p
                  id="student-education-error"
                  role="alert"
                  className="field-error"
                >
                  {appError(errors.education)}
                </p>
              )}
            </div>
            <section className="student-current-management" aria-label={appText("Current family choice")}>
              <h3>{appText("Current family choice")}</h3>
              {currentManagement && <LearningManagementBadge label={appText(currentManagement.title)} items={[appText(currentManagement.help)]} />}
              <Link className="inline-link" href="/dashboard/learning-management">{appText("Review who manages learning")}</Link>
            </section>
            <fieldset>
              <legend>
                {appText("Subject for this space")}
              </legend>
              <div className="teacher-choices">
                {suggestions.map((s) => (
                  <label key={s} className="teacher-choice">
                    <input
                      type="radio"
                      name="student-space-subject"
                      checked={subjects.includes(s)}
                      onChange={() => chooseSubject(s)}
                    />
                    <span>{appCurriculum(s)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="field">
              <label htmlFor="student-other-subjects">
                {appText("Other subject")}{" "}
              </label>
              <Input
                id="student-other-subjects"
                value={other}
                onChange={(e) => {setOther(e.target.value);setSubjects([]);}}
                maxLength={1220}
                aria-invalid={!!errors.subjects}
                aria-describedby={
                  errors.subjects
                    ? "student-subjects-error"
                    : "student-subjects-help"
                }
              />
              <small className="wizard-help" id="student-subjects-help">
                {appText(
                  "Choose one subject for this space.",
                )}{" "}
              </small>
              {errors.subjects && (
                <p
                  className="field-error"
                  role="alert"
                  id="student-subjects-error"
                >
                  {appError(errors.subjects)}
                </p>
              )}
            </div>
            <div className="field">
              <label htmlFor="student-language">
                {appText("Language you prefer (optional)")}{" "}
              </label>
              <select
                id="student-language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="">{appText("No preference")}</option>
                <option value="English">{appText("English")}</option>
                <option value="Hindi">{appText("Hindi")}</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="student-learning-notes">
                {appText("How do you like to learn? (optional)")}{" "}
              </label>
              <Textarea
                id="student-learning-notes"
                value={notes}
                maxLength={500}
                rows={4}
                onChange={(e) => setNotes(e.target.value)}
                aria-invalid={!!errors.notes}
                aria-describedby="student-notes-help"
              />
              <small id="student-notes-help" className="wizard-help">
                {appText(
                  "For example, “Please explain with pictures and give me time to try.” Keep personal details out.",
                )}{" "}
                {notes.length}
                {appText("/500 characters.")}{" "}
              </small>
            </div>
          </fieldset>
          <p className="wizard-help">
            {appText(
              "Only the final confirmation saves your changes. Leaving or reloading clears unsaved details.",
            )}{" "}
          </p>
        </form>
      )}
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{appError(error)}</AlertDescription>
        </Alert>
      )}
      {conflict && (
        <div className="student-preferences-recovery">
          <p>
            {appText(
              "Your edits are retained. Reloading replaces them with the latest saved setup and education details; review them again before saving.",
            )}{" "}
          </p>
          <RefreshButton variant="outline" disabled={readBlocked} onClick={onReload} label={appText("Reload latest student setup")} />
        </div>
      )}
      <FilterButtonGroup className="student-setup-actions">
        {saved ? (
          <>
            <FilterButton
              key="update"
              type="button"
              onClick={() => {
                setSaved(false);
                setReview(null);
                setCorrect(false);
                setErrors({});
                requestAnimationFrame(() => heading.current?.focus());
              }}
            >
              {appText("Update student setup")}{" "}
            </FilterButton>
            <FilterButton asChild accent>
              <Link href={teacherSearch} onClick={() => setTeacherSearch({filters:{...emptyTeacherFilters,subject:review?.subjects?.length === 1 ? review.subjects[0] : "",language:review?.language || ""}})}>{appText("Explore teachers")}</Link>
            </FilterButton>
            <FilterButton asChild><Link href="/dashboard">
              {appText("Open dashboard")}{" "}
            </Link></FilterButton>
          </>
        ) : review ? (
          <>
            <FilterButton
              key="edit"
              type="button"
              disabled={locked}
              onClick={() => {
                setReview(null);
                setError("");
                requestAnimationFrame(() => heading.current?.focus());
              }}
            >
              {appText("Edit setup details")}{" "}
            </FilterButton>
            <FilterButton
              accent key="confirm"
              type="button"
              disabled={busy || conflict || readBlocked}
              onClick={save}
            >
              {busy
                ? appText("Saving student setup…")
                : uncertain
                  ? appText("Retry saving student setup")
                  : appText("Confirm and save student setup")}
            </FilterButton>
          </>
        ) : (
          <>
            <FilterButton
              accent key="review"
              form="student-setup-details"
              type="submit"
              disabled={locked}
            >
              {appText("Review student setup")}{" "}
            </FilterButton>
            <FilterButton asChild><Link href="/dashboard">
              {appText("Do this later")}{" "}
            </Link></FilterButton>
          </>
        )}
      </FilterButtonGroup>
    </section>
  );
}
