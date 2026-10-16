import { test, expect, type Page } from "@playwright/test";
import { teacherDetails } from "../../packages/test-fixtures/src";
import AxeBuilder from "@axe-core/playwright";
import { validator, contract } from "../helpers/contract";
import Ajv from "ajv/dist/2020";
import addFormats from "ajv-formats";
const ajv = new Ajv({ strict: false });
addFormats(ajv);
const reviewInput = ajv.compile(
  contract.paths["/admin/teachers/{id}/reviews"].post.requestBody.content[
    "application/json"
  ].schema,
);
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { verifiedStaffSession, cleanupStaffFixtures } from "./staff-fixture";
test.use({ trace: "off" });
test.afterEach(async () => cleanupStaffFixtures());
const actor = "10000000-0000-4000-8000-000000000111",
  teacher = "20000000-0000-4000-8000-000000000111",
  owner = "10000000-0000-4000-8000-000000000112",
  kinds = ["IDENTITY", "QUALIFICATIONS", "CAPABILITY", "REFERENCES"];
const eid = (i: number) =>
    "30000000-0000-4000-8000-" + String(i + 111).padStart(12, "0"),
  cid = (i: number) =>
    "40000000-0000-4000-8000-" + String(i + 111).padStart(12, "0"),
  now = () => new Date().toISOString(),
  future = () => new Date(Date.now() + 30 * 86400000).toISOString();
