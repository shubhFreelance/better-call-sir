import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { validator } from "../helpers/contract";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ids } from "../../packages/test-fixtures/src";
const guardian = "10000000-0000-4000-8000-000000000091",
  child = "20000000-0000-4000-8000-000000000091",
  teacher = "30000000-0000-4000-8000-000000000091",
  placement = "40000000-0000-4000-8000-000000000091",
  request = "50000000-0000-4000-8000-000000000091",
  replacement = "50000000-0000-4000-8000-000000000092",
  caseId = "60000000-0000-4000-8000-000000000091";
const now = () => new Date().toISOString(),
  time = () =>
    new Date(Date.now() + 3 * 86400000 + 19800000).toISOString().slice(0, 16);
async function mock(page: Page, mode = "normal", role = "GUARDIAN") {
  let p = {
    id: placement,
    guardianId: guardian,
    teacherId: teacher,
    childId: child,
    requestId: request,
    monthlyPaise: 300000,
    policyVersion: "pilot-v1",
    guardianAccepted: true,
    teacherAccepted: true,
    guardianStarted: true,
    teacherReceiptConfirmed: true,
    status: "ACTIVE",
    version: 1,
    createdAt: now(),
    startedAt: now(),
    closedAt: null,
  };
  let source = {
    id: request,
    guardianId: guardian,
    childId: child,
    subject: "Maths",
    mode: "HOME",
    language: "English",
    locality: "Shankar Nagar",
    budgetPaise: 400000,
    schedule: "Earlier preferences",
    status: "OPEN",
    version: 1,
    createdAt: now(),
    region: "Raipur",
    matchStatus: "PENDING",
    discoveryMethod: "ASSISTED",
    preferredTeacherId: null,
    rematchFromPlacementId: null as string | null,
  };
  let requests: any[] = [source],
    stale = mode === "stale",
    failRead = false;
  const writes: { body: any; key: string; path: string }[] = [],
    reads: string[] = [],
    replays = new Map<string, any>();
  function check(schema: string, data: any) {
    const v = validator(schema);
    expect(v(data), JSON.stringify(v.errors)).toBe(true);
    return data;
  }
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: guardian,
            role,
            name: "Kavita · synthetic guardian",
            verified: true,
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (req.method() === "GET") {
      reads.push(path);
      if (failRead && path.endsWith("/requests")) {
        failRead = false;
        return route.fulfill({
          status: 503,
          json: {
            code: "UNAVAILABLE",
            message: "Current requests unavailable.",
          },
        });
      }
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
            children: [{ id: child, alias: "Aarav", grade: 8, board: "CBSE" }],
            teachers: [{ id: teacher, name: "Ananya Sharma" }],
            placements: mode === "empty" ? [] : [p],
            consent: { withdrawnAt: mode === "withdrawn" ? now() : null },
          },
        });
      if (path.endsWith("/requests"))
        return route.fulfill({
          json: check("RequestList", {
            items: mode === "missing-source" ? [] : requests,
          }),
        });
      return route.fulfill({
        status: 404,
        json: { code: "NOT_FOUND", message: "Missing fixture." },
      });
    }
    const body = req.postDataJSON(),
      key = req.headers()["idempotency-key"];
    writes.push({ body, key, path });
    expect(key).toBeTruthy();
    expect(req.headers()["x-csrf-token"]).toBe("synthetic-csrf");
    check(
      path.endsWith("/rematches")
        ? "PlacementRematchInput"
        : "PlacementCloseInput",
      body,
    );
    if (replays.has(key))
      return route.fulfill({ status: 201, json: replays.get(key) });
    if (stale) {
      stale = false;
      p = { ...p, version: 2 };
      return route.fulfill({
        status: 409,
        json: {
          code: "CONFLICT",
          message: "Placement changed. Refresh before deciding.",
        },
      });
    }
    p = { ...p, status: "CLOSED", version: p.version + 1, closedAt: now() };
    source = { ...source, status: "CLOSED" };
    let result: any;
    if (path.endsWith("/rematches")) {
      const fresh = {
        ...source,
        ...body.criteria,
        id: replacement,
        status: "OPEN",
        version: 1,
        rematchFromPlacementId: placement,
        schedulePreferences: body.preferences,
      };
      requests = [fresh, source];
      result = check("PlacementRematchResult", { request: fresh, caseId });
    } else {
      requests = [source];
      result = check("PlacementCloseResult", { placement: p, caseId });
    }
    replays.set(key, result);
    if (mode === "failed-refresh") failRead = true;
    if (mode === "uncertain" && writes.length === 1)
      return route.abort("failed");
    return route.fulfill({ status: 201, json: result });
  });
  return { writes, reads, p: () => p };
}
async function closeReview(page: Page) {
  await page
    .getByRole("button", { name: "Close arrangement", exact: true })
    .click();
  await page
    .getByLabel("Reason for closure")
    .fill("Synthetic closure: tuition needs have changed.");
  await page
    .getByRole("button", { name: "Review decision", exact: true })
    .click();
}
async function replacementReview(page: Page) {
  await page
    .getByRole("button", { name: "Request a replacement", exact: true })
    .click();
  await page
    .getByLabel("Reason for replacement")
    .fill("We need a different teaching format.");
  await page.getByLabel("Subject", { exact: true }).selectOption("Science");
  await page.getByLabel("Teaching format").selectOption("ONLINE");
  await page.getByLabel("Language", { exact: true }).selectOption("Hindi");
  await page.getByLabel("Monthly budget (₹)").fill("4500.50");
  await page.getByRole("radio", { name: "Specific dates (optional)" }).check();
  await page.getByLabel("Window 1 starts (IST)").fill(time());
  await page
    .getByRole("button", { name: "Review decision", exact: true })
    .click();
}
test("closure has explicit effects and requires acknowledgement before writing", async ({
  page,
}) => {
  const s = await mock(page);
  await page.goto("/dashboard/arrangements");
  await closeReview(page);
  await expect(
    page.getByText("Information already read cannot be recalled.", {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm closure", exact: true })
    .click();
  expect(s.writes).toHaveLength(0);
  await page
    .getByRole("checkbox", { name: /I reviewed these effects/ })
    .check();
  await page
    .getByRole("button", { name: "Confirm closure", exact: true })
    .click();
  await expect(
    page.getByText(
      "The arrangement is closed. Past records remain available.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open the linked support case" }),
  ).toHaveAttribute("href", "/support?case=" + caseId);
  expect(s.p().status).toBe("CLOSED");
});
test("replacement saves fresh criteria and displays linked progress without promising assignment", async ({
  page,
}) => {
  const s = await mock(page);
  await page.goto("/dashboard/arrangements");
  await replacementReview(page);
  await expect(page.locator(".care-review")).toContainText("Science");
  await expect(page.locator(".care-review")).toContainText("₹4,500.50");
  await page
    .getByRole("checkbox", { name: /I reviewed these effects/ })
    .check();
  await page
    .getByRole("button", { name: "Confirm closure and replacement" })
    .click();
  await expect(
    page.getByText(/A new teacher has not been assigned/),
  ).toBeVisible();
  expect(s.writes[0].body.criteria).toEqual({
    subject: "Science",
    mode: "ONLINE",
    language: "Hindi",
    locality: "Shankar Nagar",
    budgetPaise: 450050,
  });
  expect(s.writes[0].body.preferences.timezone).toBe("Asia/Kolkata");
  await page.reload();
  await expect(
    page.getByText(/Replacement request: Open; Awaiting matching/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Close arrangement", exact: true }),
  ).toHaveCount(0);
});
test("uncertain replacement freezes editing and retries the exact original operation", async ({
  page,
}) => {
  const s = await mock(page, "uncertain");
  await page.goto("/dashboard/arrangements");
  await replacementReview(page);
  await page
    .getByRole("checkbox", { name: /I reviewed these effects/ })
    .check();
  await page
    .getByRole("button", { name: "Confirm closure and replacement" })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry same decision" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Back to editing" }),
  ).toBeDisabled();
  await expect(page.getByLabel("Tuition arrangement")).toBeDisabled();
  await page.getByRole("button", { name: "Retry same decision" }).click();
  await expect(
    page.getByText(/A new teacher has not been assigned/),
  ).toBeVisible();
  expect(s.writes[1]).toEqual(s.writes[0]);
});
test("stale decisions preserve their reason and require fresh review after refresh", async ({
  page,
}) => {
  const s = await mock(page, "stale");
  await page.goto("/dashboard/arrangements");
  await closeReview(page);
  await page
    .getByRole("checkbox", { name: /I reviewed these effects/ })
    .check();
  await page
    .getByRole("button", { name: "Confirm closure", exact: true })
    .click();
  await expect(
    page.getByText("Placement changed. Refresh before deciding."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Refresh arrangement", exact: true })
    .click();
  await expect(page.getByLabel("Reason for closure")).toHaveValue(
    "Synthetic closure: tuition needs have changed.",
  );
  await page
    .getByRole("button", { name: "Review decision", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: /I reviewed these effects/ })
    .check();
  await page
    .getByRole("button", { name: "Confirm closure", exact: true })
    .click();
  await expect(
    page.getByText(
      "The arrangement is closed. Past records remain available.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(s.writes[1].body.expectedVersion).toBe(2);
});
test("saved-but-unrefreshed results cannot create another closure", async ({
  page,
}) => {
  const s = await mock(page, "failed-refresh");
  await page.goto("/dashboard/arrangements");
  await closeReview(page);
  await page
    .getByRole("checkbox", { name: /I reviewed these effects/ })
    .check();
  await page
    .getByRole("button", { name: "Confirm closure", exact: true })
    .click();
  await expect(
    page.getByText(/Your decision was saved, but current details/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Refresh arrangement", exact: true })
    .click();
  await expect(page.getByText(/This arrangement is closed/)).toBeVisible();
  expect(s.writes).toHaveLength(1);
});
test("students and teachers do not load private guardian replacement criteria", async ({
  page,
}) => {
  for (const role of ["STUDENT", "TEACHER"]) {
    await page.unrouteAll();
    const s = await mock(page, "normal", role);
    await page.goto("/dashboard/arrangements");
    await expect(
      page.getByText(/These arrangement decisions belong to your guardian/),
    ).toBeVisible();
    expect(s.reads).not.toContain("/api/v1/requests");
    await expect(
      page.getByRole("button", { name: "Close arrangement", exact: true }),
    ).toHaveCount(0);
  }
});
test("missing criteria and withdrawn consent disable replacement without hiding support", async ({
  page,
}) => {
  await mock(page, "missing-source");
  await page.goto("/dashboard/arrangements");
  await expect(
    page.getByRole("button", { name: "Request a replacement", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Close arrangement", exact: true }),
  ).toBeEnabled();
  await page.unrouteAll();
  await mock(page, "withdrawn");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Close arrangement", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("link", {
      name: "Help and safety reporting remain available",
    }),
  ).toHaveAttribute("href", "/support");
});
test("empty arrangements offer a tuition-request recovery path", async ({
  page,
}) => {
  await mock(page, "empty");
  await page.goto("/dashboard/arrangements");
  await expect(page.getByText("No tuition arrangements yet.")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Review your tuition requests" }),
  ).toHaveAttribute("href", "/dashboard/requests");
});
test("mobile replacement validation, keyboard review and screenshots remain accessible", async ({
  page,
}) => {
  const s = await mock(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/dashboard/arrangements");
  await page
    .getByRole("button", { name: "Request a replacement", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review decision", exact: true })
    .click();
  await expect(
    page.getByText("Explain the reason in 1–1,000 characters."),
  ).toBeVisible();
  expect(s.writes).toHaveLength(0);
  await page
    .getByRole("button", { name: "Cancel decision", exact: true })
    .click();
  await replacementReview(page);
  await page
    .getByRole("checkbox", { name: /I reviewed these effects/ })
    .focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("checkbox", { name: /I reviewed these effects/ }),
  ).toBeChecked();
  expect(
    (await new AxeBuilder({ page }).include(".care-workspace").analyze())
      .violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator(".care-workspace").screenshot({
    path: "test-results/arrangements-mobile.png",
    style: "nextjs-portal{display:none!important}",
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.locator(".care-workspace").screenshot({
    path: "test-results/arrangements-desktop.png",
    style: "nextjs-portal{display:none!important}",
  });
});
test("real guardian replacement persists for an isolated synthetic learner", async ({
  page,
}) => {
  const config = parseEnv(readFileSync(".env", "utf8")),
    url = new URL(config.DATABASE_URL);
  expect(["localhost", "127.0.0.1"]).toContain(url.hostname);
  expect(config.APP_MODE).toBe("development");
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url.href }),
  });
  const alias = "Synthetic " + randomUUID().slice(0, 8);
  try {
    const c = await db.child.create({
        data: { guardianId: ids.guardian, alias, grade: 8, board: "CBSE" },
      }),
      r = await db.tuitionRequest.create({
        data: {
          guardianId: ids.guardian,
          childId: c.id,
          subject: "Maths",
          mode: "HOME",
          language: "English",
          locality: "Shankar Nagar",
          budgetPaise: 400000,
          schedule: "Synthetic browser fixture",
        },
      }),
      p = await db.placement.create({
        data: {
          guardianId: ids.guardian,
          teacherId: ids.teacher,
          childId: c.id,
          requestId: r.id,
          monthlyPaise: 300000,
          status: "ACTIVE",
        },
      });
    await page.goto("/login");
    await page.getByText("Development accounts", { exact: true }).click();
    await page.getByRole("button", { name: /Kavita/ }).click();
    await expect(
      page.getByRole("heading", { name: /Hello, Kavita/ }),
    ).toBeVisible();
    await page.goto("/dashboard/arrangements");
    await page.getByLabel("Tuition arrangement").selectOption(p.id);
    await replacementReview(page);
    await page
      .getByRole("checkbox", { name: /I reviewed these effects/ })
      .check();
    await page
      .getByRole("button", { name: "Confirm closure and replacement" })
      .click();
    await expect(
      page.getByText(/A new teacher has not been assigned/),
    ).toBeVisible();
    const saved = await db.tuitionRequest.findFirstOrThrow({
      where: { rematchFromPlacementId: p.id },
    });
    expect(saved.budgetPaise).toBe(450050);
    expect(saved.subject).toBe("Science");
    expect(
      (await db.placement.findUniqueOrThrow({ where: { id: p.id } })).status,
    ).toBe("CLOSED");
    await page.reload();
    await page.getByLabel("Tuition arrangement").selectOption(p.id);
    await expect(page.getByText(/Replacement request: Open/)).toBeVisible();
  } finally {
    await db.$disconnect();
  }
});

test("arrangement links target the exact replacement record and never substitute another arrangement", async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto("/dashboard/arrangements?placement=" + placement);
  await expect(
    page.getByRole("link", {
      name: "Help and case progress for this arrangement",
    }),
  ).toHaveAttribute("href", "/support?placement=" + placement);
  await page.goto(
    "/dashboard/arrangements?placement=40000000-0000-4000-8000-000000000099",
  );
  await expect(
    page.getByText(/The linked arrangement is unavailable/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Request a replacement", exact: true }),
  ).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
});

test("replacement accepts broad weekly preferences and links to exact recorded progress", async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto("/dashboard/arrangements?placement=" + placement);
  await page
    .getByRole("button", { name: "Request a replacement", exact: true })
    .click();
  await expect(
    page.getByRole("radio", { name: "Weekly preferences" }),
  ).toBeChecked();
  await expect(page.locator('input[type="datetime-local"]')).toHaveCount(0);
  await page
    .getByLabel("Reason for replacement")
    .fill("A different teaching approach is needed.");
  await page.getByLabel("Preferred day 1", { exact: true }).selectOption("1");
  await page
    .getByRole("button", { name: "Review decision", exact: true })
    .click();
  await expect(
    page.getByText("Monday · 16:00–20:00 IST", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: /I reviewed these effects/ })
    .check();
  await page
    .getByRole("button", {
      name: "Confirm closure and replacement",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("link", { name: "Review your replacement request" }),
  ).toHaveAttribute("href", "/dashboard/requests?request=" + replacement);
  expect(state.writes[0].body.preferences).toEqual({
    timezone: "Asia/Kolkata",
    weekly: [{ weekday: 1, startMinute: 960, endMinute: 1200 }],
  });
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Review replacement progress" }),
  ).toHaveAttribute("href", "/dashboard/requests?request=" + replacement);
});
