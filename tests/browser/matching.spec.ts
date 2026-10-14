import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { validator } from "../helpers/contract";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ids } from "../../packages/test-fixtures/src";
import { verifiedStaffSession, cleanupStaffFixtures } from "./staff-fixture";
test.use({ trace: "off" });
test.afterEach(async () => cleanupStaffFixtures());
const actor = "10000000-0000-4000-8000-000000000121",
  request = "20000000-0000-4000-8000-000000000121",
  runId = "30000000-0000-4000-8000-000000000121",
  candidate = "40000000-0000-4000-8000-000000000121",
  second = "40000000-0000-4000-8000-000000000122",
  teacher = "50000000-0000-4000-8000-000000000121";
const now = () => new Date().toISOString(),
  future = (days = 3) => new Date(Date.now() + days * 86400000).toISOString();
async function mock(page: Page, mode = "normal", role = "OPERATOR") {
  let r: any = {
    id: request,
    guardianId: actor,
    childId: teacher,
    subject: "Maths",
    mode: "HOME",
    language: "English",
    locality: "Shankar Nagar",
    budgetPaise: 400000,
    schedule: "Fresh preferences",
    status: "OPEN",
    version: 2,
    createdAt: now(),
    region: "Raipur",
    scheduleStatus: "CONFIRMED",
    schedulePreferences: {
      timezone: "Asia/Kolkata",
      slots: [
        {
          startsAt: future(),
          endsAt: new Date(Date.now() + 3 * 86400000 + 3600000).toISOString(),
        },
      ],
    },
    discoveryMethod: "ASSISTED",
    preferredTeacherId: null,
    rematchFromPlacementId: null,
    matchStatus: "MATCHED",
    selectedCandidateId: null,
  };
  let items: any[] = [candidate, second].map((id, i) => ({
    id,
    requestId: request,
    teacherId: teacher,
    score: 90 - i,
    reasons: [
      "Within budget and confirmed schedule",
      "Current screened coverage",
    ],
    rankerVersion: "rules-v2",
    response: "PENDING",
    version: 1,
    runId,
    expiresAt: future(2),
    presentedAt: null,
    position: null,
    teacherName: i ? "Rohan · synthetic" : "Ananya · synthetic",
    eligibleNow: mode !== "ineligible" || i !== 0,
  }));
  let result =
    mode === "needs"
      ? "NEEDS_SCHEDULE"
      : mode === "none"
        ? "NO_MATCH"
        : "MATCHED";
  if (["needs", "none"].includes(mode)) items = [];
  let rows: any[] = [
      {
        id: runId,
        requestId: request,
        requestVersion: 1,
        operatorId: actor,
        rankerVersion: "rules-v2",
        featureVersion: "eligibility-v2",
        requestFeatures: { subject: "Maths", grade: 8, board: "CBSE" },
        eligiblePool: { poolLimited: false },
        rankedCandidates: [],
        result,
        createdAt: now(),
      },
    ],
    stale = mode === "stale",
    fail = false;
  const writes: { body: any; key: string; path: string }[] = [],
    reads: string[] = [],
    replays = new Map<string, any>();
  const check = (name: string, data: any) => {
    const v = validator(name);
    expect(v(data), JSON.stringify(v.errors)).toBe(true);
    return data;
  };
  const plain = (i: any) => {
    const { teacherName, eligibleNow, ...c } = i;
    return c;
  };
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: actor,
            name: "Synthetic operator",
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
      if (path.endsWith("/requests"))
        return route.fulfill({ json: check("RequestList", { items: [r] }) });
      if (path.endsWith("/recommendations")) {
        if (fail) {
          fail = false;
          return route.fulfill({
            status: 503,
            json: { code: "UNAVAILABLE", message: "Candidates unavailable." },
          });
        }
        return route.fulfill({
          json: check("OperatorCandidateList", { runId, items }),
        });
      }
      if (path.endsWith("/recommendation-runs"))
        return route.fulfill({ json: check("Runs", { items: rows }) });
      if (path.endsWith("/requests/" + request))
        return route.fulfill({
          json: check("TuitionRequestDetails", {
            ...r,
            candidates: items.filter((i) => i.presentedAt).map(plain),
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
    if (replays.has(key))
      return route.fulfill({ status: 201, json: replays.get(key) });
    if (stale) {
      stale = false;
      r = { ...r, version: 3 };
      return route.fulfill({
        status: 409,
        json: { code: "CONFLICT", message: "Request changed. Refresh first." },
      });
    }
    let saved: any;
    if (path.endsWith("/recommendations")) {
      check("MatchingInput", body);
      r = { ...r, version: r.version + 1 };
      saved = check("MatchResult", {
        items: items.map(plain),
        runId,
        requestVersion: r.version,
        rankerVersion: "rules-v2",
        featureVersion: "eligibility-v2",
        matchStatus: result,
        scheduleStatus: r.scheduleStatus,
        poolLimited: false,
      });
    } else {
      check("PublishInput", body);
      expect(body.expectedVersion).toBe(r.version);
      items = items.map((i) => ({
        ...i,
        presentedAt: body.candidateIds.includes(i.id) ? now() : null,
        position: body.candidateIds.includes(i.id)
          ? body.candidateIds.indexOf(i.id) + 1
          : null,
        version: i.version + 1,
      }));
      saved = check("PublishedCandidates", {
        items: body.candidateIds.map((id: string) =>
          plain(items.find((i) => i.id === id)),
        ),
        presentationId: teacher,
        runId,
      });
    }
    replays.set(key, saved);
    if (mode === "saved-refresh") fail = true;
    if (mode === "unknown" && writes.length === 1) return route.abort("failed");
    return route.fulfill({ status: 201, json: saved });
  });
  return { writes, reads, items: () => items };
}
async function publication(page: Page) {
  await page
    .getByRole("button", { name: "Review shortlist publication", exact: true })
    .click();
  await page.getByRole("button", { name: "Move candidate 1 down" }).click();
  await page
    .getByLabel("Reason for shortlist and adjustments")
    .fill("Synthetic reviewed order based on teaching fit.");
  await page
    .getByRole("button", { name: "Review publication", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /I reviewed the criteria/ }).check();
}
test("matching remains staff-scoped and MFA blocks unpublished candidate reads", async ({
  page,
}) => {
  const s = await mock(page, "normal", "GUARDIAN");
  await page.goto("/dashboard/matching");
  await expect(page.getByText(/belongs to authorized operators/)).toBeVisible();
  expect(s.reads.some((p) => p.includes("/recommendations"))).toBe(false);
  await page.unrouteAll();
  const m = await mock(page, "mfa");
  await page.reload();
  await expect(page.getByLabel("Authenticator code")).toBeVisible();
  expect(m.reads.some((p) => p.includes("/recommendations"))).toBe(false);
});
test("ordered publication is reviewed, versioned and survives reload", async ({
  page,
}) => {
  const s = await mock(page);
  await page.goto("/dashboard/matching");
  await publication(page);
  expect(s.writes).toHaveLength(0);
  await page
    .getByRole("button", { name: "Publish reviewed shortlist", exact: true })
    .click();
  await expect(page.getByText(/Reviewed shortlist published/)).toBeVisible();
  expect(s.writes[0].body.candidateIds).toEqual([second, candidate]);
  expect(s.writes[0].body.expectedVersion).toBe(2);
  await page.reload();
  await expect(page.getByText(/Published at/).first()).toBeVisible();
});
test("matching run requires explicit acknowledgement and is not publication", async ({
  page,
}) => {
  const s = await mock(page);
  await page.goto("/dashboard/matching");
  await page.getByRole("button", { name: "Review new matching run" }).click();
  await page
    .getByRole("button", { name: "Confirm matching run", exact: true })
    .click();
  expect(s.writes).toHaveLength(0);
  await page.getByRole("checkbox", { name: /I reviewed the criteria/ }).check();
  await page
    .getByRole("button", { name: "Confirm matching run", exact: true })
    .click();
  await expect(
    page.getByText(
      "Matching run recorded. Review its result before publishing.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(s.items().every((i) => !i.presentedAt)).toBe(true);
});
test("ineligible candidates cannot be selected and no-match/schedule outcomes explain recovery", async ({
  page,
}) => {
  await mock(page, "ineligible");
  await page.goto("/dashboard/matching");
  await page
    .getByRole("button", { name: "Review shortlist publication", exact: true })
    .click();
  await expect(page.getByRole("checkbox", { name: /Ananya/ })).toBeDisabled();
  for (const mode of ["none", "needs"]) {
    await page.unrouteAll();
    await mock(page, mode);
    await page.goto("/dashboard/matching");
    await expect(
      page.getByRole("button", {
        name: "Review shortlist publication",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByText(
        mode === "none"
          ? /No eligible teacher was found/
          : /Ask the guardian to confirm fresh/,
      ),
    ).toBeVisible();
  }
});
test("unknown publication retains the exact order, version and retry key", async ({
  page,
}) => {
  const s = await mock(page, "unknown");
  await page.goto("/dashboard/matching");
  await publication(page);
  await page
    .getByRole("button", { name: "Publish reviewed shortlist", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry same decision" }),
  ).toBeVisible();
  await expect(page.getByLabel("Open tuition request")).toBeDisabled();
  await page.getByRole("button", { name: "Retry same decision" }).click();
  await expect(page.getByText(/Reviewed shortlist published/)).toBeVisible();
  expect(s.writes[1]).toEqual(s.writes[0]);
});
test("stale publication preserves order/reason for review with the current version", async ({
  page,
}) => {
  const s = await mock(page, "stale");
  await page.goto("/dashboard/matching");
  await publication(page);
  await page
    .getByRole("button", { name: "Publish reviewed shortlist", exact: true })
    .click();
  await expect(page.getByText("Request changed. Refresh first.")).toBeVisible();
  await page.getByRole("button", { name: "Refresh matching details" }).click();
  await expect(
    page.getByLabel("Reason for shortlist and adjustments"),
  ).toHaveValue("Synthetic reviewed order based on teaching fit.");
  await page
    .getByRole("button", { name: "Review publication", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /I reviewed the criteria/ }).check();
  await page
    .getByRole("button", { name: "Publish reviewed shortlist", exact: true })
    .click();
  await expect(page.getByText(/Reviewed shortlist published/)).toBeVisible();
  expect(s.writes[1].body.expectedVersion).toBe(3);
});
test("saved publication refresh errors block another run until recovered", async ({
  page,
}) => {
  const s = await mock(page, "saved-refresh");
  await page.goto("/dashboard/matching");
  await publication(page);
  await page
    .getByRole("button", { name: "Publish reviewed shortlist", exact: true })
    .click();
  await expect(
    page.getByText(/Your decision was saved, but current details/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review new matching run" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Refresh matching details" }).click();
  await expect(
    page.getByRole("button", { name: "Review new matching run" }),
  ).toBeEnabled();
  expect(s.writes).toHaveLength(1);
});
test("mobile order controls and review are accessible with no overflow", async ({
  page,
}) => {
  await mock(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/dashboard/matching");
  await publication(page);
  expect(
    (await new AxeBuilder({ page }).include(".care-workspace").analyze())
      .violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".care-workspace")
    .screenshot({
      path: "test-results/matching-mobile.png",
      style: "nextjs-portal{display:none!important}",
    });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page
    .locator(".care-workspace")
    .screenshot({
      path: "test-results/matching-desktop.png",
      style: "nextjs-portal{display:none!important}",
    });
});
test("real MFA staff reloads an unpublished manual shortlist and publishes it", async ({
  page,
}) => {
  const config = parseEnv(readFileSync(".env", "utf8")),
    url = new URL(config.DATABASE_URL);
  expect(config.APP_MODE).toBe("development");
  expect(["localhost", "127.0.0.1"]).toContain(url.hostname);
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url.href }),
  });
  let ownerId = "",
    teacherId = "";
  try {
    const a = await db.account.create({
      data: {
        name: "Synthetic matching browser teacher",
        role: "TEACHER",
        verified: true,
      },
    });
    ownerId = a.id;
    const t = await db.teacher.create({
      data: {
        accountId: a.id,
        slug: "synthetic-match-" + randomUUID(),
        name: a.name,
        headline: "Synthetic Maths fixture",
        bio: "Test only",
        subjects: ["Maths"],
        boards: ["CBSE"],
        grades: [8],
        languages: ["English"],
        modes: ["HOME"],
        localities: ["Shankar Nagar"],
        monthlyPaise: 300000,
        experience: 2,
        status: "APPROVED",
        screeningComplete: true,
        screeningValidUntil: new Date(future(30)),
        feeTermsAcceptedAt: new Date(),
        travelAccepted: true,
      },
    });
    teacherId = t.id;
    const starts = new Date(
      new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10) +
        "T12:00:00+05:30",
    );
    await db.availabilityPattern.create({
      data: {
        teacherId: t.id,
        kind: "RECURRING",
        weekday: new Date(starts.getTime() + 19800000).getUTCDay(),
        startMinute: 0,
        endMinute: 1440,
        validFrom: new Date(),
        validUntil: new Date(future(30)),
      },
    });
    const c = await db.child.create({
        data: {
          guardianId: ids.guardian,
          alias: "Synthetic matching learner",
          grade: 8,
          board: "CBSE",
        },
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
          schedule: "Synthetic future slot",
          discoveryMethod: "MANUAL",
          preferredTeacherId: t.id,
          scheduleStatus: "CONFIRMED",
          schedulePreferences: {
            timezone: "Asia/Kolkata",
            slots: [
              {
                startsAt: starts.toISOString(),
                endsAt: new Date(starts.getTime() + 3600000).toISOString(),
              },
            ],
          },
        },
      });
    await verifiedStaffSession(page.request);
    await page.goto("/dashboard/matching?request=" + r.id);
    await page.getByRole("button", { name: "Review new matching run" }).click();
    await page
      .getByRole("checkbox", { name: /I reviewed the criteria/ })
      .check();
    await page
      .getByRole("button", { name: "Confirm matching run", exact: true })
      .click();
    await expect(
      page.getByText(
        "Matching run recorded. Review its result before publishing.",
        { exact: true },
      ),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", {
        name: "Review shortlist publication",
        exact: true,
      }),
    ).toBeEnabled();
    await page
      .getByRole("button", {
        name: "Review shortlist publication",
        exact: true,
      })
      .click();
    await page
      .getByLabel("Reason for shortlist and adjustments")
      .fill("Synthetic current eligibility reviewed.");
    await page
      .getByRole("button", { name: "Review publication", exact: true })
      .click();
    await page
      .getByRole("checkbox", { name: /I reviewed the criteria/ })
      .check();
    await page
      .getByRole("button", { name: "Publish reviewed shortlist", exact: true })
      .click();
    await expect(page.getByText(/Reviewed shortlist published/)).toBeVisible();
    expect(
      await db.recommendation.count({
        where: { requestId: r.id, presentedAt: { not: null } },
      }),
    ).toBe(1);
  } finally {
    if (teacherId)
      await db.teacher.update({
        where: { id: teacherId },
        data: { status: "SUSPENDED", screeningComplete: false },
      });
    if (ownerId)
      await db.account.update({
        where: { id: ownerId },
        data: { disabled: true },
      });
    await db.$disconnect();
  }
});
