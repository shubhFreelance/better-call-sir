import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { validator } from "../helpers/contract";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ids } from "../../packages/test-fixtures/src";
const account = "10000000-0000-4000-8000-000000000101",
  child = "20000000-0000-4000-8000-000000000101",
  note = "30000000-0000-4000-8000-000000000101",
  id = "40000000-0000-4000-8000-000000000101";
async function mock(page: Page, mode = "normal", role = "GUARDIAN") {
  const writes: { body: any; key: string }[] = [],
    reads: string[] = [],
    replays = new Map<string, any>();
  let rows: any[] = [],
    paused = false,
    fail = false;
  if (mode === "outcomes")
    rows = ["COMPLETED", "REJECTED"].map((status, i) => ({
      id: i ? note : id,
      accountId: account,
      kind: "CORRECTION",
      scope: "ACCOUNT",
      resourceId: account,
      reason: "Correct display name",
      correction: "Corrected name",
      status,
      resolution: i
        ? "Needs additional ownership information"
        : "Name corrected",
      policyVersion: "synthetic-policy",
      version: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  const check = (name: string, data: any) => {
    const v = validator(name);
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
            id: account,
            name: "Synthetic owner",
            role,
            verified: true,
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (req.method() === "GET") {
      reads.push(path);
      if (path.endsWith("/dashboard"))
        return route.fulfill({
          json: {
            role,
            window: {
              start: new Date().toISOString(),
              end: new Date().toISOString(),
              timezone: "Asia/Kolkata",
              metricVersion: "synthetic",
            },
            metrics: {},
            children: [{ id: child, alias: "Aarav", grade: 8, board: "CBSE" }],
            consent: { withdrawnAt: paused ? new Date().toISOString() : null },
            profile:
              role === "TEACHER"
                ? { status: paused ? "SUSPENDED" : "APPROVED" }
                : undefined,
          },
        });
      if (path.endsWith("/privacy-requests")) {
        if (fail) {
          fail = false;
          return route.fulfill({
            status: 503,
            json: { code: "UNAVAILABLE", message: "Records unavailable." },
          });
        }
        return route.fulfill({
          json: check("PrivacyRequestList", { items: rows }),
        });
      }
      if (path.endsWith("/notes"))
        return route.fulfill({
          json: {
            items: [
              {
                id: note,
                childId: child,
                text: "Private synthetic note",
                sharedTeacherId: null,
                acknowledgedAt: null,
                version: 1,
                createdAt: new Date().toISOString(),
                learner: { alias: "Aarav", grade: 8, board: "CBSE" },
                sharedTeacher: null,
                sharingActive: false,
              },
            ],
          },
        });
      return route.fulfill({
        status: 404,
        json: { code: "NOT_FOUND", message: "Missing fixture." },
      });
    }
    const body = req.postDataJSON(),
      key = req.headers()["idempotency-key"];
    writes.push({ body, key });
    expect(key).toBeTruthy();
    check("PrivacyRequestInput", body);
    if (replays.has(key))
      return route.fulfill({ status: 201, json: replays.get(key) });
    const item = check("PrivacyRequest", {
      ...body,
      id,
      accountId: account,
      correction: body.correction || null,
      status: "PENDING",
      resolution: null,
      policyVersion: null,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    rows = [item, ...rows];
    paused = body.kind === "DELETION" && body.scope !== "NOTE";
    replays.set(key, item);
    if (mode === "failed-refresh") fail = true;
    if (mode === "unknown" && writes.length === 1) return route.abort("failed");
    return route.fulfill({ status: 201, json: item });
  });
  return { writes, reads };
}
async function review(page: Page, deletion = false) {
  await page
    .getByRole("button", { name: "Create privacy request", exact: true })
    .click();
  if (deletion) await page.getByLabel("Request type").selectOption("DELETION");
  await page.getByLabel("Reason for request").fill("Synthetic owner request.");
  if (!deletion)
    await page
      .getByLabel("Proposed display name or learner alias")
      .fill("Corrected synthetic name");
  await page
    .getByRole("button", { name: "Review privacy request", exact: true })
    .click();
}
test("correction requires review and preserves entered text through editing", async ({
  page,
}) => {
  const s = await mock(page);
  await page.goto("/dashboard/privacy");
  await review(page);
  await page.getByRole("button", { name: "Back to editing" }).click();
  await expect(
    page.getByLabel("Proposed display name or learner alias"),
  ).toHaveValue("Corrected synthetic name");
  await page
    .getByRole("button", { name: "Review privacy request", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Send privacy request", exact: true })
    .click();
  expect(s.writes).toHaveLength(0);
  await page.getByRole("checkbox", { name: /I reviewed the record/ }).check();
  await page
    .getByRole("button", { name: "Send privacy request", exact: true })
    .click();
  await expect(page.locator(".privacy-record")).toContainText(
    "Awaiting review",
  );
  await page.reload();
  await expect(page.locator(".privacy-record")).toContainText(
    "Corrected synthetic name",
  );
});
test("account deletion explains immediate pause, retained evidence and no automatic restoration", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/dashboard/privacy");
  await review(page, true);
  await expect(page.locator(".care-review")).toContainText(
    "student sessions are revoked",
  );
  await expect(page.locator(".care-review")).toContainText(
    "does not promise instant or complete erasure",
  );
  await page.getByRole("checkbox", { name: /I reviewed the record/ }).check();
  await page
    .getByRole("button", { name: "Send privacy request", exact: true })
    .click();
  await expect(
    page.getByText(/Completion or rejection does not automatically restore/),
  ).toBeVisible();
});
test("unknown privacy write freezes editing and replays the exact request", async ({
  page,
}) => {
  const s = await mock(page, "unknown");
  await page.goto("/dashboard/privacy");
  await review(page, true);
  await page.getByRole("checkbox", { name: /I reviewed the record/ }).check();
  await page
    .getByRole("button", { name: "Send privacy request", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry same decision" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Back to editing" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Retry same decision" }).click();
  await expect(page.locator(".privacy-record")).toContainText(
    "Awaiting review",
  );
  expect(s.writes[1]).toEqual(s.writes[0]);
});
test("saved privacy request with failed refresh blocks another request until recovery", async ({
  page,
}) => {
  const s = await mock(page, "failed-refresh");
  await page.goto("/dashboard/privacy");
  await review(page);
  await page.getByRole("checkbox", { name: /I reviewed the record/ }).check();
  await page
    .getByRole("button", { name: "Send privacy request", exact: true })
    .click();
  await expect(
    page.getByText(/Your decision was saved, but current details/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create privacy request", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Refresh privacy records" }).click();
  await expect(page.locator(".privacy-record")).toContainText(
    "Awaiting review",
  );
  expect(s.writes).toHaveLength(1);
});
test("teacher scope is account-only and student cannot query private requests", async ({
  page,
}) => {
  await mock(page, "normal", "TEACHER");
  await page.goto("/dashboard/privacy");
  await page
    .getByRole("button", { name: "Create privacy request", exact: true })
    .click();
  await expect(page.getByLabel("Record type").locator("option")).toHaveCount(1);
  await page.unrouteAll();
  const s = await mock(page, "normal", "STUDENT");
  await page.reload();
  await expect(page.getByText(/Students can ask their guardian/)).toBeVisible();
  expect(s.reads).not.toContain("/api/v1/privacy-requests");
  expect(s.reads).not.toContain("/api/v1/notes");
});
test("completed and rejected requests show review outcomes and policy with mobile accessibility", async ({
  page,
}) => {
  await mock(page, "outcomes");
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/dashboard/privacy");
  await expect(
    page.getByText("Needs additional ownership information", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".privacy-record")).toHaveCount(2);
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
    path: "test-results/privacy-mobile.png",
    style: "nextjs-portal{display:none!important}",
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.locator(".care-workspace").screenshot({
    path: "test-results/privacy-desktop.png",
    style: "nextjs-portal{display:none!important}",
  });
});
test("real guardian note deletion stays pending and immediately revokes only that note sharing", async ({
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
    const n = await db.note.create({
      data: {
        guardianId: ids.guardian,
        childId: ids.child,
        text: "Synthetic isolated privacy browser note",
        sharedTeacherId: ids.teacher,
      },
    });
    await page.goto("/login");
    await page.getByText("Development accounts", { exact: true }).click();
    await page.getByRole("button", { name: /Kavita/ }).click();
    await expect(
      page.getByRole("heading", { name: /Hello, Kavita/ }),
    ).toBeVisible();
    await page.goto("/dashboard/privacy");
    await page
      .getByRole("button", { name: "Create privacy request", exact: true })
      .click();
    await page.getByLabel("Request type").selectOption("DELETION");
    await page.getByLabel("Record type").selectOption("NOTE");
    await page.getByLabel("Owned learning note").selectOption(n.id);
    const requestReason = "Delete synthetic browser note " + n.id;
    await page.getByLabel("Reason for request").fill(requestReason);
    await page
      .getByRole("button", { name: "Review privacy request", exact: true })
      .click();
    await page.getByRole("checkbox", { name: /I reviewed the record/ }).check();
    await page
      .getByRole("button", { name: "Send privacy request", exact: true })
      .click();
    await expect(
      page.locator(".privacy-record").filter({ hasText: requestReason }),
    ).toContainText("Awaiting review");
    expect(
      (await db.note.findUniqueOrThrow({ where: { id: n.id } }))
        .sharedTeacherId,
    ).toBeNull();
    await page.reload();
    await expect(
      page.locator(".privacy-record").filter({ hasText: requestReason }),
    ).toContainText("Awaiting review");
  } finally {
    await db.$disconnect();
  }
});
