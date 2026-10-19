"use client";
import {ServiceFollowups} from "./service-followups";
import { NotificationWorkspace } from "./notification-workspace";
import { TuitionMinimumWorkspace } from "./tuition-minimum-workspace";
import { LearningManagementWorkspace } from "./learning-management";
import { ManagedStudentLearning } from "./managed-student-learning";
import { GuardianVerificationWorkspace } from "./guardian-verification";
import { Button as SharedButton } from "../components/ui/button";
import { Input as SharedInput } from "../components/ui/input";
import {
  useAppTranslation,
  LanguageContext,
  nativeValidationText,
  translateText,
  rememberLanguage,
} from "./locale";
import {
  emptyTeacherFilters,
  useTeacherSearchState,
  type TeacherSearchPage,
} from "./teacher-search-state";
import { StudentSupporters, StudentDevices } from "./independent-access";
import {
  StudentArrangements,
  StudentOpportunities,
} from "./independent-journey";
import { StudentEnquiries } from "./student-enquiries";
import {
  IndependentStudentSetup,
  IndependentStudentHome,
} from "./independent-student";
import { TeachingCoverageSummary } from "./teaching-coverage";
import {
  CurriculumChoice,
  subjectSuggestions,
  boardSuggestions,
} from "./curriculum-choice";
import { LearnerProfiles } from "./learner-profiles";
import { TeacherLockIn } from "./teacher-lock-in";
import { WaitlistWorkspace } from "./waitlist-workspace";
import { HiringOverview } from "./hiring-overview";
import { ReportsWorkspace } from "./reports-workspace";
import { AdminConsole } from "./admin-console";
import { FinanceWorkspace } from "./finance-workspace";
import { RefreshCw, Landmark } from "lucide-react";
import { SupportOperations } from "./support-operations";
import { MatchingWorkspace } from "./matching-workspace";
import { ReviewerWorkspace } from "./reviewer-workspace";
import { PrivacyWorkspace } from "./privacy-workspace";
import { PlacementCare } from "./placement-care";
import { SupportWorkspace } from "./support-workspace";
import { NotesWorkspace } from "./notes-workspace";
import {
  useEffect,
  useRef,
  useState,
  createContext,
  useContext,
  ReactNode,
} from "react";
import Link from "next/link";
import { Button as UiButton } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Alert } from "../components/ui/alert";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../components/ui/tabs";
import { GuardianSetup } from "./guardian-setup";
import { GuardianOnboarding } from "./guardian-onboarding";
import { TeacherSetup } from "./teacher-onboarding";
import { RoleOverview } from "./role-overview";
import { TuitionRequests, TuitionTerms } from "./tuition-workflow";
import { LearningWorkspace } from "./learning-workspace";
import {
  RevisionBooking,
  ReservationBookings,
  PlacementInvoices,
} from "./revision-booking";
import { StudentWelcome } from "./student-welcome";
import { FamilyAccess, StudentActivation } from "./student-access";
import { EmailLogin } from "./email-login";
import { DemoJourney } from "./demo-journey";
import { StaffAccess, staffRole } from "./staff-access";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type InfiniteData,
  QueryClient,
  QueryClientProvider,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowUpRight,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  CalendarDays,
  GraduationCap,
  Heart,
  MapPin,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
  Phone,
  LayoutDashboard,
  NotebookPen,
  LifeBuoy,
  LogOut,
  SlidersHorizontal,
  X,
  Plus,
  AlertCircle,
  LoaderCircle,
  Languages,
  Settings,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";
import {
  api,
  ApiError,
  Account,
  Session,
  Teacher,
  Child,
  Lesson,
  TuitionRequest,
  Reservation,
  Dashboard,
  Candidate,
  rupees,
} from "@bcs/api-client";

const Auth = createContext<{
  session: Session | null;
  loading: boolean;
  setSession: (s: Session | null) => void;
  beginStudentSwitch: (studentId?: string) => void;
  failStudentSwitch: (message: string, uncertain: boolean) => void;
  hindi: boolean;
  setHindi: (v: boolean) => void;
}>({
  session: null,
  loading: true,
  setSession: () => {},
  beginStudentSwitch: () => {},
  failStudentSwitch: () => {},
  hindi: false,
  setHindi: () => {},
});
const useAuth = () => useContext(Auth);
const date = (value: string, withTime = true, locale = "en-IN") =>
  new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(new Date(value));
const pretty = (s: string) => s.replace(/_/g, " ").toLowerCase();
const initials = (name: string) =>
  name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("");
