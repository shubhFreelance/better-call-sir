import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { operationValidator } from "./contract";
import { hindiMessages } from "../../apps/web/app/hindi-messages";
const owner = "10000000-0000-4000-8000-000000000711",
  teacher = "30000000-0000-4000-8000-000000000711",
  request = "40000000-0000-4000-8000-000000000711";
function row(n: number) {
  const id = "90000000-0000-4000-8000-" + String(n).padStart(12, "0"),
    reservationId = "80000000-0000-4000-8000-" + String(n).padStart(12, "0");
  return {
    id,
    requestId: request,
    teacherId: teacher,
    guardianId: owner,
    reservationId,
    status: "PROPOSED",
    guardianAccepted: false,
    teacherAccepted: false,
    guardianOutcome: null,
    teacherOutcome: null,
    supportCaseId: null,
    version: 1,
    createdAt: new Date().toISOString(),
    reservation: {
      id: reservationId,
      teacherId: teacher,
      guardianId: owner,
      childId: null,
      kind: "DEMO",
      startsAt: new Date(Date.now() + 86400000 * 2).toISOString(),
      endsAt: new Date(Date.now() + 86400000 * 2 + 1800000).toISOString(),
      status: "HOLD",
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      version: 1,
      topic: "",
      scopeAccepted: false,
      amountPaise: 0,
      createdAt: new Date().toISOString(),
      subject: "Maths",
      language: "English",
      pricePolicyVersion: "synthetic-demo",
      payablePaise: 0,
    },
  };
}
async function setup(page: Page, mode = "normal") {
  let failure = 0,
    saved = false;
  const writes: { body: unknown; key: string }[] = [],
    reads: URL[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (url.pathname.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: owner,
            name: "Synthetic guardian",
            role: "GUARDIAN",
            verified: true,
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (url.pathname.endsWith("/dashboard"))
      return route.fulfill({
        json: {
          role: "GUARDIAN",
          metrics: {},
          children: [],
          placements: [],
          reservations: [],
          teachers: [],
          consent: { withdrawnAt: null },
          window: {
            start: new Date().toISOString(),
            end: new Date().toISOString(),
            timezone: "Asia/Kolkata",
            metricVersion: "synthetic",
          },
        },
      });
    if (url.pathname.endsWith("/teachers"))
      return route.fulfill({ json: { items: [] } });
    if (url.pathname.endsWith("/demos")) {
      reads.push(url);
      if (failure)
        return route.fulfill({
          status: failure,
          json: {
            code: "FORBIDDEN",
            message: "Synthetic private backend detail",
          },
        });
      const data = {
        items: [
          {
            ...row(url.searchParams.has("cursor") ? 2 : 1),
            guardianAccepted: saved,
            version: saved ? 2 : 1,
          },
        ],
        nextCursor: url.searchParams.has("cursor") ? null : row(1).id,
      };
      const v = operationValidator("/demos", "get", "200");
      expect(v(data), JSON.stringify(v.errors)).toBe(true);
      return route.fulfill({ json: data });
    }
    if (req.method() === "POST" && url.pathname.includes("/demos/")) {
      writes.push({
        body: req.postDataJSON(),
        key: req.headers()["idempotency-key"],
      });
      expect(writes.at(-1)!.key).toBeTruthy();
      saved = true;
      if (mode === "unknown" && writes.length === 1)
        return route.abort("failed");
      if (mode === "failed-refresh") failure = 503;
      return route.fulfill({
        status: 201,
        json: { ...row(1), guardianAccepted: true, version: 2 },
      });
    }
    return route.fulfill({
      status: 403,
      json: { code: "FORBIDDEN", message: "Unexpected read" },
    });
  });
  await page.goto("/dashboard/bookings");
  await expect(page.locator(".demo-card")).toHaveCount(1);
  return {
    writes,
    reads,
    fail(n: number) {
      failure = n;
    },
  };
}
export function demoHistoryChecks() {
  test("optional demo history loads older records, protects draft edits and offers a deliberate discard", async ({
    page,
  }) => {
    await setup(page);
    const history = page.getByRole("group", {
      name: "Optional demo history",
      exact: true,
    });
    await page
      .getByLabel("Cancellation reason", { exact: true })
      .fill("Unsent synthetic reason");
    await expect(
      history.getByRole("button", { name: "Reload history", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Discard demo edits", exact: true })
      .click();
    await expect(
      page.getByLabel("Cancellation reason", { exact: true }),
    ).toHaveValue("");
    await history
      .getByRole("button", { name: "Load more records", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".demo-card")).toHaveCount(2);
    await expect(history).toBeFocused();
  });
  test("an uncertain demo decision freezes fields and retries the exact original payload and key", async ({
    page,
  }) => {
    const s = await setup(page, "unknown");
    await page
      .getByRole("button", { name: "Accept demo time", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Retry same decision", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Cancellation reason", { exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Reload history", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Retry same decision", exact: true })
      .click();
    await expect(page.locator(".demo-card")).toContainText(/Family accepted/);
    expect(s.writes).toHaveLength(2);
    expect(s.writes[1]).toEqual(s.writes[0]);
  });
  test("a confirmed demo decision survives failed history refresh and hides cached private details until recovery", async ({
    page,
  }) => {
    const s = await setup(page, "failed-refresh");
    await page
      .getByRole("button", { name: "Accept demo time", exact: true })
      .click();
    await expect(
      page.getByText(/Your decision was saved, but current details/),
    ).toBeVisible();
    await expect(
      page.getByLabel("Cancellation reason", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Synthetic private backend detail", { exact: true }),
    ).toHaveCount(0);
    s.fail(0);
    await page
      .getByRole("button", { name: "Refresh current demo", exact: true })
      .click();
    await expect(page.locator(".demo-card")).toContainText(/Family accepted/);
    expect(s.writes).toHaveLength(1);
  });
  test("Hindi legacy demo controls retain mobile tap targets and keyboard access at 320–430px", async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      { name: "bcs.interface-language", value: "hi", url: baseURL! },
    ]);
    await page.addInitScript(() =>
      localStorage.setItem("bcs.interface-language", "hi"),
    );
    await setup(page);
    for (const width of [320, 360, 390, 430]) {
      await page.setViewportSize({ width, height: 850 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    const accept = page.getByRole("button", {
      name: hindiMessages["Accept demo time"],
      exact: true,
    });
    expect((await accept.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(
      (
        await new AxeBuilder({ page }).include(".demo-card").analyze()
      ).violations.filter((v) =>
        ["serious", "critical"].includes(v.impact || ""),
      ),
    ).toEqual([]);
    await page
      .locator(".demo-card")
      .screenshot({ path: "test-results/demo-hindi-mobile.png" });
  });
}

export { row as demoFixtureRow };
