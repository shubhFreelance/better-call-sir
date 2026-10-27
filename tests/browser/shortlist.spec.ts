import { chooseHindi, checkHindi } from "../helpers/hindi";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { validator } from "../helpers/contract";
const parent = "10000000-0000-4000-8000-000000000097",
  child = "20000000-0000-4000-8000-000000000097",
  teacherId = "30000000-0000-4000-8000-000000000097",
  requestId = "40000000-0000-4000-8000-000000000097",
  candidateId = "50000000-0000-4000-8000-000000000097",
  runId = "60000000-0000-4000-8000-000000000097",
  placementId = "70000000-0000-4000-8000-000000000097";
const future = (days = 2) =>
  new Date(Date.now() + days * 86400000).toISOString();
const local = (iso: string) =>
  new Date(new Date(iso).getTime() + 330 * 60000).toISOString().slice(0, 16);
async function mock(
  page: Page,
  mode:
    | "normal"
    | "weekly"
    | "waiting"
    | "uncertain"
    | "stale"
    | "confirmed"
    | "terms"
    | "uncertain-terms"
    | "expired"
    | "no-match"
    | "student"
    | "completed-demo" = "normal",
) {
  const profile = {
    id: teacherId,
    slug: "synthetic-shortlist-teacher",
    name: "Synthetic Teacher",
    headline: "Patient explanations and practice",
    bio: "Synthetic teaching profile",
    subjects: ["Maths"],
    boards: ["CBSE"],
    grades: [8],
    languages: ["English"],
    modes: ["ONLINE"],
    localities: [],
    monthlyPaise: 250050,
    experience: 4,
    avatarColor: "#034F46",
    capabilityLabel: "Reviewed Maths coverage",
    consultationOptIn: false,
  };
  let candidate: any = {
    id: candidateId,
    requestId,
    teacherId,
    score: 75,
    reasons: [
      "Maths · Class 8 · CBSE",
      "English instruction",
      "Within budget, capacity and confirmed schedule",
    ],
    rankerVersion: "rule-v1",
    response: "ACCEPTED",
    version: 2,
    runId,
    expiresAt:
      mode === "expired" ? new Date(Date.now() - 1000).toISOString() : future(),
    presentedAt: new Date().toISOString(),
    position: 1,
  };
  let request: any = {
    id: requestId,
    guardianId: parent,
    childId: child,
    subject: "Maths",
    mode: "ONLINE",
    language: "English",
    locality: "Shankar Nagar",
    budgetPaise: 300029,
    schedule: "Synthetic after-school tuition",
    status: "OPEN",
    version: 1,
    createdAt: new Date().toISOString(),
    discoveryMethod: "ASSISTED",
    preferredTeacherId: null,
    scheduleStatus: "CONFIRMED",
    matchStatus: mode === "no-match" ? "NO_MATCH" : mode === "waiting" ? "PENDING" : "MATCHED",
    selectedCandidateId: null,
    schedulePreferences: {
      timezone: "Asia/Kolkata",
      slots: [
        {
          startsAt: future(),
          endsAt: new Date(
            new Date(future()).getTime() + 3600000,
          ).toISOString(),
        },
      ],
    },
    candidates: ["no-match", "completed-demo", "waiting"].includes(mode)
      ? []
      : [candidate],
  };
  if (mode === "weekly" || mode === "waiting")
    request.schedulePreferences = {
      timezone: "Asia/Kolkata",
      weekly: [{ weekday: 1, startMinute: 960, endMinute: 1200 }],
    };
  let p: any =
    mode === "terms" || mode === "uncertain-terms" || mode === "confirmed"
      ?  {
          id: placementId,
          guardianId: parent,
          teacherId,
          childId: child,
          requestId,
          monthlyPaise: 250050,
          policyVersion: "pilot-v1",
          guardianAccepted: mode === "confirmed",
          teacherAccepted: true,
          guardianStarted: false,
          teacherReceiptConfirmed: false,
          status: "TERMS_PENDING",
          version: 1,
          createdAt: new Date().toISOString(),
        }
      : null;
  const paths: string[] = [],
    keys: string[] = [],
    bodies: any[] = [],
    seen: any[] = [],
    replay = new Map<string, any>();
  let accountRole = mode === "student" ? "STUDENT" : "GUARDIAN";
  let savedChoices = 0,
    stale = mode === "stale",
    termsSaved = 0;
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    paths.push(req.method() + " " + path);
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: parent,
            name: "Synthetic Guardian",
            role: accountRole,
            verified: mode !== "student",
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (path.endsWith("/dashboard/hiring")) {
      const data = {
        role: accountRole,
        asOf: new Date().toISOString(),
        definitionVersion: "hiring-v1",
        section: "ARRANGEMENTS",
        counts: {
          enquiries: 1,
          openEnquiries: 1,
          pendingResponses: 0,
          termsPending: p ? 1 : 0,
          activeArrangements: 0,
        },
        enquiries: [],
        learners: [],
        learnersLimited: false,
        nextCursor: null,
        arrangements: p
          ? [
              {
                id: p.id,
                subject: "Maths",
                mode: "ONLINE",
                status: p.status,
                guardianAccepted: p.guardianAccepted,
                teacherAccepted: p.teacherAccepted,
                guardianStarted: false,
                teacherReceiptConfirmed: false,
                learner: {
                  alias: "Synthetic Learner",
                  grade: 8,
                  board: "CBSE",
                },
                teacher: {
                  id: teacherId,
                  name: profile.name,
                  status: "APPROVED",
                },
                monthlyPaise: p.monthlyPaise,
                version: p.version,
                policyVersion: p.policyVersion,
                placementFeePaise: 62513,
              },
            ]
          : [],
        ...(accountRole === "GUARDIAN"
          ? { gate: { verified: true, consent: true, privacyPaused: false } }
          : { profile: null }),
      };
      expect(url.searchParams.get("arrangementId")).toBe(placementId);
      expect(validator("HiringDashboard")(data)).toBe(true);
      return route.fulfill({ json: data });
    }
    if(path.endsWith('/tuition-bookings/PLACEMENT/'+placementId)&&p)return route.fulfill({json:{id:p.id,kind:'PLACEMENT',version:p.version,month:'2026-11',bookingVersion:2,monthlyPaise:p.monthlyPaise,policyVersion:p.policyVersion,familyConfirmed:p.guardianAccepted,teacherConfirmed:p.teacherAccepted,confirmed:p.guardianAccepted&&p.teacherAccepted,closed:p.status==='CLOSED',canConfirm:true,proActive:false,canMarkCompleted:false,completions:[]}});
    if (path.endsWith("/dashboard")) {
      const { candidates, ...summary } = request;
      return route.fulfill({
        json: {
          role: accountRole,
          window: {
            start: new Date(Date.now() - 30 * 86400000).toISOString(),
            end: new Date().toISOString(),
            timezone: "Asia/Kolkata",
            metricVersion: "synthetic-v1",
          },
          metrics: { classesTaken: 0, pendingAttendance: 0, disputed: 0 },
          children: [
            { id: child, alias: "Synthetic Learner", grade: 8, board: "CBSE" },
          ],
          teachers: [profile],
          lessons: [],
          placements: p ? [p] : [],
          ...(mode !== "student"
            ? {
                requests: [summary],
                consent: { withdrawnAt: null },
                reservations: [],
              }
            : {}),
        },
      });
    }
    if(path.endsWith('/requests')&&req.method()==='GET'){const {candidates,...summary}=request;return route.fulfill({json:{items:[summary],nextCursor:null}});}
    if(path.endsWith('/direct-enquiries')&&req.method()==='GET')return route.fulfill({json:{items:[],counts:{},nextCursor:null}});
    if (path === `/api/v1/requests/${requestId}`) {
      const check = validator("TuitionRequestDetails");
      expect(check(request), JSON.stringify(check.errors)).toBe(true);
      return route.fulfill({ json: request });
    }
    if (path.endsWith("/demos")) {
      const reservation = {
        id: "a0000000-0000-4000-8000-000000000097",
        teacherId,
        guardianId: parent,
        childId: child,
        kind: "DEMO",
        startsAt: new Date(Date.now() - 7200000).toISOString(),
        endsAt: new Date(Date.now() - 5400000).toISOString(),
        status: "CONFIRMED",
        expiresAt: null,
        version: 1,
        topic: "Maths demo",
        scopeAccepted: true,
        amountPaise: 0,
        payablePaise: 0,
        pricePolicyVersion: "demo-dev-v1",
        subject: "Maths",
        language: "English",
        createdAt: new Date().toISOString(),
      };
      const demo = {
        id: "b0000000-0000-4000-8000-000000000097",
        requestId,
        teacherId,
        guardianId: parent,
        reservationId: reservation.id,
        status: "COMPLETED",
        guardianAccepted: true,
        teacherAccepted: true,
        guardianOutcome: "COMPLETED",
        teacherOutcome: "COMPLETED",
        supportCaseId: null,
        version: 4,
        createdAt: new Date().toISOString(),
        reservation,
      };
      if (mode === "completed-demo") {
        const check = validator("Demo");
        expect(check(demo), JSON.stringify(check.errors)).toBe(true);
      }
      return route.fulfill({
        json: { items: mode === "completed-demo" ? [demo] : [] },
      });
    }
    if (path.endsWith("/teachers")) {
      if (!url.searchParams.get("cursor"))
        return route.fulfill({
          json: {
            items: [],
            nextCursor: "30000000-0000-4000-8000-000000000096",
          },
        });
      return route.fulfill({ json: { items: [profile], nextCursor: null } });
    }
    if (path.endsWith("/presentations")) {
      const body = req.postDataJSON();
      seen.push(body);
      expect(body).toEqual({ runId, candidateIds: [candidateId] });
      return route.fulfill({
        status: 201,
        json: {
          id: "80000000-0000-4000-8000-000000000097",
          requestId,
          runId,
          actorId: parent,
          candidateIds: [candidateId],
          kind: "GUARDIAN_SHOWN",
          reason: "Rendered shortlist",
          createdAt: new Date().toISOString(),
        },
      });
    }
    if (path.endsWith("/selections")) {
      keys.push(req.headers()["idempotency-key"]);
      bodies.push(req.postDataJSON());
      if (replay.has(keys.at(-1)!))
        return route.fulfill({ status: 201, json: replay.get(keys.at(-1)!) });
      if (stale) {
        stale = false;
        request = { ...request, version: 2 };
        candidate = { ...candidate, version: 3 };
        request.candidates = [candidate];
        return route.fulfill({
          status: 409,
          json: { code: "CONFLICT", message: "Request changed." },
        });
      }
      expect(req.postDataJSON()).toMatchObject({
        expectedVersion: request.version,
        candidateVersion: candidate.version,
        candidateId,
      });
      savedChoices++;
      request = {
        ...request,
        selectedCandidateId: candidateId,
        version: request.version + 1,
      };
      const result = {
        id: "90000000-0000-4000-8000-000000000097",
        candidateId,
        runId,
        actorId: parent,
        action: "GUARDIAN_SELECTED",
        candidateVersion: candidate.version,
        createdAt: new Date().toISOString(),
        requestVersion: request.version,
      };
      expect(validator("Selection")(result)).toBe(true);
      replay.set(keys.at(-1)!, result);
      if (mode === "uncertain")
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: "unreadable choice result",
        });
      return route.fulfill({ status: 201, json: result });
    }
    if (path === "/api/v1/placements") {
      expect(req.postDataJSON()).toEqual({ requestId, teacherId });
      p = {
        id: placementId,
        guardianId: parent,
        teacherId,
        childId: child,
        requestId,
        monthlyPaise: 250050,
        policyVersion: "pilot-v1",
        guardianAccepted: false,
        teacherAccepted: false,
        guardianStarted: false,
        teacherReceiptConfirmed: false,
        status: "TERMS_PENDING",
        version: 1,
        createdAt: new Date().toISOString(),
      };
      const check = validator("Placement");
      expect(check(p), JSON.stringify(check.errors)).toBe(true);
      return route.fulfill({ status: 201, json: p });
    }
    if (path === `/api/v1/placements/${placementId}/schedules`)
      return route.fulfill({ json: { items: [] } });
    if (path === `/api/v1/placements/${placementId}/acceptances`) {
      keys.push(req.headers()["idempotency-key"]);
      bodies.push(req.postDataJSON());
      if (replay.has(keys.at(-1)!))
        return route.fulfill({ status: 201, json: replay.get(keys.at(-1)!) });
      expect(req.postDataJSON()).toEqual({
        expectedVersion: p.version,
        action: "ACCEPT_TERMS",
      });
      termsSaved++;
      p = {
        ...p,
        ...(accountRole === "TEACHER"
          ? { teacherAccepted: true }
          : { guardianAccepted: true }),
        version: p.version + 1,
      };
      const check = validator("Placement");
      expect(check(p), JSON.stringify(check.errors)).toBe(true);
      replay.set(keys.at(-1)!, p);
      if (mode === "uncertain-terms")
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: "unreadable terms result",
        });
      return route.fulfill({ status: 201, json: p });
    }
    if (path === `/api/v1/requests/${requestId}/schedules`) {
      const body = req.postDataJSON();
      expect(body.expectedVersion).toBe(request.version);
      expect(body.timezone).toBe("Asia/Kolkata");
      expect(validator("RequestScheduleInput")(body)).toBe(true);
      request = {
        ...request,
        version: request.version + 1,
        schedulePreferences:
          "weekly" in body
            ? { timezone: body.timezone, weekly: body.weekly }
            : { timezone: body.timezone, slots: body.slots },
        scheduleStatus: "CONFIRMED",
        matchStatus: "PENDING",
        selectedCandidateId: null,
        candidates: [],
      };
      return route.fulfill({ status: 201, json: request });
    }
    return route.fulfill({
      status: 404,
      json: { code: "NOT_FOUND", message: "Synthetic route unavailable" },
    });
  });
  return {
    paths,
    keys,
    bodies,
    seen,
    getChoices: () => savedChoices,
    getTerms: () => termsSaved,
    asTeacher: () => {
      accountRole = "TEACHER";
    },
  };
}
async function choose(page: Page) {
  await page
    .getByRole("button", { name: "Select teacher", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Choose Synthetic Teacher?" }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: /I understand this records/ })
    .check();
  await page.getByRole("button", { name: "Confirm teacher choice" }).click();
}
test("reviewed shortlist resolves paginated profiles, records visible options and saves an explicit choice without assignment", async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto("/dashboard/requests");
  await expect(
    page.getByRole("heading", { name: "Synthetic Teacher", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Up to ₹3,000.29", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("₹2,500.50 per month · 4 years teaching"),
  ).toBeVisible();
  await page
    .locator(`[data-candidate-id="${candidateId}"]`)
    .scrollIntoViewIfNeeded();
  await expect.poll(() => state.seen.length).toBe(1);
  await choose(page);
  await expect(
    page.getByText(
      "Teacher choice saved. This does not assign a teacher or start tuition.",
    ),
  ).toBeVisible();
  expect(state.getChoices()).toBe(1);
  expect(
    state.paths.filter(
      (p) =>
        p.startsWith("POST") &&
        (p.endsWith("/placements") || p.endsWith("/demos")),
    ),
  ).toEqual([]);
});
test("unknown teacher-choice result freezes edits and retries the same key and versions", async ({
  page,
}) => {
  const state = await mock(page, "uncertain");
  await page.goto("/dashboard/requests");
  await choose(page);
  await expect(
    page.getByText(/We couldn’t confirm this decision/),
  ).toBeVisible();
  await expect(page.getByLabel("Choose a tuition request")).toBeDisabled();
  await expect(
    page.getByRole("checkbox", { name: /I understand this records/ }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Retry same decision" }).click();
  await expect(
    page.getByText("Your saved choice", { exact: true }),
  ).toBeVisible();
  expect(state.keys).toHaveLength(2);
  expect(state.keys[0]).toBe(state.keys[1]);
  expect(state.bodies[0]).toEqual(state.bodies[1]);
  expect(state.getChoices()).toBe(1);
});
test("stale request/candidate versions preserve confirmation until explicit shortlist refresh", async ({
  page,
}) => {
  const state = await mock(page, "stale");
  await page.goto("/dashboard/requests");
  await choose(page);
  await expect(page.getByText("Request changed.")).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: /I understand this records/ }),
  ).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Confirm teacher choice" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Refresh shortlist" }).click();
  await expect(
    page.getByRole("button", { name: "Confirm teacher choice" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Confirm teacher choice" }).click();
  await expect(
    page.getByText("Your saved choice", { exact: true }),
  ).toBeVisible();
  expect(state.bodies[1]).toMatchObject({
    expectedVersion: 2,
    candidateVersion: 3,
  });
});
test("tuition acceptance requires review, survives an uncertain response and keeps start blocked without an agreed timetable", async ({
  page,
}) => {
  const state = await mock(page, "uncertain-terms");
  await page.goto("/dashboard/bookings");
  await page
    .getByRole("button", { name: "Review & accept tuition terms" })
    .click();
  await page
    .getByRole("button", { name: "Accept tuition terms", exact: true })
    .click();
  await expect(
    page.getByText(
      "Confirm the agreement or actual start details before saving.",
    ),
  ).toBeVisible();
  expect(state.getTerms()).toBe(0);
  await page
    .getByRole("checkbox", { name: /I have reviewed the monthly amount/ })
    .check();
  await page
    .getByRole("button", { name: "Accept tuition terms", exact: true })
    .click();
  await expect(
    page.getByText(/We couldn’t confirm this decision/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry same decision" }).click();
  await expect(
    page.getByText("Your tuition-term acceptance is saved."),
  ).toBeVisible();
  expect(state.keys[0]).toBe(state.keys[1]);
  expect(state.bodies[0]).toEqual(state.bodies[1]);
  expect(state.getTerms()).toBe(1);
  await expect(
    page.getByRole("button", { name: "Confirm first paid lesson" }),
  ).toBeDisabled();
});
test("availability update validates locally, sends exact UTC preferences and clears the reviewed shortlist", async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto("/dashboard/requests");
  await page
    .getByRole("button", {
      name: "Update availability preferences",
      exact: true,
    })
    .click();
  await page.getByLabel("Preferred start 1 (IST)").fill("");
  await page
    .getByRole("button", { name: "Save availability preferences" })
    .click();
  await expect(
    page.getByText(/Confirm nonoverlapping 20–120 minute windows/),
  ).toBeVisible();
  expect(
    state.paths.filter(
      (p) => p === "POST /api/v1/requests/" + requestId + "/schedules",
    ),
  ).toHaveLength(0);
  const start = future(4);
  await page.getByLabel("Preferred start 1 (IST)").fill(local(start));
  await page
    .getByRole("checkbox", {
      name: /reviewed shortlist and teacher choice will be reset/,
    })
    .check();
  await page
    .getByRole("button", { name: "Save availability preferences" })
    .click();
  await expect(
    page.getByText(
      "Availability preferences saved. The previous shortlist has been cleared for a new review.",
    ),
  ).toBeVisible();
  await expect(page.locator("[data-candidate-id]")).toHaveCount(0);
  await expect(
    page.getByText(
      "Your shortlist is awaiting review or current teacher responses. Refresh later or contact support for help.",
    ),
  ).toBeVisible();
});
test("expired and unmatched options do not offer choices or record false impressions", async ({
  page,
}) => {
  const state = await mock(page, "expired");
  await page.goto("/dashboard/requests");
  await expect(
    page.getByText("Refresh the shortlist before choosing this option."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Select teacher", exact: true }),
  ).toHaveCount(0);
  await page.locator("[data-candidate-id]").scrollIntoViewIfNeeded();
  expect(state.seen).toHaveLength(0);
});
test("student direct access never loads family requests or agreement controls", async ({
  page,
}) => {
  const state = await mock(page, "student");
  await page.goto("/dashboard/requests");
  await expect(
    page.getByRole("heading", {
      name: "Tuition choices belong to your guardian.",
    }),
  ).toBeVisible();
  expect(
    state.paths.filter(
      (p) => p.includes("/requests/") || p.includes("/placements/"),
    ),
  ).toEqual([]);
});
test("shortlist choices and term review fit on mobile and have no serious accessibility findings", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/dashboard/requests");
  await expect(
    page.getByRole("heading", { name: "Synthetic Teacher", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: "test-results/shortlist-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await page
    .getByRole("button", { name: "Select teacher", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  let result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact || ""),
    ),
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/shortlist-choice-mobile.png",
    fullPage: true,
  });
  await page.unroute("**/api/v1/**");
  await mock(page, "uncertain-terms");
  await page.goto("/dashboard/bookings");
  await page
    .getByRole("button", { name: "Review & accept tuition terms" })
    .click();
  await expect(
    page.getByRole("checkbox", { name: /I have reviewed the monthly amount/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact || ""),
    ),
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/tuition-terms-mobile.png",
    fullPage: true,
  });
});

test("no-match requests show a recovery path without claiming a teacher assignment", async ({
  page,
}) => {
  const state = await mock(page, "no-match");
  await page.goto("/dashboard/requests");
  await expect(
    page.getByText(
      "No eligible teacher is on this shortlist right now. Review your criteria or contact support.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Get help with this request" }),
  ).toHaveAttribute("href", `/support?request=${requestId}`);
  await expect(
    page.getByRole("button", { name: "Select teacher", exact: true }),
  ).toHaveCount(0);
  expect(state.seen).toHaveLength(0);
});

test("a completed demo can open pending tuition terms after its shortlist is empty", async ({
  page,
}) => {
  const state = await mock(page, "completed-demo");
  await page.goto("/dashboard/requests");
  await expect(page.locator("[data-candidate-id]")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Review tuition terms", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: /open a pending tuition agreement/ })
    .check();
  await page.getByRole("button", { name: "Open tuition agreement" }).click();
  await expect(
    page.getByText(
      "Tuition terms created. View your arrangement to review the amount and both parties’ acceptance.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View tuition arrangement" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View tuition arrangement" }),
  ).toBeVisible();
  expect(state.seen).toHaveLength(0);
  expect(
    state.paths.filter((p) => p === "POST /api/v1/placements"),
  ).toHaveLength(1);
});

test('confirmed agreement handoff offers viewing, opens the exact dedicated arrangement and requests no new acceptance',async({page})=>{
 const state=await mock(page,'confirmed');await page.goto('/dashboard/requests?request='+requestId);const handoff=page.locator('.enquiry-handoff');await expect(handoff).toContainText('Hiring terms confirmed');await expect(handoff).toContainText('Both parties have accepted.');await expect(handoff.getByRole('link',{name:'Continue to hiring confirmation',exact:true})).toHaveCount(0);const view=handoff.getByRole('link',{name:'View tuition arrangement',exact:true});await expect(view).toHaveAttribute('href','/dashboard/arrangements?placement='+placementId);await view.click();await expect(page).toHaveURL('/dashboard/arrangements?placement='+placementId);const card=page.locator('.placement-summary');await expect(card).not.toHaveAttribute('open');await card.locator(':scope > summary').click();await expect(card.locator('.monthly-hiring')).toContainText('Both parties confirmed this month.');await expect(card.getByRole('button',{name:'Confirm monthly tuition',exact:true})).toHaveCount(0);expect(state.getTerms()).toBe(0);
});

test("an accepted teacher can open terms without a demo", async ({ page }) => {
  const state = await mock(page);
  await page.goto("/dashboard/requests");
  await expect(
    page.getByRole("button", { name: "Choose & arrange optional demo" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Select teacher", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: /records my teacher choice/ })
    .check();
  await page.getByRole("button", { name: "Confirm teacher choice" }).click();
  await page
    .getByRole("button", {
      name: "Review tuition terms without a demo",
      exact: true,
    })
    .click();
  await expect(
    page.getByText(/A demo is optional\. Opening terms/),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: /open a pending tuition agreement/ })
    .check();
  await page.getByRole("button", { name: "Open tuition agreement" }).click();
  await expect(
    page.getByRole("link", { name: "View tuition arrangement" }),
  ).toBeVisible();
  expect(
    state.paths.filter((p) => p === "POST /api/v1/placements"),
  ).toHaveLength(1);
  expect(state.paths.filter((p) => p === "POST /api/v1/demos")).toHaveLength(0);
});

test("family reads and updates weekly availability without changing to dated class windows", async ({
  page,
}) => {
  const state = await mock(page, "weekly");
  await page.goto("/dashboard/requests");
  await expect(
    page.getByText("Monday · 16:00–20:00 IST", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Update availability preferences",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("radio", { name: "Weekly preferences", exact: true }),
  ).toBeChecked();
  await expect(page.locator('input[type="datetime-local"]')).toHaveCount(0);
  await page.getByLabel("Preferred day 1", { exact: true }).selectOption("3");
  await page
    .getByRole("checkbox", {
      name: /reviewed shortlist and teacher choice will be reset/,
    })
    .check();
  await page
    .getByRole("button", { name: "Save availability preferences", exact: true })
    .click();
  await expect(
    page.getByText("Wednesday · 16:00–20:00 IST", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-candidate-id]")).toHaveCount(0);
  expect(
    state.paths.filter((p) => p.endsWith("/schedules") && p.startsWith("POST")),
  ).toHaveLength(1);
});

test("enquiry selection hands off to exact mutual hiring confirmation without class planning", async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto("/dashboard/requests?request=" + requestId);
  await expect(
    page.getByRole("list", { name: "Enquiry to hiring progress" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Review tuition terms without a demo",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Select teacher", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: /records my teacher choice/ })
    .check();
  await page.getByRole("button", { name: "Confirm teacher choice" }).click();
  await expect(
    page.getByText("Teacher choice recorded", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Review tuition terms without a demo",
      exact: true,
    })
    .click();
  await page
    .getByRole("checkbox", { name: /open a pending tuition agreement/ })
    .check();
  await page.getByRole("button", { name: "Open tuition agreement" }).click();
  await expect(
    page.getByRole("link", { name: "View tuition arrangement" }),
  ).toHaveAttribute("href", "/dashboard/arrangements?placement=" + placementId);
  await expect(
    page.getByRole("heading", { name: "Recurring tuition terms" }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "View tuition arrangement" })
    .click();
  await expect(page).toHaveURL('/dashboard/arrangements?placement='+placementId);
  const arrangement=page.locator('.placement-summary');await expect(arrangement).not.toHaveAttribute('open');await arrangement.locator(':scope > summary').click();await expect(arrangement.getByRole('link',{name:'Help and case progress for this arrangement',exact:true})).toHaveAttribute('href','/support?placement='+placementId);expect(state.getTerms()).toBe(0);
  expect(
    state.paths.filter(
      (p) =>
        p.includes("/schedules") ||
        p.includes("/lessons") ||
        p.includes("/checkout"),
    ),
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/hiring-journey-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/hiring-journey-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact || ""),
    ),
  ).toEqual([]);
});
test("an unavailable enquiry link never falls back to another learner request", async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto(
    "/dashboard/requests?request=40000000-0000-4000-8000-000000000099",
  );
  await expect(page.getByText(/This enquiry is not available/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Select teacher", exact: true }),
  ).toHaveCount(0);
  expect(
    state.paths.some((p) => p === "GET /api/v1/requests/" + requestId),
  ).toBe(false);
});

test("no-match recovery preserves the enquiry and offers availability, manual search and support", async ({
  page,
}) => {
  const state = await mock(page, "no-match");
  await page.goto("/dashboard/requests?request=" + requestId);
  const recovery = page.getByRole("region", { name: "Enquiry recovery" });
  await expect(
    recovery.getByRole("heading", {
      name: "Keep your enquiry. Explore another path.",
    }),
  ).toBeVisible();
  await expect(
    recovery.getByRole("link", { name: "Browse teachers manually" }),
  ).toHaveAttribute("href", "/teachers");
  await expect(
    recovery.getByRole("link", { name: "Request future coverage" }),
  ).toHaveAttribute("href", "/waitlist");
  await recovery.getByRole("link", { name: "Review availability" }).click();
  await expect(
    page.getByRole("button", {
      name: "Update availability preferences",
      exact: true,
    }),
  ).toBeVisible();
  expect(state.paths.filter((p) => p.startsWith("POST"))).toEqual([]);
});

for (const [width, hindi] of [[1280, false], [390, false], [320, true]] as const) {
  test(`enquiry brief has compact grouped facts and preferences at ${width}px ${hindi ? "Hindi" : "English"}`, async ({ page }) => {
    if (hindi) await chooseHindi(page);
    const state = await mock(page, "waiting");
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/dashboard/requests");
    const card = page.locator(".tuition-request-review");
    await expect(card.locator(".tuition-summary dt").first()).toHaveCSS("font-size", "11px");
    await expect(card.locator(".tuition-summary dd").nth(2)).toHaveCSS("font-size", "16px");
    await expect(card.locator(".enquiry-availability-panel .wizard-help")).toHaveCSS("font-size", "12px");
    await expect(card.locator(".enquiry-options-panel [role=status]")).toBeVisible();
    await expect(card.locator(".enquiry-progress [aria-current=step]")).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const accessibility = await new AxeBuilder({ page }).include(".tuition-request-review").analyze();
    expect(accessibility.violations.filter(item => ["serious", "critical"].includes(item.impact || ""))).toEqual([]);
    if (hindi) await checkHindi(page);
    await card.screenshot({ path: `test-results/enquiry-brief-${width}-${hindi ? "hi" : "en"}.png` });
    await card.getByRole("button", { name: hindi ? "उपलब्धता की पसंद बदलें" : "Update availability preferences", exact: true }).click();
    await expect(card.locator("form.tuition-confirm")).toBeVisible();
    expect(state.paths.filter(path => path.startsWith("POST"))).toEqual([]);
  });
}

test("Hindi complete interface — शिक्षक की सूची और चयन", async ({ page }) => {
  await chooseHindi(page);
  await mock(page);
  await page.goto("/dashboard/requests");
  await checkHindi(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await checkHindi(page);
});
