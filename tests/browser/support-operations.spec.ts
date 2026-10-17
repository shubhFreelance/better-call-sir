import { chooseHindi, checkHindi } from "../helpers/hindi";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { validator } from "../helpers/contract";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ids } from "../../packages/test-fixtures/src";
import { verifiedStaffSession, cleanupStaffFixtures } from "./staff-fixture";
test.use({ trace: "off" });
test.afterEach(async () => cleanupStaffFixtures());
const actor = "10000000-0000-4000-8000-000000000141",
  owner = "10000000-0000-4000-8000-000000000142",
  caseId = "20000000-0000-4000-8000-000000000141",
  update = "30000000-0000-4000-8000-000000000141",
  other = "30000000-0000-4000-8000-000000000142",
  demoId = "40000000-0000-4000-8000-000000000141",
  lessonId = "50000000-0000-4000-8000-000000000141",
  reservation = "60000000-0000-4000-8000-000000000141";
const now = () => new Date().toISOString(),
  past = () => new Date(Date.now() - 86400000).toISOString();
async function mock(page: Page, mode = "normal", role = "OPERATOR") {
  let c: any = {
      id: caseId,
      accountId: owner,
      region: "Raipur",
      assignedToId: null,
      placementId: null,
      reservationId: null,
      resolution: null,
      category: "REPLACEMENT",
      description: "Synthetic replacement concern: please review teaching fit.",
      status: "OPEN",
      version: 2,
      createdAt: now(),
      updatedAt: now(),
    },
    updates: any[] = [
      {
        id: update,
        message: "Synthetic private staff context.",
        internal: true,
        author: "SUPPORT",
        createdAt: now(),
      },
    ];
  let lesson: any = {
    id: lessonId,
    placementId: null,
    recurringScheduleId: null,
    reservationId: null,
    teacherId: actor,
    childId: owner,
    kind: "RECURRING",
    subject: "Maths",
    startsAt: past(),
    endsAt: new Date(Date.now() - 82800000).toISOString(),
    status: "COMPLETED",
    attendance: "ABSENT",
    disputed: true,
    version: 4,
    recap: "Synthetic teacher recap.",
    recapSubmittedAt: past(),
    learner: { alias: "Aarav · synthetic", grade: 8, board: "CBSE" },
    teacher: { id: actor, name: "Ananya · synthetic" },
    participantReviews: [
      {
        action: "DISPUTED",
        reason: "I joined the lesson.",
        lessonVersion: 3,
        createdAt: past(),
      },
    ],
    cases: [{ id: caseId, status: "OPEN", version: 2 }],
  };
  const r = {
    id: reservation,
    teacherId: actor,
    guardianId: owner,
    childId: owner,
    kind: "DEMO",
    startsAt: past(),
    endsAt: new Date(Date.now() - 84600000).toISOString(),
    status: "CONFIRMED",
    expiresAt: null,
    version: 1,
    topic: "Synthetic demo",
    scopeAccepted: true,
    amountPaise: 0,
    createdAt: past(),
    subject: "Maths",
    language: "English",
    pricePolicyVersion: "pilot-v1",
    payablePaise: 0,
  };
  let demo: any = {
    id: demoId,
    requestId: owner,
    teacherId: actor,
    guardianId: owner,
    reservationId: reservation,
    status: "DISPUTED",
    guardianAccepted: true,
    teacherAccepted: true,
    guardianOutcome: "NO_SHOW",
    teacherOutcome: "ATTENDED",
    supportCaseId: caseId,
    version: 3,
    createdAt: past(),
    reservation: r,
  };
  const writes: { path: string; body: any; key: string }[] = [],
    reads: string[] = [],
    replays = new Map<string, any>();
  let stale = mode === "stale",
    fail = false;
  const check = (name: string, data: any) => {
    const v = validator(name);
    expect(v(data), JSON.stringify(v.errors)).toBe(true);
    return data;
  };
  const rawLesson = (x: any) => {
    const { learner, teacher, participantReviews, cases, ...raw } = x;
    return raw;
  };
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: actor,
            name: "Synthetic support operator",
            role,
            verified: true,
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (path.endsWith("/auth/mfa"))
      return route.fulfill({
        json: {
          enabled: true,
          verifiedUntil:
            mode === "mfa" ? null : new Date(Date.now() + 600000).toISOString(),
          recoveryCodesRemaining: 8,
        },
      });
    if (req.method() === "GET") {
      reads.push(path + url.search);
      if (path.endsWith("/dashboard"))
        return route.fulfill({
          json: {
            role,
            window: {
              start: now(),
              end: now(),
              timezone: "Asia/Kolkata",
              metricVersion: "synthetic",
            },
            metrics: {},
          },
        });
      if (path.endsWith("/cases")) {
        if (fail) {
          fail = false;
          return route.fulfill({
            status: 503,
            json: {
              code: "UNAVAILABLE",
              message: "Cases temporarily unavailable.",
            },
          });
        }
        const matches =
          (!url.searchParams.has("status") ||
            url.searchParams.get("status") === c.status) &&
          (!url.searchParams.has("category") ||
            url.searchParams.get("category") === c.category) &&
          (!url.searchParams.has("assignment") ||
            (url.searchParams.get("assignment") === "ME" &&
              c.assignedToId === actor) ||
            (url.searchParams.get("assignment") === "UNASSIGNED" &&
              !c.assignedToId));
        return route.fulfill({
          json: check("SupportCaseList", {
            items: matches ? [c] : [],
            nextCursor: null,
          }),
        });
      }
      if (path.endsWith("/cases/" + caseId))
        return route.fulfill({
          json: check("SupportCaseDetail", {
            ...c,
            updates: url.searchParams.has("updatesCursor")
              ? [
                  {
                    id: other,
                    message: "Older participant context.",
                    internal: false,
                    author: "CASE_OWNER",
                    createdAt: past(),
                  },
                ]
              : updates,
            updatesNextCursor:
              mode === "paging" && !url.searchParams.has("updatesCursor")
                ? update
                : null,
          }),
        });
      if (path.endsWith("/demos"))
        return route.fulfill({ json: { items: [check("Demo", demo)] } });
      if (path.endsWith("/admin/lessons/disputes"))
        return route.fulfill({
          json: check("LessonDisputeList", {
            items: lesson.disputed ? [lesson] : [],
            nextCursor: null,
          }),
        });
      return route.fulfill({
        status: 404,
        json: { code: "NOT_FOUND", message: "Missing fixture." },
      });
    }
    const body = req.postDataJSON(),
      key = req.headers()["idempotency-key"];
    writes.push({ path, body, key });
    expect(key).toBeTruthy();
    expect(req.headers()["x-csrf-token"]).toBe("synthetic-csrf");
    if (replays.has(key))
      return route.fulfill({ status: 201, json: replays.get(key) });
    if (stale) {
      stale = false;
      c = { ...c, version: c.version + 1 };
      return route.fulfill({
        status: 409,
        json: {
          code: "CONFLICT",
          message: "Case changed. Refresh current staff case.",
        },
      });
    }
    let saved: any;
    if (path.endsWith("/triage")) {
      check("CaseTriageInput", body);
      expect(body.expectedVersion).toBe(c.version);
      c = {
        ...c,
        status: body.status,
        assignedToId:
          body.assignedToId === undefined ? c.assignedToId : body.assignedToId,
        version: c.version + 1,
        resolution: ["RESOLVED", "CLOSED"].includes(body.status)
          ? body.reason
          : null,
      };
      saved = check("SupportCase", c);
    } else if (path.endsWith("/updates")) {
      check("CaseReplyInput", body);
      expect(body.expectedVersion).toBe(c.version);
      c = { ...c, version: c.version + 1 };
      updates = [
        {
          id: other,
          message: body.message,
          internal: body.internal,
          author: "YOU",
          createdAt: now(),
        },
        ...updates,
      ];
      saved = check("SupportCase", c);
    } else if (path.includes("/admin/demos/")) {
      check("DemoReview", body);
      expect(body.expectedVersion).toBe(demo.version);
      demo = { ...demo, status: body.resolution, version: demo.version + 1 };
      saved = check("Demo", demo);
    } else {
      check("LessonDisputeResolution", body);
      expect(body.expectedVersion).toBe(lesson.version);
      lesson = {
        ...lesson,
        attendance: body.attendance,
        disputed: false,
        version: lesson.version + 1,
      };
      saved = check("Lesson", rawLesson(lesson));
    }
    replays.set(key, saved);
    if (mode === "saved-refresh") fail = true;
    if (mode === "unknown" && writes.length === 1) return route.abort("failed");
    return route.fulfill({ status: 201, json: saved });
  });
  return { writes, reads, c: () => c };
}
async function pick(page: Page) {
  await page.getByRole("button", { name: /Replacement · Open/ }).click();
}
async function triage(page: Page) {
  await page
    .getByRole("button", { name: "Review status and assignment", exact: true })
    .click();
  await page.getByLabel("Next case status").selectOption("IN_PROGRESS");
  await page.getByLabel("Assignment decision").selectOption("me");
  await page
    .getByLabel("Reason for status/assignment")
    .fill("Synthetic operator takes ownership for review.");
  await page
    .getByRole("button", { name: "Review case decision", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /I reviewed this case/ }).check();
}
async function reply(page: Page, internal = false) {
  await page
    .getByRole("button", { name: "Write reply or staff note", exact: true })
    .click();
  if (internal)
    await page.getByRole("checkbox", { name: /Staff-only note/ }).check();
  await page
    .getByLabel("Case message")
    .fill(
      internal ? "Synthetic internal note." : "Synthetic owner-visible reply.",
    );
  await page
    .getByRole("button", { name: "Review case decision", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /I reviewed this case/ }).check();
}
async function dispute(page: Page, kind = "demo") {
  await page
    .getByRole("tab", {
      name: kind === "demo" ? "Demo disputes" : "Attendance disputes",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: kind === "demo" ? /^Demo ·/ : /Aarav · synthetic/,
    })
    .click();
  await page
    .getByLabel("Reviewed outcome")
    .selectOption(kind === "demo" ? "NOT_COMPLETED" : "PRESENT");
  await page
    .getByLabel("Evidence and reason for resolution")
    .fill("Synthetic participant evidence reviewed.");
  await page
    .getByRole("button", { name: "Review dispute outcome", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: /I reviewed the participant evidence/ })
    .check();
}
test("support operations are role-restricted and MFA precedes private queues", async ({
  page,
}) => {
  const s = await mock(page, "normal", "STUDENT");
  await page.goto("/dashboard/support");
  await expect(page.getByText(/belong to authorized operators/)).toBeVisible();
  expect(s.reads.some((p) => p.includes("/cases"))).toBe(false);
  await page.unrouteAll();
  const m = await mock(page, "mfa");
  await page.reload();
  await expect(page.getByLabel("Authenticator code")).toBeVisible();
  expect(m.reads.some((p) => p.includes("/cases"))).toBe(false);
});
test("reviewed status and self-assignment update the queue and server filters", async ({
  page,
}) => {
  const s = await mock(page);
  await page.goto("/dashboard/support");
  await pick(page);
  await triage(page);
  expect(s.writes).toHaveLength(0);
  await page
    .getByRole("button", { name: "Confirm case decision", exact: true })
    .click();
  await expect(
    page.getByText("Case status and assignment decision recorded.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(s.c().assignedToId).toBe(actor);
  await page.getByLabel("Assignment filter").selectOption("ME");
  await expect
    .poll(() => s.reads.some((p) => p.includes("assignment=ME")))
    .toBe(true);
  await page.getByLabel("Case category").selectOption("REPLACEMENT");
  await expect
    .poll(() => s.reads.some((p) => p.includes("category=REPLACEMENT")))
    .toBe(true);
});
test("staff-only note visibility is explicit and completed notes stay in the staff timeline", async ({
  page,
}) => {
  const s = await mock(page);
  await page.goto("/dashboard/support");
  await pick(page);
  await reply(page, true);
  await expect(page.locator(".care-review")).toContainText(
    "Visibility: authorized staff only.",
  );
  await page
    .getByRole("button", { name: "Confirm case decision", exact: true })
    .click();
  await expect(
    page.getByText("Private staff note recorded.", { exact: true }),
  ).toBeVisible();
  expect(s.writes[0].body.internal).toBe(true);
  await expect(page.locator(".support-updates")).toContainText(
    "Synthetic internal note.",
  );
});
test("owner reply explicitly identifies its audience and unknown outcomes replay unchanged", async ({
  page,
}) => {
  const s = await mock(page, "unknown");
  await page.goto("/dashboard/support");
  await pick(page);
  await reply(page);
  await expect(page.locator(".care-review")).toContainText(
    "Visibility: case owner and authorized staff.",
  );
  await page
    .getByRole("button", { name: "Confirm case decision", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry same decision" }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Demo disputes", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Retry same decision" }).click();
  await expect(
    page.getByText("Case-owner reply recorded.", { exact: true }),
  ).toBeVisible();
  expect(s.writes[1]).toEqual(s.writes[0]);
});
test("stale triage preserves its reason until current-case review", async ({
  page,
}) => {
  const s = await mock(page, "stale");
  await page.goto("/dashboard/support");
  await pick(page);
  await triage(page);
  await page
    .getByRole("button", { name: "Confirm case decision", exact: true })
    .click();
  await expect(
    page.getByText("Case changed. Refresh current staff case."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Refresh current staff case", exact: true })
    .click();
  await expect(page.getByLabel("Reason for status/assignment")).toHaveValue(
    "Synthetic operator takes ownership for review.",
  );
  await page
    .getByRole("button", { name: "Review case decision", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /I reviewed this case/ }).check();
  await page
    .getByRole("button", { name: "Confirm case decision", exact: true })
    .click();
  await expect(
    page.getByText("Case status and assignment decision recorded.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(s.writes[1].body.expectedVersion).toBe(3);
});
test("saved case refresh failures block another write until recovery", async ({
  page,
}) => {
  const s = await mock(page, "saved-refresh");
  await page.goto("/dashboard/support");
  await pick(page);
  await reply(page);
  await page
    .getByRole("button", { name: "Confirm case decision", exact: true })
    .click();
  await expect(
    page.getByText(/Your decision was saved, but current details/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Refresh current staff case", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Write reply or staff note",
      exact: true,
    }),
  ).toBeEnabled();
  expect(s.writes).toHaveLength(1);
});
test("earlier staff updates can be loaded without losing current private/public labels", async ({
  page,
}) => {
  await mock(page, "paging");
  await page.goto("/dashboard/support");
  await pick(page);
  await page
    .getByRole("button", { name: "Load earlier staff updates" })
    .click();
  await expect(page.locator(".support-updates").first()).toContainText(
    "Older participant context.",
  );
  await expect(page.locator(".support-updates")).toContainText("Staff only");
});
test("demo outcome review loads linked case evidence and records a versioned decision", async ({
  page,
}) => {
  const s = await mock(page);
  await page.goto("/dashboard/support");
  await dispute(page);
  await expect(
    page.getByText("Linked case evidence", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm dispute resolution", exact: true })
    .click();
  await expect(
    page.getByText(/Dispute outcome recorded. Linked support progress/),
  ).toBeVisible();
  expect(s.writes[0].body).toEqual({
    expectedVersion: 3,
    resolution: "NOT_COMPLETED",
    reason: "Synthetic participant evidence reviewed.",
  });
});
test("attendance resolution shows recorded participant reasons and retains finance distinction", async ({
  page,
}) => {
  const s = await mock(page);
  await page.goto("/dashboard/support");
  await dispute(page, "lesson");
  await expect(page.getByText(/I joined the lesson/)).toBeVisible();
  await expect(page.locator(".care-review")).toContainText(
    "actual payouts require separate finance",
  );
  await page
    .getByRole("button", { name: "Confirm dispute resolution", exact: true })
    .click();
  await expect(
    page.getByText(/Dispute outcome recorded. Linked support progress/),
  ).toBeVisible();
  expect(s.writes[0].body.attendance).toBe("PRESENT");
});
test("mobile case review and tab panels have accessible keyboard controls and padding", async ({
  page,
}) => {
  await mock(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/dashboard/support");
  await pick(page);
  await triage(page);
  expect(
    (await new AxeBuilder({ page }).include(".care-workspace").analyze())
      .violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const tabs = await page.getByRole("tablist").boundingBox();
  const lastTab = await page
    .getByRole("tab", { name: "Attendance disputes" })
    .boundingBox();
  const filters = await page.locator(".care-fields").first().boundingBox();
  expect(tabs && lastTab && filters).toBeTruthy();
  expect(lastTab!.y + lastTab!.height).toBeLessThanOrEqual(
    tabs!.y + tabs!.height,
  );
  expect(filters!.y).toBeGreaterThanOrEqual(tabs!.y + tabs!.height + 16);
  const queue = await page.locator(".care-card").first().boundingBox();
  expect(queue!.y).toBeGreaterThanOrEqual(filters!.y + filters!.height + 16);
  await page.locator(".care-workspace").screenshot({
    path: "test-results/support-operations-mobile.png",
    style: "nextjs-portal{display:none!important}",
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.locator(".care-workspace").screenshot({
    path: "test-results/support-operations-desktop.png",
    style: "nextjs-portal{display:none!important}",
  });
});
test("real MFA staff writes a private note, replies to the owner and resolves an isolated attendance dispute", async ({
  page,
  playwright,
}) => {
  const config = parseEnv(readFileSync(".env", "utf8")),
    url = new URL(config.DATABASE_URL);
  expect(config.APP_MODE).toBe("development");
  expect(["localhost", "127.0.0.1"]).toContain(url.hostname);
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url.href }),
  });
  let family: any;
  try {
    const c = await db.supportCase.create({
      data: {
        accountId: ids.guardian,
        region: "Raipur",
        category: "GENERAL",
        description: "Synthetic isolated staff browser case",
      },
    });
    await verifiedStaffSession(page.request);
    await page.goto("/dashboard/support?case=" + c.id);
    await reply(page, true);
    await page
      .getByRole("button", { name: "Confirm case decision", exact: true })
      .click();
    await expect(
      page.getByText("Private staff note recorded.", { exact: true }),
    ).toBeVisible();
    await reply(page);
    await page
      .getByRole("button", { name: "Confirm case decision", exact: true })
      .click();
    await expect(
      page.getByText("Case-owner reply recorded.", { exact: true }),
    ).toBeVisible();
    family = await playwright.request.newContext({
      baseURL: "http://localhost:3000",
    });
    expect(
      (
        await family.post("/api/v1/dev/session", {
          data: { accountId: ids.guardian },
          headers: { Origin: "http://localhost:3000" },
        })
      ).status(),
    ).toBe(201);
    const ownerView = await family.get("/api/v1/cases/" + c.id);
    expect(ownerView.status()).toBe(200);
    const visible = await ownerView.json();
    expect(
      visible.updates.some(
        (u: any) => u.message === "Synthetic internal note.",
      ),
    ).toBe(false);
    expect(
      visible.updates.some(
        (u: any) => u.message === "Synthetic owner-visible reply.",
      ),
    ).toBe(true);
    const learner = await db.child.create({
        data: {
          guardianId: ids.guardian,
          alias: "Synthetic dispute learner",
          grade: 8,
          board: "CBSE",
        },
      }),
      l = await db.lesson.create({
        data: {
          teacherId: ids.teacher,
          childId: learner.id,
          kind: "RECURRING",
          subject: "Maths",
          startsAt: new Date(Date.now() - 86400000),
          endsAt: new Date(Date.now() - 82800000),
          status: "COMPLETED",
          attendance: "ABSENT",
          disputed: true,
        },
      });
    await page
      .getByRole("tab", { name: "Attendance disputes", exact: true })
      .click();
    await page
      .getByRole("button", { name: /Synthetic dispute learner/ })
      .click();
    await page.getByLabel("Reviewed outcome").selectOption("PRESENT");
    await page
      .getByLabel("Evidence and reason for resolution")
      .fill("Synthetic attendance evidence checked.");
    await page
      .getByRole("button", { name: "Review dispute outcome", exact: true })
      .click();
    await page
      .getByRole("checkbox", { name: /I reviewed the participant evidence/ })
      .check();
    await page
      .getByRole("button", { name: "Confirm dispute resolution", exact: true })
      .click();
    await expect(
      page.getByText(/Dispute outcome recorded. Linked support progress/),
    ).toBeVisible();
    expect(
      (await db.lesson.findUniqueOrThrow({ where: { id: l.id } })).disputed,
    ).toBe(false);
    expect(
      await db.audit.count({
        where: { aggregateId: l.id, action: "ATTENDANCE_DISPUTE_RESOLVED" },
      }),
    ).toBe(1);
  } finally {
    if (family) await family.dispose();
    await db.$disconnect();
  }
});

 test("Hindi complete interface — कर्मचारी सहायता और विवाद", async ({ page }) => {
 await chooseHindi(page);
 await mock(page);
 await page.goto("/dashboard/support");
 await checkHindi(page);
 await page.setViewportSize({ width: 360, height: 800 });
 await checkHindi(page);
 });
