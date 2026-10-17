"use client";
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
  QueryClient,
  QueryClientProvider,
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
const date = (value: string, withTime = true) =>
  new Intl.DateTimeFormat("en-IN", {
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
  if (loading)
    return (
      <div className="loading" role="status">
        <LoaderCircle className="spin" /> Getting things ready…
      </div>
    );
  if (error)
    return (
      <Notice error>
        {error.message}{" "}
        {retry && (
          <button className="text-button" onClick={retry}>
            Try again
          </button>
        )}
      </Notice>
    );
  return null;
}
function Badge({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>;
}
function Empty({ children }: { children: ReactNode }) {
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
  return (
    <div className="page-title" lang={lang}>
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
function Logo() {
  return (
    <Link href="/" className="logo" aria-label="Better Call Sir home">
      <span className="logo-mark">
        <BookOpen size={21} />
      </span>
      <span>
        bettercall<span className="logo-accent">sir</span>
        <span className="logo-dot">.</span>
      </span>
    </Link>
  );
}
function Header() {
  const { session, hindi, setHindi, setSession } = useAuth(),
    client = useQueryClient();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST", csrf: session?.csrfToken });
      setSession(null);
      client.clear();
      router.push("/");
    } catch (e) {
      alert((e as Error).message);
    }
  }
  return (
    <>
      <div className="dev-strip">
        <span className="dev-dot" /> Development preview · Synthetic profiles
        and accounts · No live payments or calls
      </div>
      <header className="header" lang={hindi ? "hi" : "en"}>
        <div className="container header-inner">
          <Logo />
          <nav
            className={open ? "top-nav open" : "top-nav"}
            aria-label="Main navigation"
          >
            <Link href="/teachers" onClick={() => setOpen(false)}>
              {hindi ? "शिक्षक खोजें" : "Find a teacher"}
            </Link>
            <Link href="/teachers?tab=assisted" onClick={() => setOpen(false)}>
              {hindi ? "हमें आपके लिए खोजने दें" : "Let us search for you"}
            </Link>
            <Link href="/onboarding/teacher" onClick={() => setOpen(false)}>
              {hindi ? "शिक्षक बनें" : "Become a teacher"}
            </Link>
          </nav>
          <div className="header-actions">
            <button
              className="language"
              onClick={() => setHindi(!hindi)}
              aria-label="Switch English and Hindi"
            >
              <Languages size={16} />
              {hindi ? "English" : "हिन्दी"}
            </button>
            {session ? (
              <>
                <Link className="button small secondary" href="/dashboard">
                  <span className="header-action-desktop">
                    {hindi ? "मेरा डैशबोर्ड" : "My dashboard"}
                  </span>
                  <span className="header-action-mobile">
                    {hindi ? "डैशबोर्ड" : "Dashboard"}
                  </span>{" "}
                  <ArrowUpRight size={16} />
                </Link>
                <button
                  className="icon-button"
                  onClick={logout}
                  aria-label="Sign out"
                >
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <Link className="button small" href="/login">
                <span className="header-action-desktop">
                  {hindi ? "शुरू करें" : "Get started"}
                </span>
                <span className="header-action-mobile">
                  {hindi ? "साइन इन" : "Sign in"}
                </span>{" "}
                <ArrowUpRight size={16} />
              </Link>
            )}
            <button
              className="icon-button mobile-menu"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
              aria-label="Toggle navigation"
            >
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
function Footer() {
  return (
    <footer>
      <div className="container footer-grid">
        <div>
          <Logo />
          <p>
            A good teacher changes the way
            <br />
            you see what’s possible.
          </p>
        </div>
        <div>
          <span className="eyebrow">MADE FOR YOUR FAMILY</span>
          <Link href="/teachers">Find a teacher</Link>
          <Link href="/onboarding/parent">Tell us what you need</Link>
          <Link href="/support">Help & safety support</Link>
        </div>
        <div>
          <span className="eyebrow">STARTING CLOSE TO HOME</span>
          <p>
            Raipur, Chhattisgarh
            <br />
            Online & at-home lessons
            <br />
            Early years, school & college
          </p>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} Better Call Sir</span>
        <span>A development build. Live services are not enabled.</span>
      </div>
    </footer>
  );
}
function Illustration() {
  return (
    <div
      className="illustration"
      aria-label="Illustration of a supportive learning space"
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
          <strong>A thoughtful match</strong>
          <small>For your child. For their pace.</small>
        </div>
      </div>
      <div className="chalkboard">
        <div className="chalk-top">
          <span /> <span /> <span />
        </div>
        <span className="chalk-title">
          Small steps.
          <br />
          Big possibilities.
        </span>
        <div className="chalk-math">x² + y² = a little confidence</div>
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
          <span className="eyes">• &nbsp; •</span>
          <span className="smile">⌣</span>
        </div>
        <div className="shirt" />
        <div className="arm" />
      </div>
      <div className="illustrated-person student-person">
        <div className="hair" />
        <div className="face">
          <span className="eyes">• &nbsp; •</span>
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
          <strong>“Now I understand.”</strong>
          <small>The moment we’re here for.</small>
        </div>
      </div>
    </div>
  );
}
function TeacherCard({ teacher }: { teacher: Teacher }) {
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
          <ShieldCheck size={12} /> Reviewed coverage
        </Badge>
      </div>
      <Link href={`/teachers/${teacher.slug}`} className="teacher-name">
        <h3>{teacher.name}</h3>
        <ArrowUpRight size={19} />
      </Link>
      <p className="teacher-headline">{teacher.headline}</p>
      {teacher.demoAvailable && (
        <span className="teacher-demo-badge">
          <Check size={14} aria-hidden="true" /> Demo available
        </span>
      )}
      <TeacherLockIn days={teacher.lockInDays} />
      <div className="teacher-tags">
        {teacher.subjects.map((s) => (
          <span key={s}>{s}</span>
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
              ? "Raipur · At home & online"
              : "Raipur · Home tuition"
            : "Online tuition"}
        </span>
        <span>
          <Languages size={15} />
          {teacher.languages.join(" & ")} · {teacher.experience} years teaching
        </span>
      </div>
      <div className="teacher-bottom">
        <div>
          <strong>{rupees(teacher.monthlyPaise)}</strong>
          <small> / month · tuition paid directly</small>
        </div>
        <Link
          href={`/teachers/${teacher.slug}`}
          className="round-link"
          aria-label={`View ${teacher.name}`}
        >
          <ArrowUpRight size={20} />
        </Link>
      </div>
    </article>
  );
}
function Home() {
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
            <span /> Rooted in Raipur. Ready for your child.
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
                A little guidance.
                <br />A world of
                <br />
                <em>possibilities.</em>
              </>
            )}
          </h1>
          <p>
            {hindi
              ? "हर बच्चा अलग तरह से सीखता है। अपने बच्चे के लिए सही गणित और विज्ञान शिक्षक खोजें।"
              : "Find a teacher for early learning, school or college, online or close to home."}
          </p>
          <div className="hero-buttons">
            <Link className="button" href="/teachers">
              {hindi ? "सही शिक्षक खोजें" : "Find your kind of teacher"}
              <ArrowUpRight size={19} />
            </Link>
            <Link className="hero-secondary" href="/onboarding/parent">
              Help me choose <ArrowRight size={17} />
            </Link>
          </div>
          <div className="hero-proof">
            <div className="mini-avatars">
              <span>A</span>
              <span>R</span>
              <span>M</span>
            </div>
            <div>
              <strong>People, before profiles.</strong>
              <small>Reviewed subject coverage. Clear fit reasons.</small>
            </div>
          </div>
        </div>
        <Illustration />
      </section>
      <section className="promise-bar">
        <div className="container promise-inner">
          <span>
            <ShieldCheck />
            Reviewed teacher coverage
          </span>
          <span>
            <MapPin />
            At home or online
          </span>
          <span>
            <Heart />
            Matching is free for families
          </span>
          <span>
            <Users />
            Guardian-led, student-centred
          </span>
        </div>
      </section>
      <section className="container section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">GOOD TEACHERS. REAL CONNECTIONS.</span>
            <h2>
              A teacher for their
              <br />
              <em>kind of curious.</em>
            </h2>
          </div>
          <div>
            <p>
              Start with a subject. Stay for the understanding.
              <br />
              Explore our synthetic development catalog.
            </p>
            <Link className="inline-link" href="/teachers">
              Meet all teachers <ArrowUpRight size={17} />
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
          <span className="eyebrow">LESS GUESSWORK. MORE GOOD FIT.</span>
          <h2>
            From “where do we start?”
            <br />
            to <em>“we’ve found our teacher.”</em>
          </h2>
          <Link className="button" href="/onboarding/parent">
            Let’s find your fit <ArrowUpRight size={18} />
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
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="container hiring-discovery-banner">
        <div>
          <h2>Let us help you find the right fit.</h2>
          <p>
            Share the subject, class, location and budget that work for your
            family. Our team reviews suitable teacher options for you.
          </p>
          <Link className="button" href="/teachers?tab=assisted">
            Let us search for you <ArrowUpRight size={18} />
          </Link>
        </div>
        <div>
          <h3>You keep the choice.</h3>
          <p>
            Review profiles, ask about fit and agree the arrangement with the
            teacher. A shortlist is the start of a decision.
          </p>
        </div>
      </section>
    </>
  );
}
function Teachers() {
  const { session } = useAuth();
  const independent = session?.account.role === "INDEPENDENT_STUDENT";
  const discoveryParams = useSearchParams();
  const [filterReset, setFilterReset] = useState(0);
  const [stage, setStage] = useState(""),
    [level, setLevel] = useState(""),
    [courseName, setCourseName] = useState(""),
    [studyYear, setStudyYear] = useState("");
  function educationStage(next: string) {
    setStage(next);
    setGrade("");
    setBoard("");
    setLevel("");
    setCourseName("");
    setStudyYear("");
  }
  const [q, setQ] = useState(""),
    [subject, setSubject] = useState(""),
    [mode, setMode] = useState(""),
    [board, setBoard] = useState(""),
    [grade, setGrade] = useState(""),
    [language, setLanguage] = useState(""),
    [locality, setLocality] = useState(""),
    [maxMonthly, setMaxMonthly] = useState(""),
    [tab, setTab] = useState<"manual" | "assisted">(
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
  const query = useQuery({
    queryKey: params.size ? ["teachers", params.toString()] : ["teachers"],
    queryFn: ({ signal }) =>
      api<{ items: Teacher[] }>(`/teachers?${params}`, { signal }),
  });
  return (
    <main className="container section">
      <PageTitle
        eyebrow="FIND YOUR KIND OF TEACHER"
        title="Good learning starts with a good fit."
        subtitle="Early years, school & college · Raipur pilot"
      />
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as "manual" | "assisted")}
      >
        <TabsList
          className="discovery-tabs"
          aria-label="How would you like to find a teacher?"
        >
          <TabsTrigger value="manual">
            <Search size={18} /> Search
            <small>Browse and choose a teacher</small>
          </TabsTrigger>
          <TabsTrigger value="assisted">
            <Sparkles size={18} /> Let us search for you
            <small>Share your criteria for a reviewed shortlist</small>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="assisted">
          {independent ? (
            <section className="assisted-search panel">
              <div>
                <h2>Tell us what would work for your learning.</h2>
                <p>
                  Share your subject, availability and budget. Your criteria are
                  recorded for staff review; this does not book or hire a
                  teacher.
                </p>
              </div>
              <Link className="button" href="/dashboard/enquiries?new=1">
                Share my criteria <ArrowRight size={18} />
              </Link>
            </section>
          ) : (
            <section className="assisted-search panel">
              <div>
                <span className="eyebrow">PERSONALIZED HELP</span>
                <h2>Tell us what would work for your family.</h2>
                <p>
                  Share your learner’s education, subject, availability and
                  budget. We’ll review suitable teachers and prepare options for
                  your guardian account.
                </p>
              </div>
              <Link
                className="button"
                href="/onboarding/parent?discovery=ASSISTED"
              >
                Share your criteria <ArrowRight size={18} />
              </Link>
            </section>
          )}
        </TabsContent>
        <TabsContent value="manual">
          <div className="filter-bar catalog-filters">
            <label className="search-input">
              <Search size={19} />
              <Input
                aria-label="Search teachers"
                placeholder="Search a teacher or subject"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            <div className="filter-select">
              <label className="filter-label" htmlFor="search-stage">
                Education stage
              </label>
              <select
                id="search-stage"
                value={stage}
                onChange={(e) => educationStage(e.target.value)}
              >
                <option value="">All stages</option>
                <option value="EARLY_YEARS">Early years — Nursery / KG</option>
                <option value="SCHOOL">School — Classes 1–12</option>
                <option value="COLLEGE">College / university</option>
              </select>
            </div>
            <div className="filter-select">
              <label className="filter-label" htmlFor="search-subject">
                Subject
              </label>
              <CurriculumChoice
                key={"subject-" + filterReset}
                id="search-subject"
                value={subject}
                onChange={setSubject}
                suggestions={subjectSuggestions}
                customLabel="Subject name"
                anyLabel="All subjects"
              />
            </div>
            <label className="filter-select">
              <span className="filter-label">Lesson mode</span>
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="">At home & online</option>
                <option value="HOME">At home</option>
                <option value="ONLINE">Online</option>
              </select>
            </label>
            {(!stage || stage === "SCHOOL") && (
              <>
                <div className="filter-select">
                  <label className="filter-label" htmlFor="search-board">
                    Board
                  </label>
                  <CurriculumChoice
                    key={"board-" + filterReset}
                    id="search-board"
                    value={board}
                    onChange={(v) => {
                      setBoard(v);
                      if (v) setStage("SCHOOL");
                    }}
                    suggestions={boardSuggestions}
                    customLabel="Board name"
                    anyLabel="All boards"
                  />
                </div>
                <label className="filter-select">
                  <span className="filter-label">Class</span>
                  <select
                    aria-label="Class"
                    value={grade}
                    onChange={(e) => {
                      setGrade(e.target.value);
                      if (e.target.value) setStage("SCHOOL");
                    }}
                  >
                    <option value="">All classes</option>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        Class {n}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {stage === "EARLY_YEARS" && (
              <label className="filter-select">
                <span className="filter-label">Early years level</span>
                <select
                  aria-label="Early years level"
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                >
                  <option value="">All early years levels</option>
                  <option value="NURSERY">Nursery</option>
                  <option value="KG1">KG1</option>
                  <option value="KG2">KG2</option>
                </select>
              </label>
            )}
            {stage === "COLLEGE" && (
              <>
                <label className="filter-select">
                  <span className="filter-label">Course / degree</span>
                  <Input
                    aria-label="Course / degree"
                    value={courseName}
                    onChange={(e) => setCourseName(e.target.value)}
                    maxLength={160}
                    placeholder="For example BSc Physics"
                  />
                </label>
                <label className="filter-select">
                  <span className="filter-label">Study year</span>
                  <select
                    aria-label="Study year"
                    value={studyYear}
                    onChange={(e) => setStudyYear(e.target.value)}
                  >
                    <option value="">All study years</option>
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        Year {n}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <label className="filter-select">
              <span className="filter-label">Language</span>
              <select
                aria-label="Language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="">Any language</option>
                <option>English</option>
                <option>Hindi</option>
              </select>
            </label>
            <label className="filter-select">
              <span className="filter-label">Locality</span>
              <select
                aria-label="Locality"
                value={locality}
                onChange={(e) => setLocality(e.target.value)}
              >
                <option value="">Any locality</option>
                {[
                  "Shankar Nagar",
                  "Avanti Vihar",
                  "Telibandha",
                  "Civil Lines",
                  "Mowa",
                ].map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
            <label className="filter-select budget-filter">
              <span className="filter-label">Maximum monthly tuition</span>
              <select
                aria-label="Maximum monthly tuition"
                value={maxMonthly}
                onChange={(e) => setMaxMonthly(e.target.value)}
              >
                <option value="">Any budget</option>
                <option value="3000">Up to ₹3,000</option>
                <option value="5000">Up to ₹5,000</option>
                <option value="8000">Up to ₹8,000</option>
                <option value="12000">Up to ₹12,000</option>
              </select>
            </label>
            <UiButton
              type="button"
              variant="outline"
              className="reset-filters"
              onClick={() => {
                setFilterReset((v) => v + 1);
                setQ("");
                educationStage("");
                setSubject("");
                setMode("");
                setBoard("");
                setGrade("");
                setLanguage("");
                setLocality("");
                setMaxMonthly("");
              }}
            >
              Reset filters
            </UiButton>
          </div>
          <div className="results-heading">
            <span role="status">
              {query.isPending
                ? "Searching for teachers…"
                : query.error
                  ? "Search unavailable"
                  : `${query.data?.items.length || 0} teachers to get to know`}
            </span>
            <small>Synthetic profiles · prices are monthly tuition</small>
          </div>
          <State
            loading={query.isPending}
            error={query.error}
            retry={() => query.refetch()}
          />
          <div className="teacher-grid">
            {query.data?.items.map((t) => (
              <TeacherCard key={t.id} teacher={t} />
            ))}
          </div>
          {query.data?.items.length === 0 && !query.error && (
            <section className="coverage-recovery" aria-label="Search recovery">
              <h2>No teachers match these filters right now.</h2>
              <p>
                Try broader filters or let us review your needs. An empty search
                does not mean your class or subject is outside pilot coverage.
              </p>
              <div className="wizard-actions">
                <UiButton variant="outline" onClick={() => setTab("assisted")}>
                  Let us search for you
                </UiButton>
                <Link className="inline-link" href="/waitlist">
                  Need another class, subject or city?
                </Link>
              </div>
            </section>
          )}
          <div className="help-card">
            <div>
              <h3>Not sure who to choose?</h3>
              <p>
                Tell us what your child needs. We’ll help you find suitable
                options.
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
              Help me choose <ArrowRight size={17} />
            </Link>
          </div>
        </TabsContent>
      </Tabs>
      <p className="coverage-discovery-link">
        Looking outside our current pilot coverage?{" "}
        <Link className="inline-link" href="/waitlist">
          Request future coverage
        </Link>
      </p>
    </main>
  );
}
function Profile({ slug }: { slug: string }) {
  const { session } = useAuth();
  const independent = session?.account.role === "INDEPENDENT_STUDENT";
  const query = useQuery({
    queryKey: ["teacher", slug],
    queryFn: ({ signal }) => api<Teacher>(`/teachers/${slug}`, { signal }),
  });
  const t = query.data;
  return (
    <main className="container section">
      <Link className="inline-link" href="/teachers">
        ← All teachers
      </Link>
      <State loading={query.isPending} error={query.error} />
      {t && (
        <div className="profile-layout">
          <article className="panel profile-main">
            <div className="avatar large" style={{ background: t.avatarColor }}>
              {initials(t.name)}
            </div>
            <Badge>
              <ShieldCheck size={14} /> Reviewed subject coverage
            </Badge>
            <h1>{t.name}</h1>
            <h2 className="profile-headline">{t.headline}</h2>
            <p>{t.bio}</p>
            <h3>What we can work on together</h3>
            <div className="teacher-tags">
              {t.subjects.map((s) => (
                <span key={s}>{s}</span>
              ))}

              {t.boards.map((b) => (
                <span key={b}>{b}</span>
              ))}
            </div>
            <TeachingCoverageSummary profile={t} />
            <div className="detail-grid">
              <div>
                <Languages />
                <strong>Languages</strong>
                <p>{t.languages.join(" & ")}</p>
              </div>
              <div>
                <GraduationCap />
                <strong>Experience</strong>
                <p>{t.experience} years of teaching</p>
              </div>
              <div>
                <MapPin />
                <strong>Lesson format</strong>
                <p>{t.modes.map(pretty).join(" & ")}</p>
              </div>
              <div>
                <Phone />
                <strong>Parent consultations</strong>
                <p>
                  {t.consultationOptIn
                    ? "Opted in · accepted windows"
                    : "Not currently available"}
                </p>
              </div>
            </div>
            <Notice>
              Coverage review describes subjects and classes checked. It does
              not guarantee marks or safety. This is a synthetic development
              profile.
            </Notice>
          </article>
          <aside className="panel booking-panel">
            <span className="eyebrow">A LITTLE GUIDANCE, EVERY WEEK</span>
            <h2>
              {rupees(t.monthlyPaise)}
              <small> / month</small>
            </h2>
            <TeacherLockIn days={t.lockInDays} />
            <p className="care-help">
              Teacher-declared preference. Cancellation restrictions are not
              currently enforced.
            </p>
            {t.demoAvailable && (
              <p className="teacher-demo-badge">
                <Check size={16} aria-hidden="true" /> Demo available · optional
                before hiring
              </p>
            )}
            <p>
              Recurring tuition is paid directly to your teacher. Ordinary
              matching and safety support are free for families.
            </p>
            {independent ? (
              <>
                <Link
                  className="button"
                  href={`/dashboard/enquiries?new=1&teacher=${t.id}&profile=${encodeURIComponent(t.slug)}`}
                >
                  Enquire about this teacher <ArrowUpRight size={18} />
                </Link>
                <p className="care-help">
                  Your teacher interest is recorded for staff review. It does
                  not reserve, hire or charge you.
                </p>
              </>
            ) : (
              <>
                <Link
                  className="button"
                  href={`/onboarding/parent?teacher=${t.id}&profile=${encodeURIComponent(t.slug)}`}
                >
                  Enquire about this teacher <ArrowUpRight size={18} />
                </Link>
                <p className="care-help">
                  An enquiry starts a conversation about fit and terms. It does
                  not hire the teacher or charge you.
                </p>
                <div className="subtle-line">
                  <ShieldCheck size={16} /> Guardian-managed enquiry
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
            : "Managing your own learning? Sign up as an independent student (18+)"}
        </Link>
      </p>
      {!!query.data?.length && (
        <details className="auth-demo-accounts">
          <summary>{hindi ? "डेवलपमेंट खाते" : "Development accounts"}</summary>
          <p>
            {hindi
              ? "नमूना खातों से प्रीव्यू देखें। लाइव सेवा में ये शॉर्टकट उपलब्ध नहीं होंगे।"
              : "Explore the preview with synthetic accounts. These shortcuts are unavailable in live mode."}
          </p>
          {error && <Notice error>{error}</Notice>}
          <div className="account-list">
            {query.data?.map((a) => (
              <button
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
                    {pretty(a.role)}
                    {a.role === "GUARDIAN" && !a.verified
                      ? " · verification pending"
                      : ""}
                  </small>
                </span>
                {busy === a.id ? (
                  <LoaderCircle className="spin" />
                ) : (
                  <ArrowRight size={20} />
                )}
              </button>
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
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error && <small className="field-error">{error}</small>}
    </label>
  );
}
function IntakeForm() {
  const { session, setSession, loading } = useAuth();
  if (loading)
    return (
      <main className="container section">
        <p role="status">Loading your account…</p>
      </main>
    );
  if (!session) return <LoginPrompt />;
  if (session.account.role !== "GUARDIAN")
    return (
      <main className="container narrow section">
        <Notice error>
          Use a guardian account to create a tuition request.
        </Notice>
        <Link className="button secondary" href="/teachers">
          Browse teachers
        </Link>
      </main>
    );
  return <GuardianOnboarding session={session} onSessionChange={setSession} />;
}
function LoginPrompt() {
  const path = usePathname();
  const searchParams = useSearchParams();
  const next = path + (searchParams.size ? `?${searchParams}` : "");
  return (
    <main className="container narrow section">
      <PageTitle
        eyebrow="YOUR FAMILY, YOUR SPACE"
        title="Sign in to continue."
        subtitle="Private learning journeys are available only to the right account."
      />
      <Link className="button" href={`/login?next=${encodeURIComponent(next)}`}>
        Sign in with email <ArrowRight size={18} />
      </Link>
    </main>
  );
}
function TeacherOnboarding() {
  const { session, setSession, loading } = useAuth();
  if (loading) return <State loading />;
  if (!session) return <LoginPrompt />;
  if (!["GUARDIAN", "TEACHER"].includes(session.account.role))
    return (
      <main className="container narrow section">
        <h1>A teacher account is required.</h1>
        <p>
          Sign in with your own adult account to apply. Student accounts cannot
          submit teacher applications.
        </p>
        <Link className="button" href="/dashboard">
          Return to dashboard
        </Link>
      </main>
    );
  return <TeacherSetup session={session} onSessionChange={setSession} />;
}
function GuardianSetupPage() {
  const { session, setSession, loading } = useAuth();
  if (loading) return <State loading />;
  if (!session) return <LoginPrompt />;
  if (session.account.role !== "GUARDIAN")
    return (
      <main className="container narrow section">
        <h1>Guardian setup belongs to a guardian account.</h1>
        <Link href="/dashboard" className="inline-link">
          Return to dashboard
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
  const { session, loading } = useAuth();
  if (loading) return <State loading />;
  if (!session) return <LoginPrompt />;
  if (!["GUARDIAN", "STUDENT"].includes(session.account.role))
    return (
      <main className="container narrow section">
        <h1>Learner profiles belong to guardian and student accounts.</h1>
        <Link href="/dashboard" className="inline-link">
          Return to dashboard
        </Link>
      </main>
    );
  return <LearnerProfiles key={session.account.id} session={session} />;
}
function WaitlistPage() {
  const { session, loading } = useAuth();
  if (loading) return <State loading />;
  return <WaitlistWorkspace session={session} />;
}
function IndependentStudentPage() {
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
              : "Create your own student account"}
          </h1>
          <p>
            {hindi
              ? "पहले अपने ईमेल की पुष्टि करें। फिर तैयारी, उम्र की घोषणा और पढ़ाई की जानकारी की समीक्षा करें। स्वतंत्र सेटअप फ़िलहाल 18 वर्ष या अधिक के विद्यार्थियों के लिए है।"
              : "Start by verifying your own email. Then review your readiness, age declaration and education details. Independent setup is currently for students aged 18+."}
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
            : "This account already has a setup"}
        </h1>
        <p>
          {hindi
            ? "मौजूदा खाते को स्वतंत्र विद्यार्थी खाते में नहीं बदला जा सकता।"
            : "An existing managed student, teacher or staff account cannot become an independent student account."}
        </p>
        <Link
          className="button"
          href={
            session.account.role === "STUDENT"
              ? "/onboarding/student"
              : "/dashboard"
          }
        >
          {hindi ? "अपने खाते पर लौटें" : "Return to my account"}
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
        <h1>A guardian must authorize student access.</h1>
        <Link href="/dashboard" className="button">
          Open dashboard
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
  const { session } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const role = session?.account.role;
  const links: [string, string, LucideIcon][] = [
    ["/dashboard", "Overview", LayoutDashboard],
    ["/teachers", "Find a teacher", Search],
    ...(["GUARDIAN", "STUDENT"].includes(role || "")
      ? [
          ["/dashboard/learners", "Education profiles", GraduationCap] as [
            string,
            string,
            LucideIcon,
          ],
        ]
      : []),
    ...(role === "STUDENT"
      ? [
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
        <span className="eyebrow">YOUR TEACHER CONNECTIONS</span>
        <div className="sidebar-person">
          <span className="avatar small-avatar">
            {initials(session?.account.name || "You")}
          </span>
          <div>
            <strong>{session?.account.name.split(" · ")[0]}</strong>
            <small>{pretty(role || "account")}</small>
          </div>
        </div>
        <nav className="dashboard-desktop-nav" aria-label="Dashboard">
          {links.map(([href, label, Icon]) => (
            <Link
              key={href}
              href={href}
              className={tab === href ? "active" : ""}
              aria-current={tab === href ? "page" : undefined}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="dashboard-mobile-nav">
          <UiButton
            variant="ghost"
            className="dashboard-mobile-trigger"
            aria-label={`Dashboard menu: ${links.find(([href]) => href === tab)?.[1] || "Overview"}`}
            aria-expanded={mobileNavOpen}
            aria-controls="dashboard-mobile-sections"
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
          >
            <span>
              <small>Dashboard menu</small>
              <strong>
                {links.find(([href]) => href === tab)?.[1] || "Overview"}
              </strong>
            </span>
            <ChevronDown size={20} aria-hidden="true" />
          </UiButton>
          <nav
            id="dashboard-mobile-sections"
            aria-label="Dashboard sections"
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
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="sidebar-tip">
          <Heart size={21} />
          <p>
            A good fit starts
            <br />
            with a clear conversation.
          </p>
        </div>
      </aside>
      <section className="dashboard-content">{children}</section>
    </main>
  );
}
function DashboardPage({ tab }: { tab: string }) {
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
          aria-label={hindi ? "विद्यार्थी खाता" : "Student account"}
        >
          <Link
            className="inline-link"
            href="/dashboard"
            aria-current={tab === "/dashboard" ? "page" : undefined}
          >
            {hindi ? "मेरी पढ़ाई" : "My learning"}
          </Link>
          <Link className="inline-link" href="/teachers">
            {hindi ? "शिक्षक खोजें" : "Find a teacher"}
          </Link>
          <Link
            className="inline-link"
            href="/dashboard/enquiries"
            aria-current={tab === "/dashboard/enquiries" ? "page" : undefined}
          >
            {hindi ? "मेरी पूछताछ" : "My enquiries"}
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
              {label}
            </Link>
          ))}
          <Link
            className="inline-link"
            href="/dashboard/privacy"
            aria-current={tab === "/dashboard/privacy" ? "page" : undefined}
          >
            {hindi ? "खाते की गोपनीयता" : "Account privacy"}
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
          eyebrow=""
          title={`Hello, ${session.account.name.split(" · ")[0]}.`}
          subtitle="Your teacher connections, with a clear next step."
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
                ? "OPERATIONS"
                : ["GUARDIAN", "STUDENT", "TEACHER"].includes(
                      session.account.role,
                    )
                  ? ""
                  : "A LITTLE PROGRESS, EVERY DAY"
            }
            title={
              tab === "/dashboard"
                ? `Hello, ${session.account.name.split(" · ")[0]}.`
                : tab.endsWith("lessons")
                  ? "Every class, accounted for."
                  : tab.endsWith("reports")
                    ? "Progress, backed by records."
                    : tab.endsWith("finance")
                      ? "Financial records, with their evidence."
                      : tab.endsWith("support")
                        ? "Support, with a clear next step."
                        : tab.endsWith("matching")
                          ? "A considered shortlist, ready for review."
                          : tab.endsWith("review")
                            ? "A careful review, recorded."
                            : tab.endsWith("privacy")
                              ? hindi
                                ? "आपकी जानकारी और गोपनीयता।"
                                : "Your information and privacy."
                              : tab.endsWith("arrangements")
                                ? "A clear next step for your tuition."
                                : tab.endsWith("requests")
                                  ? "Your path to a good fit."
                                  : tab.endsWith("family")
                                    ? "Your learners, your control."
                                    : tab.endsWith("bookings")
                                      ? "A little clarity, on the calendar."
                                      : tab.endsWith("pro")
                                        ? "A conversation can help."
                                        : tab.endsWith("notes")
                                          ? session.account.role === "TEACHER"
                                            ? "Learning context, shared with you."
                                            : "Your thoughts, kept private."
                                          : "A thoughtful control room."
            }
            subtitle={
              tab === "/dashboard"
                ? "Your recorded activity, current assignments and next steps."
                : tab.endsWith("family")
                  ? "Manage student devices and the permissions you grant."
                  : tab.endsWith("requests")
                    ? "Review teacher options, demo progress and your tuition agreement."
                    : tab.endsWith("privacy")
                      ? hindi
                        ? "हर अनुरोध की समीक्षा करें और मौजूदा स्थिति देखें।"
                        : "Review each request and follow its current status."
                      : tab.endsWith("lessons")
                        ? "Your weekly timetable, booked lessons and attendance records."
                        : "All changes are confirmed by the backend."
            }
          />
          {error && <Notice error>{error}</Notice>}
          {message && <Notice>{message}</Notice>}
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
                      <span>{label}</span>
                      <strong>{value}</strong>
                      <small>
                        {i === 0 ? "Rolling 30 days" : "Recorded activity"}
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
                          <Sparkles size={13} /> A little support goes a long
                          way
                        </Badge>
                        <h2>
                          {d.role === "TEACHER"
                            ? "There’s a learner on the other side."
                            : "Keep their curiosity moving."}
                        </h2>
                        <p>
                          {d.role === "STUDENT"
                            ? "Your next class and your recorded progress are right here."
                            : "Your teachers, upcoming classes and next steps, all in one place."}
                        </p>
                      </div>
                      <BookOpen size={64} strokeWidth={1} />
                    </div>
                    <div className="dashboard-columns">
                      <div className="panel">
                        <div className="panel-title">
                          <h3>Coming up next</h3>
                          <Link
                            href="/dashboard/lessons"
                            className="inline-link"
                          >
                            View all <ArrowUpRight size={15} />
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
                            ? "Your teaching profile"
                            : "Your learning team"}
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
                                  {pretty(d.profile.status || "pending")}
                                </small>
                              </div>
                            </div>
                            <p>
                              Approval requires completed capability checks;
                              material changes must reopen review.
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
                                <small>{t.subjects.join(" & ")}</small>
                                <Link
                                  href={`/teachers/${t.slug}`}
                                  className="inline-link"
                                >
                                  View profile →
                                </Link>
                              </div>
                            </div>
                          ))
                        ) : (
                          <Empty>
                            No active teacher yet. Your shortlist is the next
                            step.
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
                <h2>These controls belong to your guardian.</h2>
                <p>
                  Only your guardian can manage learner consent and student
                  access.
                </p>
                <Link href="/dashboard" className="inline-link">
                  Return to your learning space
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
                <h2>Tuition choices belong to your guardian.</h2>
                <p>
                  Only a guardian can review their family’s requests and choose
                  a teacher.
                </p>
                <Link href="/dashboard" className="inline-link">
                  Return to your dashboard
                </Link>
              </section>
            ))}
          {tab.endsWith("bookings") && (
            <>
              <DemoJourney session={session} act={act} />
              <ReservationBookings session={session} dashboard={d} />
              {d.role === "GUARDIAN" && (
                <TuitionTerms session={session} dashboard={d} />
              )}
              {d.role === "TEACHER" && (
                <>
                  <h3>Assigned opportunities</h3>
                  {d.opportunities?.length ? (
                    d.opportunities.map((c) => (
                      <div className="panel" key={c.id}>
                        <Badge>{pretty(c.response)}</Badge>
                        <p>{c.reasons.join(" · ")}</p>
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
                              Accept opportunity
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
                              Decline
                            </Button>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <Empty>No assigned opportunities yet.</Empty>
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
  if (!lessons.length) return <Empty>No classes in this view yet.</Empty>;
  return (
    <div className="lesson-list">
      {lessons.map((l) => (
        <div className="lesson-item" key={l.id}>
          <div className="lesson-date">
            <strong>
              {new Date(l.startsAt).toLocaleDateString("en-IN", {
                day: "numeric",
                timeZone: "Asia/Kolkata",
              })}
            </strong>
            <span>
              {new Date(l.startsAt).toLocaleDateString("en-IN", {
                month: "short",
                timeZone: "Asia/Kolkata",
              })}
            </span>
          </div>
          <div className="lesson-info">
            <strong>
              {l.subject} · {pretty(l.kind)}
            </strong>
            <small>
              {children?.find((c) => c.id === l.childId)?.alias ||
                "Assigned learner"}{" "}
              · {date(l.startsAt)}
            </small>
            <span className={`attendance ${l.disputed ? "disputed" : ""}`}>
              {l.disputed
                ? "Disputed · excluded from totals"
                : `${pretty(l.status)} · ${pretty(l.attendance)}`}
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
  const m = d.membership;
  return (
    <>
      <div className="pro-card">
        <div>
          <Badge>
            <Sparkles size={13} /> Parent Pro · synthetic prepaid pass
          </Badge>
          <h2>
            Stay in the loop.
            <br />
            <em>Talk it through.</em>
          </h2>
          <p>
            Consult your child’s active teacher in an accepted window.
            <br />
            No personal numbers. No 24/7 promise.
          </p>
        </div>
        <div className="pro-allowance">
          <strong>
            {m ? m.allowance - m.used - m.reserved : 0}
            <small> / {m?.allowance || 4}</small>
          </strong>
          <span>consultations available</span>
          <small>
            {m ? `Expires ${date(m.periodEnd, false)}` : "No active membership"}
          </small>
        </div>
      </div>
      <Notice>
        Pro never changes matching rank or safety support. Live calling and plan
        purchase are unavailable until transport, price and terms are approved.
        Demo consultations use 5pm–8pm IST windows.
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
          <h3>Request a teacher callback</h3>
          <Field label="Active teacher assignment">
            <select name="placement" required>
              {d.placements
                ?.filter((p) => p.status === "ACTIVE")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {d.teachers?.find((t) => t.id === p.teacherId)?.name ||
                      "Assigned teacher"}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Preferred callback (IST)">
            <input type="datetime-local" name="time" required />
          </Field>
          <Button type="submit" disabled={busy}>
            Request consultation <Phone size={17} />
          </Button>
        </form>
      ) : (
        <Empty>
          Free or expired memberships cannot start consultations. Ordinary
          support is always available.
        </Empty>
      )}
      {d.calls?.map((c) => (
        <div className="panel panel-title" key={c.id}>
          <span>Callback · {date(c.startsAt)}</span>
          <Badge>{pretty(c.status)}</Badge>
        </div>
      ))}
    </>
  );
}
function AdminPanel({ dashboard: d }: { dashboard: Dashboard; act: Act }) {
  return (
    <section className="panel">
      <h3>Administrator workspaces</h3>
      <p>
        Review controls, private queues and recorded outcomes in the dedicated
        console.
      </p>
      <Link href="/dashboard/admin" className="inline-link">
        Open administrator console
      </Link>
    </section>
  );
}

function Support() {
  const { session } = useAuth();
  return (
    <SupportWorkspace
      key={
        session ? `${session.account.id}:${session.account.role}` : "anonymous"
      }
      session={session}
    />
  );
}
function Routes() {
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
        eyebrow="NOT FOUND"
        title="This page isn’t here yet."
        subtitle="Head back to discover your kind of teacher."
      />
      <Link className="button" href="/">
        Go home
      </Link>
    </main>
  );
}
function AppContent() {
  const [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    [hindi, setHindiState] = useState(false);
  useEffect(() => {
    try {
      setHindiState(localStorage.getItem("bcs.interface-language") === "hi");
    } catch {
      /* Browser storage is optional. */
    }
  }, []);
  function setHindi(value: boolean) {
    setHindiState(value);
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
  function changeSession(next: Session | null) {
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
          <h1>Switching to student access.</h1>
          <p>
            Guardian screens are hidden while we confirm which account this
            browser is using.
          </p>
          {transition.busy ? (
            <p role="status">Checking student access…</p>
          ) : (
            <>
              <Alert variant="destructive" role="alert">
                {transition.message}
              </Alert>
              <div className="wizard-actions">
                <UiButton className="button" onClick={checkStudentSwitch}>
                  Check device access
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
                  Return to sign-in
                </UiButton>
              </div>
            </>
          )}
        </main>
      )}
      <div hidden={!!transition}>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Header />
        {switchMessage && (
          <div className="container">
            <Alert role="status">{switchMessage}</Alert>
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
  );
}
export default function App({
  initialTeachers,
  initialTeacher,
}: { initialTeachers?: { items: Teacher[] }; initialTeacher?: Teacher } = {}) {
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
