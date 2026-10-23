"use client";
import { useAppTranslation } from "./locale";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api, ApiError, type Session, type components } from "@bcs/api-client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Notice, useDecision } from "./tuition-workflow";
import { StudentFeedback } from "./independent-journey";
import { StudentForm, EducationSummary } from "./independent-student";
type S = components["schemas"];
const copy = (hi: boolean) => (en: string, hindi: string) => (hi ? hindi : en);
export function StudentSupporters({
  session,
  hindi = false,
}: {
  session: Session;
  hindi?: boolean;
}) {
  const { appText, appError, appLocale } = useAppTranslation();

  const t = copy(hindi),
    owner = session.account.role === "INDEPENDENT_STUDENT",
    params = useSearchParams(),
    student = params.get("student"),
    [email, setEmail] = useState(""),
    [mode, setMode] = useState<"ADVICE" | "MANAGE">("ADVICE"),
    [inviting, setInviting] = useState(false),
    [review, setReview] = useState<{
      item: S["StudentGuardianGrant"];
      action: "ACCEPT" | "DECLINE" | "REVOKE";
    } | null>(null),
    [agreed, setAgreed] = useState(false),
    [inviteReview, setInviteReview] = useState(false);
  const q = useInfiniteQuery({
    queryKey: ["student-guardian-grants", session.account.id],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api<{ items: S["StudentGuardianGrant"][]; nextCursor: string | null }>(
        "/student-guardian-grants?limit=10" +
          (pageParam ? "&cursor=" + encodeURIComponent(pageParam) : ""),
        { signal },
      ),
    getNextPageParam: (r) => r.nextCursor || undefined,
    retry: false,
    refetchOnWindowFocus: false,
  });
  async function refresh() {
    const r = await q.refetch();
    if (r.error) throw r.error;
    setReview(null);
    setInviting(false);
    setInviteReview(false);
    setAgreed(false);
    setEmail("");
  }
  const d = useDecision(session, refresh),
    items = q.data?.pages.flatMap((p) => p.items) ?? [],
    active = items.find((i) => i.status === "ACTIVE"),
    pending = items.find(
      (i) => i.status === "PENDING" || i.status === "EXPIRED",
    );
  return (
    <section className="student-workspace" lang={hindi ? "hi" : "en"}>
      <h1>
        {owner
          ? t("Choose your learning support", "पढ़ाई में मदद चुनें")
          : t("Supported students", "जिन विद्यार्थियों की आप मदद करते हैं")}
      </h1>
      <p>
        {owner
          ? t(
              "Keep managing your own learning, or invite someone you trust. You keep ownership of your account and can remove access at any time.",
              "अपनी पढ़ाई खुद सँभालें या भरोसेमंद व्यक्ति को बुलाएँ। खाते के मालिक आप रहेंगे और अनुमति कभी भी हटा सकते हैं।",
            )
          : t(
              "Accept only invitations you recognize. This support is separate from your own family profiles and does not transfer account ownership.",
              "केवल पहचाने हुए आमंत्रण स्वीकारें। यह मदद आपकी पारिवारिक प्रोफ़ाइल से अलग है और खाते का मालिक नहीं बदलती।",
            )}
      </p>
      <div className="student-support-explainer">
        <h2>
          {appText(t("Decide what help you want", "तय करें कि कैसी मदद चाहिए"))}
        </h2>
        <dl>
          <dt>{appText(t("Advice only", "केवल सलाह"))}</dt>
          <dd>
            {appText(
              t(
                "View shared education, enquiries, shortlist and arrangement progress. No edits or decisions.",
                "साझा पढ़ाई, पूछताछ, शिक्षक सूची और व्यवस्था की प्रगति देखें। बदलाव या निर्णय नहीं।",
              ),
            )}
          </dd>
          <dt>
            {appText(t("Manage learning decisions", "पढ़ाई के निर्णय सँभालें"))}
          </dt>
          <dd>
            {appText(
              t(
                "Also edit education, send enquiries, choose a teacher, accept hiring and mutual email-sharing terms, close arrangements or request a replacement.",
                "पढ़ाई बदलें, पूछताछ भेजें, शिक्षक चुनें, नियुक्ति और ईमेल साझा करने की शर्तें स्वीकारें, व्यवस्था बंद करें या शिक्षक बदलने का अनुरोध करें।",
              ),
            )}
          </dd>
        </dl>
        <p>
          {appText(
            t(
              "Neither option shares login codes, devices, account ownership, private support conversations or privacy/deletion controls. This is voluntary adult support, not proof of legal guardianship.",
              "दोनों विकल्पों में लॉगिन कोड, उपकरण, खाते का स्वामित्व, निजी सहायता बातचीत या गोपनीयता/मिटाने का अधिकार साझा नहीं होता। यह वयस्क की स्वैच्छिक मदद है, कानूनी अभिभावक होने का प्रमाण नहीं।",
            ),
          )}
        </p>
      </div>
      <StudentFeedback decision={d} hindi={hindi} />
      {q.isPending && (
        <p role="status">
          {appText(t("Loading invitations…", "आमंत्रण लोड हो रहे हैं…"))}
        </p>
      )}
      {q.error && (
        <Notice error>
          {appText(
            t(
              "Invitation history is unavailable. Reload before making a decision.",
              "आमंत्रण उपलब्ध नहीं हैं। निर्णय से पहले फिर लोड करें।",
            ),
          )}{" "}
          <Button onClick={() => q.refetch()}>
            {appText(t("Try again", "फिर कोशिश करें"))}
          </Button>
        </Notice>
      )}
      {owner && q.data && !q.error && !active && !inviting && (
        <Button
          disabled={d.locked || q.hasNextPage}
          onClick={() => {
            setInviting(true);
            setAgreed(false);
          }}
        >
          {pending
            ? t("Replace pending invitation", "बाकी आमंत्रण बदलें")
            : t("Invite a supporter", "मददगार बुलाएँ")}
        </Button>
      )}
      {owner && q.hasNextPage && (
        <p>
          {appText(
            t(
              "Load the remaining history before creating or replacing an invitation.",
              "आमंत्रण बनाने या बदलने से पहले बाकी इतिहास लोड करें।",
            ),
          )}
        </p>
      )}
      {inviting && (
        <div className="student-review-panel">
          <h2>{appText(t("Invite by email", "ईमेल से आमंत्रित करें"))}</h2>
          {!inviteReview ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setInviteReview(true);
                setAgreed(false);
              }}
            >
              <fieldset disabled={d.locked}>
                <label className="field">
                  {appText(
                    t("Supporter’s account email", "मददगार के खाते का ईमेल"),
                  )}
                  <Input
                    type="email"
                    required
                    maxLength={254}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </label>
                <label className="field">
                  {appText(t("Permission", "अनुमति"))}
                  <select
                    aria-label={appText(t("Permission", "अनुमति"))}
                    value={mode}
                    onChange={(e) => setMode(e.target.value as typeof mode)}
                  >
                    <option value="ADVICE">
                      {appText(t("Advice only", "केवल सलाह"))}
                    </option>
                    <option value="MANAGE">
                      {appText(
                        t(
                          "Manage learning decisions",
                          "पढ़ाई के निर्णय सँभालें",
                        ),
                      )}
                    </option>
                  </select>
                </label>
                <Button type="submit">
                  {appText(t("Review invitation", "आमंत्रण की समीक्षा करें"))}
                </Button>
              </fieldset>
            </form>
          ) : (
            <>
              <p>
                {email.trim().toLowerCase()} ·{" "}
                {mode === "MANAGE"
                  ? t("Manage learning decisions", "पढ़ाई के निर्णय सँभालें")
                  : t("Advice only", "केवल सलाह")}
              </p>
              <p>
                {appText(
                  t(
                    "The invitation lasts seven days. Ask this person to sign in with this email as a guardian and open Supported students. Creating the invitation does not send an email or grant access before acceptance.",
                    "आमंत्रण सात दिन मान्य है। इस व्यक्ति से इसी ईमेल के अभिभावक खाते में प्रवेश करके मदद वाले विद्यार्थी खोलने को कहें। आमंत्रण बनाने से ईमेल नहीं भेजा जाता और स्वीकारने से पहले अनुमति नहीं मिलती।",
                  ),
                )}
              </p>
              {pending && (
                <Notice>
                  {appText(
                    t(
                      "The previous invitation will be revoked immediately.",
                      "पहला आमंत्रण तुरंत रद्द हो जाएगा।",
                    ),
                  )}
                </Notice>
              )}
              <label className="wizard-checkbox">
                <input
                  type="checkbox"
                  checked={agreed}
                  disabled={d.locked}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <span>
                  {appText(
                    t(
                      "I trust this person and authorize exactly the scope described above.",
                      "मुझे इस व्यक्ति पर भरोसा है और ऊपर बताई अनुमति देता/देती हूँ।",
                    ),
                  )}
                </span>
              </label>
              <div className="care-actions">
                <Button
                  variant="outline"
                  disabled={d.locked}
                  onClick={() => setInviteReview(false)}
                >
                  {appText(t("Edit invitation", "आमंत्रण बदलें"))}
                </Button>
                <Button
                  disabled={d.locked || !agreed || q.hasNextPage}
                  onClick={() =>
                    d.run({
                      path: "/student-guardian-grants",
                      body: {
                        email: email.trim(),
                        supportMode: mode,
                        expectedPendingVersion: pending?.version ?? 0,
                        confirmed: true,
                      },
                      message:
                        "Invitation created. Ask your supporter to review it in their account.",
                    })
                  }
                >
                  {appText(t("Create invitation", "आमंत्रण बनाएँ"))}
                </Button>
              </div>
            </>
          )}
          {!d.locked && (
            <Button variant="ghost" onClick={() => setInviting(false)}>
              {appText(t("Cancel", "रद्द करें"))}
            </Button>
          )}
        </div>
      )}
      {q.data && !q.error && (
        <>
          <ul className="student-candidate-list">
            {items.map((i) => (
              <li key={i.id}>
                <h2>{owner ? i.recipientEmail : i.studentName}</h2>
                <p>
                  {i.supportMode === "MANAGE"
                    ? t("Manage learning decisions", "पढ़ाई के निर्णय सँभालें")
                    : t("Advice only", "केवल सलाह")}{" "}
                  ·{" "}
                  {
                    {
                      PENDING: t(
                        "Waiting for acceptance",
                        "स्वीकृति का इंतज़ार",
                      ),
                      ACTIVE: t("Access active", "अनुमति सक्रिय"),
                      EXPIRED: t("Invitation expired", "आमंत्रण समाप्त"),
                      DECLINED: t("Declined", "मना किया"),
                      REVOKED: t("Access removed", "अनुमति हटी"),
                    }[i.status]
                  }
                </p>
                {i.status === "PENDING" && (
                  <p>
                    {appText(t("Invitation expires", "आमंत्रण समाप्त होगा"))}{" "}
                    {new Date(i.expiresAt).toLocaleDateString(
                      hindi ? "hi-IN" : appLocale,
                    )}
                  </p>
                )}
                <div className="care-actions">
                  {!owner &&
                    i.status === "PENDING" &&
                    (["ACCEPT", "DECLINE"] as const).map((action) => (
                      <Button
                        key={action}
                        variant={action === "ACCEPT" ? "default" : "outline"}
                        disabled={d.locked}
                        onClick={() => {
                          setReview({ item: i, action });
                          setAgreed(false);
                        }}
                      >
                        {action === "ACCEPT"
                          ? t("Review invitation", "आमंत्रण देखें")
                          : t("Decline invitation", "आमंत्रण मना करें")}
                      </Button>
                    ))}
                  {i.status === "ACTIVE" && !owner && !d.locked && (
                    <Link
                      className="button"
                      href={
                        "/dashboard/supported-students?student=" +
                        i.studentAccountId
                      }
                    >
                      {appText(
                        t(
                          "Open shared learning profile",
                          "साझा पढ़ाई की प्रोफ़ाइल खोलें",
                        ),
                      )}
                    </Link>
                  )}
                  {(i.status === "ACTIVE" ||
                    (owner && ["PENDING", "EXPIRED"].includes(i.status))) && (
                    <Button
                      variant="outline"
                      disabled={d.locked}
                      onClick={() => {
                        setReview({ item: i, action: "REVOKE" });
                        setAgreed(false);
                      }}
                    >
                      {owner
                        ? t("Remove access", "अनुमति हटाएँ")
                        : t("Stop supporting", "मदद बंद करें")}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {!items.length && (
            <Notice>
              {owner
                ? t(
                    "No one has access to your learning profile. Invite someone only if you want help.",
                    "आपकी पढ़ाई की प्रोफ़ाइल किसी से साझा नहीं है। ज़रूरत हो तभी आमंत्रित करें।",
                  )
                : t(
                    "No invitations for this email yet. Ask the student to invite your account email.",
                    "इस ईमेल के लिए आमंत्रण नहीं है। विद्यार्थी से आपके खाते के ईमेल पर आमंत्रित करने को कहें।",
                  )}
            </Notice>
          )}
          {q.hasNextPage && (
            <Button
              disabled={d.locked || q.isFetching}
              onClick={() => q.fetchNextPage()}
            >
              {appText(t("Load more invitations", "और आमंत्रण देखें"))}
            </Button>
          )}
        </>
      )}
      {review && (
        <div className="student-review-panel">
          <h2>
            {review.action === "REVOKE"
              ? t("Remove this access?", "यह अनुमति हटाएँ?")
              : review.action === "ACCEPT"
                ? t(
                    "Accept the stated permissions?",
                    "बताई हुई अनुमति स्वीकारें?",
                  )
                : t("Decline this invitation?", "यह आमंत्रण मना करें?")}
          </h2>
          <p>
            {review.item.studentName} · {review.item.recipientEmail} ·{" "}
            {review.item.supportMode === "MANAGE"
              ? t("Manage learning decisions", "पढ़ाई के निर्णय सँभालें")
              : t("Advice only", "केवल सलाह")}
          </p>
          <p>
            {review.action === "REVOKE"
              ? t(
                  "Shared profile and decision access stops immediately. The student keeps their account and learning records.",
                  "साझा प्रोफ़ाइल और निर्णयों की अनुमति तुरंत बंद होगी। विद्यार्थी का खाता और रिकॉर्ड सुरक्षित रहेंगे।",
                )
              : t(
                  "The exact scope is described above. Login, privacy controls and ownership remain with the student.",
                  "अनुमति ऊपर साफ़ बताई गई है। लॉगिन, गोपनीयता और स्वामित्व विद्यार्थी के पास रहेंगे।",
                )}
          </p>
          <label className="wizard-checkbox">
            <input
              type="checkbox"
              checked={agreed}
              disabled={d.locked}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              {appText(
                t(
                  "I understand this decision.",
                  "मैं यह निर्णय समझता/समझती हूँ।",
                ),
              )}
            </span>
          </label>
          <div className="care-actions">
            <Button
              variant="outline"
              disabled={d.locked}
              onClick={() => setReview(null)}
            >
              {appText(t("Go back", "वापस जाएँ"))}
            </Button>
            <Button
              disabled={d.locked || !agreed}
              onClick={() =>
                d.run({
                  path:
                    "/student-guardian-grants/" + review.item.id + "/decisions",
                  body: {
                    expectedVersion: review.item.version,
                    action: review.action,
                    confirmed: true,
                  },
                  message: "Support access decision recorded.",
                })
              }
            >
              {appText(t("Confirm decision", "निर्णय की पुष्टि करें"))}
            </Button>
          </div>
        </div>
      )}
      {!owner && student && !d.locked && !q.error && (
        <SupportedStudent
          key={student}
          id={student}
          name={items.find((item) => item.studentAccountId === student && item.status === "ACTIVE")?.studentName}
          session={session}
          hindi={hindi}
        />
      )}
    </section>
  );
}
function SupportedStudent({
  id,
  name,
  session,
  hindi,
}: {
  id: string;
  name?: string;
  session: Session;
  hindi: boolean;
}) {
  const { appText, appError, appLocale } = useAppTranslation();

  const t = copy(hindi),
    [editing, setEditing] = useState(false),
    q = useQuery({
      queryKey: ["student-delegation", session.account.id, id],
      queryFn: ({ signal }) =>
        api<S["DelegatedStudentProfile"]>(
          "/delegated-students/" + encodeURIComponent(id) + "/profile",
          { signal },
        ),
      retry: false,
      refetchOnWindowFocus: false,
    });
  return (
    <section className="care-section">
      <h2>
        {appText(t("Shared learning profile", "साझा पढ़ाई की प्रोफ़ाइल"))}
      </h2>
      {name && !q.error && <p className="supported-student-context"><strong>{appText("Student")}: </strong>{name}</p>}
      {q.isPending && (
        <p role="status">
          {appText(t("Checking your access…", "आपकी अनुमति जाँच रहे हैं…"))}
        </p>
      )}
      {q.error && (
        <Notice error>
          {appText(
            t(
              "Access is unavailable or has been revoked. Ask the student to review their support settings.",
              "अनुमति उपलब्ध नहीं है या हटा दी गई है। विद्यार्थी से मदद की सेटिंग जाँचने को कहें।",
            ),
          )}{" "}
          <Button onClick={() => q.refetch()}>
            {appText(t("Check again", "फिर जाँचें"))}
          </Button>
        </Notice>
      )}
      {q.data && !q.error && (
        <>
          <EducationSummary education={q.data.education} hindi={hindi} />
          <p>
            {q.data.supportMode === "MANAGE"
              ? t(
                  "The student authorized you to manage learning decisions. They retain account ownership.",
                  "विद्यार्थी ने आपको पढ़ाई के निर्णयों की अनुमति दी है। खाते का मालिक विद्यार्थी है।",
                )
              : t(
                  "You can read shared learning progress. Decisions remain with the student.",
                  "आप साझा पढ़ाई की प्रगति देख सकते हैं। निर्णय विद्यार्थी करेगा।",
                )}
          </p>
          <div className="care-actions">
            <Link
              className="button"
              href={"/dashboard/student-enquiries?student=" + enc(id)}
            >
              {appText(
                t(
                  "Enquiries and teacher choices",
                  "पूछताछ और शिक्षक के विकल्प",
                ),
              )}
            </Link>
            <Link
              className="button secondary"
              href={"/dashboard/student-arrangements?student=" + enc(id)}
            >
              {appText(t("Hiring and arrangements", "नियुक्ति और व्यवस्थाएँ"))}
            </Link>
            {q.data.supportMode === "MANAGE" && (
              <Button variant="outline" onClick={() => setEditing(!editing)}>
                {editing
                  ? t("Close editor", "संपादन बंद करें")
                  : t("Edit shared education", "साझा पढ़ाई बदलें")}
              </Button>
            )}
          </div>
          {editing && q.data.supportMode === "MANAGE" && (
            <StudentForm
              key={q.data.version}
              session={session}
              profile={q.data}
              hindi={hindi}
              onSessionChange={() => {}}
              reload={() => q.refetch()}
              updatePath={"/delegated-students/" + enc(id) + "/profile/updates"}
              onSaved={async () => {
                const r = await q.refetch();
                if (r.error) throw r.error;
                setEditing(false);
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
const enc = encodeURIComponent;
export function StudentDevices({
  session,
  hindi = false,
  onSignedOut,
}: {
  session: Session;
  hindi?: boolean;
  onSignedOut: () => void;
}) {
  const { appText, appError, appLocale } = useAppTranslation();

  const t = copy(hindi),
    [review, setReview] = useState<{
      item: S["StudentDevice"];
      action: "label" | "revoke";
    } | null>(null),
    [label, setLabel] = useState(""),
    [agreed, setAgreed] = useState(false);
  const q = useInfiniteQuery({
    queryKey: ["independent-student-devices", session.account.id],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api<{ items: S["StudentDevice"][]; nextCursor: string | null }>(
        "/independent-student/sessions?limit=10" +
          (pageParam ? "&cursor=" + enc(pageParam) : ""),
        { signal },
      ),
    getNextPageParam: (r) => r.nextCursor || undefined,
    retry: false,
    refetchOnWindowFocus: false,
  });
  async function refresh() {
    const r = await q.refetch();
    if (r.error instanceof ApiError && r.error.status === 401) {
      onSignedOut();
      return;
    }
    if (r.error) throw r.error;
    setReview(null);
    setAgreed(false);
  }
  const d = useDecision(
    session,
    refresh,
    (result) => !!result && typeof result === "object" && "familyId" in result,
  );
  return (
    <section className="student-workspace" lang={hindi ? "hi" : "en"}>
      <h1>
        {appText(t("Devices and account recovery", "उपकरण और खाते की वापसी"))}
      </h1>
      <p>
        {appText(
          t(
            "Name devices you recognize and sign out any you no longer use. Signing out this device returns you to email sign-in.",
            "पहचाने हुए उपकरणों को नाम दें और जिनका उपयोग नहीं करते उनसे बाहर निकलें। इस उपकरण से बाहर निकलने पर ईमेल से फिर प्रवेश करना होगा।",
          ),
        )}
      </p>
      <aside className="student-support-explainer">
        <h2>
          {appText(t("Need to regain access?", "खाते में वापस प्रवेश चाहिए?"))}
        </h2>
        <p>
          {appText(
            t(
              "Sign in with the same account email and a fresh one-time code. Keep that mailbox secure. A learning supporter cannot receive your codes, change your login or recover your account for you. If you lose the mailbox, contact support; account ownership is never transferred automatically.",
              "उसी खाते के ईमेल और नए एक बार के कोड से प्रवेश करें। ईमेल सुरक्षित रखें। मददगार आपके कोड नहीं पा सकता और लॉगिन या खाता वापस लेने का अधिकार नहीं रखता। ईमेल खो जाने पर सहायता लें; स्वामित्व अपने आप नहीं बदलता।",
            ),
          )}
        </p>
        <Link className="inline-link" href="/support">
          {appText(t("Get account help", "खाते की सहायता लें"))}
        </Link>
      </aside>
      <StudentFeedback decision={d} hindi={hindi} />
      {q.isPending && (
        <p role="status">
          {appText(t("Loading devices…", "उपकरण लोड हो रहे हैं…"))}
        </p>
      )}
      {q.error && (
        <Notice error>
          {appText(
            t(
              "Devices could not be loaded. Check your sign-in status and try again.",
              "उपकरण लोड नहीं हुए। अपना प्रवेश जाँचकर फिर कोशिश करें।",
            ),
          )}{" "}
          <Button onClick={() => refresh()}>
            {appText(t("Check access again", "अनुमति फिर जाँचें"))}
          </Button>
        </Notice>
      )}
      {q.data && !q.error && (
        <>
          <ul className="student-candidate-list">
            {q.data.pages
              .flatMap((p) => p.items)
              .map((i) => (
                <li key={i.familyId}>
                  <h2>
                    {i.deviceLabel || t("Unnamed device", "बिना नाम का उपकरण")}
                  </h2>
                  <p>
                    {i.current
                      ? t("This device", "यह उपकरण")
                      : t("Another signed-in device", "दूसरा उपकरण")}{" "}
                    · {i.familyId.slice(0, 8)}
                  </p>
                  <p>
                    {appText(t("Session expires", "प्रवेश समाप्त होगा"))}{" "}
                    {new Date(i.expiresAt).toLocaleDateString(
                      hindi ? "hi-IN" : appLocale,
                    )}
                  </p>
                  <div className="care-actions">
                    <Button
                      variant="outline"
                      disabled={d.locked}
                      onClick={() => {
                        setReview({ item: i, action: "label" });
                        setLabel(i.deviceLabel || "");
                        setAgreed(false);
                      }}
                    >
                      {appText(t("Name device", "उपकरण का नाम दें"))}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={d.locked}
                      onClick={() => {
                        setReview({ item: i, action: "revoke" });
                        setAgreed(false);
                      }}
                    >
                      {appText(t("Sign out device", "उपकरण से बाहर निकलें"))}
                    </Button>
                  </div>
                </li>
              ))}
          </ul>
          {!q.data.pages.some((p) => p.items.length) && (
            <Notice>
              {appText(
                t(
                  "No active devices on this page.",
                  "इस पृष्ठ पर सक्रिय उपकरण नहीं हैं।",
                ),
              )}
            </Notice>
          )}
          {q.hasNextPage && (
            <Button
              disabled={d.locked || q.isFetching}
              onClick={() => q.fetchNextPage()}
            >
              {appText(t("Load more devices", "और उपकरण देखें"))}
            </Button>
          )}
        </>
      )}
      {review && (
        <div className="student-review-panel">
          <h2>
            {review.action === "label"
              ? t("Name this device", "इस उपकरण का नाम दें")
              : t("Sign out this device?", "इस उपकरण से बाहर निकलें?")}
          </h2>
          <p>
            {review.item.current
              ? t(
                  "You are using this device now.",
                  "आप अभी यह उपकरण उपयोग कर रहे हैं।",
                )
              : review.item.deviceLabel || review.item.familyId.slice(0, 8)}
          </p>
          {review.action === "label" ? (
            <label className="field">
              {appText(t("Device name (optional)", "उपकरण का नाम (वैकल्पिक)"))}
              <Input
                value={label}
                maxLength={60}
                disabled={d.locked}
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>
          ) : (
            <p>
              {appText(
                t(
                  "This ends access for this device, including refreshed sessions. Your learning records stay in your account.",
                  "इससे इस उपकरण का प्रवेश बंद होगा, नए सत्र भी। पढ़ाई के रिकॉर्ड खाते में रहेंगे।",
                ),
              )}
            </p>
          )}
          <label className="wizard-checkbox">
            <input
              type="checkbox"
              checked={agreed}
              disabled={d.locked}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              {appText(t("I reviewed this change.", "मैंने यह बदलाव देखा है।"))}
            </span>
          </label>
          <div className="care-actions">
            <Button
              variant="outline"
              disabled={d.locked}
              onClick={() => setReview(null)}
            >
              {appText(t("Cancel", "रद्द करें"))}
            </Button>
            <Button
              disabled={d.locked || !agreed}
              onClick={() =>
                d.run({
                  path:
                    review.action === "label"
                      ? "/independent-student/session-labels"
                      : "/independent-student/session-revocations",
                  body: {
                    familyId: review.item.familyId,
                    confirmed: true,
                    ...(review.action === "label"
                      ? { label: label.trim() || null }
                      : {}),
                  },
                  message:
                    review.action === "label"
                      ? "Device name saved."
                      : "Device signed out.",
                  onSaved: () => {
                    if (review.action === "revoke" && review.item.current)
                      onSignedOut();
                  },
                })
              }
            >
              {review.action === "label"
                ? t("Save device name", "नाम सहेजें")
                : t("Confirm sign-out", "बाहर निकलने की पुष्टि करें")}
            </Button>
          </div>
          {d.error && !d.uncertain && (
            <Button
              variant="ghost"
              onClick={async () => {
                try {
                  await api("/auth/session");
                  await d.reload();
                } catch (e) {
                  if (e instanceof ApiError && e.status === 401) onSignedOut();
                }
              }}
            >
              {appText(
                t(
                  "Check whether I am still signed in",
                  "जाँचें कि अभी प्रवेश है या नहीं",
                ),
              )}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
