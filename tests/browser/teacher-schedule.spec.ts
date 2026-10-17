import { teacherDetails } from "../../packages/test-fixtures/src";
import { chooseHindi, checkHindi } from "../helpers/hindi";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { components } from "@bcs/api-client";
import { validator } from "../helpers/contract";
type Profile = components["schemas"]["PrivateTeacher"];
const id = "30000000-0000-4000-8000-000000000092",
  accountId = "10000000-0000-4000-8000-000000000092";
const application = {
  name: "Synthetic Schedule Teacher",
  headline: "Patient Maths guidance",
  bio: "Worked examples and practice",
  subjects: ["Maths"],
  boards: ["CBSE"],
  grades: [8],
  languages: ["Hindi"],
  modes: ["ONLINE"],
  localities: [],
  monthlyPaise: 250000,
  experience: 4,
  consultationOptIn: false,
  feeTermsAccepted: true,
};
const local = (days = 2) =>
  new Date(Date.now() + days * 86400000 + 330 * 60000)
    .toISOString()
    .slice(0, 16);
async function fillHours(page: Page) {
  await page.getByLabel("Start time (IST)", { exact: true }).fill("16:00");
  await page.getByLabel("End time (IST)", { exact: true }).fill("17:30");
}
async function fillLeave(page: Page) {
  await page.getByLabel("Leave starts (IST)").fill(local());
  await page.getByLabel("Leave ends (IST)").fill(local(3));
  await page.getByLabel("Reason for leave").fill("Time away");
}
async function setup(
  page: Page,
  mode: "normal" | "stale" | "uncertain" | "blocked" = "normal",
) {
  const { feeTermsAccepted, ...profileFields } = application;
  let profile: Profile = {
    id,
    slug: "synthetic-schedule",
    ...profileFields,
    avatarColor: "#034F46",
    accountId,
    status: "SUBMITTED",
    screeningComplete: false,
    screeningValidUntil: null,
    profileRevision: 1,
    feePolicyVersion: "development-v1",
    feeTermsAcceptedAt: new Date().toISOString(),
    region: "RAIPUR",
    maxActiveStudents: 10,
    travelAccepted: false,
    version: 1,
  };
  let patterns: components["schemas"]["AvailabilityPattern"][] = [],
    exceptions: components["schemas"]["Leave"][] = [];
  const keys: string[] = [],
    bodies: any[] = [];
  let blocked = mode === "blocked",
    stale = mode === "stale",
    creates = 0;
  const recorded: { path: string; body: any }[] = [];
  const replay = new Map<string, unknown>();
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: accountId,
            name: application.name,
            role: "TEACHER",
            verified: true,
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (path.endsWith("/onboarding/teacher"))
      return route.fulfill({
        json: {
          kind: "TEACHER",
          state: "SUBMITTED",
          draft: {},
          version: 1,
          completedResourceId: id,
        },
      });
    if (path.endsWith("/dashboard"))
      return route.fulfill({ json: { profile } });
    if (path.endsWith("/evidence"))
      return route.fulfill({ json: { items: [] } });
    if (path.endsWith("/calendar")) {
      const result = { patterns, exceptions };
      const check = validator("PrivateCalendar");
      expect(check(result), JSON.stringify(check.errors)).toBe(true);
      return route.fulfill({ json: result });
    }
    if (req.method() === "POST") {
      const body = req.postDataJSON();
      recorded.push({ path, body });
      if (path.endsWith("/capacity")) {
        if (stale) {
          stale = false;
          profile = { ...profile, version: 2 };
          return route.fulfill({
            status: 409,
            json: { code: "CONFLICT", message: "Teacher profile changed." },
          });
        }
        expect(body.expectedVersion).toBe(profile.version);
        if (body.maxActiveStudents === 1)
          return route.fulfill({
            status: 409,
            json: {
              code: "CAPACITY_COMMITTED",
              message: "Capacity cannot be reduced below committed students.",
            },
          });
        profile = {
          ...profile,
          version: profile.version + 1,
          maxActiveStudents: body.maxActiveStudents,
          travelAccepted: body.travelAccepted,
        };
        expect(validator("PrivateTeacher")(profile)).toBe(true);
        return route.fulfill({ status: 201, json: profile });
      }
      if (path.endsWith("/availability")) {
        keys.push(req.headers()["idempotency-key"]);
        bodies.push(body);
        if (replay.has(keys.at(-1)!))
          return route.fulfill({ status: 201, json: replay.get(keys.at(-1)!) });
        expect(body.expectedVersion).toBe(profile.version);
        creates++;
        const { expectedVersion, ...fields } = body;
        const pattern = {
          id: "70000000-0000-4000-8000-000000000092",
          teacherId: id,
          ...fields,
          validFrom: fields.validFrom + "T00:00:00.000Z",
          validUntil: fields.validUntil + "T00:00:00.000Z",
          active: true,
          version: 1,
        };
        patterns.push(pattern);
        expect(validator("AvailabilityPattern")(pattern)).toBe(true);
        replay.set(keys.at(-1)!, pattern);
        if (mode === "uncertain")
          return route.fulfill({
            status: 201,
            contentType: "application/json",
            body: "unreadable confirmation",
          });
        return route.fulfill({ status: 201, json: pattern });
      }
      if (path.endsWith("/changes")) {
        expect(body.expectedVersion).toBe(patterns[0].version);
        patterns[0] = {
          ...patterns[0],
          active: body.active,
          version: patterns[0].version + 1,
        };
        return route.fulfill({ status: 201, json: patterns[0] });
      }
      if (path.endsWith("/leave")) {
        expect(body.expectedVersion).toBe(profile.version);
        if (blocked) {
          blocked = false;
          return route.fulfill({
            status: 409,
            json: {
              code: "RESCHEDULE_REQUIRED",
              message:
                "An accepted or held booking must be explicitly resolved before adding overlapping leave.",
            },
          });
        }
        const { expectedVersion, ...fields } = body;
        const leave = {
          id: "90000000-0000-4000-8000-000000000092",
          teacherId: id,
          ...fields,
          active: true,
          version: 1,
        };
        exceptions.push(leave);
        expect(validator("Leave")(leave)).toBe(true);
        return route.fulfill({ status: 201, json: leave });
      }
      if (path.endsWith("/cancellations")) {
        expect(body.expectedVersion).toBe(exceptions[0].version);
        const cancelled = { ...exceptions[0], active: false, version: 2 };
        exceptions = [];
        return route.fulfill({ status: 201, json: cancelled });
      }
    }
    return route.fulfill({
      status: 404,
      json: { code: "NOT_FOUND", message: "Synthetic route unavailable" },
    });
  });
  return { keys, bodies, recorded, getCreates: () => creates };
}
test("real teacher schedule saves capacity, weekly IST hours and leave, with versioned pause and cancellation", async ({
  page,
}) => {
  await page.goto("/login?next=%2Fonboarding%2Fteacher");
  await page.getByLabel("Your name").fill(application.name);
  await page
    .getByLabel("Email address")
    .fill(`schedule-${crypto.randomUUID()}@example.test`);
  const pending = page.waitForResponse((r) =>
    r.url().endsWith("/auth/otp/request"),
  );
  await page.getByRole("button", { name: "Send sign-in code" }).click();
  const otp = await (await pending).json();
  await page.getByLabel("Six-digit code").fill(otp.developmentCode);
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(page).toHaveURL(/onboarding\/teacher/);
  const session = await (await page.request.get("/api/v1/auth/session")).json();
  const response = await page.request.post("/api/v1/teacher-applications", {
    headers: {
      Origin: "http://localhost:3000",
      "X-CSRF-Token": session.csrfToken,
      "Idempotency-Key": crypto.randomUUID(),
    },
    data: { ...application, ...teacherDetails, lockInDays: 0 },
  });
  expect(response.status()).toBe(201);
  const teacher = await response.json();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your teaching schedule" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Capacity", exact: true }).click();
  await page.getByLabel("Maximum students").fill("12");
  await page.getByRole("checkbox", { name: /I can travel/ }).check();
  await page.getByRole("button", { name: "Save capacity & travel" }).click();
  await expect(
    page.getByText("Student capacity and travel preference saved."),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Weekly hours" }).click();
  await fillHours(page);
  await page.getByRole("button", { name: "Add weekly hours" }).click();
  await expect(
    page.getByText(
      "Weekly availability saved. Accepted bookings are unchanged.",
    ),
  ).toBeVisible();
  let calendar = await (
    await page.request.get(`/api/v1/teachers/${teacher.id}/calendar`)
  ).json();
  expect(calendar.patterns[0]).toMatchObject({
    weekday: 1,
    startMinute: 960,
    endMinute: 1050,
    timezone: "Asia/Kolkata",
    active: true,
    version: 1,
  });
  await fillHours(page);
  await page.getByRole("button", { name: "Add weekly hours" }).click();
  await expect(
    page.getByText(
      "This record or time slot is no longer available. Refresh and try again.",
    ),
  ).toBeVisible();
  await expect(
    page.getByLabel("Start time (IST)", { exact: true }),
  ).toHaveValue("16:00");
  await page.getByRole("button", { name: "Refresh schedule" }).click();
  await expect(
    page.getByText(/Latest schedule and profile loaded/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause Monday Demo hours" }).click();
  await page.getByLabel("Reason for change").fill("Pause new offers");
  await page.getByRole("button", { name: "Confirm schedule change" }).click();
  await expect(
    page.getByRole("button", { name: "Reopen Monday Demo hours" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reopen Monday Demo hours" }).click();
  await page.getByLabel("Reason for change").fill("Ready again");
  await page.getByRole("button", { name: "Confirm schedule change" }).click();
  await expect(
    page.getByRole("button", { name: "Pause Monday Demo hours" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Leave", exact: true }).click();
  await fillLeave(page);
  const expectedStart = new Date(
    (await page.getByLabel("Leave starts (IST)").inputValue()) + ":00+05:30",
  ).toISOString();
  await page.getByRole("button", { name: "Add leave" }).click();
  await expect(
    page.getByText("Leave saved. This period is unavailable for new bookings."),
  ).toBeVisible();
  calendar = await (
    await page.request.get(`/api/v1/teachers/${teacher.id}/calendar`)
  ).json();
  expect(calendar.exceptions[0].startsAt).toBe(expectedStart);
  await page.getByRole("button", { name: /Cancel leave starting/ }).click();
  await page.getByLabel("Reason for change").fill("Plans changed");
  await page.getByRole("button", { name: "Confirm schedule change" }).click();
  await expect(page.getByText("No leave recorded.")).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Capacity", exact: true }).click();
  await expect(page.getByLabel("Maximum students")).toHaveValue("12");
  await expect(
    page.getByRole("checkbox", { name: /I can travel/ }),
  ).toBeChecked();
});
test("stale capacity refresh preserves edits, committed capacity cannot be reduced, and local errors stay off the network", async ({
  page,
}) => {
  const state = await setup(page, "stale");
  await page.goto("/onboarding/teacher");
  await page.getByRole("tab", { name: "Capacity", exact: true }).click();
  await page.getByLabel("Maximum students").fill("0");
  await page.getByRole("button", { name: "Save capacity & travel" }).click();
  await expect(
    page.getByText("Enter 1–100 students, as a whole number."),
  ).toBeVisible();
  expect(state.recorded).toHaveLength(0);
  await page.getByLabel("Maximum students").fill("7");
  await page.getByRole("button", { name: "Save capacity & travel" }).click();
  await expect(page.getByText("Teacher profile changed.")).toBeVisible();
  await expect(page.getByLabel("Maximum students")).toHaveValue("7");
  await page.getByRole("button", { name: "Refresh schedule" }).click();
  await expect(
    page.getByText(/Latest schedule and profile loaded/),
  ).toBeVisible();
  await expect(page.getByLabel("Maximum students")).toHaveValue("7");
  await page.getByRole("button", { name: "Save capacity & travel" }).click();
  await expect(
    page.getByText("Student capacity and travel preference saved."),
  ).toBeVisible();
  expect(state.recorded.at(-1)?.body.expectedVersion).toBe(2);
  await page.getByLabel("Maximum students").fill("1");
  await page.getByRole("button", { name: "Save capacity & travel" }).click();
  await expect(
    page.getByText("Capacity cannot be reduced below committed students."),
  ).toBeVisible();
  await expect(page.getByLabel("Maximum students")).toHaveValue("1");
});
test("uncertain availability retries the identical action once; entries survive tabs and midnight is supported", async ({
  page,
}) => {
  const state = await setup(page, "uncertain");
  await page.goto("/onboarding/teacher");
  await fillHours(page);
  await page.getByLabel("End time (IST)", { exact: true }).fill("15:00");
  await page.getByRole("button", { name: "Add weekly hours" }).click();
  await expect(
    page.getByText(
      "Choose an end time after the start, on the same day or at midnight.",
    ),
  ).toBeVisible();
  expect(state.recorded).toHaveLength(0);
  await page.getByLabel("End time (IST)", { exact: true }).fill("17:30");
  await page.getByRole("tab", { name: "Capacity", exact: true }).click();
  await page.getByRole("tab", { name: "Weekly hours" }).click();
  await expect(
    page.getByLabel("Start time (IST)", { exact: true }),
  ).toHaveValue("16:00");
  await page.getByRole("checkbox", { name: /End at midnight/ }).check();
  await page.getByRole("button", { name: "Add weekly hours" }).click();
  await expect(page.getByText(/We couldn’t confirm the change/)).toBeVisible();
  await expect(
    page.getByLabel("Start time (IST)", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("tab", { name: "Leave", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Edit application" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Refresh review status" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Retry schedule change" }).click();
  await expect(
    page.getByText(
      "Weekly availability saved. Accepted bookings are unchanged.",
    ),
  ).toBeVisible();
  expect(state.keys).toHaveLength(2);
  expect(state.keys[0]).toBe(state.keys[1]);
  expect(state.bodies[0]).toEqual(state.bodies[1]);
  expect(state.bodies[0].endMinute).toBe(1440);
  expect(state.getCreates()).toBe(1);
});
test("booking conflict preserves private leave fields and points to booking review", async ({
  page,
}) => {
  const state = await setup(page, "blocked");
  await page.goto("/onboarding/teacher");
  await page.getByRole("tab", { name: "Leave", exact: true }).click();
  await page.getByRole("button", { name: "Add leave" }).click();
  await expect(
    page.getByText("Choose a future leave start in IST."),
  ).toBeVisible();
  expect(state.recorded).toHaveLength(0);
  await fillLeave(page);
  const start = await page.getByLabel("Leave starts (IST)").inputValue();
  await page.getByRole("button", { name: "Add leave" }).click();
  await expect(
    page.getByRole("link", { name: "Review accepted bookings" }),
  ).toHaveAttribute("href", "/dashboard/bookings");
  await expect(page.getByLabel("Leave starts (IST)")).toHaveValue(start);
  await expect(page.getByLabel("Reason for leave")).toHaveValue("Time away");
  await page.getByLabel("Leave starts (IST)").fill(local(4));
  await page.getByLabel("Leave ends (IST)").fill(local(5));
  await page.getByRole("button", { name: "Add leave" }).click();
  await expect(
    page.getByText("Leave saved. This period is unavailable for new bookings."),
  ).toBeVisible();
  expect(state.recorded.map((r) => r.path)).not.toContain(
    "/api/v1/reservations",
  );
});
test("teacher schedule has keyboard tabs, no mobile overflow and no serious accessibility findings", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/onboarding/teacher");
  await fillHours(page);
  await page.getByRole("tab", { name: "Weekly hours" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Capacity", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Weekly hours" }).click();
  await page.getByRole("button", { name: "Add weekly hours" }).click();
  await expect(
    page.getByRole("button", { name: "Pause Monday Demo hours" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/teacher-schedule-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.evaluate(() => document.fonts.ready);
  for (const tab of ["Weekly hours", "Capacity", "Leave"]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const axe = await new AxeBuilder({ page }).analyze();
    expect(
      axe.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact || ""),
      ),
    ).toEqual([]);
    await page.screenshot({
      path: `test-results/teacher-schedule-${tab.replace(" ", "-")}-mobile.png`,
      fullPage: true,
    });
  }
});
test("student accounts cannot load teacher schedule data", async ({ page }) => {
  const requests: string[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    return route.fulfill({
      json: {
        account: {
          id: accountId,
          name: "Synthetic Student",
          role: "STUDENT",
          verified: false,
        },
        csrfToken: "synthetic-csrf",
      },
    });
  });
  await page.goto("/onboarding/teacher");
  await expect(
    page.getByRole("heading", { name: "A teacher account is required." }),
  ).toBeVisible();
  expect(new Set(requests)).toEqual(new Set(["/api/v1/auth/session"]));
});

test("Hindi complete interface — शिक्षक का समय और छुट्टी", async ({ page }) => {
  await chooseHindi(page);
  await setup(page);
  await page.goto("/onboarding/teacher#schedule");
  await checkHindi(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await checkHindi(page);
});
