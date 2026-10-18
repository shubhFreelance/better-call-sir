import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { privacyText } from "../../apps/web/app/privacy-copy";
import { hindiMessages } from "../../apps/web/app/hindi-messages";
import { operationValidator } from "./contract";

const owner = "10000000-0000-4000-8000-000000000801";
const entry = (n: number) => ({
  id: `90000000-0000-4000-8000-00000000080${n}`,
  accountId: owner,
  kind: "CORRECTION",
  scope: "ACCOUNT",
  resourceId: owner,
  reason: `Synthetic private request ${n}`,
  correction: "Synthetic name",
  status: "COMPLETED",
  resolution: "Synthetic reviewed outcome",
  policyVersion: "synthetic-policy",
  version: 2,
  createdAt: "2026-10-18T00:00:00.000Z",
  updatedAt: "2026-10-18T00:00:00.000Z",
});
async function setup(page: Page, pending = false) {
  let empty = false;
  let failure = 0,
    saved = false,
    failAfterSave = false;
  const reads: URL[] = [],
    writes: unknown[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (url.pathname.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: owner,
            name: "Synthetic owner",
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
          consent: { withdrawnAt: null },
          window: {
            start: "2026-10-18T00:00:00Z",
            end: "2026-10-19T00:00:00Z",
            timezone: "Asia/Kolkata",
            metricVersion: "synthetic",
          },
        },
      });
    if (url.pathname.endsWith("/privacy-requests")) {
      if (req.method() === "POST") {
        writes.push(req.postDataJSON());
        saved = true;
        if (failAfterSave) failure = 503;
        return route.fulfill({
          status: 201,
          json: {
            ...entry(3),
            ...req.postDataJSON(),
            status: "PENDING",
            version: 1,
          },
        });
      }
      reads.push(url);
      if (failure)
        return route.fulfill({
          status: failure,
          json: {
            code: "UNAVAILABLE",
            message: "Synthetic private backend detail",
          },
        });
      const data = {
        items:
          empty && url.searchParams.has("cursor")
            ? []
            : saved && !url.searchParams.has("cursor")
              ? [{ ...entry(3), status: "PENDING" }, entry(1)]
              : [entry(url.searchParams.has("cursor") ? 2 : 1)],
        nextCursor: url.searchParams.has("cursor") ? null : entry(1).id,
        pendingTargets: pending
          ? [
              { kind: "DELETION", scope: "ACCOUNT", resourceId: owner },
              { kind: "CORRECTION", scope: "ACCOUNT", resourceId: owner },
            ]
          : [],
      };
      const validate = operationValidator("/privacy-requests", "get", "200");
      expect(validate(data), JSON.stringify(validate.errors)).toBe(true);
      return route.fulfill({ json: data });
    }
    return route.fulfill({
      status: 403,
      json: { code: "FORBIDDEN", message: "Unexpected read" },
    });
  });
  await page.goto("/dashboard/privacy");
  await expect(page.locator(".privacy-record")).toHaveCount(1);
  return {
    reads,
    writes,
    emptyPage() {
      empty = true;
    },
    fail(n: number) {
      failure = n;
    },
    failAfterSave() {
      failAfterSave = true;
    },
  };
}
export function privacyHistoryChecks() {
  test("privacy pages preserve global pending guidance, duplicates and keyboard focus", async ({
    page,
  }) => {
    const s = await setup(page, true);
    await page.getByRole("button", { name: "Next page", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Your request history", exact: true }),
    ).toBeFocused();
    await expect(page.locator(".privacy-record")).toContainText(
      "Synthetic private request 2",
    );
    await expect(
      page.getByText(
        /Family processing is paused or guardian consent is withdrawn/,
      ),
    ).toBeVisible();
    expect(s.reads.at(-1)!.searchParams.get("cursor")).toBe(entry(1).id);
    await page
      .getByRole("button", { name: "Create privacy request", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Previous page", exact: true }),
    ).toBeDisabled();
    await page
      .getByLabel("Reason for request")
      .fill("Synthetic correction request");
    await page
      .getByLabel("Proposed display name or learner alias")
      .fill("Synthetic corrected name");
    await page
      .getByRole("button", { name: "Review privacy request", exact: true })
      .click();
    await expect(
      page.getByText(
        "A matching request is already awaiting review. Follow its status below.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(s.writes).toHaveLength(0);
  });
  test("privacy page errors hide cached records and recover from an unavailable cursor", async ({
    page,
  }) => {
    const s = await setup(page);
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await expect(page.locator(".privacy-record")).toContainText(
      "Synthetic private request 2",
    );
    s.fail(403);
    await page
      .getByRole("button", { name: "Previous page", exact: true })
      .click();
    await expect(
      page.getByText("Privacy history could not be loaded.", { exact: false }),
    ).toBeVisible();
    await expect(page.locator(".privacy-record")).toHaveCount(0);
    await expect(
      page.getByText("Synthetic private backend detail"),
    ).toHaveCount(0);
    s.fail(0);
    await page
      .getByRole("button", { name: "Retry privacy history", exact: true })
      .click();
    await expect(page.locator(".privacy-record")).toContainText(
      "Synthetic private request 1",
    );
    s.fail(404);
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Return to first page", exact: true }),
    ).toBeVisible();
    s.fail(0);
    await page
      .getByRole("button", { name: "Return to first page", exact: true })
      .click();
    await expect(page.locator(".privacy-record")).toContainText(
      "Synthetic private request 1",
    );
    s.emptyPage();
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await expect(
      page.getByText(
        "No requests on this page. Return to the first page for recent requests.",
        { exact: true },
      ),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Return to first page", exact: true })
      .click();
    await expect(page.locator(".privacy-record")).toContainText(
      "Synthetic private request 1",
    );
  });
  test("privacy save from an older page recovers the newest history without resubmitting", async ({
    page,
  }) => {
    const s = await setup(page);
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await expect(page.locator(".privacy-record")).toContainText(
      "Synthetic private request 2",
    );
    await page
      .getByRole("button", { name: "Create privacy request", exact: true })
      .click();
    await page
      .getByLabel("Reason for request")
      .fill("Synthetic correction request");
    await page
      .getByLabel("Proposed display name or learner alias")
      .fill("Synthetic corrected name");
    await page
      .getByRole("button", { name: "Review privacy request", exact: true })
      .click();
    await page.getByRole("checkbox", { name: /I reviewed the record/ }).check();
    s.failAfterSave();
    await page
      .getByRole("button", { name: "Send privacy request", exact: true })
      .click();
    await expect(
      page.getByText(/Your decision was saved, but current details/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create privacy request", exact: true }),
    ).toBeDisabled();
    s.fail(0);
    await page
      .getByRole("button", { name: "Refresh privacy records", exact: true })
      .click();
    await expect(page.locator(".privacy-record").first()).toContainText(
      "Synthetic private request 3",
    );
    expect(s.reads.at(-1)!.searchParams.has("cursor")).toBe(false);
    expect(s.writes).toHaveLength(1);
  });
  test("Hindi privacy history fits phones and has accessible keyboard pagination", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await setup(page);
    await page
      .getByLabel("Language / भाषा", { exact: true })
      .selectOption("hi");
    await page
      .getByRole("button", { name: hindiMessages["Next page"], exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", {
        name: privacyText(true, "Your request history"),
        exact: true,
      }),
    ).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (await new AxeBuilder({ page }).include(".privacy-workspace").analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: "test-results/privacy-history-hindi-mobile.png",
      fullPage: true,
    });
  });
}