function Button({
  children,
  onClick,
  type = "button",
  secondary = false,
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  secondary?: boolean;
  disabled?: boolean;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  return (
    <UiButton
      type={type}
      variant={secondary ? "outline" : "default"}
      className={`button ${secondary ? "secondary" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </UiButton>
  );
}
function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  return (
    <Alert
      variant={error ? "destructive" : "default"}
      className={`notice ${error ? "error" : ""}`}
      role={error ? "alert" : "status"}
    >
      <AlertCircle size={18} />
      <span>{children}</span>
    </Alert>
  );
}
function State({
  loading,
  error,
  retry,
}: {
  loading?: boolean;
  error?: Error | null;
  retry?: () => void;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  if (loading)
    return (
      <div className="loading" role="status">
        <LoaderCircle className="spin" />{" "}
        {appText("Getting things ready…")}{" "}
      </div>
    );
  if (error)
    return (
      <Notice error>
        {appError(error.message)}{" "}
        {retry && (
          <SharedButton
            data-legacy-action=""
            variant="ghost"
            className="text-button"
            onClick={retry}
          >
            {appText("Try again")}{" "}
          </SharedButton>
        )}
      </Notice>
    );
  return null;
}
function Badge({ children }: { children: ReactNode }) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  return <span className="badge">{children}</span>;
}
function Empty({ children }: { children: ReactNode }) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  return (
    <div className="empty">
      <BookOpen size={28} />
      <p>{children}</p>
    </div>
  );
}
function PageTitle({
  eyebrow,
  title,
  subtitle,
  action,
  lang,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: ReactNode;
  lang?: "en" | "hi";
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  return (
    <div className="page-title" lang={lang}>
      <div>
        {eyebrow && <span className="eyebrow">{appText(eyebrow)}</span>}
        <h1>{appText(title)}</h1>
        <p>{appText(subtitle)}</p>
      </div>
      {action}
    </div>
  );
}
function Logo() {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const { hindi } = useAuth();
  return (
    <Link
      href="/"
      className="logo"
      aria-label={
        hindi
          ? appText("Better Call Sir मुख्य पृष्ठ")
          : appText("Better Call Sir home")
      }
    >
      <span className="logo-mark">
        <BookOpen size={21} />
      </span>
      <span>
        {appText("bettercall")}
        <span className="logo-accent">{appText("sir")}</span>
        <span className="logo-dot">.</span>
      </span>
    </Link>
  );
}
function Header() {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const { session, hindi, setHindi, setSession } = useAuth(),
    client = useQueryClient();
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST", csrf: session?.csrfToken });
      setSession(null);
      setOpen(false);
      client.clear();
      router.push("/");
    } catch (e) {
      alert(
        hindi
          ? "साइन आउट की पुष्टि नहीं हुई। अपना खाता जाँचकर फिर कोशिश करें।"
          : (e as Error).message,
      );
    }
  }
  return (
    <>
      <div className="dev-strip" lang={hindi ? "hi" : "en"}>
        <span className="dev-dot" aria-hidden="true" />
        {hindi
          ? "विकास संस्करण · नमूना प्रोफ़ाइल और खाते · कोई लाइव भुगतान या कॉल नहीं"
          : appText(
              "Development preview · Synthetic profiles and accounts · No live payments or calls",
            )}
      </div>
      <header
        className="header"
        lang={hindi ? "hi" : "en"}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.preventDefault();
            setOpen(false);
            menuButton.current?.focus();
          }
        }}
      >
        <div className="container header-inner">
          <Logo />
          <nav
            className={open ? "top-nav open" : "top-nav"}
            id="site-navigation"
            aria-label={hindi ? "मुख्य नेविगेशन" : appText("Main navigation")}
          >
            <Link href="/teachers" onClick={() => setOpen(false)}>
              {hindi ? "शिक्षक खोजें" : appText("Find a teacher")}
            </Link>
            <Link href="/teachers?tab=assisted" onClick={() => setOpen(false)}>
              {hindi
                ? "हमें आपके लिए खोजने दें"
                : appText("Let us search for you")}
            </Link>
            <Link href="/onboarding/teacher" onClick={() => setOpen(false)}>
              {hindi ? "शिक्षक बनें" : appText("Become a teacher")}
            </Link>
            <div className="mobile-nav-actions">
              <UiButton
                variant="outline"
                onClick={() => setHindi(!hindi)}
                aria-label={
                  hindi
                    ? "अंग्रेज़ी और हिन्दी बदलें"
                    : appText("Switch English and Hindi")
                }
              >
                <Languages size={16} aria-hidden="true" />
                {hindi ? appText("English") : "हिन्दी"}
              </UiButton>
              {session && (
                <UiButton variant="outline" onClick={logout}>
                  <LogOut size={18} aria-hidden="true" />
                  {hindi ? "साइन आउट" : appText("Sign out")}
                </UiButton>
              )}
            </div>
          </nav>
          <div className="header-actions">
            <SharedButton
              data-legacy-action=""
              variant="ghost"
              className="language"
              onClick={() => setHindi(!hindi)}
              aria-label={
                hindi
                  ? "अंग्रेज़ी और हिन्दी बदलें"
                  : appText("Switch English and Hindi")
              }
            >
              <Languages size={16} />
              {hindi ? appText("English") : "हिन्दी"}
            </SharedButton>
            {session ? (
              <>
                <Link className="button small secondary" href="/dashboard">
                  <span className="header-action-desktop">
                    {hindi ? "मेरा डैशबोर्ड" : appText("My dashboard")}
                  </span>
                  <span className="header-action-mobile">
                    {hindi ? "डैशबोर्ड" : appText("Dashboard")}
                  </span>{" "}
                  <ArrowUpRight size={16} />
                </Link>
                <SharedButton
                  data-legacy-action=""
                  variant="ghost"
                  className="icon-button"
                  onClick={logout}
                  aria-label={hindi ? "साइन आउट" : appText("Sign out")}
                >
                  <LogOut size={18} />
                </SharedButton>
              </>
            ) : (
              <Link className="button small" href="/login">
                <span className="header-action-desktop">
                  {hindi ? "शुरू करें" : appText("Get started")}
                </span>
                <span className="header-action-mobile">
                  {hindi ? "साइन इन" : appText("Sign in")}
                </span>{" "}
                <ArrowUpRight size={16} />
              </Link>
            )}
            <SharedButton
              data-legacy-action=""
              variant="ghost"
              ref={menuButton}
              className="icon-button mobile-menu"
              aria-controls="site-navigation"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
              aria-label={
                hindi
                  ? "नेविगेशन खोलें या बंद करें"
                  : appText("Toggle navigation")
              }
            >
              {open ? <X /> : <Menu />}
            </SharedButton>
          </div>
        </div>
      </header>
    </>
  );
}
function Footer() {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const { hindi } = useAuth();
  return (
    <footer lang={hindi ? "hi" : "en"}>
      <div className="container footer-grid">
        <div>
          <Logo />
          <p>
            {hindi ? (
              "एक अच्छा शिक्षक नई संभावनाएँ दिखाता है।"
            ) : (
              <>
                {appText("A good teacher changes the way")} <br />
                {appText("you see what’s possible.")}{" "}
              </>
            )}
          </p>
        </div>
        <div>
          <span className="eyebrow">
            {hindi ? "आपके परिवार के लिए" : appText("MADE FOR YOUR FAMILY")}
          </span>
          <Link href="/teachers">
            {hindi ? "शिक्षक खोजें" : appText("Find a teacher")}
          </Link>
          <Link href="/onboarding/parent">
            {hindi ? "अपनी ज़रूरत बताएँ" : appText("Tell us what you need")}
          </Link>
          <Link href="/support">
            {hindi ? "मदद और सुरक्षा सहायता" : appText("Help & safety support")}
          </Link>
        </div>
        <div>
          <span className="eyebrow">
            {hindi ? "आपके आसपास से शुरुआत" : appText("STARTING CLOSE TO HOME")}
          </span>
          <p>
            {hindi ? "रायपुर, छत्तीसगढ़" : appText("Raipur, Chhattisgarh")}
            <br />
            {hindi
              ? "ऑनलाइन और घर पर पढ़ाई"
              : appText("Online & at-home lessons")}
            <br />
            {hindi
              ? "शुरुआती शिक्षा, स्कूल और कॉलेज"
              : appText("Early years, school & college")}
          </p>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>
          © {new Date().getFullYear()} {appText("Better Call Sir")}
        </span>
        <span>
          {hindi
            ? "यह विकास संस्करण है। लाइव सेवाएँ चालू नहीं हैं।"
            : appText("A development build. Live services are not enabled.")}
        </span>
      </div>
    </footer>
  );
}
function Illustration() {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  return (
    <div
      className="illustration"
      aria-label={appText("Illustration of a supportive learning space")}
      role="img"
    >
      <div className="art-grid" />
      <div className="art-orbit orbit-one" />
      <div className="art-orbit orbit-two" />
      <span className="art-spark spark-one">✳</span>
      <span className="art-spark spark-two">✦</span>
      <div className="float-label top-float">
        <span className="circle-icon">
          <ShieldCheck size={18} />
        </span>
        <div>
          <strong>{appText("A thoughtful match")}</strong>
          <small>{appText("For your child. For their pace.")}</small>
        </div>
      </div>
      <div className="chalkboard">
        <div className="chalk-top">
          <span /> <span /> <span />
        </div>
        <span className="chalk-title">
          {appText("Small steps.")} <br />
          {appText("Big possibilities.")}{" "}
        </span>
        <div className="chalk-math">
          {appText("x² + y² = a little confidence")}
        </div>
        <svg viewBox="0 0 250 85" aria-hidden="true">
          <path
            d="M15 60 Q70 65 105 40 T225 15"
            stroke="#d2e7b1"
            strokeWidth="3"
            fill="none"
          />
          <path
            d="M205 13 L225 15 L218 35"
            stroke="#d2e7b1"
            strokeWidth="3"
            fill="none"
          />
          <circle cx="105" cy="40" r="5" fill="#f0a97d" />
        </svg>
      </div>
      <div className="illustrated-person teacher-person">
        <div className="hair" />
        <div className="face">
          <span className="eyes">{"•   •"}</span>
          <span className="smile">⌣</span>
        </div>
        <div className="shirt" />
        <div className="arm" />
      </div>
      <div className="illustrated-person student-person">
        <div className="hair" />
        <div className="face">
          <span className="eyes">{"•   •"}</span>
          <span className="smile">⌣</span>
        </div>
        <div className="shirt" />
      </div>
      <div className="art-desk">
        <div className="art-book" />
        <div className="art-plant">✳</div>
      </div>
      <div className="float-label bottom-float">
        <span className="circle-icon peach">
          <Heart size={18} />
        </span>
        <div>
          <strong>{appText("“Now I understand.”")}</strong>
          <small>{appText("The moment we’re here for.")}</small>
        </div>
      </div>
    </div>
  );
}
function TeacherCard({ teacher }: { teacher: Teacher }) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  return (
    <article className="teacher-card">
      <div className="teacher-top">
        <div className="avatar" style={{ background: teacher.avatarColor }}>
          {initials(teacher.name)}
          <span>
            <Check size={11} />
          </span>
        </div>
        <Badge>
          <ShieldCheck size={12} /> {appText("Reviewed coverage")}{" "}
        </Badge>
      </div>
      <Link href={`/teachers/${teacher.slug}`} className="teacher-name">
        <h3>{teacher.name}</h3>
        <ArrowUpRight size={19} />
      </Link>
      <p className="teacher-headline">{teacher.headline}</p>
      {teacher.demoAvailable && (
        <span className="teacher-demo-badge">
          <Check size={14} aria-hidden="true" />{" "}
          {appText("Demo available")}{" "}
        </span>
      )}
      <TeacherLockIn days={teacher.lockInDays} />
      <div className="teacher-tags">
        {teacher.subjects.map((s) => (
          <span key={s}>{appCurriculum(s)}</span>
        ))}
      </div>
      <TeachingCoverageSummary profile={teacher} compact />
      <div className="teacher-details">
        {teacher.boards.length > 0 && (
          <span>
            <BookOpen size={15} />
            {teacher.boards.join(" · ")}
          </span>
        )}
        <span>
          <MapPin size={15} />
          {teacher.modes.includes("HOME")
            ? teacher.modes.includes("ONLINE")
              ? appText("Raipur · At home & online")
              : appText("Raipur · Home tuition")
            : appText("Online tuition")}
        </span>
        <span>
          <Languages size={15} />
          {teacher.languages
            .map((value) => appCurriculum(value))
            .join(" & ")} · {teacher.experience}{" "}
          {appText("years teaching")}{" "}
        </span>
      </div>
      <div className="teacher-bottom">
        <div>
          <strong>{rupees(teacher.monthlyPaise, appLocale)}</strong>
          <small> {appText("/ month · tuition paid directly")}</small>
        </div>
        <Link
          href={`/teachers/${teacher.slug}`}
          className="round-link"
          aria-label={appText("View {0}", [teacher.name])}
        >
          <ArrowUpRight size={20} />
        </Link>
      </div>
    </article>
  );
}
function Home() {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const { hindi } = useAuth();
  const { data, error, isPending } = useQuery({
    queryKey: ["teachers"],
    queryFn: ({ signal }) => api<{ items: Teacher[] }>("/teachers", { signal }),
  });
  return (
    <>
      <section className="hero container">
        <div className="hero-copy">
          <div className="location-pill">
            <span /> {appText("Rooted in Raipur. Ready for your child.")}{" "}
          </div>
          <h1>
            {hindi ? (
              <>
                सही शिक्षक।
                <br />
                <em>नई संभावनाएँ।</em>
              </>
            ) : (
              <>
                {appText("A little guidance.")} <br />
                {appText("A world of")} <br />
                <em>{appText("possibilities.")}</em>
              </>
            )}
          </h1>
          <p>
            {hindi
              ? "शुरुआती शिक्षा, स्कूल या कॉलेज के लिए अपने अनुरूप शिक्षक खोजें—ऑनलाइन या आसपास।"
              : appText(
                  "Find a teacher for early learning, school or college, online or close to home.",
                )}
          </p>
          <div className="hero-buttons">
            <Link className="button" href="/teachers">
              {hindi
                ? "सही शिक्षक खोजें"
                : appText("Find your kind of teacher")}
              <ArrowUpRight size={19} />
            </Link>
            <Link className="hero-secondary" href="/onboarding/parent">
              {appText("Help me choose")} <ArrowRight size={17} />
            </Link>
          </div>
          <div className="hero-proof">
            <div className="mini-avatars">
              <span>{appText("A")}</span>
              <span>{appText("R")}</span>
              <span>{appText("M")}</span>
            </div>
            <div>
              <strong>{appText("People, before profiles.")}</strong>
              <small>
                {appText("Reviewed subject coverage. Clear fit reasons.")}
              </small>
            </div>
          </div>
        </div>
        <Illustration />
      </section>
      <section className="promise-bar">
        <div className="container promise-inner">
          <span>
            <ShieldCheck />
            {appText("Reviewed teacher coverage")}{" "}
          </span>
          <span>
            <MapPin />
            {appText("At home or online")}{" "}
          </span>
          <span>
            <Heart />
            {appText("Matching is free for families")}{" "}
          </span>
          <span>
            <Users />
            {appText("Guardian-led, student-centred")}{" "}
          </span>
        </div>
      </section>
      <section className="container section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">
              {appText("GOOD TEACHERS. REAL CONNECTIONS.")}
            </span>
            <h2>
              {appText("A teacher for their")} <br />
              <em>{appText("kind of curious.")}</em>
            </h2>
          </div>
          <div>
            <p>
              {appText("Start with a subject. Stay for the understanding.")}{" "}
              <br />
              {appText("Explore our synthetic development catalog.")}{" "}
            </p>
            <Link className="inline-link" href="/teachers">
              {appText("Meet all teachers")} <ArrowUpRight size={17} />
            </Link>
          </div>
        </div>
        <State loading={isPending} error={error} />
        <div className="teacher-grid">
          {data?.items.slice(0, 3).map((t) => (
            <TeacherCard key={t.id} teacher={t} />
          ))}
        </div>
      </section>
      <section className="container how-section">
        <div>
          <span className="eyebrow">
            {appText("LESS GUESSWORK. MORE GOOD FIT.")}
          </span>
          <h2>
            {appText("From “where do we start?”")} <br />
            {appText("to")} <em>{appText("“we’ve found our teacher.”")}</em>
          </h2>
          <Link className="button" href="/onboarding/parent">
            {appText("Let’s find your fit")} <ArrowUpRight size={18} />
          </Link>
        </div>
        <div className="steps">
          {[
            [
              "01",
              "Tell us about your learner",
              "A few details about their class, subject and what works for your family.",
            ],
            [
              "02",
              "Meet teachers who fit",
              "Reviewed coverage and clear reasons for each suitable option.",
            ],
            [
              "03",
              "Start with a conversation",
              "Agree a demo, confirm the details and take the next step together.",
            ],
          ].map(([number, title, copy]) => (
            <div className="step" key={number}>
              <span>{number}</span>
              <div>
                <h3>{appText(title)}</h3>
                <p>{appText(copy)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="container hiring-discovery-banner">
        <div>
          <h2>{appText("Let us help you find the right fit.")}</h2>
          <p>
            {appText(
              "Share the subject, class, location and budget that work for your family. Our team reviews suitable teacher options for you.",
            )}{" "}
          </p>
          <Link className="button" href="/teachers?tab=assisted">
            {appText("Let us search for you")} <ArrowUpRight size={18} />
          </Link>
        </div>
        <div>
          <h3>{appText("You keep the choice.")}</h3>
          <p>
            {appText(
              "Review profiles, ask about fit and agree the arrangement with the teacher. A shortlist is the start of a decision.",
            )}{" "}
          </p>
        </div>
      </section>
    </>
  );
}
function Teachers() {
  const { session: searchSession } = useAuth();
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();
  const client = useQueryClient();
  const resultSummary = useRef<HTMLSpanElement>(null);

  const { session } = useAuth();
  const independent = session?.account.role === "INDEPENDENT_STUDENT";
  const discoveryParams = useSearchParams();
  const [filterReset, setFilterReset] = useState(0);
  const [interactive, setInteractive] = useState(false);
  useEffect(() => setInteractive(true), []);
  const [searchState, setSearchState] = useTeacherSearchState();
  const { filters, results } = searchState;
  const {
    stage,
    level,
    courseName,
    studyYear,
    q,
    subject,
    mode,
    board,
    grade,
    language,
    locality,
    maxMonthly,
  } = filters;
  function changeFilter(field: keyof typeof filters, value: string) {
    setSearchState((current) => ({
      ...current,
      filters: { ...current.filters, [field]: value },
    }));
  }
  function educationStage(next: string) {
    setSearchState((current) => ({
      ...current,
      filters: {
        ...current.filters,
        stage: next,
        grade: "",
        board: "",
        level: "",
        courseName: "",
        studyYear: "",
      },
    }));
  }
  const [tab, setTab] = useState<"manual" | "assisted">(
    discoveryParams.get("tab") === "assisted" ? "assisted" : "manual",
  );
  useEffect(() => {
    setTab(discoveryParams.get("tab") === "assisted" ? "assisted" : "manual");
  }, [discoveryParams]);
  const params = new URLSearchParams();
  if (stage) params.set("stage", stage);
  if (level) params.set("level", level);
  if (courseName.trim()) params.set("courseName", courseName.trim());
  if (studyYear) params.set("studyYear", studyYear);
  if (q.trim()) params.set("q", q.trim());
  if (subject) params.set("subject", subject);
  if (mode) params.set("mode", mode);
  if (board) params.set("board", board);
  if (grade) params.set("grade", grade);
  if (language) params.set("language", language);
  if (locality) params.set("locality", locality);
  if (maxMonthly)
    params.set("maxMonthlyPaise", String(Number(maxMonthly) * 100));
  const searchKey = params.toString();
  const saved = results?.key === searchKey ? results : undefined;
  const query = useInfiniteQuery<
    TeacherSearchPage,
    Error,
    InfiniteData<TeacherSearchPage, string>,
    string[],
    string
  >({
    queryKey: ["teacher-search", searchKey],
    initialPageParam: "",
    initialDataUpdatedAt: saved?.updatedAt,
    initialData: () => {
      if (saved) return saved.data;
      const first = !params.size
        ? client.getQueryData<{ items: Teacher[]; nextCursor?: string | null }>(
            ["teachers"],
          )
        : undefined;
      return first ? { pages: [first], pageParams: [""] } : undefined;
    },
    queryFn: ({ pageParam, signal }) => {
      const page = new URLSearchParams(params);
      if (pageParam) page.set("cursor", pageParam);
      return api<TeacherSearchPage>(`/teachers?${page}`, { signal });
    },
    getNextPageParam: (last, _pages, _lastParam, pageParams) =>
      last.nextCursor && !pageParams.includes(last.nextCursor)
        ? last.nextCursor
        : undefined,
    retry: false,
  });
  useEffect(() => {
    if (!query.data || query.error || query.isFetching) return;
    const data = query.data;
    setSearchState((current) =>
      current.filters !== filters ||
      (current.results?.data === data &&
        current.results.updatedAt === query.dataUpdatedAt &&
        current.results.key === searchKey)
        ? current
        : {
            ...current,
            results: { key: searchKey, data, updatedAt: query.dataUpdatedAt },
          },
    );
  }, [
    filters,
    searchKey,
    query.data,
    query.dataUpdatedAt,
    query.error,
    query.isFetching,
    setSearchState,
  ]);
  const teachers = [
    ...new Map(
      query.data?.pages
        .flatMap((page) => page.items)
        .map((teacher) => [teacher.id, teacher]),
    ).values(),
  ];
  const unavailable = !!query.error && !query.isFetchNextPageError;
  const lastCursor = query.data?.pages.at(-1)?.nextCursor;
  const paginationBlocked =
    !!lastCursor && !!query.data?.pageParams.includes(lastCursor);
  return (
    <main className="container section">
      <PageTitle
        eyebrow={appText("FIND YOUR KIND OF TEACHER")}
        title={appText("Good learning starts with a good fit.")}
        subtitle={appText("Early years, school & college · Raipur pilot")}
      />
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as "manual" | "assisted")}
      >
        <TabsList
          className="discovery-tabs"
          aria-label={appText("How would you like to find a teacher?")}
        >
          <TabsTrigger value="manual">
            <Search size={18} /> {appText("Search")}{" "}
            <small>{appText("Browse and choose a teacher")}</small>
          </TabsTrigger>
          <TabsTrigger value="assisted">
            <Sparkles size={18} /> {appText("Let us search for you")}{" "}
            <small>
              {appText("Share your criteria for a reviewed shortlist")}
            </small>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="assisted">
          {independent ? (
            <section className="assisted-search panel">
              <div>
                <h2>{appText("Tell us what would work for your learning.")}</h2>
                <p>
                  {appText(
                    "Share your subject, availability and budget. Your criteria are recorded for staff review; this does not book or hire a teacher.",
                  )}{" "}
                </p>
              </div>
              <Link className="button" href="/dashboard/enquiries?new=1">
                {appText("Share my criteria")} <ArrowRight size={18} />
              </Link>
            </section>
          ) : (
            <section className="assisted-search panel">
              <div>
                <span className="eyebrow">{appText("PERSONALIZED HELP")}</span>
                <h2>{appText("Tell us what would work for your family.")}</h2>
                <p>
                  {appText(
                    "Share your learner’s education, subject, availability and budget. We’ll review suitable teachers and prepare learning options for you.",
                  )}{" "}
                </p>
              </div>
              <Link
                className="button"
                href={
                  searchSession?.account.role === "STUDENT"
                    ? "/dashboard/learning-choices?new=1"
                    : searchSession?.account.role === "INDEPENDENT_STUDENT"
                      ? "/dashboard/enquiries?new=1"
                      : "/onboarding/parent?discovery=ASSISTED"
                }
              >
                {appText("Share your criteria")} <ArrowRight size={18} />
              </Link>
            </section>
          )}
        </TabsContent>
        <TabsContent value="manual">
          <fieldset
            className="filter-bar catalog-filters"
            disabled={!interactive}
            aria-busy={!interactive}
            aria-label={appText("Teacher search criteria")}
          >
            <label className="search-input">
              <Search size={19} />
              <Input
                aria-label={appText("Search teachers")}
                placeholder={appText("Search a teacher or subject")}
                value={q}
                onChange={(e) => changeFilter("q", e.target.value)}
              />
            </label>
            <div className="filter-select">
              <label className="filter-label" htmlFor="search-stage">
                {appText("Education stage")}{" "}
              </label>
              <select
                id="search-stage"
                value={stage}
                onChange={(e) => educationStage(e.target.value)}
              >
                <option value="">{appText("All stages")}</option>
                <option value="EARLY_YEARS">
                  {appText("Early years — Nursery / KG")}
                </option>
                <option value="SCHOOL">
                  {appText("School — Classes 1–12")}
                </option>
                <option value="COLLEGE">
                  {appText("College / university")}
                </option>
              </select>
            </div>
            <div className="filter-select">
              <label className="filter-label" htmlFor="search-subject">
                {appText("Subject")}{" "}
              </label>
              <CurriculumChoice
                key={"subject-" + filterReset}
                id="search-subject"
                value={subject}
                onChange={(value) => changeFilter("subject", value)}
                suggestions={subjectSuggestions}
                customLabel={appText("Subject name")}
                anyLabel={appText("All subjects")}
              />
            </div>
            <label className="filter-select">
              <span className="filter-label">{appText("Lesson mode")}</span>
              <select
                aria-label={appText("Lesson mode")}
                value={mode}
                onChange={(e) => changeFilter("mode", e.target.value)}
              >
                <option value="">{appText("At home & online")}</option>
                <option value="HOME">{appText("At home")}</option>
                <option value="ONLINE">{appText("Online")}</option>
              </select>
            </label>
            {(!stage || stage === "SCHOOL") && (
              <>
                <div className="filter-select">
                  <label className="filter-label" htmlFor="search-board">
                    {appText("Board")}{" "}
                  </label>
                  <CurriculumChoice
                    key={"board-" + filterReset}
                    id="search-board"
                    value={board}
                    onChange={(v) => {
                      changeFilter("board", v);
                      if (v) changeFilter("stage", "SCHOOL");
                    }}
                    suggestions={boardSuggestions}
                    customLabel={appText("Board name")}
                    anyLabel={appText("All boards")}
                  />
                </div>
                <label className="filter-select">
                  <span className="filter-label">{appText("Class")}</span>
                  <select
                    aria-label={appText("Class")}
                    value={grade}
                    onChange={(e) => {
                      changeFilter("grade", e.target.value);
                      if (e.target.value) changeFilter("stage", "SCHOOL");
                    }}
                  >
                    <option value="">{appText("All classes")}</option>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {appText("Class")} {n}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {stage === "EARLY_YEARS" && (
              <label className="filter-select">
                <span className="filter-label">
                  {appText("Early years level")}
                </span>
                <select
                  aria-label={appText("Early years level")}
                  value={level}
                  onChange={(e) => changeFilter("level", e.target.value)}
                >
                  <option value="">{appText("All early years levels")}</option>
                  <option value="NURSERY">{appText("Nursery")}</option>
                  <option value="KG1">{appText("KG1")}</option>
                  <option value="KG2">{appText("KG2")}</option>
                </select>
              </label>
            )}
            {stage === "COLLEGE" && (
              <>
                <label className="filter-select">
                  <span className="filter-label">
                    {appText("Course / degree")}
                  </span>
                  <Input
                    aria-label={appText("Course / degree")}
                    value={courseName}
                    onChange={(e) => changeFilter("courseName", e.target.value)}
                    maxLength={160}
                    placeholder={appText("For example BSc Physics")}
                  />
                </label>
                <label className="filter-select">
                  <span className="filter-label">{appText("Study year")}</span>
                  <select
                    aria-label={appText("Study year")}
                    value={studyYear}
                    onChange={(e) => changeFilter("studyYear", e.target.value)}
                  >
                    <option value="">{appText("All study years")}</option>
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {appText("Year")} {n}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <label className="filter-select">
              <span className="filter-label">{appText("Language")}</span>
              <select
                aria-label={appText("Language")}
                value={language}
                onChange={(e) => changeFilter("language", e.target.value)}
              >
                <option value="">{appText("Any language")}</option>
                <option value="English">{appText("English")}</option>
                <option value="Hindi">{appText("Hindi")}</option>
              </select>
            </label>
            <label className="filter-select">
              <span className="filter-label">{appText("Locality")}</span>
              <select
                aria-label={appText("Locality")}
                value={locality}
                onChange={(e) => changeFilter("locality", e.target.value)}
              >
                <option value="">{appText("Any locality")}</option>
                {[
                  "Shankar Nagar",
                  "Avanti Vihar",
                  "Telibandha",
                  "Civil Lines",
                  "Mowa",
                ].map((l) => (
                  <option key={l} value={l}>
                    {appText(l)}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-select budget-filter">
              <span className="filter-label">
                {appText("Maximum monthly tuition")}
              </span>
              <select
                aria-label={appText("Maximum monthly tuition")}
                value={maxMonthly}
                onChange={(e) => changeFilter("maxMonthly", e.target.value)}
              >
                <option value="">{appText("Any budget")}</option>
                <option value="3000">{appText("Up to ₹3,000")}</option>
                <option value="5000">{appText("Up to ₹5,000")}</option>
                <option value="8000">{appText("Up to ₹8,000")}</option>
                <option value="12000">{appText("Up to ₹12,000")}</option>
              </select>
            </label>
            <UiButton
              type="button"
              variant="outline"
              className="reset-filters"
              onClick={() => {
                setFilterReset((v) => v + 1);
                setSearchState({ filters: { ...emptyTeacherFilters } });
              }}
            >
              {appText("Reset filters")}{" "}
            </UiButton>
          </fieldset>
          {!interactive && (
            <p role="status">{appText("Preparing teacher search…")}</p>
          )}
          <div className="results-heading">
            <span role="status" ref={resultSummary} tabIndex={-1}>
              {query.isPending
                ? appText("Searching for teachers…")
                : unavailable
                  ? appText("Search unavailable")
                  : appText("{0} teachers to get to know", [teachers.length])}
            </span>
            <small>
              {appText("Synthetic profiles · prices are monthly tuition")}
            </small>
          </div>
          <State
            loading={query.isPending}
            error={unavailable ? query.error : null}
            retry={() => query.refetch()}
          />
          <div
            className="teacher-grid"
            id="teacher-search-results"
            aria-busy={query.isFetching}
          >
            {!unavailable &&
              teachers.map((t) => <TeacherCard key={t.id} teacher={t} />)}
          </div>
          {!unavailable && teachers.length > 0 && (
            <section
              className="search-pagination"
              aria-label={appText("More teacher results")}
            >
              {query.isFetchNextPageError && (
                <Notice error>
                  {appText(
                    "We couldn’t load more teachers. Your current results and filters are kept.",
                  )}
                </Notice>
              )}
              <p role="status">
                {paginationBlocked
                  ? appText(
                      "More results could not be verified. Refresh this search to try again.",
                    )
                  : query.hasNextPage
                    ? appText(
                        "Showing {0} teachers. More matches are available.",
                        [teachers.length],
                      )
                    : appText("All matching teachers are shown.")}
              </p>
              {(query.hasNextPage || paginationBlocked) && (
                <UiButton
                  type="button"
                  variant="outline"
                  disabled={query.isFetching}
                  aria-controls="teacher-search-results"
                  onClick={async () => {
                    if (paginationBlocked) {
                      await query.refetch();
                      return;
                    }
                    const next = await query.fetchNextPage({
                      cancelRefetch: false,
                    });
                    if (!next.isError && !next.data?.pages.at(-1)?.nextCursor)
                      resultSummary.current?.focus();
                  }}
                >
                  {query.isFetching
                    ? appText(
                        query.isFetchingNextPage
                          ? "Loading more teachers…"
                          : "Searching for teachers…",
                      )
                    : paginationBlocked
                      ? appText("Refresh search")
                      : query.isFetchNextPageError
                        ? appText("Try loading more teachers again")
                        : appText("Load more teachers")}
                </UiButton>
              )}
            </section>
          )}
          {teachers.length === 0 && !query.isPending && !query.error && (
            <section
              className="coverage-recovery"
              aria-label={appText("Search recovery")}
            >
              <h2>{appText("No teachers match these filters right now.")}</h2>
              <p>
                {appText(
                  "Try broader filters or let us review your needs. An empty search does not mean your class or subject is outside pilot coverage.",
                )}{" "}
              </p>
              <div className="wizard-actions">
                <UiButton variant="outline" onClick={() => setTab("assisted")}>
                  {appText("Let us search for you")}{" "}
                </UiButton>
                <Link className="inline-link" href="/waitlist">
                  {appText("Need another class, subject or city?")}{" "}
                </Link>
              </div>
            </section>
          )}
          <div className="help-card">
            <div>
              <h3>{appText("Not sure who to choose?")}</h3>
              <p>
                {appText(
                  "Tell us what your child needs. We’ll help you find suitable options.",
                )}{" "}
              </p>
            </div>
            <Link
              href={
                independent
                  ? "/dashboard/enquiries?new=1"
                  : "/onboarding/parent"
              }
              className="button secondary"
            >
              {appText("Help me choose")} <ArrowRight size={17} />
            </Link>
          </div>
        </TabsContent>
      </Tabs>
      <p className="coverage-discovery-link">
        {appText("Looking outside our current pilot coverage?")}{" "}
        <Link className="inline-link" href="/waitlist">
          {appText("Request future coverage")}{" "}
        </Link>
      </p>
    </main>
  );
}
function Profile({ slug }: { slug: string }) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const { session } = useAuth();
  const independent = session?.account.role === "INDEPENDENT_STUDENT";
  const query = useQuery({
    queryKey: ["teacher", slug],
    queryFn: ({ signal }) =>
      api<Teacher>(`/teachers/${encodeURIComponent(slug)}`, { signal }),
    retry: false,
  });
  const t = query.data;
  const profileTitle = useRef<HTMLHeadingElement>(null);
  const recoveryTitle = useRef<HTMLHeadingElement>(null);
  const lastFailure = useRef<{ slug: string; error: Error } | null>(null);
  const failure =
    query.error ||
    (query.isFetching && lastFailure.current?.slug === slug
      ? lastFailure.current.error
      : null);
  useEffect(() => {
    if (query.error && !query.isFetching) {
      lastFailure.current = { slug, error: query.error };
      recoveryTitle.current?.focus();
    } else if (
      query.isSuccess &&
      !query.isFetching &&
      t &&
      lastFailure.current?.slug === slug
    ) {
      lastFailure.current = null;
      profileTitle.current?.focus();
    }
  }, [query.error, query.isFetching, query.isSuccess, t, slug]);
  const missing = failure instanceof ApiError && failure.status === 404;
  return (
    <main className="container section">
      <div className="profile-navigation">
        <Link className="inline-link" href="/teachers">
          {appText("← All teachers")}{" "}
        </Link>
        {t && !failure && (
          <UiButton
            type="button"
            variant="outline"
            disabled={query.isFetching}
            onClick={() => query.refetch({ cancelRefetch: false })}
          >
            {appText(
              query.isFetching ? "Checking profile…" : "Refresh profile",
            )}
          </UiButton>
        )}
      </div>
      <State loading={query.isPending && !failure} />
      {failure && (
        <section
          className="profile-recovery panel"
          aria-labelledby="profile-recovery-title"
          aria-busy={query.isFetching}
        >
          <h1 id="profile-recovery-title" ref={recoveryTitle} tabIndex={-1}>
            {appText(
              missing
                ? "This teacher profile is unavailable."
                : "We couldn’t load this teacher profile.",
            )}
          </h1>
          <p>
            {appText(
              missing
                ? "This profile cannot currently be viewed or enquired about. Check again, explore other teachers or ask us to help you search."
                : "Your account and enquiries are unchanged. Retry this profile or continue your teacher search.",
            )}
          </p>
          <div className="wizard-actions">
            <UiButton
              type="button"
              disabled={query.isFetching}
              onClick={() => query.refetch({ cancelRefetch: false })}
            >
              {appText(
                query.isFetching ? "Checking profile…" : "Retry this profile",
              )}
            </UiButton>
            <Link className="button secondary" href="/teachers">
              {appText("Browse other teachers")}
            </Link>
            <Link className="inline-link" href="/teachers?tab=assisted">
              {appText("Let us search for you")}
            </Link>
          </div>
        </section>
      )}
      {t && !failure && (
        <div className="profile-layout">
          <article className="panel profile-main">
            <div className="avatar large" style={{ background: t.avatarColor }}>
              {initials(t.name)}
            </div>
            <Badge>
              <ShieldCheck size={14} />{" "}
              {appText("Reviewed subject coverage")}{" "}
            </Badge>
            <h1 ref={profileTitle} tabIndex={-1}>
              {t.name}
            </h1>
            <h2 className="profile-headline">{t.headline}</h2>
            <p>{t.bio}</p>
            <h3>{appText("What we can work on together")}</h3>
            <div className="teacher-tags">
              {t.subjects.map((s) => (
                <span key={s}>{appCurriculum(s)}</span>
              ))}

              {t.boards.map((b) => (
                <span key={b}>{b}</span>
              ))}
            </div>
            <TeachingCoverageSummary profile={t} />
            <div className="detail-grid">
              <div>
                <Languages />
                <strong>{appText("Languages")}</strong>
                <p>
                  {t.languages.map((value) => appCurriculum(value)).join(" & ")}
                </p>
              </div>
              <div>
                <GraduationCap />
                <strong>{appText("Experience")}</strong>
                <p>
                  {t.experience} {appText("years of teaching")}
                </p>
              </div>
              <div>
                <MapPin />
                <strong>{appText("Lesson format")}</strong>
                <p>
                  {t.modes.map((value) => appText(pretty(value))).join(" · ")}
                </p>
              </div>
              <div>
                <Phone />
                <strong>{appText("Parent consultations")}</strong>
                <p>
                  {t.consultationOptIn
                    ? appText("Opted in · accepted windows")
                    : appText("Not currently available")}
                </p>
              </div>
            </div>
            <Notice>
              {appText(
                "Coverage review describes subjects and classes checked. It does not guarantee marks or safety. This is a synthetic development profile.",
              )}{" "}
            </Notice>
          </article>
          <aside className="panel booking-panel">
            <span className="eyebrow">
              {appText("A LITTLE GUIDANCE, EVERY WEEK")}
            </span>
            <h2>
              {rupees(t.monthlyPaise, appLocale)}
              <small> {appText("/ month")}</small>
            </h2>
            <TeacherLockIn days={t.lockInDays} />
            <p className="care-help">
              {appText(
                "Teacher-declared preference. Cancellation restrictions are not currently enforced.",
              )}{" "}
            </p>
            {t.demoAvailable && (
              <p className="teacher-demo-badge">
                <Check size={16} aria-hidden="true" />{" "}
                {appText("Demo available · optional before hiring")}{" "}
              </p>
            )}
            <p>
              {appText(
                "Recurring tuition is paid directly to your teacher. Ordinary matching and safety support are free for families.",
              )}{" "}
            </p>
            {independent ? (
              <>
                <Link
                  className="button"
                  href={`/dashboard/enquiries?new=1&teacher=${t.id}&profile=${encodeURIComponent(t.slug)}`}
                >
                  {appText("Enquire about this teacher")}{" "}
                  <ArrowUpRight size={18} />
                </Link>
                <p className="care-help">
                  {appText(
                    "Your teacher interest is recorded for staff review. It does not reserve, hire or charge you.",
                  )}{" "}
                </p>
              </>
            ) : (
              <>
                <Link
                  className="button"
                  href={`${session?.account.role === "STUDENT" ? "/dashboard/learning-choices?new=1&" : "/onboarding/parent?"}teacher=${t.id}&profile=${encodeURIComponent(t.slug)}`}
                >
                  {appText("Enquire about this teacher")}{" "}
                  <ArrowUpRight size={18} />
                </Link>
                <p className="care-help">
                  {appText(
                    "An enquiry starts a conversation about fit and terms. It does not hire the teacher or charge you.",
                  )}{" "}
                </p>
                <div className="subtle-line">
                  <ShieldCheck size={16} />{" "}
                  {appText("Guardian-managed enquiry")}{" "}
                </div>
              </>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
function Login() {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const searchParams = useSearchParams();
  const { setSession, hindi, setHindi } = useAuth(),
    router = useRouter(),
    client = useQueryClient();
  const query = useQuery({
    queryKey: ["dev-accounts"],
    queryFn: () => api<Account[]>("/dev/accounts"),
    retry: false,
  });
  const [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  function signedIn(session: Session) {
    client.clear();
    setSession(session);
    const next = searchParams.get("next");
    router.push(
      next &&
        (/^\/onboarding\/(parent|guardian|teacher|student|independent-student)(?:\?|$)/.test(
          next,
        ) ||
          (session.account.role === "GUARDIAN" &&
            /^\/revision(?:\?[^#]*)?$/.test(next)))
        ? next
        : session.account.role === "GUARDIAN" && !session.account.verified
          ? "/onboarding/guardian"
          : "/dashboard",
    );
  }
  async function login(id: string) {
    setBusy(id);
    setError("");
    try {
      const session = await api<Session>("/dev/session", {
        method: "POST",
        body: { accountId: id },
      });
      signedIn(session);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <main className="container auth-section" lang={hindi ? "hi" : "en"}>
      <EmailLogin
        onSignedIn={signedIn}
        hindi={hindi}
        onLanguageChange={setHindi}
      />
      <p className="independent-signup-link">
        <Link href="/onboarding/independent-student" className="inline-link">
          {hindi
            ? "अपनी पढ़ाई सँभालते हैं? स्वतंत्र विद्यार्थी के रूप में खाता बनाएँ (18+)"
            : appText(
                "Managing your own learning? Sign up as an independent student (18+)",
              )}
        </Link>
      </p>
      {!!query.data?.length && (
        <details className="auth-demo-accounts">
          <summary>
            {hindi ? "डेवलपमेंट खाते" : appText("Development accounts")}
          </summary>
          <p>
            {hindi
              ? "नमूना खातों से प्रीव्यू देखें। लाइव सेवा में ये शॉर्टकट उपलब्ध नहीं होंगे।"
              : appText(
                  "Explore the preview with synthetic accounts. These shortcuts are unavailable in live mode.",
                )}
          </p>
          {error && <Notice error>{appError(error)}</Notice>}
          <div className="account-list">
            {query.data?.map((a) => (
              <SharedButton
                data-legacy-action=""
                variant="ghost"
                className="account-choice"
                key={a.id}
                onClick={() => login(a.id)}
                disabled={!!busy}
              >
                <span className="account-icon">
                  {a.role === "STUDENT" ? (
                    <GraduationCap />
                  ) : a.role === "TEACHER" ? (
                    <BookOpen />
                  ) : a.role === "ADMIN" ? (
                    <Settings />
                  ) : (
                    <Users />
                  )}
                </span>
                <span>
                  <strong>{a.name}</strong>
                  <small>
                    {appText(pretty(a.role))}
                    {a.role === "GUARDIAN" && !a.verified
                      ? appText(" · verification pending")
                      : ""}
                  </small>
                </span>
                {busy === a.id ? (
                  <LoaderCircle className="spin" />
                ) : (
                  <ArrowRight size={20} />
                )}
              </SharedButton>
            ))}
          </div>
        </details>
      )}
    </main>
  );
}
function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  return (
    <label className="field">
      <span>{appText(label)}</span>
      {children}
      {error && <small className="field-error">{appError(error)}</small>}
    </label>
  );
}
function IntakeForm() {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const { session, setSession, loading } = useAuth();
  if (loading)
    return (
      <main className="container section">
        <p role="status">{appText("Loading your account…")}</p>
      </main>
    );
  if (!session) return <LoginPrompt />;

  if (session.account.role !== "GUARDIAN")
    return (
      <main className="container narrow section">
        <Notice error>
          {appText("Use a guardian account to create a tuition request.")}{" "}
        </Notice>
        <Link className="button secondary" href="/teachers">
          {appText("Browse teachers")}{" "}
        </Link>
      </main>
    );
  return <GuardianOnboarding session={session} onSessionChange={setSession} />;
}
function LoginPrompt() {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const path = usePathname();
  const searchParams = useSearchParams();
  const next = path + (searchParams.size ? `?${searchParams}` : "");
  return (
    <main className="container narrow section">
      <PageTitle
        eyebrow={appText("YOUR FAMILY, YOUR SPACE")}
        title={appText("Sign in to continue.")}
        subtitle={appText(
          "Private learning journeys are available only to the right account.",
        )}
      />
      <Link className="button" href={`/login?next=${encodeURIComponent(next)}`}>
        {appText("Sign in with email")} <ArrowRight size={18} />
      </Link>
    </main>
  );
}
function TeacherOnboarding() {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const { session, setSession, loading } = useAuth();
  if (loading) return <State loading />;
  if (!session) return <LoginPrompt />;
  if (!["GUARDIAN", "TEACHER"].includes(session.account.role))
    return (
      <main className="container narrow section">
        <h1>{appText("A teacher account is required.")}</h1>
        <p>
          {appText(
            "Sign in with your own adult account to apply. Student accounts cannot submit teacher applications.",
          )}{" "}
        </p>
        <Link className="button" href="/dashboard">
          {appText("Return to dashboard")}{" "}
        </Link>
      </main>
    );
  return <TeacherSetup session={session} onSessionChange={setSession} />;
}
function GuardianVerificationPage() {
  const { session, setSession, loading } = useAuth();
  const { appText } = useAppTranslation();
  if (loading) return <State loading />;
  if (!session) return <LoginPrompt />;
  return (
    <main className="container section">
      <PageTitle
        eyebrow={appText("Family access")}
        title={appText("Guardian verification")}
        subtitle={appText(
          "Confirm the relationship. Keep learning consent separate.",
        )}
      />
      <GuardianVerificationWorkspace
        key={session.account.id}
        session={session}
        onSessionChange={setSession}
      />
    </main>
  );
}
function GuardianSetupPage() {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const { session, setSession, loading } = useAuth();
  if (loading) return <State loading />;
  if (!session) return <LoginPrompt />;
  if (session.account.role !== "GUARDIAN")
    return (
      <main className="container narrow section">
        <h1>{appText("Guardian setup belongs to a guardian account.")}</h1>
        <Link href="/dashboard" className="inline-link">
          {appText("Return to dashboard")}{" "}
        </Link>
      </main>
    );
  return (
    <GuardianSetup
      key={session.account.id}
      session={session}
      onSessionChange={setSession}
    />
  );
}
function LearnerProfilesPage() {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const { session, loading } = useAuth();
  if (loading) return <State loading />;
  if (!session) return <LoginPrompt />;
  if (!["GUARDIAN", "STUDENT"].includes(session.account.role))
    return (
      <main className="container narrow section">
        <h1>
          {appText("Learner profiles belong to guardian and student accounts.")}
        </h1>
        <Link href="/dashboard" className="inline-link">
          {appText("Return to dashboard")}{" "}
        </Link>
      </main>
    );
  return <LearnerProfiles key={session.account.id} session={session} />;
}
function WaitlistPage() {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const { session, loading } = useAuth();
  if (loading) return <State loading />;
  return <WaitlistWorkspace session={session} />;
}
function IndependentStudentPage() {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const { session, setSession, loading, hindi, setHindi } = useAuth(),
    client = useQueryClient(),
    params = useSearchParams();
  if (loading) return <State loading />;
  if (!session)
    return (
      <main className="container auth-section" lang={hindi ? "hi" : "en"}>
        <header className="wizard-title">
          <h1>
            {hindi
              ? "अपना विद्यार्थी खाता बनाएँ"
              : appText("Create your own student account")}
          </h1>
          <p>
            {hindi
              ? "पहले अपने ईमेल की पुष्टि करें। फिर तैयारी, उम्र की घोषणा और पढ़ाई की जानकारी की समीक्षा करें। स्वतंत्र सेटअप फ़िलहाल 18 वर्ष या अधिक के विद्यार्थियों के लिए है।"
              : appText(
                  "Start by verifying your own email. Then review your readiness, age declaration and education details. Independent setup is currently for students aged 18+.",
                )}
          </p>
        </header>
        <EmailLogin
          hindi={hindi}
          onLanguageChange={setHindi}
          onSignedIn={(next) => {
            client.clear();
            setSession(next);
          }}
        />
      </main>
    );
  if (!["GUARDIAN", "INDEPENDENT_STUDENT"].includes(session.account.role))
    return (
      <main className="container narrow section">
        <h1>
          {hindi
            ? "इस खाते का सेटअप पहले से है"
            : appText("This account already has a setup")}
        </h1>
        <p>
          {hindi
            ? "मौजूदा खाते को स्वतंत्र विद्यार्थी खाते में नहीं बदला जा सकता।"
            : appText(
                "An existing managed student, teacher or staff account cannot become an independent student account.",
              )}
        </p>
        <Link
          className="button"
          href={
            session.account.role === "STUDENT"
              ? "/onboarding/student"
              : "/dashboard"
          }
        >
          {hindi ? "अपने खाते पर लौटें" : appText("Return to my account")}
        </Link>
      </main>
    );
  return (
    <IndependentStudentSetup
      key={session.account.id}
      session={session}
      onSessionChange={setSession}
      hindi={hindi}
      onLanguageChange={setHindi}
      editing={params.get("edit") === "1"}
    />
  );
}
function StudentOnboarding() {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const {
    session,
    setSession,
    loading,
    beginStudentSwitch,
    failStudentSwitch,
  } = useAuth();
  if (loading) return <State loading />;
  if (!session) return <LoginPrompt />;
  if (session.account.role === "STUDENT")
    return <StudentWelcome session={session} />;
  if (session.account.role !== "GUARDIAN")
    return (
      <main className="container narrow section">
        <h1>{appText("A guardian must authorize student access.")}</h1>
        <Link href="/dashboard" className="button">
          {appText("Open dashboard")}{" "}
        </Link>
      </main>
    );
  return (
    <StudentActivation
      session={session}
      onSessionChange={setSession}
      onSwitchStart={beginStudentSwitch}
      onSwitchFailure={failStudentSwitch}
    />
  );
}
function Revision() {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const { session } = useAuth();
  const params = useSearchParams();
  return (
    <RevisionBooking session={session} initialTeacher={params.get("teacher")} />
  );
}

function DashboardShell({
  children,
  tab,
}: {
  children: ReactNode;
  tab: string;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const { session } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const role = session?.account.role;
  const links: [string, string, LucideIcon][] = [
    ["/dashboard", "Overview", LayoutDashboard],
    ["/dashboard/notifications", "Notifications", ShieldCheck],
    ...(["ADMIN", "OPERATOR"].includes(role || "") ? [["/dashboard/service-followups", "Service follow-ups", LifeBuoy] as [string,string,LucideIcon]] : []),
    ...(["ADMIN", "OPERATOR"].includes(role || "")
      ? [
          [
            "/dashboard/email-delivery",
            "Email delivery & recovery",
            ShieldCheck,
          ] as [string, string, LucideIcon],
        ]
      : []),
    ...(["ADMIN", "OPERATOR"].includes(role || "")
      ? [
          [
            "/dashboard/minimum-tuition",
            "Minimum-tuition assessments",
            ShieldCheck,
          ] as [string, string, LucideIcon],
        ]
      : []),
    ["/teachers", "Find a teacher", Search],
    ...(["GUARDIAN", "STUDENT", "ADMIN", "REVIEWER"].includes(role || "")
      ? [
          ["/guardian-verification", "Guardian verification", ShieldCheck] as [
            string,
            string,
            LucideIcon,
          ],
        ]
      : []),
    ...(["GUARDIAN", "STUDENT"].includes(role || "")
      ? [
          [
            "/dashboard/learning-management",
            "Who manages learning?",
            Users,
          ] as [string, string, LucideIcon],
          ["/dashboard/learners", "Education profiles", GraduationCap] as [
            string,
            string,
            LucideIcon,
          ],
        ]
      : []),
    ...(role === "STUDENT"
      ? [
          ["/dashboard/learning-choices", "My teacher choices", Users] as [
            string,
            string,
            LucideIcon,
          ],
          ["/onboarding/student", "Learning preferences", Settings] as [
            string,
            string,
            LucideIcon,
          ],
        ]
      : []),
    ...(role === "GUARDIAN"
      ? ([
          ["/onboarding/guardian", "Guardian setup", ShieldCheck],
          ["/dashboard/requests", "Enquiries & teacher choices", Users],
          ["/dashboard/arrangements", "Arrangements & replacement", RefreshCw],
          ["/dashboard/family", "Learners & access", ShieldCheck],
          ["/dashboard/supported-students", "Supported students", Users],
          ["/dashboard/privacy", "Privacy & data", ShieldCheck],
        ] as [string, string, LucideIcon][])
      : role === "TEACHER"
        ? ([
            ["/dashboard/enquiries", "Assigned enquiries", ClipboardList],
            [
              "/dashboard/student-opportunities",
              "Independent students",
              GraduationCap,
            ],
            ["/dashboard/student-arrangements", "Student arrangements", Users],
            ["/onboarding/teacher", "Profile & evidence", Settings],
            ["/dashboard/privacy", "Privacy & data", ShieldCheck],
          ] as [string, string, LucideIcon][])
        : role === "ADMIN"
          ? ([["/dashboard/admin", "Control console", Settings]] as [
              string,
              string,
              LucideIcon,
            ][])
          : []),
    ...(["ADMIN", "REVIEWER"].includes(role || "")
      ? [
          ["/dashboard/review", "Teacher screening", ShieldCheck] as [
            string,
            string,
            LucideIcon,
          ],
        ]
      : []),
    ...(["ADMIN", "OPERATOR"].includes(role || "")
      ? [
          ["/dashboard/matching", "Matching review", Users] as [
            string,
            string,
            LucideIcon,
          ],
          [
            "/dashboard/student-enquiries",
            "Student enquiries",
            GraduationCap,
          ] as [string, string, LucideIcon],
        ]
      : []),
    ...(["ADMIN", "OPERATOR"].includes(role || "")
      ? [
          ["/dashboard/support", "Support & disputes", LifeBuoy] as [
            string,
            string,
            LucideIcon,
          ],
        ]
      : []),
    ...(["ADMIN", "FINANCE"].includes(role || "")
      ? [
          ["/dashboard/finance", "Finance & records", Landmark] as [
            string,
            string,
            LucideIcon,
          ],
        ]
      : []),
    ...(["ADMIN", "OPERATOR", "FINANCE"].includes(role || "")
      ? [
          ["/dashboard/reports", "Reports & cohorts", LayoutDashboard] as [
            string,
            string,
            LucideIcon,
          ],
        ]
      : []),
    ["/support", "Help & safety", LifeBuoy],
    ...(role && staffRole(role)
      ? [
          ["/dashboard/security", "Authenticator & recovery", ShieldCheck] as [
            string,
            string,
            LucideIcon,
          ],
        ]
      : []),
  ];
  return (
    <main className="container dashboard-layout">
      <aside className="dashboard-sidebar">
        <span className="eyebrow">{appText("YOUR TEACHER CONNECTIONS")}</span>
        <div className="sidebar-person">
          <span className="avatar small-avatar">
            {initials(session?.account.name || "You")}
          </span>
          <div>
            <strong>{session?.account.name.split(" · ")[0]}</strong>
            <small>{appText(pretty(role || "account"))}</small>
          </div>
        </div>
        <nav
          className="dashboard-desktop-nav"
          aria-label={appText("Dashboard")}
        >
          {links.map(([href, label, Icon]) => (
            <Link
              key={href}
              href={href}
              className={tab === href ? "active" : ""}
              aria-current={tab === href ? "page" : undefined}
            >
              <Icon size={18} />
              {appText(label)}
            </Link>
          ))}
        </nav>
        <div className="dashboard-mobile-nav">
          <UiButton
            variant="ghost"
            className="dashboard-mobile-trigger"
            aria-label={appText("Dashboard menu: {0}", [
              links.find(([href]) => href === tab)?.[1] || appText("Overview"),
            ])}
            aria-expanded={mobileNavOpen}
            aria-controls="dashboard-mobile-sections"
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
          >
            <span>
              <small>{appText("Dashboard menu")}</small>
              <strong>
                {appText(
                  links.find(([href]) => href === tab)?.[1] ||
                    appText("Overview"),
                )}
              </strong>
            </span>
            <ChevronDown size={20} aria-hidden="true" />
          </UiButton>
          <nav
            id="dashboard-mobile-sections"
            aria-label={appText("Dashboard sections")}
            hidden={!mobileNavOpen}
          >
            {links.map(([href, label, Icon]) => (
              <Link
                key={href}
                href={href}
                className={tab === href ? "active" : ""}
                aria-current={tab === href ? "page" : undefined}
                onClick={() => setMobileNavOpen(false)}
              >
                <Icon size={18} />
                {appText(label)}
              </Link>
            ))}
          </nav>
        </div>
        <div className="sidebar-tip">
          <Heart size={21} />
          <p>
            {appText("A good fit starts")} <br />
            {appText("with a clear conversation.")}{" "}
          </p>
        </div>
      </aside>
      <section className="dashboard-content">{children}</section>
    </main>
  );
}
function DashboardPage({ tab }: { tab: string }) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const {
      session,
      setSession,
      loading,
      beginStudentSwitch,
      failStudentSwitch,
      hindi,
      setHindi,
    } = useAuth(),
    client = useQueryClient();
  const query = useQuery({
    queryKey: ["dashboard", session?.account.id],
    queryFn: ({ signal }) => api<Dashboard>("/dashboard", { signal }),
    enabled:
      !!session &&
      session.account.role !== "INDEPENDENT_STUDENT" &&
      ![
        "/dashboard/student-enquiries",
        "/dashboard/student-arrangements",
        "/dashboard/student-opportunities",
        "/dashboard/supported-students",
        "/dashboard/student-supporters",
        "/dashboard/student-devices",
        "/dashboard/learning-management",
        "/dashboard/learning-choices",
        "/dashboard/minimum-tuition",
        "/dashboard/service-followups",
        "/dashboard/notifications",
        "/dashboard/email-delivery",
      ].includes(tab) &&
      !(
        ["GUARDIAN", "STUDENT", "TEACHER", "ADMIN"].includes(
          session.account.role,
        ) &&
        (tab === "/dashboard" || tab === "/dashboard/enquiries")
      ),
  });
  const [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function act(path: string, body: unknown = {}, idempotent = true) {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const result = await api(path, {
        method: "POST",
        body,
        csrf: session?.csrfToken,
        ...(idempotent ? { key: crypto.randomUUID() } : {}),
      });
      setMessage("Saved. Your dashboard is up to date.");
      await client.invalidateQueries({ queryKey: ["dashboard"] });
      await client.invalidateQueries({ queryKey: ["demos"] });
      return result;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <State loading />;
  if (!session) return <LoginPrompt />;
  if (tab === "/dashboard/service-followups") return <DashboardShell tab={tab}><ServiceFollowups session={session}/></DashboardShell>;
  if (["/dashboard/notifications", "/dashboard/email-delivery"].includes(tab))
    return (
      <DashboardShell tab={tab}>
        <NotificationWorkspace
          session={session}
          staff={tab === "/dashboard/email-delivery"}
        />
      </DashboardShell>
    );
  if (tab === "/dashboard/minimum-tuition")
    return (
      <DashboardShell tab={tab}>
        <TuitionMinimumWorkspace session={session} />
      </DashboardShell>
    );
  if (
    tab === "/dashboard/learning-management" ||
    tab === "/dashboard/learning-choices"
  )
    return (
      <DashboardShell tab={tab}>
        {tab === "/dashboard/learning-management" &&
        ["GUARDIAN", "STUDENT"].includes(session.account.role) ? (
          <LearningManagementWorkspace session={session} />
        ) : tab === "/dashboard/learning-choices" &&
          session.account.role === "STUDENT" ? (
          <ManagedStudentLearning session={session} />
        ) : (
          <Notice error>
            {appText("This page requires the appropriate family account.")}
          </Notice>
        )}
      </DashboardShell>
    );
  if (
    session.account.role !== "INDEPENDENT_STUDENT" &&
    [
      "/dashboard/student-arrangements",
      "/dashboard/student-opportunities",
      "/dashboard/supported-students",
    ].includes(tab)
  )
    return (
      <DashboardShell tab={tab}>
        {tab === "/dashboard/student-arrangements" ? (
          <StudentArrangements session={session} hindi={hindi} />
        ) : tab === "/dashboard/student-opportunities" ? (
          <StudentOpportunities session={session} hindi={hindi} />
        ) : (
          <StudentSupporters session={session} hindi={hindi} />
        )}
      </DashboardShell>
    );
  if (
    tab === "/dashboard/student-enquiries" &&
    session.account.role !== "INDEPENDENT_STUDENT"
  )
    return (
      <DashboardShell tab={tab}>
        <StudentEnquiries session={session} hindi={hindi} />
      </DashboardShell>
    );
  if (session.account.role === "INDEPENDENT_STUDENT")
    return (
      <main
        className="container section independent-student"
        lang={hindi ? "hi" : "en"}
      >
        <nav
          className="independent-navigation"
          aria-label={hindi ? "विद्यार्थी खाता" : appText("Student account")}
        >
          <Link
            className="inline-link"
            href="/dashboard"
            aria-current={tab === "/dashboard" ? "page" : undefined}
          >
            {hindi ? "मेरी पढ़ाई" : appText("My learning")}
          </Link>
          <Link className="inline-link" href="/teachers">
            {hindi ? "शिक्षक खोजें" : appText("Find a teacher")}
          </Link>
          <Link
            className="inline-link"
            href="/dashboard/enquiries"
            aria-current={tab === "/dashboard/enquiries" ? "page" : undefined}
          >
            {hindi ? "मेरी पूछताछ" : appText("My enquiries")}
          </Link>
          {[
            [
              "/dashboard/student-arrangements",
              hindi ? "नियुक्ति और व्यवस्थाएँ" : "Hiring & arrangements",
            ],
            [
              "/dashboard/student-supporters",
              hindi ? "पढ़ाई में मदद" : "Learning support",
            ],
            [
              "/dashboard/student-devices",
              hindi ? "उपकरण और वापसी" : "Devices & recovery",
            ],
            ["/support", hindi ? "सहायता" : "Help"],
          ].map(([href, label]) => (
            <Link
              key={href}
              className="inline-link"
              href={href}
              aria-current={tab === href ? "page" : undefined}
            >
              {appText(label)}
            </Link>
          ))}
          <Link
            className="inline-link"
            href="/dashboard/privacy"
            aria-current={tab === "/dashboard/privacy" ? "page" : undefined}
          >
            {hindi ? "खाते की गोपनीयता" : appText("Account privacy")}
          </Link>
        </nav>
        {tab === "/dashboard/enquiries" ||
        tab === "/dashboard/student-enquiries" ? (
          <StudentEnquiries
            key={session.account.id}
            session={session}
            hindi={hindi}
          />
        ) : tab === "/dashboard/student-arrangements" ? (
          <StudentArrangements session={session} hindi={hindi} />
        ) : tab === "/dashboard/student-supporters" ? (
          <StudentSupporters session={session} hindi={hindi} />
        ) : tab === "/dashboard/student-devices" ? (
          <StudentDevices
            session={session}
            hindi={hindi}
            onSignedOut={() => {
              client.clear();
              setSession(null);
              window.location.assign("/login");
            }}
          />
        ) : tab === "/dashboard/privacy" ? (
          <PrivacyWorkspace
            session={session}
            hindi={hindi}
            onLanguageChange={setHindi}
          />
        ) : (
          <IndependentStudentHome session={session} hindi={hindi} />
        )}
      </main>
    );
  if (
    ["GUARDIAN", "STUDENT", "TEACHER", "ADMIN"].includes(
      session.account.role,
    ) &&
    (tab === "/dashboard" || tab === "/dashboard/enquiries")
  )
    return (
      <DashboardShell tab={tab}>
        <PageTitle
          eyebrow={appText("")}
          title={appText("Hello, {0}.", [session.account.name.split(" · ")[0]])}
          subtitle={appText(
            "Your teacher connections, with a clear next step.",
          )}
        />
        <HiringOverview
          key={`${session.account.id}:${session.account.role}`}
          session={session}
        />
      </DashboardShell>
    );
  const d = query.data;
  return (
    <DashboardShell tab={tab}>
      <State
        loading={query.isPending}
        error={query.error}
        retry={() => query.refetch()}
      />
      {d && (
        <>
          <PageTitle
            lang={tab.endsWith("privacy") ? (hindi ? "hi" : "en") : undefined}
            eyebrow={
              session.account.role === "ADMIN"
                ? appText("OPERATIONS")
                : ["GUARDIAN", "STUDENT", "TEACHER"].includes(
                      session.account.role,
                    )
                  ? ""
                  : appText("A LITTLE PROGRESS, EVERY DAY")
            }
            title={
              tab === "/dashboard"
                ? appText("Hello, {0}.", [session.account.name.split(" · ")[0]])
                : tab.endsWith("lessons")
                  ? appText("Every class, accounted for.")
                  : tab.endsWith("reports")
                    ? appText("Progress, backed by records.")
                    : tab.endsWith("finance")
                      ? appText("Financial records, with their evidence.")
                      : tab.endsWith("support")
                        ? appText("Support, with a clear next step.")
                        : tab.endsWith("matching")
                          ? appText("A considered shortlist, ready for review.")
                          : tab.endsWith("review")
                            ? appText("A careful review, recorded.")
                            : tab.endsWith("privacy")
                              ? hindi
                                ? "आपकी जानकारी और गोपनीयता।"
                                : appText("Your information and privacy.")
                              : tab.endsWith("arrangements")
                                ? appText("A clear next step for your tuition.")
                                : tab.endsWith("requests")
                                  ? appText("Your path to a good fit.")
                                  : tab.endsWith("family")
                                    ? appText("Your learners, your control.")
                                    : tab.endsWith("bookings")
                                      ? appText(
                                          "A little clarity, on the calendar.",
                                        )
                                      : tab.endsWith("pro")
                                        ? appText("A conversation can help.")
                                        : tab.endsWith("notes")
                                          ? session.account.role === "TEACHER"
                                            ? appText(
                                                "Learning context, shared with you.",
                                              )
                                            : appText(
                                                "Your thoughts, kept private.",
                                              )
                                          : appText(
                                              "A thoughtful control room.",
                                            )
            }
            subtitle={
              tab === "/dashboard"
                ? appText(
                    "Your recorded activity, current assignments and next steps.",
                  )
                : tab.endsWith("family")
                  ? appText(
                      "Manage student devices and the permissions you grant.",
                    )
                  : tab.endsWith("requests")
                    ? appText(
                        "Review teacher options, demo progress and your tuition agreement.",
                      )
                    : tab.endsWith("privacy")
                      ? hindi
                        ? "हर अनुरोध की समीक्षा करें और मौजूदा स्थिति देखें।"
                        : appText(
                            "Review each request and follow its current status.",
                          )
                      : tab.endsWith("lessons")
                        ? appText(
                            "Your weekly timetable, booked lessons and attendance records.",
                          )
                        : appText("All changes are confirmed by the backend.")
            }
          />
          {error && <Notice error>{appError(error)}</Notice>}
          {message && <Notice>{appText(message)}</Notice>}
          {tab === "/dashboard/history" &&
            (["GUARDIAN", "STUDENT", "TEACHER"].includes(
              session.account.role,
            ) ? (
              <RoleOverview
                key={`${session.account.id}:${session.account.role}`}
                dashboard={d}
                session={session}
              />
            ) : (
              <>
                <div className="stats-grid">
                  {(d.role === "ADMIN"
                    ? [
                        ["Open requests", d.metrics.requests],
                        ["Pending teachers", d.metrics.pendingTeachers],
                        ["Active placements", d.metrics.activePlacements],
                        ["Open support cases", d.metrics.openCases],
                      ]
                    : d.role === "TEACHER"
                      ? [
                          ["Completed lessons", d.metrics.completedLessons],
                          ["Students taught", d.metrics.uniqueStudentsTaught],
                          ["Active students", d.metrics.activeStudents],
                          ["Attendance pending", d.metrics.pendingAttendance],
                        ]
                      : [
                          ["Classes taken", d.metrics.classesTaken],
                          ["Completed lessons", d.metrics.completedLessons],
                          ["Disputed records", d.metrics.disputed],
                          ["Attendance pending", d.metrics.pendingAttendance],
                        ]
                  ).map(([label, value], i) => (
                    <div className="stat" key={label}>
                      <span>{appText(label)}</span>
                      <strong>{value}</strong>
                      <small>
                        {i === 0
                          ? appText("Rolling 30 days")
                          : appText("Recorded activity")}
                      </small>
                    </div>
                  ))}
                </div>
                {d.role === "ADMIN" ? (
                  <AdminPanel dashboard={d} act={act} />
                ) : (
                  <>
                    <div className="dashboard-banner">
                      <div>
                        <Badge>
                          <Sparkles size={13} />{" "}
                          {appText("A little support goes a long way")}{" "}
                        </Badge>
                        <h2>
                          {d.role === "TEACHER"
                            ? appText("There’s a learner on the other side.")
                            : appText("Keep their curiosity moving.")}
                        </h2>
                        <p>
                          {d.role === "STUDENT"
                            ? appText(
                                "Your next class and your recorded progress are right here.",
                              )
                            : appText(
                                "Your teachers, upcoming classes and next steps, all in one place.",
                              )}
                        </p>
                      </div>
                      <BookOpen size={64} strokeWidth={1} />
                    </div>
                    <div className="dashboard-columns">
                      <div className="panel">
                        <div className="panel-title">
                          <h3>{appText("Coming up next")}</h3>
                          <Link
                            href="/dashboard/lessons"
                            className="inline-link"
                          >
                            {appText("View all")} <ArrowUpRight size={15} />
                          </Link>
                        </div>
                        <LessonList
                          lessons={
                            d.lessons
                              ?.filter((l) => l.status === "SCHEDULED")
                              .sort((a, b) =>
                                a.startsAt.localeCompare(b.startsAt),
                              )
                              .slice(0, 3) || []
                          }
                          children={d.children}
                        />
                      </div>
                      <div className="panel">
                        <h3>
                          {d.role === "TEACHER"
                            ? appText("Your teaching profile")
                            : appText("Your learning team")}
                        </h3>
                        {d.profile ? (
                          <>
                            <div className="team-member">
                              <div
                                className="avatar"
                                style={{ background: d.profile.avatarColor }}
                              >
                                {initials(d.profile.name)}
                              </div>
                              <div>
                                <strong>{d.profile.name}</strong>
                                <small>
                                  {appText(
                                    pretty(d.profile.status || "pending"),
                                  )}
                                </small>
                              </div>
                            </div>
                            <p>
                              {appText(
                                "Approval requires completed capability checks; material changes must reopen review.",
                              )}{" "}
                            </p>
                          </>
                        ) : d.teachers?.length ? (
                          d.teachers.map((t) => (
                            <div className="team-member" key={t.id}>
                              <div
                                className="avatar"
                                style={{ background: t.avatarColor }}
                              >
                                {initials(t.name)}
                              </div>
                              <div>
                                <strong>{t.name}</strong>
                                <small>
                                  {t.subjects
                                    .map((value) => appCurriculum(value))
                                    .join(" & ")}
                                </small>
                                <Link
                                  href={`/teachers/${t.slug}`}
                                  className="inline-link"
                                >
                                  {appText("View profile →")}{" "}
                                </Link>
                              </div>
                            </div>
                          ))
                        ) : (
                          <Empty>
                            {appText(
                              "No active teacher yet. Your shortlist is the next step.",
                            )}{" "}
                          </Empty>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </>
            ))}
          {tab.endsWith("family") &&
            (session.account.role === "GUARDIAN" ? (
              <FamilyAccess
                session={session}
                consentActive={!!d.consent && !d.consent.withdrawnAt}
                onSessionChange={setSession}
                onSwitchStart={beginStudentSwitch}
                onSwitchFailure={failStudentSwitch}
              />
            ) : (
              <section className="panel">
                <h2>{appText("These controls belong to your guardian.")}</h2>
                <p>
                  {appText(
                    "Only your guardian can manage learner consent and student access.",
                  )}{" "}
                </p>
                <Link href="/dashboard" className="inline-link">
                  {appText("Return to your learning space")}{" "}
                </Link>
              </section>
            ))}
          {tab.endsWith("reports") && (
            <ReportsWorkspace
              key={`${session.account.id}:${session.account.role}`}
              session={session}
            />
          )}
          {tab.endsWith("finance") && (
            <FinanceWorkspace
              key={`${session.account.id}:${session.account.role}`}
              session={session}
            />
          )}
          {tab.endsWith("support") && (
            <SupportOperations
              key={`${session.account.id}:${session.account.role}`}
              session={session}
            />
          )}
          {tab.endsWith("matching") && (
            <MatchingWorkspace
              key={`${session.account.id}:${session.account.role}`}
              session={session}
            />
          )}
          {tab.endsWith("review") && (
            <ReviewerWorkspace
              key={`${session.account.id}:${session.account.role}`}
              session={session}
            />
          )}
          {tab.endsWith("privacy") && (
            <PrivacyWorkspace
              key={`${session.account.id}:${session.account.role}`}
              session={session}
              dashboard={d}
              hindi={hindi}
              onLanguageChange={setHindi}
            />
          )}
          {tab.endsWith("arrangements") && (
            <PlacementCare
              key={session.account.id}
              session={session}
              dashboard={d}
            />
          )}
          {tab.endsWith("lessons") && (
            <LearningWorkspace session={session} dashboard={d} />
          )}
          {tab.endsWith("requests") &&
            (session.account.role === "GUARDIAN" ? (
              <TuitionRequests session={session} dashboard={d} />
            ) : (
              <section className="panel">
                <h2>{appText("Tuition choices belong to your guardian.")}</h2>
                <p>
                  {appText(
                    "Only a guardian can review their family’s requests and choose a teacher.",
                  )}{" "}
                </p>
                <Link href="/dashboard" className="inline-link">
                  {appText("Return to your dashboard")}{" "}
                </Link>
              </section>
            ))}
          {tab.endsWith("bookings") && (
            <>
              <DemoJourney
                key={`${session.account.id}:${session.account.role}`}
                session={session}
              />
              <ReservationBookings session={session} dashboard={d} />
              {d.role === "GUARDIAN" && (
                <TuitionTerms session={session} dashboard={d} />
              )}
              {d.role === "TEACHER" && (
                <>
                  <h3>{appText("Assigned opportunities")}</h3>
                  {d.opportunities?.length ? (
                    d.opportunities.map((c) => (
                      <div className="panel" key={c.id}>
                        <Badge>{appText(pretty(c.response))}</Badge>
                        <p>{appText(c.reasons.join(" · "))}</p>
                        {c.response === "PENDING" && (
                          <div className="action-row">
                            <Button
                              onClick={() =>
                                void act(
                                  `/candidates/${c.id}/responses`,
                                  {
                                    response: "ACCEPTED",
                                    expectedVersion: c.version,
                                  },
                                  true,
                                )
                              }
                            >
                              {appText("Accept opportunity")}{" "}
                            </Button>
                            <Button
                              secondary
                              onClick={() =>
                                void act(
                                  `/candidates/${c.id}/responses`,
                                  {
                                    response: "DECLINED",
                                    expectedVersion: c.version,
                                  },
                                  true,
                                )
                              }
                            >
                              {appText("Decline")}{" "}
                            </Button>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <Empty>{appText("No assigned opportunities yet.")}</Empty>
                  )}
                  <TuitionTerms session={session} dashboard={d} />
                  <PlacementInvoices session={session} dashboard={d} />
                </>
              )}
            </>
          )}
          {tab.endsWith("pro") && <Pro dashboard={d} act={act} busy={busy} />}
          {tab.endsWith("notes") && (
            <NotesWorkspace
              key={session.account.id}
              session={session}
              dashboard={d}
            />
          )}
          {tab.endsWith("admin") && (
            <AdminConsole
              key={`${session.account.id}:${session.account.role}`}
              session={session}
            />
          )}
        </>
      )}
    </DashboardShell>
  );
}
type Act = (
  path: string,
  body?: unknown,
  idempotent?: boolean,
) => Promise<unknown>;
function LessonList({
  lessons,
  children,
}: {
  lessons: Lesson[];
  children?: Child[];
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  if (!lessons.length)
    return <Empty>{appText("No classes in this view yet.")}</Empty>;
  return (
    <div className="lesson-list">
      {lessons.map((l) => (
        <div className="lesson-item" key={l.id}>
          <div className="lesson-date">
            <strong>
              {new Date(l.startsAt).toLocaleDateString(appLocale, {
                day: "numeric",
                timeZone: "Asia/Kolkata",
              })}
            </strong>
            <span>
              {new Date(l.startsAt).toLocaleDateString(appLocale, {
                month: "short",
                timeZone: "Asia/Kolkata",
              })}
            </span>
          </div>
          <div className="lesson-info">
            <strong>
              {appCurriculum(l.subject)} · {appText(pretty(l.kind))}
            </strong>
            <small>
              {children?.find((c) => c.id === l.childId)?.alias ||
                appText("Assigned learner")}{" "}
              · {date(l.startsAt, undefined, appLocale)}
            </small>
            <span className={`attendance ${l.disputed ? "disputed" : ""}`}>
              {l.disputed
                ? appText("Disputed · excluded from totals")
                : `${appText(pretty(l.status))} · ${appText(pretty(l.attendance))}`}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
function Pro({
  dashboard: d,
  act,
  busy,
}: {
  dashboard: Dashboard;
  act: Act;
  busy: boolean;
}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const m = d.membership;
  return (
    <>
      <div className="pro-card">
        <div>
          <Badge>
            <Sparkles size={13} />{" "}
            {appText("Parent Pro · synthetic prepaid pass")}{" "}
          </Badge>
          <h2>
            {appText("Stay in the loop.")} <br />
            <em>{appText("Talk it through.")}</em>
          </h2>
          <p>
            {appText(
              "Consult your child’s active teacher in an accepted window.",
            )}{" "}
            <br />
            {appText("No personal numbers. No 24/7 promise.")}{" "}
          </p>
        </div>
        <div className="pro-allowance">
          <strong>
            {m ? m.allowance - m.used - m.reserved : 0}
            <small> / {m?.allowance || 4}</small>
          </strong>
          <span>{appText("consultations available")}</span>
          <small>
            {m
              ? appText("Expires {0}", [date(m.periodEnd, false, appLocale)])
              : appText("No active membership")}
          </small>
        </div>
      </div>
      <Notice>
        {appText(
          "Pro never changes matching rank or safety support. Live calling and plan purchase are unavailable until transport, price and terms are approved. Demo consultations use 5pm–8pm IST windows.",
        )}{" "}
      </Notice>
      {m && m.status === "ACTIVE" ? (
        <form
          className="panel form-panel"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void act("/pro/calls", {
              placementId: f.get("placement"),
              startsAt: new Date(`${f.get("time")}+05:30`).toISOString(),
            });
          }}
        >
          <h3>{appText("Request a teacher callback")}</h3>
          <Field label={appText("Active teacher assignment")}>
            <select name="placement" required>
              {d.placements
                ?.filter((p) => p.status === "ACTIVE")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {d.teachers?.find((t) => t.id === p.teacherId)?.name ||
                      appText("Assigned teacher")}
                  </option>
                ))}
            </select>
          </Field>
          <Field label={appText("Preferred callback (IST)")}>
            <SharedInput type="datetime-local" name="time" required />
          </Field>
          <Button type="submit" disabled={busy}>
            {appText("Request consultation")} <Phone size={17} />
          </Button>
        </form>
      ) : (
        <Empty>
          {appText(
            "Free or expired memberships cannot start consultations. Ordinary support is always available.",
          )}{" "}
        </Empty>
      )}
      {d.calls?.map((c) => (
        <div className="panel panel-title" key={c.id}>
          <span>
            {appText("Callback ·")} {date(c.startsAt, undefined, appLocale)}
          </span>
          <Badge>{appText(pretty(c.status))}</Badge>
        </div>
      ))}
    </>
  );
}
function AdminPanel({ dashboard: d }: { dashboard: Dashboard; act: Act }) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  return (
    <section className="panel">
      <h3>{appText("Administrator workspaces")}</h3>
      <p>
        {appText(
          "Review controls, private queues and recorded outcomes in the dedicated console.",
        )}{" "}
      </p>
      <Link href="/dashboard/admin" className="inline-link">
        {appText("Open administrator console")}{" "}
      </Link>
    </section>
  );
}

function Support() {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const { session, hindi, setHindi } = useAuth();
  return (
    <SupportWorkspace
      key={
        session ? `${session.account.id}:${session.account.role}` : "anonymous"
      }
      session={session}
      hindi={hindi}
      onLanguageChange={setHindi}
    />
  );
}
function Routes() {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const path = usePathname();
  return path === "/" ? (
    <Home />
  ) : path === "/waitlist" ? (
    <WaitlistPage />
  ) : path === "/teachers" ? (
    <Teachers />
  ) : path.startsWith("/teachers/") ? (
    <Profile slug={path.split("/")[2]} />
  ) : path === "/login" ? (
    <Login />
  ) : path === "/dashboard/learners" ? (
    <LearnerProfilesPage />
  ) : path === "/guardian-verification" ? (
    <GuardianVerificationPage />
  ) : path === "/onboarding/guardian" ? (
    <GuardianSetupPage />
  ) : path === "/onboarding/parent" ? (
    <IntakeForm />
  ) : path === "/onboarding/teacher" ? (
    <TeacherOnboarding />
  ) : path === "/onboarding/independent-student" ? (
    <IndependentStudentPage />
  ) : path === "/onboarding/student" ? (
    <StudentOnboarding />
  ) : path === "/revision" ? (
    <Revision />
  ) : path.startsWith("/dashboard") ? (
    <DashboardPage tab={path} />
  ) : path === "/support" ? (
    <Support />
  ) : (
    <main className="container section">
      <PageTitle
        eyebrow={appText("NOT FOUND")}
        title={appText("This page isn’t here yet.")}
        subtitle={appText("Head back to discover your kind of teacher.")}
      />
      <Link className="button" href="/">
        {appText("Go home")}{" "}
      </Link>
    </main>
  );
}
function AppContent() {
  const initialHindi = useContext(LanguageContext);
  const [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    [hindi, setHindiState] = useState(initialHindi);
  const { appText, appError, appLocale, appCurriculum } =
    useAppTranslation(hindi);
  useEffect(() => {
    try {
      const stored = localStorage.getItem("bcs.interface-language");
      if (stored === "hi" || stored === "en") {
        setHindiState(stored === "hi");
        rememberLanguage(stored === "hi");
      }
    } catch {
      /* Browser storage is optional. */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = hindi ? "hi" : "en";
    document.title = translateText(
      hindi,
      "Better Call Sir · Find your kind of teacher",
    );
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        "content",
        translateText(
          hindi,
          "Find a teacher for early learning, school or college, online or close to home.",
        ),
      );
  }, [hindi]);
  function setHindi(value: boolean) {
    setHindiState(value);
    rememberLanguage(value);
    document
      .querySelectorAll<HTMLInputElement>("[data-bcs-localized-validity]")
      .forEach((field) => {
        field.setCustomValidity("");
        delete field.dataset.bcsLocalizedValidity;
      });
    try {
      localStorage.setItem("bcs.interface-language", value ? "hi" : "en");
    } catch {
      /* Keep language selection in memory. */
    }
  }
  const [transition, setTransition] = useState<{
    guardianId: string;
    studentId?: string;
    busy: boolean;
    message: string;
  } | null>(null);
  const [switchMessage, setSwitchMessage] = useState("");
  const client = useQueryClient(),
    router = useRouter(),
    path = usePathname();
  const [, setPublicSearch] = useTeacherSearchState();
  function changeSession(next: Session | null) {
    if (!next || (session && session.account.id !== next.account.id))
      setPublicSearch({ filters: { ...emptyTeacherFilters } });
    setSession(next);
    setTransition(null);
    setSwitchMessage("");
  }
  function beginStudentSwitch(studentId?: string) {
    if (!session) return;
    void client.cancelQueries();
    client.clear();
    setSwitchMessage("");
    setTransition({
      guardianId: session.account.id,
      studentId,
      busy: true,
      message: "",
    });
  }
  function failStudentSwitch(message: string, uncertain: boolean) {
    if (uncertain)
      setTransition((current) =>
        current ? { ...current, busy: false, message } : null,
      );
    else {
      setTransition(null);
      if (path !== "/onboarding/student") setSwitchMessage(message);
    }
  }
  async function checkStudentSwitch() {
    if (!transition) return;
    const expected = transition;
    setTransition({ ...expected, busy: true });
    try {
      const next = await api<Session>("/auth/session", {
        signal: AbortSignal.timeout(12000),
      });
      if (
        next.account.role === "STUDENT" &&
        (!expected.studentId || next.account.id === expected.studentId)
      ) {
        client.clear();
        changeSession(next);
      } else if (
        next.account.role === "GUARDIAN" &&
        next.account.id === expected.guardianId
      ) {
        client.clear();
        changeSession(next);
        setSwitchMessage(
          "This browser is still signed in as the guardian. Review learner access before authorizing this device again.",
        );
      } else
        throw new Error(
          "A different account is active. Return to sign-in before continuing.",
        );
    } catch (error) {
      setTransition({
        ...expected,
        busy: false,
        message: (error as Error).message,
      });
    }
  }
  useEffect(() => {
    let active = true;
    api<Session>("/auth/session")
      .then((s) => {
        if (active) setSession(s);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <LanguageContext.Provider value={hindi}>
      <Auth.Provider
        value={{
          session,
          loading,
          setSession: changeSession,
          hindi,
          setHindi,
          beginStudentSwitch,
          failStudentSwitch,
        }}
      >
        {transition && (
          <main className="container narrow section wizard-verification">
            <h1>{appText("Switching to student access.")}</h1>
            <p>
              {appText(
                "Guardian screens are hidden while we confirm which account this browser is using.",
              )}{" "}
            </p>
            {transition.busy ? (
              <p role="status">{appText("Checking student access…")}</p>
            ) : (
              <>
                <Alert variant="destructive" role="alert">
                  {appError(transition.message)}
                </Alert>
                <div className="wizard-actions">
                  <UiButton className="button" onClick={checkStudentSwitch}>
                    {appText("Check device access")}{" "}
                  </UiButton>
                  <UiButton
                    variant="outline"
                    className="button secondary"
                    onClick={() => {
                      client.clear();
                      changeSession(null);
                      router.push("/login");
                    }}
                  >
                    {appText("Return to sign-in")}{" "}
                  </UiButton>
                </div>
              </>
            )}
          </main>
        )}
        <div
          hidden={!!transition}
          onInvalidCapture={(event) => {
            const field = event.target;
            if (
              hindi &&
              (field instanceof HTMLInputElement ||
                field instanceof HTMLSelectElement ||
                field instanceof HTMLTextAreaElement)
            ) {
              field.setCustomValidity(nativeValidationText(field.validity));
              field.dataset.bcsLocalizedValidity = "true";
            }
          }}
          onInputCapture={(event) => {
            const field = event.target;
            if (
              (field instanceof HTMLInputElement ||
                field instanceof HTMLSelectElement ||
                field instanceof HTMLTextAreaElement) &&
              field.dataset.bcsLocalizedValidity
            ) {
              field.setCustomValidity("");
              delete field.dataset.bcsLocalizedValidity;
            }
          }}
        >
          <a className="skip-link" href="#main" lang={hindi ? "hi" : "en"}>
            {hindi ? "मुख्य सामग्री पर जाएँ" : appText("Skip to content")}
          </a>
          <Header />
          {switchMessage && (
            <div className="container">
              <Alert role="status">{appError(switchMessage)}</Alert>
            </div>
          )}
          <div id="main" tabIndex={-1}>
            <StaffAccess
              session={session}
              onSignIn={() => {
                client.clear();
                changeSession(null);
                router.push("/login");
              }}
            >
              <Routes />
            </StaffAccess>
          </div>
          <Footer />
        </div>
      </Auth.Provider>
    </LanguageContext.Provider>
  );
}
export default function App({
  initialTeachers,
  initialTeacher,
}: { initialTeachers?: { items: Teacher[] }; initialTeacher?: Teacher } = {}) {
  const { appText, appError, appLocale, appCurriculum } = useAppTranslation();

  const [client] = useState(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: (count, error) =>
            !(
              error instanceof ApiError &&
              [401, 403, 404].includes(error.status)
            ) && count < 1,
          staleTime: 15000,
        },
      },
    });
    if (initialTeachers) client.setQueryData(["teachers"], initialTeachers);
    if (initialTeacher)
      client.setQueryData(["teacher", initialTeacher.slug], initialTeacher);
    return client;
  });
  return (
    <QueryClientProvider client={client}>
      <AppContent />
    </QueryClientProvider>
  );
}
