import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { validator, operationValidator } from "./contract";
import { checkHindi } from "./hindi";
import { hindiMessages } from "../../apps/web/app/hindi-messages";
const actor = "10000000-0000-4000-8000-000000000821",
  target = "10000000-0000-4000-8000-000000000822",
  proposer = "10000000-0000-4000-8000-000000000823",
  changeId = "20000000-0000-4000-8000-000000000821";
function proposal(extra = {}) {
  return {
    id: changeId,
    kind: "RECOVER",
    targetAccountId: target,
    email: "staff@example.test",
    name: "Synthetic staff member",
    role: "REVIEWER",
    region: "Raipur",
    expectedAuthVersion: 0,
    proposerId: proposer,
    proposerAuthVersion: 0,
    approverId: null,
    reason: "Private identity check completed",
    evidenceRef: "restricted:case-staff-821",
    decisionReason: null,
    status: "PENDING",
    version: 1,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    createdAt: new Date().toISOString(),
    decidedAt: null,
    ...extra,
  };
}
async function setup(page: Page, mode = "normal") {
  let denied = false,
    saved = false,
    record = proposal(
      mode === "self"
        ? { proposerId: actor }
        : mode === "target"
          ? { targetAccountId: actor }
          : mode === "expired"
            ? { expiresAt: new Date(0).toISOString() }
            : {},
    );
  const writes: { body: any; key: string; path: string }[] = [],
    reads: URL[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      p = url.pathname;
    if (p.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: actor,
            name: "Synthetic administrator",
            role: "ADMIN",
            verified: false,
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (p.endsWith("/auth/mfa"))
      return route.fulfill({
        json: {
          enabled: true,
          verifiedUntil: new Date(Date.now() + 600000).toISOString(),
          recoveryCodesRemaining: 8,
        },
      });
    if (p.endsWith("/dashboard"))
      return route.fulfill({
        json: {
          role: "ADMIN",
          window: {
            start: new Date().toISOString(),
            end: new Date().toISOString(),
            timezone: "Asia/Kolkata",
            metricVersion: "synthetic",
          },
          metrics: {},
        },
      });
    if (p.endsWith("/admin/console"))
      return route.fulfill({
        json: {
          asOf: new Date().toISOString(),
          mode: "SYNTHETIC_DEVELOPMENT",
          flags: [],
          accounts: 2,
          pendingPrivacy: 0,
          supply: [],
          supplyLimit: 50,
          commercial: {
            placementExamples: [],
            revisionPrices: [],
            currency: "INR",
            editable: false,
          },
          integrations: [],
          release: {
            authorized: false,
            status: "BLOCKED",
            providerQualification: "PENDING",
          },
          staffAdministration: "INDEPENDENT_APPROVAL_REQUIRED",
        },
      });
    if (req.method() === "GET" && p.includes("/admin/staff")) {
      reads.push(url);
      if (denied)
        return route.fulfill({
          status: 403,
          json: {
            code: "FORBIDDEN",
            message: "Synthetic private backend detail",
          },
        });
      let data: any;
      if (p.endsWith("/changes"))
        data = {
          items:
            url.searchParams.get("status") === "PENDING" && saved
              ? []
              : [record],
          nextCursor:
            mode === "paging" && !url.searchParams.has("cursor")
              ? changeId
              : null,
        };
      else
        data = {
          items: [
            {
              id: actor,
              name: "Synthetic administrator",
              email: "admin@example.test",
              role: "ADMIN",
              region: "Raipur",
              disabled: false,
              authVersion: 0,
            },
            {
              id: target,
              name: "Synthetic staff member",
              email: "staff@example.test",
              role: "REVIEWER",
              region: "Raipur",
              disabled: false,
              authVersion: 0,
            },
          ],
          nextCursor:
            mode === "paging" && !url.searchParams.has("cursor")
              ? target
              : null,
        };
      const validate = operationValidator(
        p.endsWith("/changes") ? "/admin/staff/changes" : "/admin/staff",
        "get",
        "200",
      );
      expect(validate(data), JSON.stringify(validate.errors)).toBe(true);
      return route.fulfill({ json: data });
    }
    if (req.method() === "POST" && p.includes("/admin/staff/changes")) {
      const body = req.postDataJSON(),
        isDecision = p.endsWith("/decision"),
        validate = validator(isDecision ? "StaffDecision" : "StaffProposal");
      expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
      writes.push({ body, key: req.headers()["idempotency-key"], path: p });
      expect(writes.at(-1)!.key).toBeTruthy();
      if (mode === "unknown" && writes.length === 1)
        return route.abort("failed");
      saved = true;
      record = isDecision
        ? {
            ...record,
            status:
              body.decision === "APPROVE"
                ? "APPROVED"
                : body.decision === "REJECT"
                  ? "REJECTED"
                  : "CANCELLED",
            version: 2,
            approverId: body.decision === "CANCEL" ? null : actor,
            decisionReason: body.reason,
            decidedAt: new Date().toISOString(),
          }
        : proposal({
            ...body,
            id: changeId,
            targetAccountId: null,
            expectedAuthVersion: 0,
            proposerId: actor,
          });
      delete (record as any).confirmed;
      const check = validator("StaffChange");
      expect(check(record), JSON.stringify(check.errors)).toBe(true);
      if (mode === "failed-refresh") denied = true;
      return route.fulfill({ status: 201, json: record });
    }
    return route.fulfill({ json: { items: [] } });
  });
  await page.goto("/dashboard/admin");
  await page.getByRole("tab", { name: "Staff access", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Access with a second pair of eyes." }),
  ).toBeVisible();
  return {
    writes,
    reads,
    fail(value: boolean) {
      denied = value;
    },
  };
}
async function startCreate(page: Page) {
  await page
    .getByRole("button", { name: "Add staff member", exact: true })
    .click();
  await page
    .getByLabel("Staff name", { exact: true })
    .fill("Synthetic new reviewer");
  await page
    .getByLabel("Dedicated staff email", { exact: true })
    .fill("new-reviewer@example.test");
  await page
    .getByLabel("Proposal reason", { exact: true })
    .fill("Approved reviewer staffing requirement");
  await page
    .getByLabel(/^Restricted review reference/)
    .fill("restricted:review-123");
  await page
    .getByRole("button", { name: "Review staff proposal", exact: true })
    .click();
}
async function startReview(page: Page) {
  await page
    .getByRole("button", { name: "Review staff change", exact: true })
    .click();
  await page
    .getByLabel("Decision reason", { exact: true })
    .fill("Independently verified the protected identity record");
  await page.getByRole("checkbox").check();
}
export function staffAdministrationChecks() {
  test("staff role changes review reactivation and preserve the current access version", async ({
    page,
  }) => {
    const s = await setup(page);
    await page
      .getByRole("button", { name: "Change staff access", exact: true })
      .click();
    await expect(
      page.getByText(
        "Approval applies the proposed role and region and reactivates suspended staff access.",
        { exact: true },
      ),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Staff role", exact: true })
      .selectOption("FINANCE");
    await page.getByLabel(/^Configured region/).fill("Delhi");
    await page
      .getByLabel("Proposal reason", { exact: true })
      .fill("Independently scoped finance access");
    const reference = page.getByLabel(/^Restricted review reference/);
    await reference.fill("invalid reference");
    expect(
      await reference.evaluate(
        (e: HTMLInputElement) => e.validity.patternMismatch,
      ),
    ).toBe(true);
    await reference.fill("restricted:finance-123");
    await page
      .getByRole("button", { name: "Review staff proposal", exact: true })
      .click();
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Send for independent review", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Close staff review", exact: true }),
    ).toBeEnabled();
    expect(s.writes).toHaveLength(1);
    expect(s.writes[0].body).toMatchObject({
      kind: "CHANGE",
      targetAccountId: target,
      expectedAuthVersion: 0,
      role: "FINANCE",
      region: "Delhi",
    });
    expect(s.writes[0].body).not.toHaveProperty("email");
  });

  test("staff creation reviews dedicated identity and locks navigation until explicit discard or save", async ({
    page,
  }) => {
    const s = await setup(page);
    await startCreate(page);
    await expect(
      page.getByRole("tab", { name: "People & linkage", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", {
        name: "Send for independent review",
        exact: true,
      }),
    ).toBeVisible();
    expect(s.writes).toHaveLength(0);
    await page
      .getByRole("button", { name: "Edit staff proposal", exact: true })
      .click();
    await expect(page.getByLabel("Staff name", { exact: true })).toHaveValue(
      "Synthetic new reviewer",
    );
    await page
      .getByRole("button", { name: "Review staff proposal", exact: true })
      .click();
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Send for independent review", exact: true })
      .click();
    await expect(
      page.getByText(
        "Your proposal is saved. A different administrator must review it before access changes.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(s.writes).toHaveLength(1);
    expect(s.writes[0].body.role).toBe("REVIEWER");
    await page
      .getByRole("button", { name: "Close staff review", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Access with a second pair of eyes." }),
    ).toBeFocused();
  });
  test("independent staff recovery records the reviewed version and displays the confirmed outcome", async ({
    page,
  }) => {
    const s = await setup(page);
    await startReview(page);
    await page
      .getByRole("button", { name: "Record independent review", exact: true })
      .click();
    await expect(
      page.getByText(
        "The review is recorded. Approved changes take effect immediately; affected staff must sign in and enroll their authenticator again.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Staff access review", exact: true })
        .getByText("Approved", { exact: true }),
    ).toBeVisible();
    expect(s.writes[0].body).toMatchObject({
      expectedVersion: 1,
      decision: "APPROVE",
      independentlyVerified: true,
    });
  });
  test("proposer can cancel but cannot approve their proposal, and the target cannot review their own change", async ({
    page,
  }) => {
    const s = await setup(page, "self");
    await page
      .getByRole("button", { name: "Review staff change", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Record independent review",
        exact: true,
      }),
    ).toHaveCount(0);
    await page
      .getByLabel("Decision reason", { exact: true })
      .fill("No longer required");
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Cancel staff proposal", exact: true })
      .click();
    expect(s.writes[0].body.decision).toBe("CANCEL");
    await page.unroute("**/api/v1/**");
    await setup(page, "target");
    await page
      .getByRole("button", { name: "Review staff change", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Record independent review",
        exact: true,
      }),
    ).toBeDisabled();
  });
  test("uncertain staff decisions freeze edits and replay the exact original body and idempotency key", async ({
    page,
  }) => {
    const s = await setup(page, "unknown");
    await startReview(page);
    await page
      .getByRole("button", { name: "Record independent review", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Retry same decision", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Decision reason", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Discard staff review", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Retry same decision", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Close staff review", exact: true }),
    ).toBeEnabled();
    expect(s.writes).toHaveLength(2);
    expect(s.writes[1]).toEqual(s.writes[0]);
  });
  test("confirmed staff decisions survive failed reads, hide private details and never send a second mutation", async ({
    page,
  }) => {
    const s = await setup(page, "failed-refresh");
    await startReview(page);
    await page
      .getByRole("button", { name: "Record independent review", exact: true })
      .click();
    await expect(
      page.getByText(
        "Staff records are unavailable. Private details stay hidden until access is checked again.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByText("restricted:case-staff-821", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Synthetic private backend detail", { exact: true }),
    ).toHaveCount(0);
    s.fail(false);
    await page
      .getByRole("button", { name: "Reload staff records", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Close staff review", exact: true }),
    ).toBeEnabled();
    await expect(
      page
        .getByRole("region", { name: "Staff access review", exact: true })
        .getByText("Approved", { exact: true }),
    ).toBeVisible();
    expect(s.writes).toHaveLength(1);
  });
  test("staff histories preserve filters and failed-page recovery while private records stay hidden", async ({
    page,
  }) => {
    const s = await setup(page, "paging");
    await page
      .getByRole("group", { name: "Staff directory history", exact: true })
      .getByRole("button", { name: "Load more records", exact: true })
      .click();
    expect(
      s.reads.some(
        (u) =>
          u.pathname.endsWith("/staff") &&
          u.searchParams.get("cursor") === target,
      ),
    ).toBe(true);
    s.fail(true);
    await page
      .getByRole("group", { name: "Staff approval history", exact: true })
      .getByRole("button", { name: "Load more records", exact: true })
      .click();
    await expect(
      page
        .getByRole("group", { name: "Staff approval history", exact: true })
        .getByRole("button", { name: "Retry history", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Review staff change", exact: true }),
    ).toHaveCount(0);
    s.fail(false);
    await page
      .getByRole("group", { name: "Staff approval history", exact: true })
      .getByRole("button", { name: "Retry history", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Review staff change", exact: true }),
    ).toBeVisible();
    expect(
      s.reads
        .filter((u) => u.pathname.endsWith("/changes"))
        .every((u) => u.searchParams.get("status") === "PENDING"),
    ).toBe(true);
  });
  test("expired staff proposals require rejection or a fresh proposal before approval", async ({
    page,
  }) => {
    const s = await setup(page, "expired");
    await startReview(page);
    await expect(
      page.getByRole("button", {
        name: "Record independent review",
        exact: true,
      }),
    ).toBeDisabled();
    await page
      .getByRole("combobox", { name: "Review outcome", exact: true })
      .selectOption("REJECT");
    await page
      .getByRole("button", { name: "Record independent review", exact: true })
      .click();
    expect(s.writes[0].body.decision).toBe("REJECT");
  });
  test("Hindi staff forms fit 320–430px with keyboard access, 44px actions and accessible labels", async ({
    page,
  }) => {
    await setup(page);
    await page
      .getByRole("button", { name: "Add staff member", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Switch English and Hindi", exact: true })
      .click();
    await checkHindi(page);
    for (const width of [320, 360, 390, 430]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(
        page.getByLabel(hindiMessages["Staff name"], { exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const bounds = await page
        .getByRole("button", {
          name: hindiMessages["Review staff proposal"],
          exact: true,
        })
        .boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
    }
    const results = await new AxeBuilder({ page })
      .include(".staff-workspace")
      .analyze();
    expect(
      results.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact || ""),
      ),
    ).toEqual([]);
    await page.getByLabel(hindiMessages["Staff name"], { exact: true }).focus();
    await expect(
      page.getByLabel(hindiMessages["Staff name"], { exact: true }),
    ).toBeFocused();
    await page
      .locator(".staff-editor")
      .screenshot({ path: "test-results/staff-hindi-mobile.png" });
  });
}
