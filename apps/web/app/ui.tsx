"use client";
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
import { Textarea } from "../components/ui/textarea";
import { Alert } from "../components/ui/alert";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../components/ui/tabs";
import { DemoChoice, DemoJourney } from "./demo-journey";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
  LockKeyhole,
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
  Note,
  Candidate,
  rupees,
} from "@bcs/api-client";

const Auth = createContext<{
  session: Session | null;
  loading: boolean;
  setSession: (s: Session | null) => void;
  hindi: boolean;
  setHindi: (v: boolean) => void;
}>({
  session: null,
  loading: true,
  setSession: () => {},
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
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <span className="eyebrow">{eyebrow}</span>
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
      <header className="header">
        <div className="container header-inner">
          <Logo />
          <nav
            className={open ? "top-nav open" : "top-nav"}
            aria-label="Main navigation"
          >
            <Link href="/teachers" onClick={() => setOpen(false)}>
              {hindi ? "शिक्षक खोजें" : "Find a teacher"}
            </Link>
            <Link href="/revision" onClick={() => setOpen(false)}>
              {hindi ? "रिवीज़न सत्र" : "Revision sessions"}
              <span className="tiny-tag">NEW</span>
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
                  My dashboard <ArrowUpRight size={16} />
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
                Get started <ArrowUpRight size={16} />
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
            Classes 6–10 · CBSE & CGBSE
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
      <div className="teacher-tags">
        {teacher.subjects.map((s) => (
          <span key={s}>{s}</span>
        ))}
        <span>Classes 6–10</span>
      </div>
      <div className="teacher-details">
        <span>
          <BookOpen size={15} />
          {teacher.boards.join(" · ")}
        </span>
        <span>
          <MapPin size={15} />
          {teacher.modes.includes("HOME")
            ? "Raipur · At home & online"
            : "Online lessons"}
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
              : "Every child learns differently. Find a teacher who gets yours — for Maths and Science, online or right at home."}
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
      <section className="container revision-banner">
        <div>
          <span className="eyebrow">ONE TOPIC. A LITTLE MORE CLARITY.</span>
          <h2>
            Stuck on a chapter?
            <br />
            Let’s work through it.
          </h2>
          <p>
            Scheduled 20, 40 or 60 minute revision with a clear topic scope.
            <br />
            Expert acceptance first. Transparent pricing next.
          </p>
          <Link className="button dark" href="/revision">
            Explore revision sessions <ArrowUpRight size={18} />
          </Link>
        </div>
        <div className="revision-art">
          <div>
            20<span>min</span>
          </div>
          <div>
            40<span>min</span>
          </div>
          <div>
            60<span>min</span>
          </div>
          <Sparkles size={36} />
        </div>
      </section>
    </>
  );
}
function Teachers() {
  const [q, setQ] = useState(""),
    [subject, setSubject] = useState(""),
    [mode, setMode] = useState(""),
    [board, setBoard] = useState(""),
    [grade, setGrade] = useState(""),
    [language, setLanguage] = useState(""),
    [locality, setLocality] = useState(""),
    [maxMonthly, setMaxMonthly] = useState(""),
    [tab, setTab] = useState<"manual" | "assisted">("manual");
  const params = new URLSearchParams();
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
        subtitle="Maths & Science · Classes 6–10 · CBSE & CGBSE · Raipur"
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
          <section className="assisted-search panel">
            <div>
              <span className="eyebrow">PERSONALIZED HELP</span>
              <h2>Tell us what would work for your family.</h2>
              <p>
                Share your learner’s class, subject, schedule and budget. We’ll
                review suitable teachers and prepare options for your guardian
                account.
              </p>
            </div>
            <Link
              className="button"
              href="/onboarding/parent?discovery=ASSISTED"
            >
              Share your criteria <ArrowRight size={18} />
            </Link>
          </section>
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
            <label className="filter-select">
              <span className="filter-label">Subject</span>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              >
                <option value="">All subjects</option>
                <option>Maths</option>
                <option>Science</option>
              </select>
            </label>
            <label className="filter-select">
              <span className="filter-label">Lesson mode</span>
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="">At home & online</option>
                <option value="HOME">At home</option>
                <option value="ONLINE">Online</option>
              </select>
            </label>
            <label className="filter-select">
              <span className="filter-label">Board</span>
              <select
                aria-label="Board"
                value={board}
                onChange={(e) => setBoard(e.target.value)}
              >
                <option value="">All boards</option>
                <option>CBSE</option>
                <option>CGBSE</option>
              </select>
            </label>
            <label className="filter-select">
              <span className="filter-label">Class</span>
              <select
                aria-label="Class"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
              >
                <option value="">All classes</option>
                {[6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>
                    Class {n}
                  </option>
                ))}
              </select>
            </label>
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
                setQ("");
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
          {query.data?.items.length === 0 && (
            <Empty>
              No teachers match these filters. Try another subject or ask us to
              help.
            </Empty>
          )}
          <div className="help-card">
            <div>
              <h3>Not sure who to choose?</h3>
              <p>
                Tell us what your child needs. We’ll help you find suitable
                options.
              </p>
            </div>
            <Link href="/onboarding/parent" className="button secondary">
              Help me choose <ArrowRight size={17} />
            </Link>
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}
function Profile({ slug }: { slug: string }) {
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
              <span>Classes 6–10</span>
              {t.boards.map((b) => (
                <span key={b}>{b}</span>
              ))}
            </div>
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
            <p>
              Recurring tuition is paid directly to your teacher. Ordinary
              matching and safety support are free for families.
            </p>
            <Link
              className="button"
              href={`/onboarding/parent?teacher=${t.id}&profile=${encodeURIComponent(t.slug)}`}
            >
              Find a recurring teacher <ArrowUpRight size={18} />
            </Link>
            <Link
              className="button secondary"
              href={`/revision?teacher=${t.id}`}
            >
              Book a revision session <Clock size={17} />
            </Link>
            <div className="subtle-line">
              <ShieldCheck size={16} /> Guardian-managed booking
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
function Login() {
  const searchParams = useSearchParams();
  const { setSession } = useAuth(),
    router = useRouter(),
    client = useQueryClient();
  const query = useQuery({
    queryKey: ["dev-accounts"],
    queryFn: () => api<Account[]>("/dev/accounts"),
  });
  const [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  async function login(id: string) {
    setBusy(id);
    setError("");
    try {
      const session = await api<Session>("/dev/session", {
        method: "POST",
        body: { accountId: id },
      });
      client.clear();
      setSession(session);
      const next = searchParams.get("next");
      router.push(
        next && /^\/onboarding\/(parent|teacher|student)(?:\?|$)/.test(next)
          ? next
          : "/dashboard",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <main className="container narrow section">
      <PageTitle
        eyebrow="COME ON IN"
        title="See learning from every side."
        subtitle="Choose a synthetic account to explore the working development journeys."
      />
      <Notice>
        No real family data. These shortcuts are disabled in live mode. New
        parent authentication requires a reviewed adult-verification provider
        before child intake.
      </Notice>
      {error && <Notice error>{error}</Notice>}
      <State loading={query.isPending} error={query.error} />
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
    </main>
  );
}
const intakeSchema = z.object({
  alias: z.string().trim().min(1, "Enter a learner alias.").max(40),
  grade: z.string(),
  board: z.enum(["CBSE", "CGBSE"]),
  subject: z.enum(["Maths", "Science"]),
  mode: z.enum(["ONLINE", "HOME"]),
  language: z.enum(["English", "Hindi"]),
  locality: z.string().min(1),
  budget: z
    .string()
    .refine(
      (v) => Number(v) >= 500 && Number(v) <= 20000,
      "Choose a monthly budget between ₹500 and ₹20,000.",
    ),
  schedule: z.string().trim().min(3, "Tell us which times work.").max(300),
});
type Intake = z.infer<typeof intakeSchema>;
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
  const searchParams = useSearchParams();
  const { session } = useAuth(),
    router = useRouter(),
    client = useQueryClient();
  const [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [accepted, setAccepted] = useState(false);
  const preferredTeacherId = searchParams.get("teacher") || "";
  const discovery = preferredTeacherId ? "MANUAL" : "ASSISTED";
  const profile = searchParams.get("profile");
  const chosenTeacher = useQuery({
    queryKey: ["teacher", profile],
    queryFn: ({ signal }) =>
      api<Teacher>(`/teachers/${encodeURIComponent(profile!)}`, { signal }),
    enabled: !!preferredTeacherId && !!profile,
  });
  const [key, setKey] = useState(() => crypto.randomUUID());
  const form = useForm<Intake>({
    resolver: zodResolver(intakeSchema),
    defaultValues: {
      alias: "",
      grade: "8",
      board: "CBSE",
      subject: "Maths",
      mode: "HOME",
      language: "English",
      locality: "Shankar Nagar",
      budget: "4000",
      schedule: "",
    },
  });
  useEffect(() => {
    const teacher = chosenTeacher.data;
    if (!teacher || teacher.id !== preferredTeacherId) return;
    const defaults: Partial<Intake> = {
      subject: teacher.subjects[0] as Intake["subject"],
      mode: teacher.modes[0] as Intake["mode"],
      language: teacher.languages[0] as Intake["language"],
      locality: teacher.localities[0] || "Shankar Nagar",
      budget: String(teacher.monthlyPaise / 100),
    };
    for (const [name, value] of Object.entries(defaults)) {
      const field = name as keyof Intake;
      if (value && !form.getFieldState(field).isDirty)
        form.setValue(field, value);
    }
  }, [chosenTeacher.data, preferredTeacherId, form]);
  const children = useQuery({
    queryKey: ["children", session?.account.id],
    queryFn: () => api<{ items: Child[] }>("/children"),
    enabled: session?.account.role === "GUARDIAN",
  });
  const [childId, setChildId] = useState("");
  if (!session) return <LoginPrompt />;
  if (session.account.role !== "GUARDIAN")
    return (
      <Notice error>Use a guardian account to create a tuition request.</Notice>
    );
  async function submit(data: Intake) {
    setError("");
    setStatus("");
    try {
      if (!session?.account.verified)
        throw new Error(
          "Adult verification is pending. Child-data intake is blocked.",
        );
      if (!accepted)
        throw new Error(
          "Please read and accept the purpose-specific guardian consent.",
        );
      await api("/consents", {
        method: "POST",
        csrf: session?.csrfToken,
        body: {
          purpose: "tuition-and-learning-records",
          policyVersion: "development-v1",
          accepted: true,
        },
      });
      const result = await api<TuitionRequest>("/requests", {
        method: "POST",
        csrf: session?.csrfToken,
        key,
        body: {
          ...data,
          childId: childId || undefined,
          discoveryMethod: discovery,
          preferredTeacherId:
            discovery === "MANUAL" ? preferredTeacherId : undefined,
          grade: Number(data.grade),
          budget: undefined,
          budgetPaise: Number(data.budget) * 100,
        },
      });
      setStatus(
        `Request ${result.id.slice(0, 8)} saved. An operator will review fit and availability; no teacher is assigned yet.`,
      );
      setKey(crypto.randomUUID());
      client.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <main className="container section">
      <PageTitle
        eyebrow="PARENT ONBOARDING"
        title="Tell us about your kind of learner."
        subtitle="A few thoughtful details. A more suitable match."
      />
      <div className="form-layout">
        <aside className="form-aside">
          <ol className="progress-list">
            <li className="done">
              <CheckCircle2 /> Adult authentication
            </li>
            <li className={session.account.verified ? "done" : "active"}>
              <ShieldCheck /> Adult verification
            </li>
            <li className="active">
              <Heart /> Guardian consent & need
            </li>
            <li>
              <Users /> Operator review & shortlist
            </li>
          </ol>
          <h3>Less data. More care.</h3>
          <p>
            We ask for a learner alias, class and tuition need. No child phone,
            photograph, school location or date of birth.
          </p>
          <Notice>
            Your teacher is never assigned automatically. You decide after the
            shortlist and a conversation.
          </Notice>
        </aside>
        <form className="panel form-panel" onSubmit={form.handleSubmit(submit)}>
          <div className="discovery-choice">
            <strong>
              {discovery === "MANUAL"
                ? "You chose a teacher"
                : "We’ll help find a suitable teacher"}
            </strong>
            {chosenTeacher.data?.id === preferredTeacherId && (
              <span>
                {chosenTeacher.data.name} ·{" "}
                {rupees(chosenTeacher.data.monthlyPaise)} per month
              </span>
            )}
            <p>
              {discovery === "MANUAL"
                ? "Your request will be reviewed for this teacher’s availability and fit."
                : "Your criteria will be reviewed against the eligible teacher pool."}
            </p>
            <Link className="text-button" href="/teachers">
              Change discovery option
            </Link>
          </div>
          <div className="form-section-heading">
            <span>01</span>
            <h3>Your learner</h3>
          </div>
          {!session.account.verified && (
            <Notice error>
              Verification pending. You can explore the catalog, but child
              intake remains blocked.
            </Notice>
          )}
          <fieldset
            disabled={!session.account.verified || form.formState.isSubmitting}
          >
            {!!children.data?.items.length && (
              <Field label="Link an existing learner">
                <select
                  value={childId}
                  onChange={(e) => {
                    setChildId(e.target.value);
                    const c = children.data?.items.find(
                      (c) => c.id === e.target.value,
                    );
                    if (c) {
                      form.setValue("alias", c.alias);
                      form.setValue("grade", String(c.grade));
                      form.setValue("board", c.board as Intake["board"]);
                    }
                  }}
                >
                  <option value="">Add another learner</option>
                  {children.data.items.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.alias} · Class {c.grade}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field
              label="Learner alias"
              error={form.formState.errors.alias?.message}
            >
              <input
                {...form.register("alias")}
                placeholder="A name they like to go by"
              />
            </Field>
            <div className="form-row">
              <Field label="Class">
                <select {...form.register("grade")}>
                  {[6, 7, 8, 9, 10].map((g) => (
                    <option key={g} value={g}>
                      Class {g}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Board">
                <select {...form.register("board")}>
                  <option>CBSE</option>
                  <option>CGBSE</option>
                </select>
              </Field>
            </div>
            <div className="form-section-heading">
              <span>02</span>
              <h3>What would help?</h3>
            </div>
            <div className="form-row">
              <Field label="Subject">
                <select {...form.register("subject")}>
                  <option>Maths</option>
                  <option>Science</option>
                </select>
              </Field>
              <Field label="Lesson format">
                <select {...form.register("mode")}>
                  <option value="HOME">At home</option>
                  <option value="ONLINE">Online</option>
                </select>
              </Field>
            </div>
            <div className="form-row">
              <Field label="Language">
                <select {...form.register("language")}>
                  <option>English</option>
                  <option>Hindi</option>
                </select>
              </Field>
              <Field label="Locality">
                <select {...form.register("locality")}>
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
              </Field>
            </div>
            <Field
              label="Monthly tuition budget (₹)"
              error={form.formState.errors.budget?.message}
            >
              <input
                {...form.register("budget")}
                type="number"
                min="500"
                max="20000"
              />
            </Field>
            <Field
              label="When do lessons work for your family?"
              error={form.formState.errors.schedule?.message}
            >
              <Textarea
                {...form.register("schedule")}
                placeholder="For example: Monday and Wednesday, after 5pm"
                rows={3}
              />
            </Field>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
              />
              <span>
                I am this child’s parent or lawful guardian. I consent to using
                this alias, grade and need for tuition matching and learning
                records under the development-v1 notice. I can withdraw consent
                in my dashboard. This does not authorize AI training.
              </span>
            </label>
          </fieldset>
          {error && <Notice error>{error}</Notice>}
          {status && (
            <Notice>
              {status}{" "}
              <Link href="/dashboard" className="inline-link">
                View dashboard →
              </Link>
            </Notice>
          )}
          <Button
            type="submit"
            disabled={form.formState.isSubmitting || !session.account.verified}
          >
            {form.formState.isSubmitting
              ? "Saving…"
              : "Save my tuition request"}
            <ArrowRight size={18} />
          </Button>
        </form>
      </div>
    </main>
  );
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
        Choose a demo account <ArrowRight size={18} />
      </Link>
    </main>
  );
}
function TeacherOnboarding() {
  const { session } = useAuth();
  const [error, setError] = useState(""),
    [saved, setSaved] = useState(""),
    [busy, setBusy] = useState(false);
  if (!session) return <LoginPrompt />;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const t = await api<Teacher>("/teacher-applications", {
        method: "POST",
        csrf: session?.csrfToken,
        key: crypto.randomUUID(),
        body: {
          name: f.get("name"),
          headline: f.get("headline"),
          bio: f.get("bio"),
          subjects: [f.get("subject")],
          boards: ["CBSE", "CGBSE"],
          grades: [6, 7, 8, 9, 10],
          languages: ["English", "Hindi"],
          modes: [f.get("mode")],
          localities: [f.get("locality")],
          monthlyPaise: Number(f.get("price")) * 100,
          experience: Number(f.get("experience")),
          consultationOptIn: f.get("consultation") === "on",
          feeTermsAccepted: f.get("terms") === "on",
        },
      });
      setSaved(
        `${t.name}: application submitted for review. Screening and private evidence remain required; your profile is not public.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="container narrow section">
      <PageTitle
        eyebrow="TEACHER ONBOARDING"
        title="Bring your kind of teaching."
        subtitle="Tell us your coverage. Approval requires private evidence and capability checks."
      />
      <form className="panel form-panel" onSubmit={submit}>
        <Badge>Step 1 · Profile & teaching preferences</Badge>
        <Field label="Your name">
          <input name="name" required maxLength={80} />
        </Field>
        <Field label="A short teaching headline">
          <input name="headline" required maxLength={120} />
        </Field>
        <Field label="About your teaching">
          <textarea name="bio" required maxLength={1500} rows={4} />
        </Field>
        <div className="form-row">
          <Field label="Subject">
            <select name="subject">
              <option>Maths</option>
              <option>Science</option>
            </select>
          </Field>
          <Field label="Lesson format">
            <select name="mode">
              <option value="HOME">At home</option>
              <option value="ONLINE">Online</option>
            </select>
          </Field>
        </div>
        <div className="form-row">
          <Field label="Years teaching">
            <input
              name="experience"
              type="number"
              required
              min={0}
              max={60}
              defaultValue={0}
            />
          </Field>
          <Field label="Monthly tuition (₹)">
            <input
              name="price"
              type="number"
              min={500}
              max={20000}
              required
              defaultValue={3000}
            />
          </Field>
        </div>
        <Field label="Locality">
          <select name="locality">
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
        </Field>
        <label className="checkbox-field">
          <input type="checkbox" name="consultation" />
          <span>
            I’m interested in Parent Pro consultations during accepted windows.
          </span>
        </label>
        <label className="checkbox-field">
          <input name="terms" type="checkbox" required />
          <span>
            I acknowledge the proposed pilot placement fee: 25% of the first
            monthly tuition, capped at ₹1,500, after independently confirmed
            start and receipt. Final terms require review.
          </span>
        </label>
        <Notice>
          Private evidence upload and screening providers are not configured.
          Submission saves a pending application and cannot self-approve.
        </Notice>
        {error && <Notice error>{error}</Notice>}
        {saved && <Notice>{saved}</Notice>}
        <Button type="submit" disabled={busy}>
          {busy ? "Submitting…" : "Submit for review"}
          <ArrowRight size={18} />
        </Button>
      </form>
    </main>
  );
}
function StudentOnboarding() {
  const { session, setSession } = useAuth(),
    client = useQueryClient(),
    router = useRouter();
  const [error, setError] = useState("");
  if (!session) return <LoginPrompt />;
  async function activate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      const session = await api<Session>("/invitations/activate", {
        method: "POST",
        csrf: useToken,
        body: { token: new FormData(e.currentTarget).get("token") },
      });
      client.clear();
      setSession(session);
      router.push("/dashboard");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const useToken = session.csrfToken;
  return (
    <main className="container narrow section">
      <PageTitle
        eyebrow="STUDENT ONBOARDING"
        title="Your learning, in your own space."
        subtitle="A parent or guardian authorizes this device. No child phone number required."
      />
      <form onSubmit={activate} className="panel form-panel">
        <Notice>
          Your student space shows your teacher, classes and attendance.
          Purchases and private parent notes stay with your guardian.
        </Notice>
        <Field label="Guardian invitation token">
          <input
            name="token"
            required
            autoComplete="off"
            placeholder="Paste the single-use invitation"
          />
        </Field>
        {error && <Notice error>{error}</Notice>}
        <Button type="submit" disabled={session.account.role !== "GUARDIAN"}>
          Authorize student access <ArrowRight size={17} />
        </Button>
        <p className="muted">
          This action requires the inviting guardian’s account and switches this
          browser to a restricted student session.
        </p>
      </form>
    </main>
  );
}
function Revision() {
  const { session } = useAuth();
  const teachers = useQuery({
    queryKey: ["teachers"],
    queryFn: () => api<{ items: Teacher[] }>("/teachers"),
  });
  const [reservation, setReservation] = useState<Reservation | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      if (!session)
        throw new Error(
          "Sign in with a guardian account to request a session.",
        );
      const r = await api<Reservation>("/revision/holds", {
        method: "POST",
        csrf: session.csrfToken,
        key: crypto.randomUUID(),
        body: {
          teacherId: f.get("teacher"),
          startsAt: new Date(`${f.get("startsAt")}+05:30`).toISOString(),
          duration: Number(f.get("duration")),
          topic: f.get("topic"),
        },
      });
      setReservation(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="container section">
      <PageTitle
        eyebrow="A LITTLE MORE CLARITY"
        title="One topic. One focused session."
        subtitle="Choose 20, 40 or 60 minutes. Your expert reviews the scope before checkout."
      />
      <div className="form-layout">
        <aside className="form-aside">
          <div className="duration-cards">
            {[20, 40, 60].map((d) => (
              <div key={d}>
                <strong>
                  {d}
                  <small> minutes</small>
                </strong>
                <span>{rupees(d * 1500)} total · sandbox quote</span>
                <p>
                  {d === 20
                    ? "One narrow topic"
                    : d === 40
                      ? "Related topics & practice"
                      : "A broader selected review"}
                </p>
              </div>
            ))}
          </div>
          <Notice>
            No full-syllabus or marks guarantee. Live checkout and expert
            settlement are disabled pending provider approval.
          </Notice>
        </aside>
        <form className="panel form-panel" onSubmit={submit}>
          <h3>What shall we work through?</h3>
          <Field label="Expert">
            <select name="teacher" required>
              {teachers.data?.items.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.subjects.join(" & ")}
                </option>
              ))}
            </select>
          </Field>
          <div className="form-row">
            <Field label="Duration">
              <select name="duration">
                <option value="20">20 minutes</option>
                <option value="40">40 minutes</option>
                <option value="60">60 minutes</option>
              </select>
            </Field>
            <Field label="Preferred start (IST)">
              <input name="startsAt" type="datetime-local" required />
            </Field>
          </div>
          <p className="muted">
            Development window: 9am–8pm IST, at least one hour ahead, within 60
            days.
          </p>
          <Field label="Topic brief">
            <textarea
              name="topic"
              required
              rows={5}
              maxLength={1000}
              placeholder="Class, board, subject and the specific topic or question you want to cover"
            />
          </Field>
          {error && <Notice error>{error}</Notice>}
          {reservation && (
            <Notice>
              Hold created until{" "}
              {reservation.expiresAt ? date(reservation.expiresAt) : "expiry"}.
              Waiting for expert scope acceptance. This is not a confirmed
              booking. Check your dashboard for its status.
            </Notice>
          )}
          <Button
            type="submit"
            disabled={busy || session?.account.role !== "GUARDIAN"}
          >
            {busy ? "Reserving…" : "Request scope & hold slot"}
            <Clock size={17} />
          </Button>
          {!session && (
            <Link href="/login" className="inline-link">
              Sign in to request a revision →
            </Link>
          )}
        </form>
      </div>
    </main>
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
  const role = session?.account.role;
  const links: [string, string, LucideIcon][] = [
    ["/dashboard", "Overview", LayoutDashboard],
    ["/dashboard/lessons", "Classes & attendance", CalendarDays],
    ...(role === "GUARDIAN"
      ? ([
          ["/dashboard/requests", "Tuition requests", Users],
          ["/dashboard/bookings", "Revision bookings", Clock],
          ["/dashboard/pro", "Parent Pro", Phone],
          ["/dashboard/notes", "Private notes", NotebookPen],
        ] as [string, string, LucideIcon][])
      : role === "TEACHER"
        ? ([
            ["/dashboard/bookings", "Bookings & opportunities", ClipboardList],
          ] as [string, string, LucideIcon][])
        : role === "ADMIN"
          ? ([["/dashboard/admin", "Control console", Settings]] as [
              string,
              string,
              LucideIcon,
            ][])
          : []),
    ["/support", "Help & safety", LifeBuoy],
  ];
  return (
    <main className="container dashboard-layout">
      <aside className="dashboard-sidebar">
        <span className="eyebrow">YOUR LEARNING SPACE</span>
        <div className="sidebar-person">
          <span className="avatar small-avatar">
            {initials(session?.account.name || "You")}
          </span>
          <div>
            <strong>{session?.account.name.split(" · ")[0]}</strong>
            <small>{pretty(role || "account")}</small>
          </div>
        </div>
        <nav aria-label="Dashboard">
          {links.map(([href, label, Icon]) => (
            <Link
              key={href}
              href={href}
              className={tab === href ? "active" : ""}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-tip">
          <Heart size={21} />
          <p>
            Small steps count.
            <br />
            Keep showing up.
          </p>
        </div>
      </aside>
      <section className="dashboard-content">{children}</section>
    </main>
  );
}
function DashboardPage({ tab }: { tab: string }) {
  const { session, loading } = useAuth(),
    client = useQueryClient();
  const query = useQuery({
    queryKey: ["dashboard", session?.account.id],
    queryFn: ({ signal }) => api<Dashboard>("/dashboard", { signal }),
    enabled: !!session,
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
            eyebrow={
              session.account.role === "ADMIN"
                ? "OPERATIONS"
                : "A LITTLE PROGRESS, EVERY DAY"
            }
            title={
              tab === "/dashboard"
                ? `Hello, ${session.account.name.split(" · ")[0]}.`
                : tab.endsWith("lessons")
                  ? "Every class, accounted for."
                  : tab.endsWith("requests")
                    ? "Your path to a good fit."
                    : tab.endsWith("bookings")
                      ? "A little clarity, on the calendar."
                      : tab.endsWith("pro")
                        ? "A conversation can help."
                        : tab.endsWith("notes")
                          ? "Your thoughts, kept private."
                          : "A thoughtful control room."
            }
            subtitle={
              tab === "/dashboard"
                ? `Here’s your learning picture · ${date(d.window.start, false)}–${date(d.window.end, false)} · IST`
                : "All changes are confirmed by the backend."
            }
          />
          {error && <Notice error>{error}</Notice>}
          {message && <Notice>{message}</Notice>}
          {tab === "/dashboard" && (
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
                        <Sparkles size={13} /> A little support goes a long way
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
                        <Link href="/dashboard/lessons" className="inline-link">
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
                  {d.role === "GUARDIAN" && (
                    <div className="panel privacy-panel">
                      <LockKeyhole size={24} />
                      <div>
                        <h3>Your family stays in control.</h3>
                        <p>
                          Consent is{" "}
                          {d.consent && !d.consent.withdrawnAt
                            ? "active"
                            : "pending or withdrawn"}
                          . Withdrawal stops new matching and child-data writes
                          and revokes student sessions.
                        </p>
                      </div>
                      <Button
                        secondary
                        onClick={() => {
                          if (
                            confirm(
                              "Withdraw consent and stop new matching and student access?",
                            )
                          )
                            void act("/consents/withdraw", {}, false);
                        }}
                      >
                        Withdraw consent
                      </Button>
                    </div>
                  )}
                  {d.role === "GUARDIAN" && !!d.children?.length && (
                    <div className="panel">
                      <h3>Guardian-managed student access</h3>
                      <p>
                        Create a single-use, 24-hour invitation to authorize a
                        student device.
                      </p>
                      {d.children.map((c) => (
                        <Button
                          secondary
                          key={c.id}
                          onClick={async () => {
                            const result = (await act(
                              `/children/${c.id}/invitations`,
                              {},
                              false,
                            )) as { token: string } | undefined;
                            if (result)
                              setMessage(
                                `Invitation for ${c.alias}: ${result.token}. Open Student onboarding on the intended device while signed in as the inviting guardian.`,
                              );
                          }}
                        >
                          Invite {c.alias} <ArrowRight size={16} />
                        </Button>
                      ))}
                      <Link href="/onboarding/student" className="inline-link">
                        Student onboarding →
                      </Link>
                    </div>
                  )}
                </>
              )}
            </>
          )}
          {tab.endsWith("lessons") && (
            <div className="panel">
              <div className="panel-title">
                <h3>Classes & attendance</h3>
                <Badge>{d.window.metricVersion}</Badge>
              </div>
              <p className="muted">
                Classes taken count completed PRESENT or LATE lessons. Absent,
                cancelled and disputed records are excluded.
              </p>
              <LessonList
                lessons={d.lessons || []}
                children={d.children}
                role={d.role}
                act={act}
              />
            </div>
          )}
          {tab.endsWith("requests") && (
            <>
              <div className="panel-title">
                <h3>Your tuition requests</h3>
                <Link className="button small" href="/onboarding/parent">
                  <Plus size={16} />
                  New request
                </Link>
              </div>
              {d.requests?.length ? (
                d.requests.map((r) => (
                  <RequestCard key={r.id} request={r} act={act} />
                ))
              ) : (
                <Empty>No requests yet. Tell us what your family needs.</Empty>
              )}
              <PlacementList dashboard={d} act={act} />
            </>
          )}
          {tab.endsWith("bookings") && (
            <>
              <DemoJourney session={session} act={act} />
              <div className="panel-title">
                <h3>Revision & recurring reservations</h3>
                {d.role === "GUARDIAN" && (
                  <Link className="button small" href="/revision">
                    Request revision <Plus size={16} />
                  </Link>
                )}
              </div>
              {d.reservations?.length ? (
                d.reservations
                  .filter((r) => r.kind !== "DEMO")
                  .map((r) => (
                    <div className="panel reservation-card" key={r.id}>
                      <div className="panel-title">
                        <h3>
                          {pretty(r.kind)} · {date(r.startsAt)}
                        </h3>
                        <Badge>{pretty(r.status)}</Badge>
                      </div>
                      <p>{r.topic}</p>
                      <p className="muted">
                        {rupees(r.amountPaise)} total · Scope{" "}
                        {r.scopeAccepted ? "accepted" : "pending"}
                        {r.expiresAt
                          ? ` · Hold expires ${date(r.expiresAt)}`
                          : ""}
                      </p>
                      <div className="action-row">
                        {d.role === "TEACHER" &&
                          r.kind === "REVISION" &&
                          r.status === "HOLD" &&
                          !r.scopeAccepted && (
                            <Button
                              secondary
                              onClick={() =>
                                void act(
                                  `/reservations/${r.id}/scope`,
                                  { expectedVersion: r.version },
                                  false,
                                )
                              }
                            >
                              Accept topic scope
                            </Button>
                          )}
                        {d.role === "GUARDIAN" &&
                          r.kind === "REVISION" &&
                          r.status === "HOLD" &&
                          r.scopeAccepted && (
                            <Button
                              onClick={() =>
                                void act(`/dev/reservations/${r.id}/capture`, {
                                  providerEventId: `sandbox-${r.id}`,
                                  amountPaise: r.amountPaise,
                                  currency: "INR",
                                })
                              }
                            >
                              Simulate sandbox capture
                            </Button>
                          )}
                        {d.role === "GUARDIAN" &&
                          r.kind === "REVISION" &&
                          ["HOLD", "CONFIRMED"].includes(r.status) && (
                            <Button
                              secondary
                              onClick={() =>
                                void act(`/reservations/${r.id}/cancel`, {
                                  expectedVersion: r.version,
                                  reason: "Guardian cancellation",
                                })
                              }
                            >
                              Cancel reservation
                            </Button>
                          )}
                      </div>
                    </div>
                  ))
              ) : (
                <Empty>No reservations. Choose a topic to begin.</Empty>
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
                  <PlacementList dashboard={d} act={act} />
                  <h3>Placement invoices</h3>
                  {d.invoices?.length ? (
                    d.invoices.map((i) => (
                      <div className="panel panel-title" key={i.id}>
                        <span>
                          Teacher success fee · {rupees(i.amountPaise)}
                        </span>
                        <Badge>{pretty(i.status)}</Badge>
                      </div>
                    ))
                  ) : (
                    <Empty>
                      No placement invoices. Both parties must confirm start and
                      tuition receipt.
                    </Empty>
                  )}
                </>
              )}
              <Notice>
                Sandbox capture is synthetic provider evidence. Live checkout,
                settlement and private meeting links remain disabled.
              </Notice>
            </>
          )}
          {tab.endsWith("pro") && <Pro dashboard={d} act={act} busy={busy} />}
          {tab.endsWith("notes") && <Notes dashboard={d} />}
          {tab.endsWith("admin") && (
            <>
              <DemoJourney session={session} act={act} />
              <AdminPanel dashboard={d} act={act} />
            </>
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
  role,
  act,
}: {
  lessons: Lesson[];
  children?: Child[];
  role?: string;
  act?: Act;
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
          {act &&
            role === "TEACHER" &&
            new Date(l.startsAt) < new Date() &&
            l.status !== "CANCELLED" && (
              <button
                className="text-button"
                onClick={() =>
                  void act(`/lessons/${l.id}/attendance`, {
                    expectedVersion: l.version,
                    attendance: "PRESENT",
                    reason: "Teacher attendance confirmation",
                  })
                }
              >
                Mark present
              </button>
            )}
          {act &&
            ["GUARDIAN", "STUDENT"].includes(role || "") &&
            l.status === "COMPLETED" &&
            !l.disputed && (
              <button
                className="text-button"
                onClick={() => {
                  const reason = prompt(
                    "What is incorrect about this attendance record?",
                  );
                  if (reason)
                    void act(`/lessons/${l.id}/disputes`, { reason }, false);
                }}
              >
                Flag error
              </button>
            )}
        </div>
      ))}
    </div>
  );
}
function RequestCard({ request, act }: { request: TuitionRequest; act: Act }) {
  const { session } = useAuth();
  const query = useQuery({
    queryKey: ["request", session?.account.id, request.id],
    queryFn: () =>
      api<TuitionRequest & { candidates: Candidate[] }>(
        `/requests/${request.id}`,
      ),
  });
  const teachers = useQuery({
    queryKey: ["teachers"],
    queryFn: () => api<{ items: Teacher[] }>("/teachers"),
  });
  return (
    <div className="panel">
      <div className="panel-title">
        <h3>
          {request.subject} · {pretty(request.mode)}
        </h3>
        <Badge>{pretty(request.status)}</Badge>
      </div>
      <p>
        {request.locality} · {request.language} · up to{" "}
        {rupees(request.budgetPaise)}/month
      </p>
      <p className="muted">{request.schedule}</p>
      {query.data?.candidates.length ? (
        query.data.candidates.map((c) => (
          <div className="candidate" key={c.id}>
            <div>
              <strong>
                {teachers.data?.items.find((t) => t.id === c.teacherId)?.name ||
                  "Candidate"}
              </strong>
              <p>{c.reasons.join(" · ")}</p>
              <Badge>Teacher response: {pretty(c.response)}</Badge>
            </div>
            {c.response === "ACCEPTED" && request.status === "OPEN" && (
              <DemoChoice
                session={session}
                requestId={request.id}
                teacherId={c.teacherId}
                act={act}
              />
            )}
          </div>
        ))
      ) : (
        <Notice>
          {request.status === "OPEN"
            ? "Waiting for operator review, teacher response and schedule confirmation. No automatic assignment."
            : "This request has an existing placement."}
        </Notice>
      )}
    </div>
  );
}
function PlacementList({
  dashboard: d,
  act,
}: {
  dashboard: Dashboard;
  act: Act;
}) {
  return (
    <>
      {d.placements?.map((p) => (
        <div className="panel" key={p.id}>
          <div className="panel-title">
            <h3>Recurring tuition terms</h3>
            <Badge>{pretty(p.status)}</Badge>
          </div>
          <p>
            {rupees(p.monthlyPaise)}/month · Direct tuition payment · pilot-v1
          </p>
          <p className="muted">
            Teacher fee: 25% of the first monthly tuition, capped at ₹1,500.
            Invoiced only after both independent start confirmations and
            acknowledged receipt.
          </p>
          <div className="action-row">
            {!(d.role === "GUARDIAN"
              ? p.guardianAccepted
              : p.teacherAccepted) && (
              <Button
                onClick={() =>
                  void act(`/placements/${p.id}/acceptances`, {
                    expectedVersion: p.version,
                    action: "ACCEPT_TERMS",
                  })
                }
              >
                Accept tuition terms
              </Button>
            )}
            {p.guardianAccepted &&
              p.teacherAccepted &&
              !(d.role === "GUARDIAN"
                ? p.guardianStarted
                : p.teacherReceiptConfirmed) && (
                <Button
                  onClick={() =>
                    void act(`/placements/${p.id}/acceptances`, {
                      expectedVersion: p.version,
                      action: "CONFIRM_START",
                    })
                  }
                >
                  {d.role === "GUARDIAN"
                    ? "Confirm first paid lesson"
                    : "Confirm lesson & tuition receipt"}
                </Button>
              )}
          </div>
        </div>
      ))}
    </>
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
function Notes({ dashboard: d }: { dashboard: Dashboard }) {
  const { session } = useAuth();
  const query = useQuery({
    queryKey: ["notes", session?.account.id],
    queryFn: () => api<{ items: Note[] }>("/notes"),
  });
  const [error, setError] = useState("");
  async function save(path: string, body: unknown) {
    try {
      setError("");
      await api(path, {
        method: "POST",
        body,
        csrf: session?.csrfToken,
        key: crypto.randomUUID(),
      });
      await query.refetch();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <Notice>
        Notes start private. Sharing grants only the named active teacher
        access. Revoking sharing stops new access; it cannot recall what a
        person already read.
      </Notice>
      {error && <Notice error>{error}</Notice>}
      <form
        className="panel form-panel"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget,
            f = new FormData(form);
          void save("/notes", {
            childId: f.get("child"),
            text: f.get("text"),
          }).then(() => form.reset());
        }}
      >
        <Field label="Learner">
          <select name="child" required>
            {d.children?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.alias}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Private note">
          <textarea
            name="text"
            required
            rows={4}
            maxLength={5000}
            placeholder="Something that would help you support their learning…"
          />
        </Field>
        <Button type="submit">
          Save privately <LockKeyhole size={16} />
        </Button>
      </form>
      <State loading={query.isPending} error={query.error} />
      {query.data?.items.map((n) => (
        <article className="panel note-card" key={n.id}>
          <Badge>
            {n.sharedTeacherId
              ? "Shared with named teacher"
              : "Private · only you"}
          </Badge>
          <p>{n.text}</p>
          <small>{date(n.createdAt)}</small>
          <div className="action-row">
            {n.sharedTeacherId ? (
              <Button
                secondary
                onClick={() =>
                  void save(`/notes/${n.id}/shares`, {
                    expectedVersion: n.version,
                    teacherId: null,
                  })
                }
              >
                Revoke sharing
              </Button>
            ) : (
              d.placements
                ?.filter(
                  (p) => p.status === "ACTIVE" && p.childId === n.childId,
                )
                .map((p) => (
                  <Button
                    secondary
                    key={p.id}
                    onClick={() =>
                      void save(`/notes/${n.id}/shares`, {
                        expectedVersion: n.version,
                        teacherId: p.teacherId,
                      })
                    }
                  >
                    Share with{" "}
                    {d.teachers?.find((t) => t.id === p.teacherId)?.name ||
                      "active teacher"}
                  </Button>
                ))
            )}
          </div>
        </article>
      ))}
      {query.data?.items.length === 0 && (
        <Empty>No notes yet. Your first note stays private.</Empty>
      )}
    </>
  );
}
function AdminPanel({ dashboard: d, act }: { dashboard: Dashboard; act: Act }) {
  const { session } = useAuth();
  const teachers = useQuery({
    queryKey: ["admin-teachers", session?.account.id],
    queryFn: () => api<{ items: Teacher[] }>("/admin/teachers"),
    enabled: session?.account.role === "ADMIN",
  });
  const requests = useQuery({
    queryKey: ["admin-requests", session?.account.id],
    queryFn: () => api<{ items: TuitionRequest[] }>("/requests"),
    enabled: session?.account.role === "ADMIN",
  });
  if (session?.account.role !== "ADMIN")
    return (
      <Notice error>
        The control console is restricted to authorized operators.
      </Notice>
    );
  return (
    <>
      <Notice>
        This synthetic console is development-only. Live privileged access is
        blocked pending MFA, role delegation and release qualification.
      </Notice>
      <div className="panel">
        <h3>Feature controls</h3>
        <p>Kill switches pause new transactions and retain existing records.</p>
        {d.flags?.map((f) => (
          <div className="control-row" key={f.name}>
            <span>
              <strong>{pretty(f.name)}</strong>
              <small>Version {f.version}</small>
            </span>
            <Badge>{f.enabled ? "Enabled" : "Paused"}</Badge>
            <Button
              secondary
              onClick={() => {
                const reason = prompt(
                  `Reason to ${f.enabled ? "pause" : "enable"} ${f.name}?`,
                );
                if (
                  reason &&
                  confirm("Confirm this audited configuration change?")
                )
                  void act(
                    `/admin/flags/${f.name}`,
                    {
                      enabled: !f.enabled,
                      expectedVersion: f.version,
                      reason,
                      confirmed: true,
                    },
                    false,
                  );
              }}
            >
              {f.enabled ? "Pause" : "Enable"}
            </Button>
          </div>
        ))}
      </div>
      <div className="panel">
        <h3>Teacher review queue</h3>
        <State loading={teachers.isPending} error={teachers.error} />
        {teachers.data?.items.map((t) => (
          <div className="control-row" key={t.id}>
            <span>
              <strong>{t.name}</strong>
              <small>
                {t.screeningComplete
                  ? "Capability checks complete"
                  : "Screening & private evidence pending"}
              </small>
            </span>
            <Badge>{pretty(t.status || "pending")}</Badge>
            <Button
              secondary
              onClick={() => {
                const reason = prompt(
                  "Reason for this teacher review decision?",
                );
                if (reason && confirm("Confirm this audited review action?"))
                  void act(
                    `/admin/teachers/${t.id}/reviews`,
                    {
                      expectedVersion: t.version,
                      status:
                        t.status === "APPROVED" ? "SUSPENDED" : "APPROVED",
                      reason,
                    },
                    true,
                  ).then(() => teachers.refetch());
              }}
            >
              {t.status === "APPROVED" ? "Suspend" : "Review approval"}
            </Button>
          </div>
        ))}
      </div>
      <div className="panel">
        <h3>Requests awaiting fit review</h3>
        {requests.data?.items
          .filter((r) => r.status === "OPEN")
          .map((r) => (
            <div className="control-row" key={r.id}>
              <span>
                <strong>
                  {r.subject} · {r.locality}
                </strong>
                <small>
                  {r.language} · {rupees(r.budgetPaise)}/month · {r.schedule}
                </small>
              </span>
              <Button
                secondary
                onClick={() =>
                  void act(
                    `/admin/requests/${r.id}/recommendations`,
                    { expectedVersion: r.version },
                    true,
                  )
                }
              >
                Build eligible shortlist
              </Button>
            </div>
          ))}
        {!requests.data?.items.some((r) => r.status === "OPEN") && (
          <Empty>No open requests.</Empty>
        )}
      </div>
      <div className="dashboard-columns">
        <div className="panel">
          <h3>Support & safety queue</h3>
          {d.cases?.length ? (
            d.cases.map((c) => (
              <div className="case-item" key={c.id}>
                <Badge>{c.category}</Badge>
                <p>{c.description}</p>
                <small>{pretty(c.status)}</small>
              </div>
            ))
          ) : (
            <Empty>No open support cases.</Empty>
          )}
        </div>
        <div className="panel">
          <h3>Integration health</h3>
          <div className="control-row">
            <span>Synthetic outbox pending</span>
            <strong>{d.jobs?.pending || 0}</strong>
          </div>
          <div className="control-row">
            <span>Failed jobs</span>
            <strong>{d.jobs?.failed || 0}</strong>
          </div>
          <p className="muted">
            OTP, verification, payments, masked audio, private media and
            reconciliation: live adapters unconfigured.
          </p>
        </div>
      </div>
      <div className="panel">
        <h3>Append-only audit history</h3>
        {d.audit?.length ? (
          d.audit.map((a) => (
            <div className="audit-item" key={a.id}>
              <strong>{pretty(a.action)}</strong>
              <span>{a.reason}</span>
              <small>{date(a.createdAt)}</small>
            </div>
          ))
        ) : (
          <Empty>No privileged actions recorded yet.</Empty>
        )}
      </div>
    </>
  );
}
function Support() {
  const { session } = useAuth();
  const [message, setMessage] = useState(""),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      if (!session) throw new Error("Sign in to submit a private case.");
      const c = await api<{ id: string }>("/cases", {
        method: "POST",
        csrf: session.csrfToken,
        key: crypto.randomUUID(),
        body: {
          category: f.get("category"),
          description: f.get("description"),
        },
      });
      setMessage(
        `Case ${c.id.slice(0, 8)} saved. This development environment has no live support operator or delivery provider.`,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <main className="container narrow section">
      <PageTitle
        eyebrow="WE’RE HERE TO HELP"
        title="A little support, when it matters."
        subtitle="Safety reporting and ordinary support remain free, with or without Pro."
      />
      <Notice>
        This is a development service with no emergency response. For immediate
        danger, contact local emergency services.
      </Notice>
      <form className="panel form-panel" onSubmit={submit}>
        <Field label="What can we help with?">
          <select name="category">
            <option value="GENERAL">General question</option>
            <option value="SAFETY">Safety concern</option>
            <option value="REPLACEMENT">Teacher replacement</option>
            <option value="ATTENDANCE">Attendance record</option>
            <option value="PAYMENT">Payment or refund</option>
            <option value="PRIVACY">Privacy, correction or deletion</option>
          </select>
        </Field>
        <Field label="Tell us what happened">
          <textarea
            rows={6}
            name="description"
            required
            maxLength={3000}
            placeholder="Share only what’s needed to help resolve this case."
          />
        </Field>
        {message && <Notice>{message}</Notice>}
        {error && <Notice error>{error}</Notice>}
        <Button type="submit" disabled={!session}>
          Submit a private case <LifeBuoy size={17} />
        </Button>
        {!session && (
          <Link className="inline-link" href="/login">
            Sign in to submit →
          </Link>
        )}
      </form>
    </main>
  );
}
function Routes() {
  const path = usePathname();
  return path === "/" ? (
    <Home />
  ) : path === "/teachers" ? (
    <Teachers />
  ) : path.startsWith("/teachers/") ? (
    <Profile slug={path.split("/")[2]} />
  ) : path === "/login" ? (
    <Login />
  ) : path === "/onboarding/parent" ? (
    <IntakeForm />
  ) : path === "/onboarding/teacher" ? (
    <TeacherOnboarding />
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
    [hindi, setHindi] = useState(false);
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
    <Auth.Provider value={{ session, loading, setSession, hindi, setHindi }}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Header />
      <div id="main" tabIndex={-1}>
        <Routes />
      </div>
      <Footer />
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
