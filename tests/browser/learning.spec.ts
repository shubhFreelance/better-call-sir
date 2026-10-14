import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { validator } from "../helpers/contract";
import { ids } from "../../packages/test-fixtures/src";
import type { components } from "@bcs/api-client";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const parent = "10000000-0000-4000-8000-000000000099",
  child = "20000000-0000-4000-8000-000000000099",
  teacherId = "30000000-0000-4000-8000-000000000099",
  requestId = "40000000-0000-4000-8000-000000000099",
  placementId = "50000000-0000-4000-8000-000000000099",
  scheduleId = "60000000-0000-4000-8000-000000000099",
  lessonId = "70000000-0000-4000-8000-000000000099";
const iso = (offset = 0) =>
  new Date(Date.now() + offset * 86400000).toISOString();
const day = (offset = 0) =>
  new Date(Date.now() + offset * 86400000 + 330 * 60000)
    .toISOString()
    .slice(0, 10);
async function mock(page: Page, mode = "normal", role = "GUARDIAN") {
  const profile = {
    id: teacherId,
    slug: "synthetic-learning",
    name: "Synthetic Teacher",
    headline: "Patient practice",
    bio: "Synthetic profile",
    subjects: ["Maths"],
    boards: ["CBSE"],
    grades: [8],
    languages: ["English"],
    modes: ["HOME", "ONLINE"],
    localities: ["Shankar Nagar"],
    monthlyPaise: 250050,
    experience: 4,
    avatarColor: "#034F46",
    capabilityLabel: "Reviewed coverage",
    consultationOptIn: false,
  };
  let p = {
    id: placementId,
    requestId,
    guardianId: parent,
    teacherId,
    childId: child,
    monthlyPaise: 250050,
    status: mode === "closed" ? "CLOSED" : "TERMS_PENDING",
    version: 1,
    guardianAccepted: mode !== "terms-pending",
    teacherAccepted: true,
    guardianStarted: false,
    teacherReceiptConfirmed: false,
    policyVersion: "pilot-v1",
    createdAt: iso(),
  };
  let schedule: components["schemas"]["RecurringSchedule"] = {
    id: scheduleId,
    placementId,
    guardianId: parent,
    teacherId,
    childId: child,
    timezone: "Asia/Kolkata",
    slots: [
      { weekday: 1, startMinute: 1020, endMinute: 1050 },
      { weekday: 4, startMinute: 1020, endMinute: 1050 },
    ],
    reason: "After-school practice",
    validFrom: day(1) + "T00:00:00.000Z",
    validUntil: day(60) + "T00:00:00.000Z",
    status:
      mode === "accepted" || mode === "uncertain-extend"
        ? "ACCEPTED"
        : "PROPOSED",
    guardianAccepted: mode === "accepted" || mode === "uncertain-extend",
    teacherAccepted: true,
    version: 2,
    createdAt: iso(),
    materializedUntil: null,
    extensionRetryAt: null,
  };
  let schedules =
    mode === "normal" ||
    mode === "uncertain-propose" ||
    mode === "stale-propose"
      ? []
      : [schedule];
  let lesson: components["schemas"]["LessonRecords"]["items"][number] = {
    id: lessonId,
    placementId,
    recurringScheduleId: scheduleId,
    reservationId: null,
    teacherId,
    childId: child,
    kind:
      mode === "revision" || mode === "uncertain-attendance"
        ? "REVISION"
        : "RECURRING",
    subject: "Maths",
    startsAt: iso(-2),
    endsAt: iso(-2 + 1 / 48),
    status:
      role === "TEACHER" && !mode.includes("feedback")
        ? "SCHEDULED"
        : "COMPLETED",
    attendance:
      role === "TEACHER" && !mode.includes("feedback") ? "PENDING" : "PRESENT",
    disputed: false,
    version: 1,
    learner: { alias: "Synthetic Learner", grade: 8, board: "CBSE" },
    teacher: { id: teacherId, name: profile.name },
    confirmations: [],
    recap: "Reviewed fractions; practise mixed-number conversions.",
    recapSubmittedAt: iso(-1),
    myConfirmation:
      role !== "TEACHER" && mode.includes("feedback")
        ? { action: "CONFIRMED", lessonVersion: 1, createdAt: iso(-1) }
        : null,
    feedback:
      mode === "feedback-saved" && role !== "STUDENT"
        ? {
            id: "90000000-0000-4000-8000-000000000099",
            rating: 4,
            comment: "Clear guidance and useful practice.",
            createdAt: iso(-1),
          }
        : null,
    feedbackEligible:
      role === "GUARDIAN" &&
      mode.includes("feedback") &&
      mode !== "feedback-saved",
  };
  let writes: { path: string; key: string; body: any }[] = [],
    paths: string[] = [],
    replays = new Map<string, any>(),
    stale = mode === "stale-propose",
    refreshFails = false;
  function check(name: string, value: unknown) {
    const valid = validator(name);
    expect(valid(value), JSON.stringify(valid.errors)).toBe(true);
    return value;
  }
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
            role,
            verified: mode !== "unverified",
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (path.endsWith("/dashboard")) {
      if (refreshFails) {
        refreshFails = false;
        return route.fulfill({
          status: 503,
          json: {
            code: "UNAVAILABLE",
            message: "Current details could not be loaded.",
          },
        });
      }
      return route.fulfill({
        json: {
          role,
          window: {
            start: iso(-30),
            end: iso(),
            timezone: "Asia/Kolkata",
            metricVersion: "synthetic-v1",
          },
          metrics: { classesTaken: 0, pendingAttendance: 0, disputed: 0 },
          children: [
            { id: child, alias: "Synthetic Learner", board: "CBSE", grade: 8 },
          ],
          teachers: [profile],
          profile: role === "TEACHER" ? profile : undefined,
          placements: role === "STUDENT" ? [] : [p],
          lessons: [],
          requests:
            role === "GUARDIAN"
              ? [
                  {
                    id: requestId,
                    childId: child,
                    subject: "Maths",
                    mode: "ONLINE",
                    language: "English",
                    locality: "Shankar Nagar",
                    budgetPaise: 300000,
                    discoveryMethod: "ASSISTED",
                    preferredTeacherId: null,
                    schedule: "After school",
                    status: "PLACED",
                    version: 1,
                    createdAt: iso(),
                  },
                ]
              : undefined,
          consent: { withdrawnAt: mode === "no-consent" ? iso() : null },
        },
      });
    }
    if (
      req.method() === "GET" &&
      path.endsWith(`/placements/${placementId}/schedules`)
    )
      return route.fulfill({
        json: check("RecurringSchedules", { items: schedules }),
      });
    if (req.method() === "GET" && path.endsWith("/lessons")) {
      expect(url.searchParams.get("from")).toContain("+05:30");
      expect(url.searchParams.get("limit")).toBe("20");
      const upcoming = {
        ...lesson,
        id: "70000000-0000-4000-8000-000000000098",
        startsAt: iso(3),
        endsAt: iso(3 + 1 / 48),
        status: "SCHEDULED",
        attendance: "PENDING",
        confirmations: [],
      };
      const items = url.searchParams.has("cursor")
        ? [
            {
              ...lesson,
              id: "70000000-0000-4000-8000-000000000096",
              status: "CANCELLED",
            },
          ]
        : [lesson, ...(schedule.status === "ACCEPTED" ? [upcoming] : [])];
      return route.fulfill({
        json: check("LessonRecords", {
          items,
          nextCursor:
            mode === "pagination" && !url.searchParams.has("cursor")
              ? lesson.id
              : null,
        }),
      });
    }
    if (req.method() === "POST") {
      const key = req.headers()["idempotency-key"],
        body = req.postDataJSON();
      writes.push({ path, key, body });
      expect(key).toBeTruthy();
      expect(req.headers()["x-csrf-token"]).toBe("synthetic-csrf");
      if (replays.has(key))
        return route.fulfill({ status: 201, json: replays.get(key) });
      let result: any;
      if (path.endsWith(`/placements/${placementId}/schedules`)) {
        check("RecurringScheduleInput", body);
        if (stale) {
          stale = false;
          p.version = 2;
          return route.fulfill({
            status: 409,
            json: {
              code: "CONFLICT",
              message: "Placement changed. Refresh the timetable.",
            },
          });
        }
        expect(body.expectedVersion).toBe(p.version);
        p.version++;
        schedule = {
          ...schedule,
          timezone: body.timezone,
          slots: body.slots,
          reason: body.reason,
          validFrom: body.validFrom + "T00:00:00.000Z",
          validUntil: body.validUntil + "T00:00:00.000Z",
          status: "PROPOSED",
          version: 1,
          guardianAccepted: false,
          teacherAccepted: false,
        };
        schedules = [schedule];
        result = check("RecurringSchedule", schedule);
      } else if (
        path.endsWith(`/recurring-schedules/${scheduleId}/acceptances`)
      ) {
        if (mode === "collision")
          return route.fulfill({
            status: 409,
            json: {
              code: "SCHEDULE_COLLISION",
              message:
                "The agreed timetable is unavailable; choose another schedule.",
            },
          });
        expect(body.expectedVersion).toBe(schedule.version);
        schedule = {
          ...schedule,
          [role === "GUARDIAN" ? "guardianAccepted" : "teacherAccepted"]: true,
          version: schedule.version + 1,
        };
        if (schedule.guardianAccepted && schedule.teacherAccepted)
          schedule.status = "ACCEPTED";
        schedules = [schedule];
        result = check("RecurringSchedule", schedule);
      } else if (path.endsWith(`/recurring-schedules/${scheduleId}/extensions`))
        result = check("RecurringExtension", { created: 0, horizonDays: 60 });
      else if (path.endsWith(`/lessons/${lessonId}/feedback`)) {
        check("LessonFeedbackInput", body);
        if (mode === "stale-feedback") {
          lesson = { ...lesson, version: 2, feedbackEligible: false };
          return route.fulfill({
            status: 409,
            json: {
              code: "CONFLICT",
              message:
                "The lesson changed. Refresh its record before sending feedback.",
            },
          });
        }
        expect(body.expectedVersion).toBe(lesson.version);
        result = check("LessonFeedback", {
          id: "90000000-0000-4000-8000-000000000099",
          lessonId,
          guardianId: parent,
          rating: body.rating,
          comment: body.comment,
          createdAt: iso(),
        });
        lesson = {
          ...lesson,
          feedbackEligible: false,
          feedback: {
            id: result.id,
            rating: result.rating,
            comment: result.comment,
            createdAt: result.createdAt,
          },
        };
      } else if (path.endsWith(`/lessons/${lessonId}/attendance`)) {
        expect(body.expectedVersion).toBe(lesson.version);
        lesson = {
          ...lesson,
          attendance: body.attendance,
          status: "COMPLETED",
          version: lesson.version + 1,
        };
        result = { id: lesson.id, version: lesson.version };
      } else if (path.endsWith(`/lessons/${lessonId}/confirmations`)) {
        check("LessonConfirmationInput", body);
        expect(body.expectedVersion).toBe(lesson.version);
        result = check("LessonConfirmation", {
          id: "80000000-0000-4000-8000-000000000099",
          lessonId,
          actorId: parent,
          action: body.action,
          reason: body.reason,
          lessonVersion: lesson.version,
          createdAt: iso(),
        });
        lesson = {
          ...lesson,
          disputed: body.action === "DISPUTED",
          version: lesson.version + (body.action === "DISPUTED" ? 1 : 0),
          myConfirmation: {
            action: body.action,
            lessonVersion: body.expectedVersion,
            createdAt: iso(),
          },
          feedbackEligible: role === "GUARDIAN" && body.action === "CONFIRMED",
          confirmations: [
            ...lesson.confirmations,
            { action: body.action, createdAt: iso() },
          ],
        };
      } else throw new Error("Unexpected write " + path);
      replays.set(key, result);
      if (mode.startsWith("uncertain-") && writes.length === 1)
        return route.abort("failed");
      if (mode === "failed-refresh") refreshFails = true;
      return route.fulfill({ status: 201, json: result });
    }
    return route.fulfill({
      status: 404,
      json: { code: "NOT_FOUND", message: "Unexpected test route" },
    });
  });
  return {
    writes,
    paths,
    getSchedule: () => schedule,
    getLesson: () => lesson,
  };
}
async function propose(page: Page) {
  await page
    .getByRole("button", { name: "Propose weekly times", exact: true })
    .click();
  await page.getByLabel("First valid date").fill(day(2));
  await page.getByLabel("Last valid date").fill(day(30));
  await page.getByLabel("Day 1", { exact: true }).selectOption("2");
  await page.getByLabel("Start time 1 (IST)").fill("16:30");
  await page.getByLabel("Duration 1", { exact: true }).selectOption("40");
  await page
    .getByLabel("Reason for these times")
    .fill("After-school Maths practice");
  await page
    .getByRole("checkbox", { name: /I have reviewed these times/ })
    .check();
}
async function reviewAttendance(page: Page) {
  await page.getByRole("tab", { name: "Attendance & records" }).click();
  await page
    .getByRole("button", { name: "Record attendance", exact: true })
    .click();
  await page
    .getByLabel("Reason for this record")
    .fill("Lesson completed with guided practice");
  await page
    .getByRole("checkbox", { name: /I have reviewed this lesson/ })
    .check();
}
test("weekly proposal validates overlap, preserves IST minutes and needs both acceptances", async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto("/dashboard/lessons");
  await propose(page);
  await page.getByRole("button", { name: "Add weekly time" }).click();
  await page.getByLabel("Day 2", { exact: true }).selectOption("2");
  await page.getByLabel("Start time 2 (IST)").fill("16:40");
  await page.getByRole("button", { name: "Save timetable proposal" }).click();
  await expect(page.getByText(/Use nonoverlapping 20–120/)).toBeVisible();
  expect(state.writes).toHaveLength(0);
  await page.getByRole("button", { name: "Remove weekly time 2" }).click();
  await page.getByRole("button", { name: "Save timetable proposal" }).click();
  await expect(page.getByText(/Weekly timetable proposed/)).toBeVisible();
  expect(state.writes[0].body).toMatchObject({
    timezone: "Asia/Kolkata",
    expectedVersion: 1,
    slots: [{ weekday: 2, startMinute: 990, endMinute: 1030 }],
    validFrom: day(2),
    validUntil: day(30),
  });
  expect(state.getSchedule().status).toBe("PROPOSED");
  await expect(page.getByText("Timetable agreed", { exact: true })).toHaveCount(
    0,
  );
});
test("unknown proposal retries identical key and freezes dates until confirmed", async ({
  page,
}) => {
  const state = await mock(page, "uncertain-propose");
  await page.goto("/dashboard/lessons");
  await propose(page);
  await page.getByRole("button", { name: "Save timetable proposal" }).click();
  await expect(
    page.getByText(/We couldn’t confirm this decision/),
  ).toBeVisible();
  await expect(page.getByLabel("First valid date")).toBeDisabled();
  await page.getByRole("button", { name: "Retry same decision" }).click();
  await expect(page.getByText(/Weekly timetable proposed/)).toBeVisible();
  expect(state.writes[0]).toEqual(state.writes[1]);
});
test("stale proposal refresh preserves review and uses the latest placement version", async ({
  page,
}) => {
  const state = await mock(page, "stale-propose");
  await page.goto("/dashboard/lessons");
  await propose(page);
  await page.getByRole("button", { name: "Save timetable proposal" }).click();
  await expect(
    page.getByText("Placement changed. Refresh the timetable."),
  ).toBeVisible();
  await expect(page.getByLabel("Reason for these times")).toHaveValue(
    "After-school Maths practice",
  );
  await page
    .getByRole("button", { name: "Refresh timetable", exact: true })
    .click();
  await expect(page.getByText(/Current details loaded/)).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: /I have reviewed these times/ }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Save timetable proposal" }).click();
  await expect(page.getByText(/Weekly timetable proposed/)).toBeVisible();
  expect(state.writes[1].body.expectedVersion).toBe(2);
});
test("last party accepts explicitly and an extension retries without requiring a fabricated ID", async ({
  page,
}) => {
  const state = await mock(page, "uncertain-extend");
  await page.goto("/dashboard/lessons");
  await page
    .getByRole("button", { name: "Check upcoming bookings", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: /I have reviewed the timetable/ })
    .check();
  await page.getByRole("button", { name: "Confirm booking check" }).click();
  await expect(
    page.getByText(/We couldn’t confirm this decision/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry same decision" }).click();
  await expect(
    page.getByText(/within its rolling 60-day horizon/),
  ).toBeVisible();
  expect(state.writes[0]).toEqual(state.writes[1]);
  await page.unroute("**/api/v1/**");
  const second = await mock(page, "proposed");
  await page.reload();
  await page.getByRole("button", { name: "Review & accept timetable" }).click();
  await page
    .getByRole("button", { name: "Accept this timetable", exact: true })
    .click();
  await expect(
    page.getByText(/Review this timetable and confirm/),
  ).toBeVisible();
  expect(second.writes).toHaveLength(0);
  await page
    .getByRole("checkbox", { name: /I have reviewed the timetable/ })
    .check();
  await page
    .getByRole("button", { name: "Accept this timetable", exact: true })
    .click();
  await expect(
    page.getByText("Timetable agreed", { exact: true }),
  ).toBeVisible();
  expect(second.writes[0].body.expectedVersion).toBe(2);
  await expect(
    page.getByRole("heading", { name: "Maths with Synthetic Teacher" }),
  ).toBeVisible();
});
test("collision and incomplete terms never show an agreed timetable", async ({
  page,
}) => {
  const state = await mock(page, "collision");
  await page.goto("/dashboard/lessons");
  await page.getByRole("button", { name: "Review & accept timetable" }).click();
  await page
    .getByRole("checkbox", { name: /I have reviewed the timetable/ })
    .check();
  await page
    .getByRole("button", { name: "Accept this timetable", exact: true })
    .click();
  await expect(
    page.getByText(/The agreed timetable is unavailable/),
  ).toBeVisible();
  expect(state.getSchedule().status).toBe("PROPOSED");
  await expect(page.getByText("Timetable agreed", { exact: true })).toHaveCount(
    0,
  );
  await page.unroute("**/api/v1/**");
  await mock(page, "terms-pending");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Review & accept timetable" }),
  ).toBeDisabled();
});
test("teacher attendance requires a revision recap and unknown saves retry the original record", async ({
  page,
}) => {
  const state = await mock(page, "uncertain-attendance", "TEACHER");
  await page.goto("/dashboard/lessons");
  await reviewAttendance(page);
  await page.getByLabel("Attendance", { exact: true }).selectOption("LATE");
  await page
    .getByRole("button", { name: "Save attendance record", exact: true })
    .click();
  await expect(
    page.getByText(/Delivered revision lessons also need a recap/),
  ).toBeVisible();
  expect(state.writes).toHaveLength(0);
  await page
    .getByLabel("Revision recap (required)")
    .fill("Reviewed fractions; practise mixed-number conversions.");
  await page
    .getByRole("button", { name: "Save attendance record", exact: true })
    .click();
  await expect(
    page.getByText(/We couldn’t confirm this decision/),
  ).toBeVisible();
  await expect(page.getByLabel("Reason for this record")).toBeDisabled();
  await expect(
    page.getByRole("tab", { name: "Upcoming", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Retry same decision" }).click();
  await expect(
    page.getByText("Attendance record saved.", { exact: true }),
  ).toBeVisible();
  expect(state.writes[0]).toEqual(state.writes[1]);
  expect(state.writes[0].body).toMatchObject({
    expectedVersion: 1,
    attendance: "LATE",
    recap: "Reviewed fractions; practise mixed-number conversions.",
  });
  expect(state.getLesson().attendance).toBe("LATE");
});
test("student dispute is versioned, excludes the record and never queries guardian timetables", async ({
  page,
}) => {
  const state = await mock(page, "normal", "STUDENT");
  await page.goto("/dashboard/lessons");
  await page.getByRole("tab", { name: "Attendance & records" }).click();
  await expect(
    page.getByRole("button", { name: "Record attendance", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Report attendance error" }).click();
  await page
    .getByLabel("What is incorrect?")
    .fill("I attended the full class; the marked record is incorrect.");
  await page.getByRole("checkbox", { name: /I want support/ }).check();
  await page.getByRole("button", { name: "Submit attendance dispute" }).click();
  await expect(
    page.getByText("Attendance under review", { exact: true }),
  ).toBeVisible();
  expect(state.writes[0].body).toMatchObject({
    expectedVersion: 1,
    action: "DISPUTED",
  });
  expect(
    state.paths.some(
      (p) => p.includes("/schedules") || p.includes("/requests"),
    ),
  ).toBe(false);
  expect(state.getLesson().disputed).toBe(true);
});
test("guardian confirmation retries the same review once and then directs corrections to support", async ({
  page,
}) => {
  const state = await mock(page, "uncertain-confirm");
  await page.goto("/dashboard/lessons");
  await page.getByRole("tab", { name: "Attendance & records" }).click();
  await page
    .getByRole("button", { name: "Confirm attendance", exact: true })
    .click();
  await page
    .getByLabel("Reason for this record")
    .fill("The lesson attendance record is accurate.");
  await page
    .getByRole("checkbox", { name: /I have reviewed this lesson/ })
    .check();
  await page
    .getByRole("button", { name: "Save attendance confirmation", exact: true })
    .click();
  await expect(
    page.getByText(/We couldn’t confirm this decision/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry same decision" }).click();
  await expect(
    page.getByText("Your attendance confirmation is recorded.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(state.writes[0]).toEqual(state.writes[1]);
  expect(state.getLesson().confirmations).toHaveLength(1);
  await expect(
    page.getByRole("button", { name: "Confirm attendance", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Report attendance error" }),
  ).toBeDisabled();
  await page
    .getByText("Recorded attendance reviews (1)", { exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "ask support to correct the record" }),
  ).toHaveAttribute("href", "/support");
});
test("lesson date filters validate locally and pagination preserves role-scoped records", async ({
  page,
}) => {
  const state = await mock(page, "pagination");
  await page.goto("/dashboard/lessons");
  await page.getByRole("tab", { name: "Attendance & records" }).click();
  await expect(
    page.getByRole("heading", { name: "Maths with Synthetic Teacher" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Load more lessons" }).click();
  await expect(
    page.getByRole("heading", { name: "Maths with Synthetic Teacher" }),
  ).toHaveCount(2);
  const requests = state.paths.filter(
    (p) => p === "GET /api/v1/lessons",
  ).length;
  await page.getByLabel("Lessons from").fill(day(3));
  await page.getByLabel("Lessons through").fill(day(1));
  await page.getByRole("button", { name: "Apply dates" }).click();
  await expect(page.getByText(/Choose a valid date range/)).toBeVisible();
  expect(state.paths.filter((p) => p === "GET /api/v1/lessons")).toHaveLength(
    requests,
  );
  await expect(
    page.getByRole("button", { name: "Confirm attendance", exact: true }),
  ).toHaveCount(1);
});
test("saved timetable with failed refresh blocks further writes until an explicit refresh", async ({
  page,
}) => {
  const state = await mock(page, "failed-refresh");
  await page.goto("/dashboard/lessons");
  await page.getByRole("button", { name: "Review & accept timetable" }).click();
  await page
    .getByRole("checkbox", { name: /I have reviewed the timetable/ })
    .check();
  await page
    .getByRole("button", { name: "Accept this timetable", exact: true })
    .click();
  await expect(
    page.getByText(
      /Your decision was saved, but current details could not be loaded/,
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Propose/ })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Retry same decision" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Refresh timetable", exact: true })
    .click();
  await expect(page.getByText(/Current details loaded/)).toBeVisible();
  expect(state.writes).toHaveLength(1);
});
test("premium timetable and review forms fit mobile with accessible contrast and keyboard controls", async ({
  page,
}) => {
  await mock(page, "accepted");
  await page.goto("/dashboard/lessons");
  await expect(
    page.getByText("Timetable agreed", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: "test-results/learning-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByRole("button", { name: "Propose a replacement" }).click();
  await expect(page.getByLabel("First valid date")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  let results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact || ""),
    ),
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/learning-proposal-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("tab", { name: "Attendance & records" }).focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: "Confirm attendance", exact: true })
    .click();
  results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact || ""),
    ),
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/learning-attendance-mobile.png",
    fullPage: true,
  });
});
test("inactive guardian consent and closed agreements prevent timetable changes", async ({
  page,
}) => {
  await mock(page, "no-consent");
  await page.goto("/dashboard/lessons");
  await expect(
    page.getByRole("button", { name: "Propose weekly times" }),
  ).toBeDisabled();
  await page.unroute("**/api/v1/**");
  await mock(page, "closed");
  await page.reload();
  await expect(page.getByText("Closed", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Propose/ })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Review & accept timetable" }),
  ).toBeDisabled();
});
async function login(page: Page, name: string) {
  await page.goto("/login");
  await page.getByText("Development accounts", { exact: true }).click();
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(
    page.getByRole("heading", { name: new RegExp(`Hello, ${name}`) }),
  ).toBeVisible();
}
test("real guardian and teacher agree a timetable, review attendance and share private lesson feedback", async ({
  page,
  context,
}) => {
  const local = parseEnv(readFileSync(".env", "utf8"));
  const database = new URL(local.DATABASE_URL);
  expect(["localhost", "127.0.0.1"]).toContain(database.hostname);
  expect(local.APP_MODE).toBe("development");
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: database.href }),
  });
  const freshLessonId = randomUUID();
  try {
    await db.lesson.create({
      data: {
        id: freshLessonId,
        placementId: ids.placement,
        childId: ids.child,
        teacherId: ids.teacher,
        kind: "RECURRING",
        subject: "Maths",
        startsAt: new Date(iso(-1)),
        endsAt: new Date(iso(-1 + 1 / 48)),
      },
    });
  } finally {
    await db.$disconnect();
  }
  await login(page, "Kavita");
  await page.goto("/dashboard/lessons");
  const card = page
    .locator(".learning-timetable")
    .filter({
      has: page.getByRole("heading", { name: "Ananya Sharma", exact: true }),
    })
    .filter({ has: page.getByText("Aarav", { exact: true }) })
    .first();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: /Propose/ }).click();
  await card.getByLabel("First valid date").fill(day(3));
  await card.getByLabel("Last valid date").fill(day(31));
  await card
    .getByLabel("Day 1", { exact: true })
    .selectOption(String(new Date(day(3) + "T12:00:00Z").getUTCDay()));
  await card.getByLabel("Start time 1 (IST)").fill("14:10");
  await card.getByLabel("Duration 1", { exact: true }).selectOption("30");
  await card
    .getByLabel("Reason for these times")
    .fill("Synthetic browser acceptance: weekly practice");
  await card
    .getByRole("checkbox", { name: /I have reviewed these times/ })
    .check();
  await card.getByRole("button", { name: "Save timetable proposal" }).click();
  await expect(card.getByText(/Weekly timetable proposed/)).toBeVisible();
  await card.getByRole("button", { name: "Review & accept timetable" }).click();
  await card
    .getByRole("checkbox", { name: /I have reviewed the timetable/ })
    .check();
  await card
    .getByRole("button", { name: "Accept this timetable", exact: true })
    .click();
  await expect(
    card.getByText("Your acceptance is recorded. Waiting for the other party."),
  ).toBeVisible();
  const schedules = await page.request.get(
    `/api/v1/placements/${ids.placement}/schedules`,
  );
  const proposal = (await schedules.json()).items.find(
    (s: any) => s.status === "PROPOSED",
  );
  expect(proposal.guardianAccepted).toBe(true);
  expect(proposal.teacherAccepted).toBe(false);
  const teacherContext = await context.browser()!.newContext();
  const teacherPage = await teacherContext.newPage();
  try {
    await login(teacherPage, "Ananya");
    await teacherPage.goto("/dashboard/lessons");
    const teacherCard = teacherPage
      .locator(".learning-timetable")
      .filter({
        has: teacherPage.getByRole("heading", {
          name: "Ananya Sharma",
          exact: true,
        }),
      })
      .filter({
        has: teacherPage.getByText(`Agreement ${ids.placement.slice(0, 8)}`, {
          exact: true,
        }),
      })
      .first();
    await teacherCard
      .getByRole("button", { name: "Review & accept timetable" })
      .click();
    await teacherCard
      .getByRole("checkbox", { name: /I have reviewed the timetable/ })
      .check();
    await teacherCard
      .getByRole("button", { name: "Accept this timetable", exact: true })
      .click();
    await expect(
      teacherCard.getByText("Timetable agreed", { exact: true }),
    ).toBeVisible();
    await teacherPage
      .getByRole("tab", { name: "Attendance & records" })
      .click();
    await teacherPage.getByLabel("Lessons through").fill(day());
    await teacherPage.getByRole("button", { name: "Apply dates" }).click();
    const past = teacherPage.locator(`[data-lesson-id="${freshLessonId}"]`);
    await past
      .getByRole("button", { name: "Record attendance", exact: true })
      .click();
    await past.getByLabel("Attendance", { exact: true }).selectOption("LATE");
    await past
      .getByLabel("Reason for this record")
      .fill("Synthetic browser attendance review");
    const recap = past.getByLabel(/Revision recap/);
    if (await recap.count()) await recap.fill("Synthetic revision recap");
    await past
      .getByRole("checkbox", { name: /I have reviewed this lesson/ })
      .check();
    await past
      .getByRole("button", { name: "Save attendance record", exact: true })
      .click();
    await expect(
      past.getByText("Attendance record saved.", { exact: true }),
    ).toBeVisible();
  } finally {
    await teacherContext.close();
  }
  await card
    .getByRole("button", { name: "Refresh timetable", exact: true })
    .click();
  await expect(
    card.getByText("Timetable agreed", { exact: true }),
  ).toBeVisible();
  const lessons = await page.request.get(
    `/api/v1/lessons?${new URLSearchParams({ from: iso(1), to: iso(59), limit: "50" })}`,
  );
  expect(
    (await lessons.json()).items.some(
      (l: any) => l.recurringScheduleId === proposal.id && l.reservationId,
    ),
  ).toBe(true);
  await page.getByRole("tab", { name: "Attendance & records" }).click();
  await page.getByLabel("Lessons through").fill(day());
  await page.getByRole("button", { name: "Apply dates" }).click();
  const late = page.locator(`[data-lesson-id="${freshLessonId}"]`);
  await late
    .getByRole("button", { name: "Confirm attendance", exact: true })
    .click();
  await late
    .getByLabel("Reason for this record")
    .fill("Synthetic guardian confirms the attendance record");
  await late
    .getByRole("checkbox", { name: /I have reviewed this lesson/ })
    .check();
  await late
    .getByRole("button", { name: "Save attendance confirmation", exact: true })
    .click();
  await expect(
    late.getByText("Your attendance confirmation is recorded.", {
      exact: true,
    }),
  ).toBeVisible();
  await late.getByRole("button", { name: "Share lesson feedback" }).click();
  await late.getByRole("radio", { name: "5 Excellent", exact: true }).check();
  await late
    .getByLabel("What worked well, or could be better? (optional)")
    .fill("Synthetic browser check: useful lesson practice.");
  await late
    .getByRole("button", { name: "Review feedback", exact: true })
    .click();
  await late.getByRole("checkbox", { name: /I reviewed my feedback/ }).check();
  await late.getByRole("button", { name: "Send private feedback" }).click();
  await expect(
    late.getByRole("region", { name: "Private lesson feedback" }),
  ).toContainText("5 out of 5");
  await page.reload();
  await page.getByRole("tab", { name: "Attendance & records" }).click();
  await page.getByLabel("Lessons through").fill(day());
  await page.getByRole("button", { name: "Apply dates" }).click();
  await expect(
    page
      .locator(`[data-lesson-id="${freshLessonId}"]`)
      .getByRole("region", { name: "Private lesson feedback" }),
  ).toContainText("Synthetic browser check");
  const readContext = await context.browser()!.newContext();
  try {
    const readPage = await readContext.newPage();
    await login(readPage, "Ananya");
    await readPage.goto("/dashboard/lessons");
    await readPage.getByRole("tab", { name: "Attendance & records" }).click();
    await readPage.getByLabel("Lessons through").fill(day());
    await readPage.getByRole("button", { name: "Apply dates" }).click();
    await expect(
      readPage
        .locator(`[data-lesson-id="${freshLessonId}"]`)
        .getByRole("region", { name: "Private lesson feedback" }),
    ).toContainText("Synthetic browser check");
  } finally {
    await readContext.close();
  }
});

async function composeFeedback(page: Page) {
  await page.goto("/dashboard/lessons");
  await page.getByRole("tab", { name: "Attendance & records" }).click();
  await page.getByRole("button", { name: "Share lesson feedback" }).click();
  await page
    .getByRole("radio", { name: "4 Very helpful", exact: true })
    .check();
  await page
    .getByLabel("What worked well, or could be better? (optional)")
    .fill("Clear guidance and useful practice.");
  await page
    .getByRole("button", { name: "Review feedback", exact: true })
    .click();
}
test("guardian feedback validates a rating, reviews private visibility and records only after explicit consent", async ({
  page,
}) => {
  const state = await mock(page, "feedback");
  await page.goto("/dashboard/lessons");
  await page.getByRole("tab", { name: "Attendance & records" }).click();
  await expect(
    page.getByRole("region", { name: "Teacher recap" }),
  ).toContainText("mixed-number conversions");
  await expect(
    page.getByText("You confirmed this attendance record.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm attendance", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Share lesson feedback" }).click();
  await page
    .getByRole("button", { name: "Review feedback", exact: true })
    .click();
  await expect(
    page.getByText("Choose how helpful this lesson was.", { exact: true }),
  ).toBeVisible();
  expect(state.writes).toHaveLength(0);
  await page
    .getByRole("radio", { name: "4 Very helpful", exact: true })
    .check();
  await page
    .getByLabel("What worked well, or could be better? (optional)")
    .fill("Clear guidance and useful practice.");
  await page
    .getByRole("button", { name: "Review feedback", exact: true })
    .click();
  await page.getByRole("button", { name: "Send private feedback" }).click();
  expect(state.writes).toHaveLength(0);
  await page.getByRole("checkbox", { name: /I reviewed my feedback/ }).check();
  await page.getByRole("button", { name: "Send private feedback" }).click();
  await expect(
    page.getByRole("region", { name: "Private lesson feedback" }),
  ).toContainText("4 out of 5");
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].body).toEqual({
    expectedVersion: 1,
    rating: 4,
    comment: "Clear guidance and useful practice.",
  });
  await expect(
    page.getByRole("button", { name: "Share lesson feedback" }),
  ).toHaveCount(0);
  await page.reload();
  await page.getByRole("tab", { name: "Attendance & records" }).click();
  await expect(
    page.getByRole("region", { name: "Private lesson feedback" }),
  ).toContainText("Clear guidance");
  expect(state.writes).toHaveLength(1);
});
test("an uncertain feedback save freezes navigation and retries the same key and payload without duplicates", async ({
  page,
}) => {
  const state = await mock(page, "uncertain-feedback");
  await composeFeedback(page);
  await page.getByRole("checkbox", { name: /I reviewed my feedback/ }).check();
  await page.getByRole("button", { name: "Send private feedback" }).click();
  await expect(
    page.getByText(/We couldn’t confirm this decision/),
  ).toBeVisible();
  await expect(page.getByLabel("Lessons from")).toBeDisabled();
  await expect(page.getByRole("tab", { name: "Upcoming" })).toBeDisabled();
  await page.getByRole("button", { name: "Retry same decision" }).click();
  await expect(
    page.getByRole("region", { name: "Private lesson feedback" }),
  ).toBeVisible();
  expect(state.writes).toHaveLength(2);
  expect(state.writes[0]).toEqual(state.writes[1]);
  await expect(
    page.getByRole("button", { name: "Share lesson feedback" }),
  ).toHaveCount(0);
});
test("changed attendance preserves feedback edits and requires an explicit refresh before another decision", async ({
  page,
}) => {
  const state = await mock(page, "stale-feedback");
  await composeFeedback(page);
  await page.getByRole("checkbox", { name: /I reviewed my feedback/ }).check();
  await page.getByRole("button", { name: "Send private feedback" }).click();
  await expect(page.getByText(/The lesson changed/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send private feedback" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Refresh attendance record" }).click();
  await expect(
    page.getByText(/You reviewed an earlier attendance record/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send private feedback" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Edit feedback" }).click();
  await expect(
    page.getByLabel("What worked well, or could be better? (optional)"),
  ).toHaveValue("Clear guidance and useful practice.");
  expect(state.writes).toHaveLength(1);
});
test("teachers see saved guardian feedback while students have recap access without feedback controls or guardian comments", async ({
  page,
}) => {
  await mock(page, "feedback-saved", "TEACHER");
  await page.goto("/dashboard/lessons");
  await page.getByRole("tab", { name: "Attendance & records" }).click();
  await expect(
    page.getByRole("region", { name: "Private lesson feedback" }),
  ).toContainText("Guardian feedback");
  await expect(
    page.getByRole("button", { name: "Share lesson feedback" }),
  ).toHaveCount(0);
  await page.unroute("**/api/v1/**");
  const state = await mock(page, "feedback-saved", "STUDENT");
  await page.reload();
  await page.getByRole("tab", { name: "Attendance & records" }).click();
  await expect(
    page.getByRole("region", { name: "Teacher recap" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Private lesson feedback" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Share lesson feedback" }),
  ).toHaveCount(0);
  expect(state.paths.some((x) => x.endsWith("/feedback"))).toBe(false);
});
test("mobile feedback has labelled keyboard controls, readable recap colors and no serious accessibility findings", async ({
  page,
}) => {
  await mock(page, "feedback");
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/dashboard/lessons");
  await page.getByRole("tab", { name: "Attendance & records" }).click();
  await page.getByRole("button", { name: "Share lesson feedback" }).click();
  const first = page.getByRole("radio", {
    name: "1 Needs support",
    exact: true,
  });
  await first.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("radio", { name: "2 Could be clearer", exact: true }),
  ).toBeChecked();
  await page
    .getByLabel("What worked well, or could be better? (optional)")
    .fill("A little more practice next time.");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((x) =>
      ["serious", "critical"].includes(x.impact || ""),
    ),
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/lesson-feedback-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Review feedback", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit feedback" }).click();
  await expect(
    page.getByLabel("What worked well, or could be better? (optional)"),
  ).toHaveValue("A little more practice next time.");
  await page.setViewportSize({ width: 1280, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/lesson-feedback-desktop.png",
    fullPage: true,
  });
});
