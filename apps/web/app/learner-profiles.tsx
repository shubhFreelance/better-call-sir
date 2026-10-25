"use client";
import { onboardingAccessDenied } from "./onboarding-read-boundary";
import { useAppTranslation } from "./locale";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { api, ApiError, type Session, type components } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { FilterButton, FilterButtonGroup } from "../components/ui/filter-button";
import { Input } from "../components/ui/input";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Info } from "lucide-react";
import { CardSearch } from "../components/ui/card-search";
import { InfoTooltip } from "../components/ui/info-tooltip";
type Profile = components["schemas"]["LearnerProfile"];
type Profiles = components["schemas"]["LearnerProfiles"];
type ProfileInput = components["schemas"]["LearnerProfileInput"];
type ProfileUpdate = components["schemas"]["LearnerProfileUpdate"];
const initial = {
  alias: "",
  stage: "SCHOOL",
  institutionName: "",
  subjects: "",
  grade: "",
  board: "",
  level: "",
  courseName: "",
  university: "",
  studyYear: "",
};
const fieldLabels = {
  alias: "Learner name or alias",
  institutionName: "School / institution name",
  subjects: "Subjects studied",
  grade: "Class",
  board: "School board",
  level: "Early years level",
  courseName: "Course / degree",
  university: "University / awarding institution",
  studyYear: "Current year of study",
};
const gateMessages = {
  VERIFICATION_REQUIRED:
    "Guardian verification is required before entering learner details.",
  CONSENT_REQUIRED: "Review guardian consent before entering learner details.",
  PRIVACY_PAUSED:
    "Learner profile changes are paused while your deletion request is reviewed.",
  READ_ONLY:
    "You can view your linked profile. Your guardian currently manages education details.",
  READY: "",
};
export function LearnerProfiles({ session, targetName, targetId }: { session: Session; targetName?: string; targetId?: string }) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const client = useQueryClient();
  const [cursor, setCursor] = useState<string | null>(null),
    [adding, setAdding] = useState(!!targetName && !targetId),
    [saved, setSaved] = useState<Profile | null>(null);
  const [editing, setEditing] = useState<Profile | null>(null),
    [openingId, setOpeningId] = useState<string | null>(null),
    [openError, setOpenError] = useState(""),
    [editNotice, setEditNotice] = useState(""),
    [stale, setStale] = useState(false);
  const [values, setValues] = useState({...initial, alias: targetName || ""}),
    [review, setReview] = useState<ProfileInput | null>(null),
    [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [message, setMessage] = useState("");
  const pending = useRef<{
      body: ProfileInput | ProfileUpdate;
      key: string;
      path: string;
    } | null>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const query = useQuery({
    queryKey: ["learner-profiles", session.account.id, cursor, targetId],
    queryFn: async ({ signal }) => targetId ? {creationStatus:"READY" as const, items:[await api<Profile>("/learner-profiles/"+targetId,{signal})],nextCursor:null} :
      api<Profiles>(
        "/learner-profiles?limit=10" + (cursor ? "&cursor=" + cursor : ""),
        { signal },
      ),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [learnerSearch, setLearnerSearch] = useState("");
  const relationships = useInfiniteQuery({
    queryKey: ["learner-relationships", session.account.id],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => api<{items: components["schemas"]["GuardianVerification"][]; nextCursor: string | null}>("/guardian-verifications?limit=20" + (pageParam ? "&cursor=" + pageParam : ""), {signal}),
    getNextPageParam: page => page.nextCursor ?? undefined,
    enabled: session.account.role === "GUARDIAN",
    retry: false,
  });
  const verifiedLearners = relationships.data?.pages.flatMap(page => page.items).filter(row => row.status === "APPROVED" && !row.learnerId) ?? [];
  const matchesName = (name: string) => name.toLocaleLowerCase().includes(learnerSearch.trim().toLocaleLowerCase());
  const noPendingLearners = !relationships.isPending && !relationships.error && !verifiedLearners.some(row => matchesName(row.learnerName));
  const ownProfile = query.data?.items[0];
  const studentManagement = useQuery({
    queryKey: ["learning-management", session.account.id, ownProfile?.id],
    queryFn: ({ signal }) =>
      api<components["schemas"]["LearningManagement"]>(
        `/children/${ownProfile!.id}/learning-management`,
        { signal },
      ),
    enabled: session.account.role === "STUDENT" && !!ownProfile,
    retry: false,
  });
  const ready =
    (query.data?.creationStatus === "READY" ||
      (session.account.role === "STUDENT" &&
        !!studentManagement.data?.canManageLearning &&
        !studentManagement.error)) &&
    !query.error &&
    !query.isFetching;
  const locked = busy || uncertain || !!openingId;
  const denied = onboardingAccessDenied(query.error);
  useEffect(() => {
    if (adding && !locked && ready) heading.current?.focus();
  }, [adding, editing, review, locked, ready]);

  async function openEdit(id: string) {
    setOpeningId(id);
    setOpenError("");
    setEditNotice("");
    setSaved(null);
    try {
      const current = await api<Profile>("/learner-profiles/" + id);
      if (current.editStatus !== "EDITABLE") {
        setEditNotice(
          current.editStatus === "DELETED"
            ? "This learner profile was deleted and cannot be restored by editing."
            : "This learner profile is linked to enquiry or learning history. Direct edits are unavailable. Use privacy requests for name corrections, or contact support to review education changes.",
        );
        setAdding(false);
        setEditing(null);
        setReview(null);
        return;
      }
      const e = current.education;
      setValues({
        ...initial,
        alias: current.alias,
        stage: e.stage,
        institutionName: e.institutionName || "",
        subjects: e.subjects.join(", "),
        ...(e.stage === "SCHOOL"
          ? { grade: String(e.grade ?? ""), board: e.board || "" }
          : e.stage === "EARLY_YEARS"
            ? { level: e.level || "" }
            : {
                courseName: e.courseName || "",
                university: e.university || "",
                studyYear: String(e.studyYear ?? ""),
              }),
      });
      setEditing(current);
      setAdding(true);
      setReview(null);
      setErrors({});
      setMessage("");
      setStale(false);
    } catch (error) {
      setOpenError(
        "We couldn’t load the latest learner profile. Your current edits are retained. Try opening the profile again.",
      );
    } finally {
      setOpeningId(null);
    }
  }
  function change(name: keyof typeof initial, value: string) {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => ({ ...e, [name]: "" }));
  }
  function prepare() {
    const e: Record<string, string> = {};
    for (const [name, max] of [
      ["alias", 40],
      ["institutionName", 160],
      ["subjects", 1500],
      ...(values.stage === "SCHOOL"
        ? [["board", 80]]
        : values.stage === "COLLEGE"
          ? [
              ["courseName", 160],
              ["university", 160],
            ]
          : []),
    ] as [keyof typeof initial, number][])
      if (!values[name].trim() || values[name].trim().length > max)
        e[name] =
          `Enter ${fieldLabels[name as keyof typeof fieldLabels].toLowerCase()} (up to ${max} characters).`;
    const subjects = values.subjects
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (
      !subjects.length ||
      subjects.length > 20 ||
      subjects.some((s) => s.length > 60) ||
      new Set(subjects.map((s) => s.toLowerCase())).size !== subjects.length
    )
      e.subjects =
        "Enter 1–20 distinct subjects, separated by commas. Each can have up to 60 characters.";
    if (
      values.stage === "SCHOOL" &&
      (!/^\d+$/.test(values.grade) ||
        Number(values.grade) < 1 ||
        Number(values.grade) > 12)
    )
      e.grade = "Choose a class from 1 to 12.";
    if (
      values.stage === "EARLY_YEARS" &&
      !["NURSERY", "KG1", "KG2"].includes(values.level)
    )
      e.level = "Choose Nursery, KG1 or KG2.";
    if (
      values.stage === "COLLEGE" &&
      (!/^\d+$/.test(values.studyYear) ||
        Number(values.studyYear) < 1 ||
        Number(values.studyYear) > 10)
    )
      e.studyYear = "Enter a whole study year from 1 to 10.";
    setErrors(e);
    if (Object.keys(e).length) {
      document.getElementById("education-" + Object.keys(e)[0])?.focus();
      return;
    }
    const common = { institutionName: values.institutionName.trim(), subjects };
    const education: ProfileInput["education"] =
      values.stage === "SCHOOL"
        ? {
            ...common,
            stage: "SCHOOL",
            grade: Number(values.grade),
            board: values.board.trim().toUpperCase(),
          }
        : values.stage === "EARLY_YEARS"
          ? {
              ...common,
              stage: "EARLY_YEARS",
              level: values.level as "NURSERY" | "KG1" | "KG2",
            }
          : {
              ...common,
              stage: "COLLEGE",
              courseName: values.courseName.trim(),
              university: values.university.trim(),
              studyYear: Number(values.studyYear),
            };
    setReview({ alias: values.alias.trim(), education });
    setMessage("");
  }
  async function save() {
    if (!review || stale || denied || (!ready && !uncertain)) return;
    const attempt = pending.current || {
      body: editing
        ? {
            ...review,
            expectedVersion: editing.version,
            confirmed: true as const,
          }
        : review,
      key: crypto.randomUUID(),
      path: editing
        ? "/learner-profiles/" + editing.id + "/updates"
        : "/learner-profiles",
    };
    pending.current = attempt;
    setBusy(true);
    setMessage("");
    try {
      const result = await api<Profile>(attempt.path, {
        method: "POST",
        body: attempt.body,
        key: attempt.key,
        csrf: session.csrfToken,
      });
      pending.current = null;
      setUncertain(false);
      setSaved(result);
      setAdding(false);
      setEditing(null);
      setReview(null);
      setValues(initial);
      await client.invalidateQueries({ queryKey: ["children"] });
      await client.invalidateQueries({ queryKey: ["family-children"] });
      await client.invalidateQueries({ queryKey: ["hiring-dashboard"] });
      await client.invalidateQueries({ queryKey: ["dashboard"] });
      await client.invalidateQueries({ queryKey: ["learner-profiles"] });
      await client.invalidateQueries({ queryKey: ["guardian-setup"] });
      await client.invalidateQueries({ queryKey: ["learner-relationships"] });
      await client.invalidateQueries({ queryKey: ["guardian-verification"] });
      await client.invalidateQueries({ queryKey: ["guardian-verifications"] });
    } catch (error) {
      const unknown =
        !(error instanceof ApiError) ||
        error.code === "INVALID_RESPONSE" ||
        error.status >= 500;
      setUncertain(unknown);
      if (!unknown) pending.current = null;
      if (editing && error instanceof ApiError && error.status === 409)
        setStale(true);
      setMessage(
        unknown
          ? editing
            ? "We couldn’t confirm whether your changes were saved. Retry the same save; your update will be applied only once."
            : "We couldn’t confirm whether the profile was saved. Retry this save; the same request will not create a second profile."
          : error instanceof Error
            ? error.message
            : "The profile could not be saved.",
      );
      if (error instanceof ApiError && [401, 403].includes(error.status))
        await query.refetch();
    } finally {
      setBusy(false);
    }
  }
  function field(
    name: keyof typeof fieldLabels,
    control?: ReactNode,
    hint?: string,
  ) {
    const props = {
      id: "education-" + name,
      value: values[name],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        change(name, e.target.value),
      "aria-invalid": !!errors[name],
      "aria-describedby": errors[name]
        ? "education-" + name + "-error"
        : hint
          ? "education-" + name + "-hint"
          : undefined,
    };
    return (
      <div className="field">
        <label htmlFor={props.id}>
          {name === "institutionName" && values.stage === "COLLEGE"
            ? appText("College / institution name")
            : appText(fieldLabels[name])}
        </label>
        {control || (
          <Input
            {...props}
            readOnly={session.account.role === "STUDENT" && name === "alias"}
            maxLength={
              name === "alias"
                ? 40
                : name === "subjects"
                  ? 1500
                  : name === "board"
                    ? 80
                    : 160
            }
            type={name === "studyYear" ? "number" : "text"}
            min={name === "studyYear" ? 1 : undefined}
            max={name === "studyYear" ? 10 : undefined}
          />
        )}
        {errors[name] ? (
          <small id={props.id + "-error"} role="alert" className="field-error">
            {appError(errors[name])}
          </small>
        ) : (
          hint && (
            <small id={props.id + "-hint"} className="wizard-help">
              {appText(hint)}
            </small>
          )
        )}
      </div>
    );
  }
  return (
    <section className="learner-profiles">
      {!targetName && <header className="wizard-title">
        <h1>
          {session.account.role === "STUDENT"
            ? appText("Your education profile.")
            : appText("Manage children & learners")}
        </h1>
        <p>
          {appText(
            "Add each child separately: verify your relationship, review learning permission, then complete their education details. Approval for one child does not cover another.",
          )}{" "}
        </p>
        <div className="learner-profile-navigation">
          <Button asChild variant="ghost">
            <Link href="/dashboard">{appText("Back to dashboard")}</Link>
          </Button>
          {session.account.role === "GUARDIAN" && (
            <>
              <Button asChild variant="secondary" className="learner-verification-action">
                <Link href="/guardian-verification">
                  {appText("Verify another learner relationship")}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/onboarding/guardian">{appText("Guardian setup")}</Link>
              </Button>
            </>
          )}
        </div>
      </header>}
      <div className="learner-profile-layout">
        <aside className="learner-profile-intro">
          <h2>{appText("Start with the learner.")}</h2>
          <p>
            {appText(
              "Saving an education profile does not send an enquiry, hire a teacher or activate a student account.",
            )}{" "}
          </p>
          <p>
            {appText(
              "Teacher enquiries support early years, school and college. Each match still needs an available teacher whose current reviewed coverage fits the learner.",
            )}{" "}
          </p>
          <p>
            {appText(
              "These details are private. Add education information only; do not enter identity documents or contact details.",
            )}{" "}
          </p>
        </aside>
        <div className="learner-profile-main">
          {saved && !denied && (
            <Alert>
              <AlertDescription className="saved-profile-feedback">
                <strong>
                  {saved.alias}
                  {appText("’s profile is saved.")}
                </strong>
                <p>
                  {saved.enquiryEligible
                    ? appText(
                        "You can select this learner when starting a supported tuition enquiry.",
                      )
                    : appText(
                        "The profile is saved. Complete its education details before starting an enquiry.",
                      )}
                </p>
{!targetName && (                <Link href="/onboarding/guardian" className="inline-link">
                  {appText("Continue guardian setup")}{" "}
                </Link>)}
                {saved.enquiryEligible && (
                  <Link className="inline-link" href="/onboarding/parent">
                    {appText("Start a tuition enquiry")}{" "}
                  </Link>
                )}
                <Link
                  className="inline-link"
                  href={"/dashboard/family?learner=" + saved.id}
                >
                  {appText("Manage student access")}{" "}
                </Link>
              </AlertDescription>
            </Alert>
          )}
          {openingId && (
            <p role="status">
              {appText("Loading the latest learner profile…")}
            </p>
          )}
          {openError && (
            <Alert variant="destructive">
              <AlertDescription>{appError(openError)}</AlertDescription>
            </Alert>
          )}
          {editNotice && (
            <Alert>
              <AlertDescription>
                {editNotice}
                <Link href="/dashboard/privacy" className="inline-link">
                  {appText("Review privacy and correction requests")}{" "}
                </Link>
                <Link href="/dashboard/support" className="inline-link">
                  {appText("Get help with education details")}{" "}
                </Link>
              </AlertDescription>
            </Alert>
          )}
          {query.isPending && (
            <p role="status">{appText("Loading learner profiles…")}</p>
          )}
          {query.error && (
            <Alert variant="destructive">
              <AlertDescription>
                {appText(
                  "We couldn’t load the current learner profiles. Your form is retained; refresh before saving a profile.",
                )}{" "}
                <Button
                  disabled={locked}
                  variant="outline"
                  onClick={() => query.refetch()}
                >
                  {appText("Retry learner profiles")}{" "}
                </Button>
                {cursor && (
                  <Button
                    disabled={locked}
                    variant="ghost"
                    onClick={() => setCursor(null)}
                  >
                    {appText("Return to first page")}{" "}
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
          {session.account.role === "GUARDIAN" && !targetName && !denied && !adding && (
            <section className="care-card learner-setup-card" aria-label={appText("Verified learners awaiting setup")}>
              <CardSearch title={<>{appText("Verified learners awaiting setup")}<InfoTooltip
                label={appText("About learner setup")}
                items={[appText("Complete education details to connect the existing student account."),
                  ...(noPendingLearners ? [appText("No matching learners awaiting setup. Check saved profiles below.")] : [])]} /></>}
                label={appText("Find your learner")} placeholder={appText("Type a learner name")}
                value={learnerSearch} onChange={setLearnerSearch} />
              {relationships.isPending && <p role="status">{appText("Loading learner profiles…")}</p>}
              {relationships.error && <Alert variant="destructive"><AlertDescription>{appText("We couldn’t load your verified relationships.")} <Button variant="outline" onClick={() => relationships.refetch()}>{appText("Try again")}</Button></AlertDescription></Alert>}
              {!relationships.error && verifiedLearners.filter(row => matchesName(row.learnerName)).map(row => (
                <article key={row.id} className="care-card">
                  <h3>{row.learnerName}</h3>
                  <p>{appText("Relationship verified · Education profile not created")}</p>
                  {row.studentEmail && <p>{row.studentEmail}</p>}
                  {ready ? <Button disabled={locked} onClick={() => {setValues({...initial, alias: row.learnerName}); setAdding(true); setSaved(null); setReview(null); setErrors({}); setMessage("");}}>{appText("Complete learner profile")}</Button> : <Button asChild variant="outline"><Link href="/onboarding/guardian">{appText("Review learning permission")}</Link></Button>}
                </article>
              ))}
              {noPendingLearners && <p role="status" className="sr-only">{appText("No matching learners awaiting setup. Check saved profiles below.")}</p>}
              {relationships.hasNextPage && <Button variant="outline" disabled={relationships.isFetchingNextPage} onClick={() => relationships.fetchNextPage()}>{appText("Load more relationships")}</Button>}
            </section>
          )}
          {query.data && !denied && (
            <>
              {query.data.creationStatus !== "READY" && !ready && (
                <Alert>
                  <AlertDescription>
                    {appText(gateMessages[query.data.creationStatus])}
                    {["VERIFICATION_REQUIRED", "CONSENT_REQUIRED"].includes(
                      query.data.creationStatus,
                    ) && (
                      <Link href="/onboarding/guardian" className="inline-link">
                        {appText("Review guardian onboarding")}{" "}
                      </Link>
                    )}
                  </AlertDescription>
                </Alert>
              )}
              {!editing && (!adding || query.data.items.length > 0) && (
                <section
                  className="care-card"
                  aria-label={appText("Saved learner profiles")}
                >
                  <div className="hiring-section-heading">
                    <h2>{appText("Saved profiles")}</h2>
                    {session.account.role === "GUARDIAN" && !targetName && !adding && (
                      <Button asChild disabled={locked}>
                        <Link href="/guardian-verification?new=1">{appText("Add a child or learner")}</Link>
                      </Button>
                    )}
                  </div>
                  {!query.data.items.length ? (
                    <p>{appText("No learner profiles saved yet.")}</p>
                  ) : (
                    <ul className="learner-education-list">
                      {query.data.items.filter(p => matchesName(p.alias) && (!targetName || p.alias.toLowerCase() === targetName.toLowerCase())).map((p) => (
                        <li key={p.id} className="saved-learner-card">
                          <h3>{p.alias}</h3>
                          <EducationSummary education={p.education} />
                          <div className="saved-learner-info">
                            <Info size={18} aria-hidden="true" />
                            <p>
                            {p.enquiryEligible
                              ? appText(
                                  "Education details are ready for an enquiry. Teacher fit and availability still need to be checked.",
                                )
                              : !p.education.institutionName ||
                                  !p.education.subjects.length
                                ? appText(
                                    "Education details are incomplete. Review guardian onboarding before sending an enquiry.",
                                  )
                                : appText(
                                    "Complete the education details before requesting a teacher.",
                                  )}
                            </p>
                          </div>
                          {(session.account.role === "GUARDIAN" ||
                            !!studentManagement.data?.canManageLearning) && (
                            <div className="saved-learner-actions">
                              <Button
                                variant="outline"
                                disabled={!ready || locked || adding}
                                onClick={() => openEdit(p.id)}
                              >
                                {appText("Edit profile for")} {p.alias}
                              </Button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="wizard-actions">
                    {cursor && (
                      <Button
                        variant="outline"
                        disabled={locked || adding || query.isFetching}
                        onClick={() => setCursor(null)}
                      >
                        {appText("First page")}{" "}
                      </Button>
                    )}
                    {query.data.nextCursor && (
                      <Button
                        variant="outline"
                        disabled={locked || adding || query.isFetching}
                        onClick={() => setCursor(query.data!.nextCursor)}
                      >
                        {appText("Next profiles")}{" "}
                      </Button>
                    )}
                  </div>
                </section>
              )}
            </>
          )}
          {adding && !denied && (
            <section
              className="wizard-card"
              aria-label={
                editing
                  ? appText("Edit learner profile")
                  : appText("New learner profile")
              }
            >
              <p className="wizard-save-note">
                {appText(
                  "All fields shown are required. Details stay in this form until you confirm the save. Leaving or reloading clears unsaved details.",
                )}{" "}
              </p>
              <h2 ref={heading} tabIndex={-1}>
                {review
                  ? appText("Review the learner profile")
                  : editing
                    ? appText("Edit education details")
                    : appText("Add education details")}
              </h2>
              {editing && (
                <div className="learner-profile-edit-context">
                  <strong>
                    {appText("Updating")} {editing.alias}
                    {appText("’s education profile")}
                  </strong>
                  <p>
                    {appText(
                      "Review every change before saving. Student access permissions stay as they are. Profiles used in an enquiry or learning history need a correction review.",
                    )}{" "}
                  </p>
                </div>
              )}
              {review ? (
                <>
                  <h3>{review.alias}</h3>
                  <EducationSummary education={review.education} />
                  <p>
                    {appText(
                      "You manage this learner’s education details. Saving this profile does not change student access permissions.",
                    )}{" "}
                  </p>
                </>
              ) : (
                <form
                  id="learner-education-form"
                  noValidate
                  onSubmit={(e) => {
                    e.preventDefault();
                    prepare();
                  }}
                >
                  <fieldset
                    disabled={locked || stale || !ready}
                    className="learner-education-fields"
                  >
                    <legend className="sr-only">
                      {appText("Learner education")}
                    </legend>
                    {field(
                      "alias",
                      undefined,
                      "For a newly verified relationship, use the learner name from the approved guardian review, up to 40 characters.",
                    )}
                    <div className="field">
                      <label htmlFor="education-stage">
                        {appText("Education stage")}
                      </label>
                      <select
                        id="education-stage"
                        value={values.stage}
                        onChange={(e) => {
                          change("stage", e.target.value);
                          setErrors({});
                        }}
                      >
                        <option value="EARLY_YEARS">
                          {appText("Early years — Nursery / KG")}{" "}
                        </option>
                        <option value="SCHOOL">
                          {appText("School — Classes 1–12")}
                        </option>
                        <option value="COLLEGE">
                          {appText("College / university")}
                        </option>
                      </select>
                    </div>
                    {values.stage === "EARLY_YEARS" &&
                      field(
                        "level",
                        <select
                          id="education-level"
                          value={values.level}
                          onChange={(e) => change("level", e.target.value)}
                          aria-invalid={!!errors.level}
                          aria-describedby={
                            errors.level ? "education-level-error" : undefined
                          }
                        >
                          <option value="">
                            {appText("Choose early years level")}
                          </option>
                          <option value="NURSERY">{appText("Nursery")}</option>
                          <option value="KG1">{appText("KG1")}</option>
                          <option value="KG2">{appText("KG2")}</option>
                        </select>,
                      )}
                    {values.stage === "SCHOOL" && (
                      <div className="wizard-fields">
                        {field(
                          "grade",
                          <select
                            id="education-grade"
                            value={values.grade}
                            onChange={(e) => change("grade", e.target.value)}
                            aria-invalid={!!errors.grade}
                            aria-describedby={
                              errors.grade ? "education-grade-error" : undefined
                            }
                          >
                            <option value="">{appText("Choose class")}</option>
                            {Array.from({ length: 12 }, (_, i) => (
                              <option key={i + 1} value={i + 1}>
                                {appText("Class")} {i + 1}
                              </option>
                            ))}
                          </select>,
                        )}
                        {field(
                          "board",
                          undefined,
                          "For example CBSE, ICSE, CGBSE or your state board.",
                        )}
                      </div>
                    )}
                    {field("institutionName")}
                    {values.stage === "COLLEGE" && (
                      <>
                        {field("courseName")} {field("university")}{" "}
                        {field("studyYear")}
                      </>
                    )}
                    {field(
                      "subjects",
                      undefined,
                      "Separate subjects with commas, for example English, Maths, Science.",
                    )}
                  </fieldset>
                </form>
              )}
              {message && (
                <Alert variant="destructive">
                  <AlertDescription>{appText(message)}</AlertDescription>
                </Alert>
              )}
              {stale && editing && (
                <Alert>
                  <AlertDescription>
                    {appText(
                      "The saved profile changed or can no longer be edited. Your edits are retained. Reloading discards them; review the latest profile before saving again.",
                    )}{" "}
                    <Button
                      variant="outline"
                      disabled={locked}
                      onClick={() => openEdit(editing.id)}
                    >
                      {appText("Discard edits and reload profile")}{" "}
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              {openError && editing && !stale && (
                <Button
                  variant="outline"
                  disabled={locked}
                  onClick={() => openEdit(editing.id)}
                >
                  {appText("Retry opening profile")}{" "}
                </Button>
              )}
              <FilterButtonGroup>
                {review ? (
                  <>
                    <FilterButton
                      disabled={locked}
                      onClick={() => {
                        setReview(null);
                        setMessage("");
                      }}
                    >
                      {appText("Edit details")}{" "}
                    </FilterButton>
                    <FilterButton accent
                      disabled={
                        busy || stale || !!openingId || (!ready && !uncertain)
                      }
                      onClick={save}
                    >
                      {busy
                        ? appText("Saving profile…")
                        : uncertain
                          ? appText("Retry profile save")
                          : editing
                            ? appText("Confirm and save changes")
                            : appText("Confirm and save profile")}
                    </FilterButton>
                  </>
                ) : (
                  <FilterButton accent
                    type="submit"
                    form="learner-education-form"
                    disabled={locked || stale || !ready}
                  >
                    {appText("Review learner profile")}{" "}
                  </FilterButton>
                )}
                <FilterButton
                  disabled={locked}
                  onClick={() => {
                    setAdding(false);
                    setEditing(null);
                    setStale(false);
                    setOpenError("");
                    setReview(null);
                    setMessage("");
                  }}
                >
                  {appText("Cancel")}{" "}
                </FilterButton>
              </FilterButtonGroup>
            </section>
          )}
        </div>
      </div>
    </section>
  );
}
export function EducationSummary({
  education: e,
}: {
  education: Profile["education"];
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  return (
    <div className="learner-education-summary">
      <p>
        {e.stage === "SCHOOL"
          ? appText("Class {0} · {1}", [e.grade, e.board])
          : e.stage === "EARLY_YEARS"
            ? e.level === "NURSERY"
              ? appText("Nursery")
              : e.level === "KG1"
                ? appText("KG1")
                : appText("KG2")
            : `${e.courseName || appText("College")}${e.studyYear ? " · " + appText("Year") + " " + e.studyYear : ""}`}
      </p>
      {e.institutionName && <p>{e.institutionName}</p>}
      {e.stage === "COLLEGE" && e.university && <p>{e.university}</p>}
      <p>
        {e.subjects.length
          ? appText("Subjects: {0}", [
              e.subjects.map((value) => appCurriculum(value)).join(", "),
            ])
          : appText("Subjects not yet recorded.")}
      </p>
    </div>
  );
}
