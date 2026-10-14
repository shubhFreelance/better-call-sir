import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { validator } from "../helpers/contract";
import { ids } from "../../packages/test-fixtures/src";
test.use({ trace: "off" });
const child1 = "20000000-0000-4000-8000-000000000211",
  child2 = "20000000-0000-4000-8000-000000000212";
const metrics = {
  lessons: 10,
  classesTaken: 6,
  completedLessons: 8,
  uniqueStudentsTaught: 2,
  cancelled: 1,
  absent: 1,
  disputed: 1,
  attendanceDue: 9,
  attendanceRecorded: 7,
  pendingAttendance: 1,
  pendingConfirmations: 3,
};
const firstMetrics = {
  lessons: 6,
  classesTaken: 4,
  completedLessons: 5,
  uniqueStudentsTaught: 1,
  cancelled: 1,
  absent: 1,
  disputed: 0,
  attendanceDue: 5,
  attendanceRecorded: 5,
  pendingAttendance: 0,
  pendingConfirmations: 2,
};
const secondMetrics = {
  lessons: 4,
  classesTaken: 2,
  completedLessons: 3,
  uniqueStudentsTaught: 1,
  cancelled: 0,
  absent: 0,
  disputed: 1,
  attendanceDue: 4,
  attendanceRecorded: 2,
  pendingAttendance: 1,
  pendingConfirmations: 1,
};
const demos = {
  scheduled: 3,
  completed: 1,
  cancelled: 1,
  noShow: 1,
  disputed: 1,
};
async function mock(page: Page, role = "GUARDIAN", mode = "normal") {
  const reads: string[] = [],
    dates: string[] = [];
  let fail = mode === "error",
    empty = mode === "empty";
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      p = url.pathname,
      now = new Date().toISOString();
    reads.push(p);
    expect(req.method()).toBe("GET");
    if (p.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id:
              role === "STUDENT"
                ? ids.student
                : role === "TEACHER"
                  ? ids.teacherAccount
                  : ids.guardian,
            name: `Synthetic ${role.toLowerCase()}`,
            role,
            verified: true,
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (p.endsWith("/dashboard"))
      return route.fulfill({
        json: {
          role,
          window: {
            start: new Date(Date.now() - 30 * 86400000).toISOString(),
            end: now,
            timezone: "Asia/Kolkata",
            metricVersion: "legacy",
          },
          metrics: { classesTaken: 999, completedLessons: 999 },
          children: [],
          lessons: [],
          placements: [],
          teachers: [],
          ...(role === "GUARDIAN" ? { consent: { withdrawnAt: null } } : {}),
        },
      });
    if (p.endsWith("/dashboard/learning")) {
      dates.push(url.search);
      if (fail)
        return route.fulfill({
          status: 503,
          json: {
            code: "REPORT_UNAVAILABLE",
            message: "Synthetic report failure",
          },
        });
      const m = empty
        ? Object.fromEntries(Object.keys(metrics).map((k) => [k, 0]))
        : role === "STUDENT"
          ? firstMetrics
          : metrics;
      const metric = {
          ...m,
          ...(role === "TEACHER"
            ? {
                feedbackSampleSize: empty ? 0 : 2,
                feedbackAverage: empty ? null : 4.5,
              }
            : {}),
        },
        from =
          url.searchParams.get("from") ||
          new Date(Date.now() - 30 * 86400000).toISOString(),
        to = url.searchParams.get("to") || now;
      const child = (id: string, alias: string) => ({
        learner: { id, alias, grade: 8, board: "CBSE" },
        metrics: {
          ...(id === child1 ? firstMetrics : secondMetrics),
          ...(role === "TEACHER"
            ? {
                feedbackSampleSize: id === child1 ? 2 : 0,
                feedbackAverage: id === child1 ? 4.5 : null,
              }
            : {}),
        },
        demos:
          empty || id === child2
            ? {
                scheduled: 0,
                completed: 0,
                cancelled: 0,
                noShow: 0,
                disputed: 0,
              }
            : demos,
        assignments: [
          {
            teacherId: ids.teacher,
            name: "Synthetic Maths teacher",
            subject: "Maths",
            status: "APPROVED",
          },
        ],
        assignmentsLimited: false,
        nextLesson: {
          id: "60000000-0000-4000-8000-000000000211",
          kind: "RECURRING",
          subject: "Maths",
          startsAt: new Date(Date.now() + 86400000).toISOString(),
          endsAt: new Date(Date.now() + 90000000).toISOString(),
          teacherName: "Synthetic Maths teacher",
        },
      });
      let learners = empty
        ? []
        : role === "STUDENT"
          ? [child(child1, "Mira")]
          : [child(child1, "Mira"), child(child2, "Arun")];
      let nextCursor: string | null = null;
      if (mode === "pages") {
        learners = url.searchParams.has("cursor")
          ? [child(child2, "Arun")]
          : [child(child1, "Mira")];
        nextCursor = url.searchParams.has("cursor") ? null : child1;
      }
      const result = {
        role,
        window: {
          from: new Date(from).toISOString(),
          to: new Date(to).toISOString(),
          timezone: "Asia/Kolkata",
          metricVersion: "learning-dashboard-v2",
          basis: "LESSON_STARTS_AT",
          endExclusive: true,
        },
        lastUpdated: now,
        metrics: metric,
        activeStudents: empty ? 0 : role === "STUDENT" ? 1 : 2,
        demos: empty
          ? { scheduled: 0, completed: 0, cancelled: 0, noShow: 0, disputed: 0 }
          : demos,
        serviceKinds: empty
          ? []
          : role === "STUDENT"
            ? [{ kind: "RECURRING", metrics: firstMetrics }]
            : [
                {
                  kind: "RECURRING",
                  metrics: {
                    ...metric,
                    classesTaken: 4,
                    completedLessons: 6,
                    lessons: 8,
                  },
                },
                {
                  kind: "REVISION",
                  metrics: {
                    ...metric,
                    classesTaken: 2,
                    completedLessons: 2,
                    lessons: 2,
                  },
                },
              ],
        learners,
        nextCursor,
        ...(role === "TEACHER"
          ? {
              profile: empty
                ? null
                : {
                    id: ids.teacher,
                    name: "Synthetic Maths teacher",
                    status: "APPROVED",
                    subjects: ["Maths"],
                  },
            }
          : {}),
        ...(role === "GUARDIAN"
          ? {
              membership: empty
                ? null
                : {
                    status: "ACTIVE",
                    allowance: 4,
                    used: 1,
                    reserved: 1,
                    periodEnd: new Date(
                      Date.now() + 15 * 86400000,
                    ).toISOString(),
                  },
            }
          : {}),
      };
      const check = validator("LearningDashboard");
      expect(check(result), JSON.stringify(check.errors)).toBe(true);
      return route.fulfill({ json: result });
    }
    return route.fulfill({
      status: 404,
      json: { code: "NOT_FOUND", message: "Missing synthetic route" },
    });
  });
  return {
    reads,
    dates,
    recover: () => {
      fail = false;
    },
    fail: () => {
      fail = true;
    },
  };
}
const ready = (page: Page) =>
  expect(
    page.getByRole("table", { name: "Lesson service breakdown" }),
  ).toBeVisible();