async function mock(page: Page, mode = "normal", role = "REVIEWER") {
  let t: any = {
    ...teacherDetails,
    id: teacher,
    accountId: mode === "self" ? actor : owner,
    slug: "synthetic-teacher",
    name: "Ananya · synthetic teacher",
    headline: "Maths learning for class 8",
    bio: "Synthetic application for interface review.",
    subjects: ["Maths"],
    boards: ["CBSE"],
    grades: [8],
    languages: ["English"],
    modes: ["ONLINE"],
    localities: [],
    monthlyPaise: 300000,
    experience: 3,
    avatarColor: "#F0D7FF",
    consultationOptIn: false,
    status: "SUBMITTED",
    screeningComplete: false,
    screeningValidUntil: null,
    profileRevision: 2,
    feePolicyVersion: "pilot-v1",
    feeTermsAcceptedAt: now(),
    region: "Raipur",
    maxActiveStudents: 10,
    travelAccepted: false,
    version: 1,
  };
  if (mode === "expanded")
    Object.assign(t, {
      subjects: ["Mechanics", "Language", "Physics"],
      boards: ["CBSE"],
      grades: [12],
      teachingCoverage: [
        {
          stage: "COLLEGE",
          subject: "Mechanics",
          courseName: "BSc Physics",
          studyYear: 2,
        },
        { stage: "EARLY_YEARS", subject: "Language", level: "KG1" },
        { stage: "SCHOOL", subject: "Physics", board: "CBSE", grade: 12 },
      ],
    });
  let evidence = kinds.map((kind, i) => ({
      id: eid(i),
      teacherId: teacher,
      kind,
      mediaType: "application/pdf",
      size: 128,
      sha256: "a".repeat(64),
      status: mode === "quarantine" && i === 0 ? "QUARANTINED" : "CLEAN",
      scannerVersion:
        mode === "quarantine" && i === 0 ? null : "synthetic-scanner",
      scannedAt: mode === "quarantine" && i === 0 ? null : now(),
      uploadedAt: now(),
      version: 1,
    })),
    checks: any[] = [];
  if (["ready", "old", "expired", "failed"].includes(mode))
    checks = kinds.map((kind, i) => ({
      id: cid(i),
      teacherId: teacher,
      reviewerId: actor,
      profileRevision: mode === "old" ? 1 : 2,
      kind,
      evidenceId: eid(i),
      result: mode === "failed" && i === 0 ? "FAILED" : "PASSED",
      reason: "Synthetic assessment",
      coverage:
        kind === "CAPABILITY"
          ? { subjects: t.subjects, boards: t.boards, grades: t.grades }
          : null,
      policyVersion: "synthetic-policy",
      validUntil: mode === "expired" ? new Date(0).toISOString() : future(),
      createdAt: now(),
    }));
  const writes: { path: string; body: any; key: string }[] = [],
    reads: string[] = [],
    replays = new Map<string, any>();
  let stale = mode === "stale",
    fail = false;
  const check = (schema: string, data: any) => {
    const v = validator(schema);
    expect(v(data), JSON.stringify(v.errors)).toBe(true);
    return data;
  };
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: actor,
            name: "Synthetic reviewer",
            role,
            verified: true,
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (path.endsWith("/auth/mfa"))
      return route.fulfill({
        json: check("MfaStatus", {
          enabled: true,
          verifiedUntil:
            mode === "mfa" ? null : new Date(Date.now() + 600000).toISOString(),
          recoveryCodesRemaining: 8,
        }),
      });
    if (req.method() === "GET") {
      reads.push(path);
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
      if (path.endsWith("/admin/teachers")) {
        if (fail) {
          fail = false;
          return route.fulfill({
            status: 503,
            json: { code: "UNAVAILABLE", message: "Queue unavailable." },
          });
        }
        return route.fulfill({
          json: check("PrivateTeacherList", { items: [t] }),
        });
      }
      if (path.endsWith("/evidence"))
        return route.fulfill({
          json: check("EvidenceList", { items: evidence }),
        });
      if (path.endsWith("/checks"))
        return route.fulfill({
          json: check("VerificationList", { items: checks }),
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
      t = { ...t, version: 2 };
      return route.fulfill({
        status: 409,
        json: {
          code: "CONFLICT",
          message: "Application changed. Refresh first.",
        },
      });
    }
    let result: any;
    if (path.endsWith("/checks")) {
      check("VerificationInput", body);
      expect(body.expectedVersion).toBe(t.version);
      expect(body.coverage).toEqual({
        subjects: t.subjects,
        boards: t.boards,
        grades: t.grades,
        ...(t.teachingCoverage ? { teachingCoverage: t.teachingCoverage } : {}),
      });
      const { expectedVersion, ...assessment } = body;
      result = check("VerificationCheck", {
        ...assessment,
        id: cid(7),
        teacherId: teacher,
        reviewerId: actor,
        profileRevision: t.profileRevision,
        policyVersion: "synthetic-policy",
        createdAt: now(),
      });
      delete result.expectedVersion;
      checks = [result, ...checks];
      t = { ...t, version: t.version + 1 };
    } else if (path.endsWith("/retries")) {
      check("EvidenceRetry", body);
      const e = evidence.find((e) => path.includes(e.id))!;
      result = check("Evidence", { ...e, version: e.version + 1 });
      evidence = evidence.map((x) => (x.id === e.id ? result : x));
    } else {
      expect(reviewInput(body), JSON.stringify(reviewInput.errors)).toBe(true);
      expect(body.expectedVersion).toBe(t.version);
      t = {
        ...t,
        status: body.status,
        screeningComplete: body.status === "APPROVED",
        screeningValidUntil: body.status === "APPROVED" ? future() : null,
        version: t.version + 1,
      };
      result = check("PrivateTeacher", t);
    }
    replays.set(key, result);
    if (mode === "saved-refresh") fail = true;
    if (mode === "unknown" && writes.length === 1) return route.abort("failed");
    return route.fulfill({ status: 201, json: result });
  });
  return { writes, reads, t: () => t };
}
async function decision(page: Page, status = "CHANGES_REQUESTED") {
  await page
    .getByRole("button", { name: "Review teacher decision", exact: true })
    .click();
  await page
    .getByLabel("Teacher decision", { exact: true })
    .selectOption(status);
  await page
    .getByLabel("Reason for recorded decision")
    .fill("Synthetic reviewed decision.");
  await page
    .getByRole("button", { name: "Review assessment", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: /I independently reviewed/ })
    .check();
}
async function capability(page: Page) {
  await page
    .getByRole("button", { name: "Record screening check", exact: true })
    .click();
  await page.getByLabel("Check kind").selectOption("CAPABILITY");
  await page.getByLabel("Matching clean evidence").selectOption(eid(2));
  await page.getByLabel("Assessment result").selectOption("PASSED");
  await page
    .getByRole("checkbox", {
      name: /I assessed every declared teaching area/,
    })
    .check();
  await page
    .getByLabel("Reason for recorded decision")
    .fill("Synthetic full Maths CBSE class 8 assessment.");
  await page
    .getByRole("button", { name: "Review assessment", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: /I independently reviewed/ })
    .check();
}
test("guardian cannot read reviewer queue; unverified staff MFA blocks private reads", async ({
  page,
}) => {
  const g = await mock(page, "normal", "GUARDIAN");
  await page.goto("/dashboard/review");
  await expect(
    page.getByText(/restricted to authorized reviewers/),
  ).toBeVisible();
  expect(g.reads).not.toContain("/api/v1/admin/teachers");
  await page.unrouteAll();
  const s = await mock(page, "mfa");
  await page.reload();
  await expect(page.getByLabel("Authenticator code")).toBeVisible();
  expect(
    s.reads.some(
      (p) => p.includes("/admin/teachers") || p.endsWith("/evidence"),
    ),
  ).toBe(false);
});
test("quarantined evidence has no download and scan retry stays quarantined", async ({
  page,
}) => {
  const s = await mock(page, "quarantine");
  await page.goto("/dashboard/review");
  const details = page.getByRole("region", {
    name: "Private onboarding details",
    exact: true,
  });
  await expect(
    details.getByRole("heading", { name: "Complete address", exact: true }),
  ).toBeVisible();
  await expect(
    details
      .getByText(teacherDetails.education[0].institution, { exact: false })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download private identity evidence" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Download private capability evidence" }),
  ).toHaveAttribute("href", "/api/v1/evidence/" + eid(2) + "/content");
  await page.getByRole("button", { name: /Review scan retry/ }).click();
  await page
    .getByLabel("Reason for recorded decision")
    .fill("Retry after scanner service recovery.");
  await page
    .getByRole("button", { name: "Review assessment", exact: true })
    .click();
  await page.getByRole("checkbox").last().check();
  await page
    .getByRole("button", { name: "Confirm reviewer decision", exact: true })
    .click();
  await expect(
    page.getByText("Scan retry queued. The evidence remains quarantined.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(s.writes[0].body.expectedVersion).toBe(1);
  expect(s.t().status).toBe("SUBMITTED");
});
test("capability assessment requires full coverage and records the current revision", async ({
  page,
}) => {
  const s = await mock(page);
  await page.goto("/dashboard/review");
  await capability(page);
  expect(s.writes).toHaveLength(0);
  await page
    .getByRole("button", { name: "Confirm reviewer decision", exact: true })
    .click();
  await expect(
    page.getByText(
      "Screening assessment recorded. Teacher approval remains a separate decision.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(s.writes[0].body.coverage).toEqual({
    subjects: ["Maths"],
    boards: ["CBSE"],
    grades: [8],
  });
  await page
    .getByRole("button", { name: "Record screening check", exact: true })
    .click();
  await expect(
    page.getByLabel("Check kind").locator('option[value="CAPABILITY"]'),
  ).toBeDisabled();
});
test("missing, expired, previous-revision and failed checks cannot enable approval", async ({
  page,
}) => {
  for (const mode of ["normal", "expired", "old", "failed"]) {
    await page.unrouteAll();
    await mock(page, mode);
    await page.goto("/dashboard/review");
    await page
      .getByRole("button", { name: "Review teacher decision", exact: true })
      .click();
    await expect(
      page
        .getByLabel("Teacher decision", { exact: true })
        .locator('option[value="APPROVED"]'),
    ).toBeDisabled();
  }
});
test("current passed checks allow approval and a separate reviewed suspension", async ({
  page,
}) => {
  const s = await mock(page, "ready");
  await page.goto("/dashboard/review");
  await decision(page, "APPROVED");
  await page
    .getByRole("button", { name: "Confirm reviewer decision", exact: true })
    .click();
  await expect(
    page.getByText("Teacher review decision recorded.", { exact: true }),
  ).toBeVisible();
  expect(s.t().status).toBe("APPROVED");
  await decision(page, "SUSPENDED");
  await expect(page.locator(".care-review")).toContainText(
    "Existing paid bookings and refunds require separate review",
  );
  await page
    .getByRole("button", { name: "Confirm reviewer decision", exact: true })
    .click();
  await expect.poll(() => s.t().status).toBe("SUSPENDED");
  expect(s.writes[1].body.expectedVersion).toBe(2);
});
test("unknown assessment keeps the same version, complete payload and retry key", async ({
  page,
}) => {
  const s = await mock(page, "unknown");
  await page.goto("/dashboard/review");
  await capability(page);
  await page
    .getByRole("button", { name: "Confirm reviewer decision", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry same decision" }),
  ).toBeVisible();
  await expect(page.getByLabel("Teacher application")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Back to editing" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Retry same decision" }).click();
  await expect(
    page.getByText(
      "Screening assessment recorded. Teacher approval remains a separate decision.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(s.writes[1]).toEqual(s.writes[0]);
});
test("stale decisions retain reasons and require fresh review after refresh", async ({
  page,
}) => {
  const s = await mock(page, "stale");
  await page.goto("/dashboard/review");
  await decision(page);
  await page
    .getByRole("button", { name: "Confirm reviewer decision", exact: true })
    .click();
  await expect(
    page.getByText("Application changed. Refresh first."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Refresh screening", exact: true })
    .click();
  await expect(page.getByLabel("Reason for recorded decision")).toHaveValue(
    "Synthetic reviewed decision.",
  );
  await page
    .getByRole("button", { name: "Review assessment", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: /I independently reviewed/ })
    .check();
  await page
    .getByRole("button", { name: "Confirm reviewer decision", exact: true })
    .click();
  await expect(
    page.getByText("Teacher review decision recorded.", { exact: true }),
  ).toBeVisible();
  expect(s.writes[1].body.expectedVersion).toBe(2);
});
test("saved review followed by a read failure blocks another decision until recovery", async ({
  page,
}) => {
  const s = await mock(page, "saved-refresh");
  await page.goto("/dashboard/review");
  await decision(page);
  await page
    .getByRole("button", { name: "Confirm reviewer decision", exact: true })
    .click();
  await expect(
    page.getByText(/Your decision was saved, but current details/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review teacher decision", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Refresh screening", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Review teacher decision", exact: true }),
  ).toBeEnabled();
  expect(s.writes).toHaveLength(1);
});
test("self-review cannot load private evidence/checks or offer a decision", async ({
  page,
}) => {
  const s = await mock(page, "self", "ADMIN");
  await page.goto("/dashboard/review");
  await expect(
    page.getByText(/You cannot review your own application/),
  ).toBeVisible();
  expect(
    s.reads.some((p) => p.endsWith("/checks") || p.endsWith("/evidence")),
  ).toBe(false);
  await expect(
    page.getByRole("button", { name: "Review teacher decision", exact: true }),
  ).toHaveCount(0);
});
test("mobile reviewer decisions support keyboard acknowledgement and accessible spacing", async ({
  page,
}) => {
  await mock(page, "ready");
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/dashboard/review");
  await decision(page, "SUSPENDED");
  await page
    .getByRole("checkbox", { name: /I independently reviewed/ })
    .focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("Space");
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
    path: "test-results/reviewer-mobile.png",
    style: "nextjs-portal{display:none!important}",
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.locator(".care-workspace").screenshot({
    path: "test-results/reviewer-desktop.png",
    style: "nextjs-portal{display:none!important}",
  });
});
test.describe("real scoped reviewer flow", () => {
  test("MFA-verified staff records changes and suspension for an isolated synthetic application", async ({
    page,
  }) => {
    const config = parseEnv(readFileSync(".env", "utf8")),
      url = new URL(config.DATABASE_URL);
    expect(config.APP_MODE).toBe("development");
    expect(["localhost", "127.0.0.1"]).toContain(url.hostname);
    const db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url.href }),
    });
    try {
      const region = "Synthetic reviewer " + randomUUID();
      const account = await db.account.create({
          data: {
            name: "Synthetic reviewer browser applicant",
            role: "TEACHER",
          },
        }),
        t = await db.teacher.create({
          data: {
            accountId: account.id,
            slug: "synthetic-review-" + randomUUID(),
            region,
            name: account.name,
            headline: "Synthetic class 8 Maths",
            bio: "Synthetic reviewer browser fixture",
            subjects: ["Maths"],
            boards: ["CBSE"],
            grades: [8],
            languages: ["English"],
            modes: ["ONLINE"],
            localities: [],
            monthlyPaise: 300000,
            experience: 2,
            feeTermsAcceptedAt: new Date(),
          },
        });
      const session = await verifiedStaffSession(page.request);
      // Isolate the bounded regional queue from other synthetic applications.
      await db.account.update({
        where: { id: session.account.id },
        data: { role: "REVIEWER", region },
      });
      await page.goto("/dashboard/review?teacher=" + t.id);
      await expect(
        page.getByRole("button", {
          name: "Review teacher decision",
          exact: true,
        }),
      ).toBeEnabled();
      await decision(page);
      await page
        .getByRole("button", { name: "Confirm reviewer decision", exact: true })
        .click();
      await expect(
        page.getByText("Teacher review decision recorded.", { exact: true }),
      ).toBeVisible();
      expect(
        (await db.teacher.findUniqueOrThrow({ where: { id: t.id } })).status,
      ).toBe("CHANGES_REQUESTED");
      await decision(page, "SUSPENDED");
      await page
        .getByRole("button", { name: "Confirm reviewer decision", exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (await db.teacher.findUniqueOrThrow({ where: { id: t.id } }))
              .status,
        )
        .toBe("SUSPENDED");
      await page.reload();
      await expect(page.locator(".care-status").first()).toContainText(
        "Suspended",
      );
      expect(
        await db.audit.count({
          where: { aggregateId: t.id, action: "TEACHER_REVIEW" },
        }),
      ).toBe(2);
    } finally {
      await db.$disconnect();
    }
  });
});

test("capability review records exact early years, school and college teaching areas", async ({
  page,
}) => {
  const s = await mock(page, "expanded");
  await page.goto("/dashboard/review");
  await expect(page.getByText(/BSc Physics/).first()).toBeVisible();
  await capability(page);
  await page
    .getByRole("button", { name: "Confirm reviewer decision", exact: true })
    .click();
  await expect(
    page.getByText(
      "Screening assessment recorded. Teacher approval remains a separate decision.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(s.writes[0].body.coverage.teachingCoverage).toEqual(
    s.t().teachingCoverage,
  );
});
