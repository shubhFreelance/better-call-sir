import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { operationValidator, validator } from "./contract";
import { checkHindi } from "./hindi";
import { hindiMessages } from "../../apps/web/app/hindi-messages";
const actor = "10000000-0000-4000-8000-000000000831",
  other = "10000000-0000-4000-8000-000000000832",
  id = "20000000-0000-4000-8000-000000000831";
const regions = [
  {
    id: "Delhi",
    countryCode: "IN",
    stateCode: "DL",
    cityName: "Delhi",
    enabled: false,
  },
  {
    id: "Raipur",
    countryCode: "IN",
    stateCode: "CG",
    cityName: "Raipur",
    enabled: true,
  },
];
const baseline = () => ({
  placementBasisPoints: 2500,
  placementCapPaise: 150000,
  regions: structuredClone(regions),
});
async function setup(page: Page, mode = "normal") {
  let failure = false,
    snapshot = baseline(),
    version = 1;
  let change: any = {
    id,
    kind: "FEE",
    restoreVersion: null,
    expectedVersion: mode === "stale" ? 0 : 1,
    before: baseline(),
    after: {
      ...baseline(),
      placementBasisPoints: 2000,
      placementCapPaise: 100000,
    },
    proposerId: mode === "self" ? actor : other,
    proposerAuthVersion: 0,
    approverId: null,
    reason: "Synthetic protected policy review",
    evidenceRef: "policy:restricted-831",
    decisionReason: null,
    status: "PENDING",
    version: 1,
    expiresAt: new Date(
      mode === "expired" ? 0 : Date.now() + 86400000,
    ).toISOString(),
    createdAt: new Date().toISOString(),
    decidedAt: null,
  };
  const history: any[] = [
    {
      id: "1",
      version: 1,
      changeId: null,
      before: baseline(),
      after: baseline(),
      proposerId: other,
      approverId: actor,
      reason: "Synthetic current policy",
      evidenceRef: "policy:current",
      createdAt: new Date().toISOString(),
    },
    {
      id: "0",
      version: 0,
      changeId: null,
      before: baseline(),
      after: {
        ...baseline(),
        placementBasisPoints: 2000,
        placementCapPaise: 100000,
        regions: [regions[1]],
      },
      proposerId: null,
      approverId: null,
      reason: "Synthetic baseline",
      evidenceRef: "policy:baseline",
      createdAt: new Date().toISOString(),
    },
  ];
  const writes: { body: any; key: string; path: string }[] = [],
    reads: URL[] = [],
    replays = new Map<string, any>();
  function check(schema: string, value: any) {
    const v = validator(schema);
    expect(v(value), JSON.stringify(v.errors)).toBe(true);
    return value;
  }
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
    if (req.method() === "GET" && p.includes("/admin/commercial")) {
      reads.push(url);
      if (failure)
        return route.fulfill({
          status: 403,
          json: {
            code: "FORBIDDEN",
            message: "Synthetic private backend detail",
          },
        });
      if (p.endsWith("/commercial"))
        return route.fulfill({
          json: check("CommercialConfiguration", {
            version,
            snapshot,
            supply: snapshot.regions.map((r) => ({
              regionId: r.id,
              screened: r.enabled ? 2 : 0,
              withAvailability: r.enabled ? 1 : 0,
            })),
            limits: {
              maxBasisPoints: 2500,
              maxCapPaise: 150000,
              maxRegions: 200,
            },
            currency: "INR",
            chargesEnabled: false,
          }),
        });
      if (p.endsWith("/history")) {
        const items =
          mode === "paging"
            ? url.searchParams.has("cursor")
              ? [history[1]]
              : [history[0]]
            : history;
        const result = {
            items,
            nextCursor:
              mode === "paging" && !url.searchParams.has("cursor") ? "1" : null,
          },
          v = operationValidator("/admin/commercial/history", "get", "200");
        expect(v(result), JSON.stringify(v.errors)).toBe(true);
        return route.fulfill({ json: result });
      }
      if (p.endsWith("/changes")) {
        const items =
          mode === "empty"
            ? []
            : change.status === "PENDING" || !url.searchParams.has("status")
              ? [change]
              : [];
        const data = { items, nextCursor: null },
          v = operationValidator("/admin/commercial/changes", "get", "200");
        expect(v(data), JSON.stringify(v.errors)).toBe(true);
        return route.fulfill({ json: data });
      }
    }
    if (req.method() === "POST" && p.includes("/admin/commercial/changes")) {
      const body = req.postDataJSON(),
        key = req.headers()["idempotency-key"],
        isDecision = p.endsWith("/decision");
      check(isDecision ? "CommercialDecision" : "CommercialProposal", body);
      writes.push({ body, key, path: p });
      expect(key).toBeTruthy();
      if (replays.has(key))
        return route.fulfill({ status: 201, json: replays.get(key) });
      if (isDecision) {
        change = {
          ...change,
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
        };
        if (body.decision === "APPROVE") {
          version++;
          snapshot = change.after;
          history.unshift({
            id: String(version),
            version,
            changeId: id,
            before: change.before,
            after: change.after,
            proposerId: change.proposerId,
            approverId: actor,
            reason: change.reason,
            evidenceRef: change.evidenceRef,
            createdAt: new Date().toISOString(),
          });
        }
      } else {
        let after = structuredClone(snapshot);
        if (body.kind === "FEE") after = { ...after, ...body.fee };
        if (body.kind === "REGION")
          after.regions = after.regions
            .filter((r) => r.id !== body.region.id)
            .concat(body.region);
        if (body.kind === "ROLLBACK") {
          const old = history.find(
            (r) => r.version === body.restoreVersion,
          )!.after;
          after = {
            ...old,
            regions: snapshot.regions.map(
              (r) =>
                old.regions.find((x: any) => x.id === r.id) || {
                  ...r,
                  enabled: false,
                },
            ),
          };
        }
        change = {
          ...change,
          kind: body.kind,
          restoreVersion: body.restoreVersion ?? null,
          expectedVersion: body.expectedVersion,
          before: snapshot,
          after,
          reason: body.reason,
          evidenceRef: body.evidenceRef,
          proposerId: actor,
        };
      }
      check("CommercialChange", change);
      replays.set(key, structuredClone(change));
      if (mode === "unknown" && writes.length === 1)
        return route.abort("failed");
      if (mode === "failed-refresh") failure = true;
      return route.fulfill({ status: 201, json: change });
    }
    return route.fulfill({ json: { items: [] } });
  });
  await page.goto("/dashboard/admin");
  await page.getByRole("tab", { name: "Fees & coverage", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Change the next agreement. Preserve the last.",
    }),
  ).toBeVisible();
  return {
    writes,
    reads,
    fail(value: boolean) {
      failure = value;
    },
  };
}
async function proposalFields(page: Page) {
  await page
    .getByRole("textbox", { name: "Proposal reason", exact: true })
    .fill("Reviewed policy change for future hiring");
  await page
    .getByRole("textbox", { name: "Restricted review reference", exact: true })
    .fill("policy:review-123");
}
async function reviewExisting(page: Page) {
  await page
    .getByRole("button", { name: "Review configuration change", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Decision reason", exact: true })
    .fill("Independently verified the protected policy and effects");
  await page.getByRole("checkbox").check();
}
export function commercialConfigurationChecks() {
  test("fee proposals review integer money, pilot bounds and future-only effects before independent submission", async ({
    page,
  }) => {
    const s = await setup(page);
    await page
      .getByRole("button", { name: "Propose fee change", exact: true })
      .click();
    const rate = page.getByRole("spinbutton", {
      name: "Platform fee rate (%)",
      exact: true,
    });
    await rate.fill("25.01");
    expect(
      await rate.evaluate((e: HTMLInputElement) => e.validity.rangeOverflow),
    ).toBe(true);
    await rate.fill("10");
    await page
      .getByRole("spinbutton", {
        name: "Maximum platform fee (₹)",
        exact: true,
      })
      .fill("800");
    await proposalFields(page);
    await page
      .getByRole("button", {
        name: "Review configuration proposal",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("region", { name: "Configuration effects", exact: true }),
    ).toBeVisible();
    expect(s.writes).toHaveLength(0);
    await expect(
      page.getByRole("tab", { name: "Staff access", exact: true }),
    ).toBeDisabled();
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Send for independent review", exact: true })
      .click();
    await expect(
      page.getByText(
        "The proposal is saved. Current settings stay in effect until a different administrator approves.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(s.writes[0].body.fee).toEqual({
      placementBasisPoints: 1000,
      placementCapPaise: 80000,
    });
    await page
      .getByRole("button", { name: "Close configuration review", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Change the next agreement. Preserve the last.",
      }),
    ).toBeFocused();
  });
  test("region registration reviews paused coverage and preserves permanent codes", async ({
    page,
  }) => {
    const s = await setup(page);
    await page
      .getByRole("button", { name: "Register a region", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Region code", exact: true })
      .fill("Bhopal");
    await page
      .getByRole("textbox", { name: "City name", exact: true })
      .fill("Bhopal");
    await page
      .getByRole("textbox", { name: "State code", exact: true })
      .fill("MP");
    await proposalFields(page);
    await page
      .getByRole("button", {
        name: "Review configuration proposal",
        exact: true,
      })
      .click();
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Send for independent review", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Close configuration review",
        exact: true,
      }),
    ).toBeEnabled();
    expect(s.writes[0].body.region).toMatchObject({
      id: "Bhopal",
      stateCode: "MP",
      enabled: false,
    });
  });
  test("restoring an old version proposes a new revision without applying settings or deleting newer region codes", async ({
    page,
  }) => {
    const s = await setup(page);
    await page
      .getByRole("button", { name: "Restore version 0", exact: true })
      .click();
    await expect(
      page.getByText(
        "Restore version 0 as a new revision. Newer region codes remain registered and are paused when absent from the restored version.",
        { exact: true },
      ),
    ).toBeVisible();
    await proposalFields(page);
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Send for independent review", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Close configuration review",
        exact: true,
      }),
    ).toBeEnabled();
    expect(s.writes[0].body).toMatchObject({
      kind: "ROLLBACK",
      restoreVersion: 0,
      expectedVersion: 1,
    });
  });
  test("independent approval records a new outcome while the proposer can only cancel", async ({
    page,
  }) => {
    const s = await setup(page);
    await reviewExisting(page);
    await page
      .getByRole("button", { name: "Record configuration review", exact: true })
      .click();
    await expect(
      page
        .getByRole("region", { name: "Configuration review", exact: true })
        .getByText("Approved", { exact: true }),
    ).toBeVisible();
    expect(s.writes[0].body).toMatchObject({
      decision: "APPROVE",
      expectedVersion: 1,
      independentlyVerified: true,
    });
    await page.unroute("**/api/v1/**");
    const own = await setup(page, "self");
    await reviewExisting(page);
    await expect(
      page.getByRole("button", {
        name: "Record configuration review",
        exact: true,
      }),
    ).toHaveCount(0);
    await page
      .getByRole("button", {
        name: "Cancel configuration proposal",
        exact: true,
      })
      .click();
    expect(own.writes[0].body.decision).toBe("CANCEL");
  });
  test("uncertain configuration approval freezes edits and retries the same already-recorded request exactly", async ({
    page,
  }) => {
    const s = await setup(page, "unknown");
    await reviewExisting(page);
    await page
      .getByRole("button", { name: "Record configuration review", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Retry same decision", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Decision reason", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", {
        name: "Discard configuration review",
        exact: true,
      }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Retry same decision", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Close configuration review",
        exact: true,
      }),
    ).toBeEnabled();
    expect(s.writes).toHaveLength(2);
    expect(s.writes[1]).toEqual(s.writes[0]);
  });
  test("saved configuration survives denied reads without exposing private references or repeating approval", async ({
    page,
  }) => {
    const s = await setup(page, "failed-refresh");
    await reviewExisting(page);
    await page
      .getByRole("button", { name: "Record configuration review", exact: true })
      .click();
    await expect(
      page.getByText(
        "Configuration records are unavailable. Private review details stay hidden until access is checked again.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByText("policy:restricted-831", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Synthetic private backend detail", { exact: true }),
    ).toHaveCount(0);
    s.fail(false);
    await page
      .getByRole("button", {
        name: "Reload configuration records",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Close configuration review",
        exact: true,
      }),
    ).toBeEnabled();
    await expect(
      page
        .getByRole("region", { name: "Configuration review", exact: true })
        .getByText("Approved", { exact: true }),
    ).toBeVisible();
    expect(s.writes).toHaveLength(1);
  });
  test("expired and stale proposals allow rejection while approval remains blocked", async ({
    page,
  }) => {
    for (const mode of ["expired", "stale"]) {
      if (mode === "stale") await page.unroute("**/api/v1/**");
      const s = await setup(page, mode);
      await reviewExisting(page);
      await expect(
        page.getByRole("button", {
          name: "Record configuration review",
          exact: true,
        }),
      ).toBeDisabled();
      await page
        .getByRole("combobox", { name: "Review outcome", exact: true })
        .selectOption("REJECT");
      await page
        .getByRole("button", {
          name: "Record configuration review",
          exact: true,
        })
        .click();
      expect(s.writes[0].body.decision).toBe("REJECT");
    }
  });
  test("configuration history reaches baseline zero and empty proposals give a clear next action", async ({
    page,
  }) => {
    const s = await setup(page, "paging");
    const history = page.getByRole("group", {
      name: "Applied configuration history",
      exact: true,
    });
    await history
      .getByRole("button", { name: "Load more records", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Restore version 0", exact: true }),
    ).toBeVisible();
    expect(
      s.reads.some(
        (u) =>
          u.pathname.endsWith("/history") &&
          u.searchParams.get("cursor") === "1",
      ),
    ).toBe(true);
    await page.unroute("**/api/v1/**");
    await setup(page, "empty");
    await expect(
      page.getByText("No configuration proposals in this view.", {
        exact: true,
      }),
    ).toBeVisible();
  });
  test("Hindi configuration forms fit phones with accessible keyboard controls and before/after review", async ({
    page,
  }) => {
    await setup(page);
    await page
      .getByRole("button", { name: "Propose fee change", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Switch English and Hindi", exact: true })
      .click();
    await checkHindi(page);
    for (const width of [320, 360, 390, 430]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const action = page.getByRole("button", {
        name: hindiMessages["Review configuration proposal"],
        exact: true,
      });
      expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    const input = page.getByRole("spinbutton", {
      name: hindiMessages["Platform fee rate (%)"],
      exact: true,
    });
    await input.focus();
    await expect(input).toBeFocused();
    const a = await new AxeBuilder({ page })
      .include(".commercial-workspace")
      .analyze();
    expect(
      a.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact || ""),
      ),
    ).toEqual([]);
    await page
      .locator(".staff-editor")
      .screenshot({ path: "test-results/commercial-hindi-mobile.png" });
  });
}
