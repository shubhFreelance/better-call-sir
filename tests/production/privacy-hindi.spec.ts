import { test, expect } from "@playwright/test";
import { operationValidator } from "../helpers/contract";
test("Hindi privacy review preserves canonical account requests under strict production CSP", async ({
  page,
}) => {
  const account = "10000000-0000-4000-8000-000000000982",
    id = "40000000-0000-4000-8000-000000000982",
    errors: string[] = [],
    writes: unknown[] = [];
  let record: any = null;
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: account,
            name: "Synthetic privacy owner",
            role: "INDEPENDENT_STUDENT",
            verified: false,
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (path.endsWith("/privacy-requests")) {
      if (req.method() === "GET")
        return route.fulfill({ json: { items: record ? [record] : [] } });
      const body = req.postDataJSON();
      writes.push(body);
      expect(req.headers()["x-csrf-token"]).toBe("synthetic-csrf");
      expect(req.headers()["idempotency-key"]).toBeTruthy();
      expect(body).toEqual({
        kind: "CORRECTION",
        scope: "ACCOUNT",
        resourceId: account,
        reason: "नाम की वर्तनी सुधारें।",
        correction: "सही नाम",
      });
      record = {
        ...body,
        id,
        accountId: account,
        status: "PENDING",
        resolution: null,
        policyVersion: null,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      expect(
        operationValidator("/privacy-requests", "post", "201")(record),
      ).toBe(true);
      return route.fulfill({ status: 201, json: record });
    }
    return route.fulfill({
      status: 403,
      json: { code: "FORBIDDEN", message: "Unexpected private read" },
    });
  });
  await page.setViewportSize({ width: 360, height: 800 });
  const response = await page.goto("/dashboard/privacy");
  expect(response!.headers()["content-security-policy"]).not.toContain(
    "unsafe-eval",
  );
  await page.getByLabel("Language / भाषा", { exact: true }).selectOption("hi");
  await page
    .getByRole("button", { name: "गोपनीयता अनुरोध बनाएँ", exact: true })
    .click();
  await page
    .getByLabel("अनुरोध का कारण", { exact: true })
    .fill("नाम की वर्तनी सुधारें।");
  await page
    .getByLabel("प्रस्तावित दिखने वाला नाम या विद्यार्थी का उपनाम", {
      exact: true,
    })
    .fill("सही नाम");
  await page
    .getByRole("button", {
      name: "गोपनीयता अनुरोध की समीक्षा करें",
      exact: true,
    })
    .click();
  await page
    .getByRole("checkbox", {
      name: "मैंने रिकॉर्ड, चाहा गया बदलाव",
      exact: false,
    })
    .check();
  await page
    .getByRole("button", { name: "गोपनीयता अनुरोध भेजें", exact: true })
    .click();
  await expect(page.locator(".privacy-record")).toContainText(
    "समीक्षा का इंतज़ार",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(writes).toHaveLength(1);
  expect(errors).toEqual([]);
});