test("guardian sees per-learner activity, current teacher, upcoming class and separate bookings without legacy totals", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/dashboard/history");
  await ready(page);
  const family = page.getByRole("region", { name: "Family activity" });
  await expect(family).toContainText("Classes taken");
  await expect(family).toContainText("6");
  await expect(page.getByText("999", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("article", { name: "Mira’s learning" }),
  ).toContainText("4");
  await expect(
    page.getByRole("article", { name: "Arun’s learning" }),
  ).toContainText("2");
  await expect(
    page.getByRole("article", { name: "Mira’s learning" }),
  ).toContainText("Synthetic Maths teacher");
  await expect(
    page.getByRole("article", { name: "Mira’s learning" }),
  ).toContainText("Next scheduled class");
  await expect(
    page.getByRole("link", { name: "Manage Mira’s access" }),
  ).toHaveAttribute("href", `/dashboard/family?learner=${child1}`);
  await expect(
    page.getByText("Masked call delivery remains disabled.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Lesson service breakdown" }),
  ).toContainText("Revision sessions");
  await expect(family).toContainText("reported no-shows");
});
test("student own learner view has no family purchase, membership or feedback controls", async ({
  page,
}) => {
  const state = await mock(page, "STUDENT");
  await page.goto("/dashboard/history");
  await ready(page);
  await expect(
    page.getByRole("article", { name: "Mira’s learning" }),
  ).toBeVisible();
  await expect(page.getByText("Arun", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("link", {
      name: /Manage .*access|Review revision bookings|Review Parent Pro/,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Private feedback sample", { exact: true }),
  ).toHaveCount(0);
  expect(
    state.reads.some((p) => /children|finance|membership|notes/.test(p)),
  ).toBe(false);
});
test("teacher reports denominators and feedback sample alongside recorded cancellations and distinct students", async ({
  page,
}) => {
  await mock(page, "TEACHER");
  await page.goto("/dashboard/history");
  await ready(page);
  await expect(
    page.getByRole("region", { name: "Teaching activity" }),
  ).toContainText("7 / 9");
  await expect(page.getByText("77.8%", { exact: true })).toBeVisible();
  await expect(page.getByText("4.5 / 5", { exact: true })).toBeVisible();
  await expect(
    page.getByText("2 eligible attended lessons with feedback.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Distinct students taught", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Active assigned students", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Review teacher application" }),
  ).toHaveAttribute("href", "/onboarding/teacher");
  await expect(
    page.getByText("Recorded Parent Pro allowance", { exact: true }),
  ).toHaveCount(0);
});
test("previous calendar month applies only after submit and maps whole IST days to an exclusive end", async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto("/dashboard/history");
  await ready(page);
  await page.getByLabel("Date preset").selectOption("PREVIOUS");
  expect(
    state.dates.every((value) => !new URLSearchParams(value).has("from")),
  ).toBe(true);
  const from = await page.getByLabel("Activity from (IST)").inputValue(),
    to = await page.getByLabel("Activity through (IST)").inputValue();
  await page.getByRole("button", { name: "Apply activity dates" }).focus();
  await page.keyboard.press("Enter");
  await expect
    .poll(() => new URLSearchParams(state.dates.at(-1)).has("from"))
    .toBe(true);
  const applied = new URLSearchParams(state.dates.at(-1));
  expect(applied.get("from")).toBe(from + "T00:00:00+05:30");
  expect(applied.get("to")).toBe(
    new Date(Date.parse(to + "T00:00:00+05:30") + 86400000).toISOString(),
  );
  await expect(
    page.getByText("Lesson start selects this period.", { exact: false }),
  ).toContainText("end excluded");
});
test("custom range rejects reversed and excessive dates while preserving the applied result", async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto("/dashboard/history");
  await ready(page);
  await page.getByLabel("Date preset").selectOption("CUSTOM");
  await page.getByLabel("Activity from (IST)").fill("2026-10-14");
  await page.getByLabel("Activity through (IST)").fill("2026-10-01");
  await page.getByRole("button", { name: "Apply activity dates" }).click();
  await expect(page.locator(".role-overview").getByRole("alert")).toContainText(
    "ordered date range",
  );
  expect(
    state.dates.every((value) => !new URLSearchParams(value).has("from")),
  ).toBe(true);
  await page.getByLabel("Activity from (IST)").fill("2024-01-01");
  await page.getByLabel("Activity through (IST)").fill("2026-10-14");
  await page.getByRole("button", { name: "Apply activity dates" }).click();
  expect(
    state.dates.every((value) => !new URLSearchParams(value).has("from")),
  ).toBe(true);
  await ready(page);
});
test("empty teacher shows unestimable completeness and no eligible feedback instead of invented rates", async ({
  page,
}) => {
  await mock(page, "TEACHER", "empty");
  await page.goto("/dashboard/history");
  await ready(page);
  await expect(page.getByText("Not estimable", { exact: true })).toBeVisible();
  await expect(
    page.getByText("No eligible feedback", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No lesson records start in this period.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("No teaching profile yet.", { exact: false }),
  ).toBeVisible();
});
test("unavailable report is not shown as zero and can be explicitly retried", async ({
  page,
}) => {
  const state = await mock(page, "GUARDIAN", "error");
  await page.goto("/dashboard/history");
  await expect(page.locator(".role-overview").getByRole("alert")).toContainText(
    "not a zero-activity result",
  );
  await expect(
    page.getByRole("table", { name: "Lesson service breakdown" }),
  ).toHaveCount(0);
  state.recover();
  await page.getByRole("button", { name: "Retry recorded activity" }).click();
  await ready(page);
});
test("failed refresh retains marked previous records rather than replacing them with zero", async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto("/dashboard/history");
  await ready(page);
  state.fail();
  await page.getByRole("button", { name: "Refresh activity" }).click();
  await expect(page.locator(".role-overview").getByRole("alert")).toContainText(
    "last successful read",
  );
  await ready(page);
});
test("learner pagination retains global totals and resets when report dates change", async ({
  page,
}) => {
  const state = await mock(page, "GUARDIAN", "pages");
  await page.goto("/dashboard/history");
  await ready(page);
  await page.getByRole("button", { name: "Next learners" }).click();
  await expect(
    page.getByRole("article", { name: "Arun’s learning" }),
  ).toBeVisible();
  await expect(page.getByText("Page 2", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Family activity" }),
  ).toContainText("6");
  await page.getByLabel("Date preset").selectOption("PREVIOUS");
  await page.getByRole("button", { name: "Apply activity dates" }).click();
  await expect(
    page.getByRole("article", { name: "Mira’s learning" }),
  ).toBeVisible();
  await expect(page.getByText("Page 1", { exact: true })).toBeVisible();
  expect(new URLSearchParams(state.dates.at(-1)).has("cursor")).toBe(false);
});
test("guardian, student and teacher layouts pass mobile accessibility and have no overflow", async ({
  page,
}) => {
  for (const role of ["GUARDIAN", "STUDENT", "TEACHER"]) {
    await page.unroute("**/api/v1/**");
    await mock(page, role);
    await page.setViewportSize({ width: 1365, height: 950 });
    await page.goto("/dashboard/history");
    await ready(page);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `test-results/dashboard-${role.toLowerCase()}-desktop.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 360, height: 850 });
    await page.evaluate(() => document.fonts.ready);
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
    await page.screenshot({
      path: `test-results/dashboard-${role.toLowerCase()}-mobile.png`,
      fullPage: true,
    });
  }
});
test("real development guardian, student and teacher get their scoped dashboard records", async ({
  page,
}) => {
  for (const [id, role] of [
    [ids.guardian, "GUARDIAN"],
    [ids.student, "STUDENT"],
    [ids.teacherAccount, "TEACHER"],
  ]) {
    const signed = await page.request.post("/api/v1/dev/session", {
      data: { accountId: id },
      headers: { Origin: "http://localhost:3000" },
    });
    expect(signed.status()).toBe(201);
    await page.goto("/dashboard/history");
    await ready(page);
    const r = await page.request.get("/api/v1/dashboard/learning"),
      body = await r.json();
    expect(r.status()).toBe(200);
    expect(body.role).toBe(role);
    const check = validator("LearningDashboard");
    expect(check(body), JSON.stringify(check.errors)).toBe(true);
    if (role === "STUDENT") {
      expect(body.learners.every((c: any) => c.learner.id === ids.child)).toBe(
        true,
      );
      expect(body).not.toHaveProperty("membership");
      expect(body.metrics).not.toHaveProperty("feedbackSampleSize");
    }
  }
});
