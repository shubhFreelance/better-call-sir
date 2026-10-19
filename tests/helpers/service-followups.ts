import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { validator } from "./contract";
import { chooseHindi, checkHindi } from "./hindi";
const id = "20000000-0000-4000-8000-000000000971",
  actor = "10000000-0000-4000-8000-000000000971",
  caseId = "30000000-0000-4000-8000-000000000971";
async function fixture(
  page: Page,
  opts: {
    unassigned?: boolean;
    lost?: boolean;
    readFailure?: boolean;
    history?: boolean;
    queueFailure?: boolean;
    changedAnchor?: boolean;
    role?: string;
    empty?: boolean;
  } = {},
) {
  const now = new Date().toISOString(),
    writes: any[] = [],
    receipts = new Map();
  let contactDenied = false,
    contactReads = 0,
    denied = false,
    aborted = false,
    serviceReads = 0;
  const row: any = {
    id,
    kind: "PLACEMENT",
    region: "Raipur",
    learnerName: "Synthetic Learner",
    teacherName: "Synthetic Teacher",
    subject: "Maths",
    arrangementStatus: "ACTIVE",
    startedAt: new Date(Date.now() - 31 * 86400000).toISOString(),
    dueAt: new Date(Date.now() - 86400000).toISOString(),
    status: "OPEN",
    version: opts.unassigned ? 0 : 1,
    assignedToId: opts.unassigned ? null : actor,
    nextContactAt: null,
    supportCaseId: null,
    recordedObservation: { continued: null, observedAt: now },
  };
  const checked = (name: string, value: any) => {
    const check = validator(name);
    expect(check(value), JSON.stringify(check.errors)).toBe(true);
    return value;
  };
  const contacts: any[] = [];
  if (opts.history)
    contacts.push({
      id: "40000000-0000-4000-8000-000000000971",
      followupId: id,
      actorId: actor,
      outcome: "NO_RESPONSE",
      method: "EMAIL",
      nextContactAt: new Date(Date.now() + 86400000).toISOString(),
      supportCaseId: null,
      createdAt: now,
    });
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      u = new URL(req.url()),
      path = u.pathname.replace("/api/v1", "");
    if (path === "/auth/session")
      return route.fulfill({
        json: {
          account: {
            id: actor,
            name: "Synthetic Service Staff",
            role: opts.role || "ADMIN",
            verified: true,
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (path === "/auth/mfa")
      return route.fulfill({
        json: {
          enabled: true,
          verifiedUntil: new Date(Date.now() + 600000).toISOString(),
          recoveryCodesRemaining: 8,
        },
      });
    if (!path.startsWith("/admin/service-followups"))
      return route.fulfill({
        json: { items: [], metrics: {}, placements: [], requests: [] },
      });
    if (req.method() === "GET") {
      serviceReads++;
      if (path.endsWith("/contact-details")) {
        contactReads++;
        return contactDenied
          ? route.fulfill({
              status: 403,
              json: {
                code: "CLAIM_REQUIRED",
                message:
                  "Only the assigned staff member can reveal contact details.",
              },
            })
          : route.fulfill({
              json: { email: "synthetic-owner@example.test", phone: null },
            });
      }
      if (path === "/admin/service-followups") {
        if (
          (opts.queueFailure || (opts.changedAnchor && writes.length)) &&
          u.searchParams.has("cursor")
        )
          return route.fulfill({
            status: 404,
            json: {
              code: "NOT_FOUND",
              message: "Follow-up history boundary is unavailable.",
            },
          });
        const status = u.searchParams.get("status"),
          items =
            opts.empty ||
            (status && status !== row.status) ||
            (!status && row.status === "COMPLETED")
              ? []
              : [
                  {
                    ...row,
                    ...(u.searchParams.has("cursor")
                      ? { id: "20000000-0000-4000-8000-000000000972" }
                      : {}),
                  },
                ];
        return route.fulfill({
          json: checked("ServiceFollowupPage", {
            items,
            nextCursor:
              opts.history && !u.searchParams.has("cursor")
                ? "PLACEMENT:" + id
                : null,
            asOf: now,
          }),
        });
      }
      if (denied)
        return route.fulfill({
          status: 404,
          json: {
            code: "NOT_FOUND",
            message: "Service follow-up not found or outreach is paused.",
          },
        });
      return route.fulfill({
        json: checked("ServiceFollowupDetail", {
          followup: row,
          contacts: u.searchParams.has("cursor") ? [] : contacts,
          nextCursor:
            opts.history && !u.searchParams.has("cursor")
              ? contacts[0].id
              : null,
        }),
      });
    }
    const key = req.headers()["idempotency-key"],
      body = req.postDataJSON();
    expect(key).toBeTruthy();
    expect(req.headers()["x-csrf-token"]).toBe("synthetic-csrf");
    writes.push({ key, body, path });
    let result = receipts.get(key);
    if (!result) {
      expect(body.expectedVersion).toBe(row.version);
      expect(body.confirmed).toBe(true);
      row.version++;
      if (path.endsWith("/assignments"))
        row.assignedToId = body.action === "CLAIM" ? actor : null;
      else {
        row.status = body.outcome === "NO_RESPONSE" ? "SCHEDULED" : "COMPLETED";
        row.nextContactAt = body.nextContactAt || null;
        row.supportCaseId = body.outcome === "HELP_REQUESTED" ? caseId : null;
        contacts.unshift({
          id: crypto.randomUUID(),
          followupId: id,
          actorId: actor,
          outcome: body.outcome,
          method: body.method,
          nextContactAt: row.nextContactAt,
          supportCaseId: row.supportCaseId,
          createdAt: now,
        });
      }
      result = checked("ServiceFollowupResult", {
        id,
        status: row.status,
        version: row.version,
        supportCaseId: row.supportCaseId,
      });
      receipts.set(key, result);
      if (opts.readFailure) denied = true;
      if (opts.lost && !aborted) {
        aborted = true;
        return route.abort("failed");
      }
    }
    return route.fulfill({ status: 201, json: result });
  });
  return {
    row,
    contactReads: () => contactReads,
    denyContacts: () => {
      contactDenied = true;
    },
    writes,
    restore: () => {
      denied = false;
    },
    reads: () => serviceReads,
  };
}
async function open(page: Page) {
  await page.goto("/dashboard/service-followups");
  await page
    .getByRole("button", { name: "Open follow-up", exact: true })
    .click();
}
async function confirm(page: Page) {
  await page
    .getByLabel(
      "I reviewed the assignment or actual contact attempt and its effects.",
      { exact: true },
    )
    .check();
  await page
    .getByRole("button", { name: "Confirm follow-up decision", exact: true })
    .click();
}
const saved =
  "Follow-up decision recorded. No call or email was sent by this screen.";
export function serviceFollowupTests() {
  test("staff sees the due arrangement and unknown cohort evidence without inventing continuation", async ({
    page,
  }) => {
    await fixture(page);
    await open(page);
    await expect(
      page.getByRole("heading", {
        name: "Synthetic Learner with Synthetic Teacher",
        level: 2,
      }),
    ).toBeFocused();
    await expect(
      page.getByText("The recorded cohort outcome is unknown.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Record contact attempt",
        exact: true,
      }),
    ).toBeVisible();
  });
  test("claiming is separately reviewed before opening the contact worksheet", async ({
    page,
  }) => {
    const f = await fixture(page, { unassigned: true });
    await open(page);
    await expect(
      page.getByRole("heading", {
        name: "Record contact attempt",
        exact: true,
      }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Claim this follow-up", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Review follow-up decision",
        exact: true,
      }),
    ).toBeFocused();
    await confirm(page);
    await expect(page.getByText(saved, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Record contact attempt",
        exact: true,
      }),
    ).toBeVisible();
    expect(f.writes[0].body.action).toBe("CLAIM");
  });
  test("help handoff remains acknowledged after completion removes the row from the pending queue", async ({
    page,
  }) => {
    const f = await fixture(page);
    await open(page);
    await page
      .getByRole("combobox", { name: "Contact outcome", exact: true })
      .selectOption("HELP_REQUESTED");
    await page
      .getByRole("combobox", { name: "Support category", exact: true })
      .selectOption("SAFETY");
    await page
      .getByRole("button", { name: "Review contact record", exact: true })
      .click();
    await confirm(page);
    await expect(page.getByText(saved, { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        "No follow-ups match this view. Try another status or include scheduled work.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open linked support case", exact: true }),
    ).toHaveAttribute("href", "/dashboard/support?case=" + caseId);
    expect(f.writes).toHaveLength(1);
    expect(f.writes[0].body.supportCategory).toBe("SAFETY");
  });
  test("a lost contact response locks navigation and replays exactly one reviewed request", async ({
    page,
  }) => {
    const f = await fixture(page, { lost: true });
    await open(page);
    await page
      .getByRole("button", { name: "Review contact record", exact: true })
      .click();
    await confirm(page);
    await expect(
      page.getByRole("button", {
        name: "Close follow-up details",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByRole("combobox", { name: "Follow-up status", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Retry same decision", exact: true })
      .click();
    await expect(page.getByText(saved, { exact: true })).toBeVisible();
    expect(f.writes[1]).toEqual(f.writes[0]);
  });
  test("saved contact hides private details on denied reads and reloads without repeating a write", async ({
    page,
  }) => {
    const f = await fixture(page, { readFailure: true });
    await open(page);
    await page
      .getByRole("button", { name: "Review contact record", exact: true })
      .click();
    await confirm(page);
    await expect(
      page.getByText(
        "Follow-up details are unavailable. Private records are hidden until access is restored.",
        { exact: false },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Synthetic Learner with Synthetic Teacher",
        level: 2,
      }),
    ).toHaveCount(0);
    f.restore();
    await page
      .getByRole("button", { name: "Reload follow-up details", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Synthetic Learner with Synthetic Teacher",
        level: 2,
      }),
    ).toBeVisible();
    expect(f.writes).toHaveLength(1);
  });
  test("no response validates future scheduling and reviews an exact IST timestamp", async ({
    page,
  }) => {
    const f = await fixture(page);
    await open(page);
    await page
      .getByRole("combobox", { name: "Contact outcome", exact: true })
      .selectOption("NO_RESPONSE");
    await page
      .getByLabel("Next contact attempt", { exact: true })
      .fill("2000-01-01T10:00");
    await page
      .getByRole("button", { name: "Review contact record", exact: true })
      .click();
    await expect(
      page.getByText("Schedule the next attempt within the next thirty days.", {
        exact: true,
      }),
    ).toBeVisible();
    const day = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    await page
      .getByLabel("Next contact attempt", { exact: true })
      .fill(day + "T10:00");
    await page
      .getByRole("button", { name: "Review contact record", exact: true })
      .click();
    await confirm(page);
    await expect(page.getByText(saved, { exact: true })).toBeVisible();
    expect(f.writes[0].body.nextContactAt).toBe(day + "T04:30:00.000Z");
    expect(f.row.status).toBe("SCHEDULED");
  });
  test("queue and contact cursors reach later pages and restore focus on return", async ({
    page,
  }) => {
    await fixture(page, { history: true });
    await page.goto("/dashboard/service-followups");
    await page
      .getByRole("button", { name: "Next follow-ups", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Follow-up queue", exact: true }),
    ).toBeFocused();
    await page
      .getByRole("button", { name: "Previous follow-ups", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Open follow-up", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Next contacts", exact: true })
      .click();
    await expect(
      page.getByText("No staff contact attempts are recorded yet.", {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Previous contacts", exact: true })
      .click();
    await expect(
      page.getByText("No response", { exact: true }).last(),
    ).toBeVisible();
  });
  test("removed queue anchors hide stale records and offer explicit first-page recovery", async ({
    page,
  }) => {
    await fixture(page, { history: true, queueFailure: true });
    await page.goto("/dashboard/service-followups");
    await page
      .getByRole("button", { name: "Next follow-ups", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Open follow-up", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Return to first page", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Open follow-up", exact: true }),
    ).toBeVisible();
  });
  test("empty service queues have a useful next action", async ({ page }) => {
    await fixture(page, { empty: true });
    await page.goto("/dashboard/service-followups");
    await expect(
      page.getByText(
        "No follow-ups match this view. Try another status or include scheduled work.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Next follow-ups", exact: true }),
    ).toBeDisabled();
  });
  test("finance accounts cannot query or act on service follow-ups", async ({
    page,
  }) => {
    const f = await fixture(page, { role: "FINANCE" });
    await page.goto("/dashboard/service-followups");
    await expect(
      page.getByText("Service follow-ups require authorized staff access.", {
        exact: true,
      }),
    ).toBeVisible();
    expect(f.reads()).toBe(0);
  });
  for (const width of [320, 390, 430])
    test(`Hindi service contact review fits ${width}px phones`, async ({
      page,
    }) => {
      await chooseHindi(page);
      await page.setViewportSize({ width, height: 850 });
      await fixture(page);
      await page.goto("/dashboard/service-followups");
      await page
        .getByRole("button", { name: "संपर्क का विवरण खोलें", exact: true })
        .click();
      await checkHindi(page, "सेवा के बाद संपर्क");
      if (width === 390) {
        await page
          .getByRole("button", {
            name: "खाताधारक का संपर्क विवरण देखें",
            exact: true,
          })
          .click();
        await expect(
          page.getByText("synthetic-owner@example.test", { exact: true }),
        ).toBeVisible();
        await checkHindi(page);
        await page
          .getByRole("button", {
            name: "खाताधारक का संपर्क विवरण छिपाएँ",
            exact: true,
          })
          .click();
      }

      await page
        .getByRole("combobox", { name: "संपर्क का नतीजा", exact: true })
        .selectOption("HELP_REQUESTED");
      await page
        .getByRole("button", {
          name: "संपर्क रिकॉर्ड की समीक्षा करें",
          exact: true,
        })
        .click();
      await checkHindi(page);
      const results = await new AxeBuilder({ page })
        .disableRules(["color-contrast"])
        .analyze();
      expect(
        results.violations.filter((v) =>
          ["critical", "serious"].includes(v.impact || ""),
        ),
      ).toEqual([]);
      if (width === 390)
        await page.screenshot({
          path: "test-results/service-followup-hindi-mobile.png",
          fullPage: true,
          style: "nextjs-portal{display:none!important}",
        });
    });
  test("owner contacts are revealed deliberately, hidden on close and freshly denied without cached addresses", async ({
    page,
  }) => {
    const f = await fixture(page);
    await open(page);
    expect(f.contactReads()).toBe(0);
    await page
      .getByRole("button", {
        name: "Reveal owner contact details",
        exact: true,
      })
      .click();
    await expect(
      page.getByText("synthetic-owner@example.test", { exact: true }),
    ).toBeVisible();
    const firstReads = f.contactReads();
    expect(firstReads).toBeGreaterThan(0);
    await page
      .getByRole("button", { name: "Hide owner contact details", exact: true })
      .click();
    await expect(
      page.getByText("synthetic-owner@example.test", { exact: true }),
    ).toHaveCount(0);
    f.denyContacts();
    await page
      .getByRole("button", {
        name: "Reveal owner contact details",
        exact: true,
      })
      .click();
    await expect(
      page.getByText(
        "Only the assigned staff member can reveal contact details.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByText("synthetic-owner@example.test", { exact: true }),
    ).toHaveCount(0);
    expect(f.contactReads()).toBeGreaterThan(firstReads);
  });
  test("reviewing a decision immediately clears revealed owner contacts", async ({
    page,
  }) => {
    const f = await fixture(page);
    await open(page);
    await page
      .getByRole("button", {
        name: "Reveal owner contact details",
        exact: true,
      })
      .click();
    await expect(
      page.getByText("synthetic-owner@example.test", { exact: true }),
    ).toBeVisible();
    const firstReads = f.contactReads();
    await page
      .getByRole("button", { name: "Review contact record", exact: true })
      .click();
    await expect(
      page.getByText("synthetic-owner@example.test", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Cancel review", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Reveal owner contact details",
        exact: true,
      }),
    ).toBeVisible();
    expect(f.contactReads()).toBe(firstReads);
  });
  test("saved later-page contact returns to a fresh first queue page without locking its receipt", async ({
    page,
  }) => {
    const f = await fixture(page, { history: true, changedAnchor: true });
    await page.goto("/dashboard/service-followups");
    await page
      .getByRole("button", { name: "Next follow-ups", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Open follow-up", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Review contact record", exact: true })
      .click();
    await confirm(page);
    await expect(page.getByText(saved, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Done", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page
      .getByRole("button", { name: "Close follow-up details", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Follow-up queue", exact: true }),
    ).toBeFocused();
    await expect(
      page.getByText(
        "No follow-ups match this view. Try another status or include scheduled work.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(f.writes).toHaveLength(1);
  });
  test("English service worksheet has accessible labels and keyboard focus", async ({
    page,
  }) => {
    await fixture(page);
    await open(page);
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((v) =>
        ["critical", "serious"].includes(v.impact || ""),
      ),
    ).toEqual([]);
    await page
      .getByRole("button", { name: "Review contact record", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Review follow-up decision",
        exact: true,
      }),
    ).toBeFocused();
    await page
      .getByRole("button", { name: "Cancel review", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Synthetic Learner with Synthetic Teacher",
        level: 2,
      }),
    ).toBeFocused();
    await page.screenshot({
      path: "test-results/service-followup-english-desktop.png",
      fullPage: true,
      style: "nextjs-portal{display:none!important}",
    });
  });
}
