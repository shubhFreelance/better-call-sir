import { test, expect } from "@playwright/test";
import { operationValidator, validator } from "../helpers/contract";

test("Hindi support request and reply preserve API contracts under production CSP", async ({
  page,
}) => {
  const account = "10000000-0000-4000-8000-000000000983",
    id = "20000000-0000-4000-8000-000000000983",
    errors: string[] = [],
    writes: unknown[] = [];
  let item: any = null,
    updates: any[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: account,
            name: "Synthetic support owner",
            role: "INDEPENDENT_STUDENT",
            verified: false,
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (req.method() === "GET" && path.endsWith("/cases"))
      return route.fulfill({
        json: { items: item ? [item] : [], nextCursor: null },
      });
    if (req.method() === "GET" && path.endsWith("/cases/" + id))
      return route.fulfill({
        json: { ...item, updates, updatesNextCursor: null },
      });
    if (
      req.method() === "POST" &&
      (path.endsWith("/cases") || path.endsWith("/updates"))
    ) {
      const body = req.postDataJSON();
      writes.push(body);
      expect(req.headers()["x-csrf-token"]).toBe("synthetic-csrf");
      expect(req.headers()["idempotency-key"]).toBeTruthy();
      if (path.endsWith("/cases")) {
        expect(body).toEqual({
          category: "SAFETY",
          description: "निजी सहायता चाहिए।",
        });
        item = {
          ...body,
          id,
          accountId: account,
          region: "Raipur",
          assignedToId: null,
          placementId: null,
          reservationId: null,
          resolution: null,
          status: "OPEN",
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        expect(operationValidator("/cases", "post", "201")(item)).toBe(true);
      } else {
        expect(body).toEqual({
          expectedVersion: 1,
          message: "अतिरिक्त जानकारी।",
          internal: false,
        });
        expect(validator("CaseReplyInput")(body)).toBe(true);
        item = { ...item, version: 2 };
        updates = [
          {
            id,
            message: body.message,
            author: "YOU",
            internal: false,
            createdAt: new Date().toISOString(),
          },
        ];
      }
      return route.fulfill({ status: 201, json: item });
    }
    return route.fulfill({
      status: 403,
      json: { code: "FORBIDDEN", message: "Unexpected private request" },
    });
  });
  await page.setViewportSize({ width: 360, height: 800 });
  const response = await page.goto("/support");
  expect(response!.headers()["content-security-policy"]).not.toContain(
    "unsafe-eval",
  );
  await page.getByLabel("Language / भाषा", { exact: true }).selectOption("hi");
  await page
    .getByRole("button", { name: "नया मामला बनाएँ", exact: true })
    .click();
  await page.getByLabel("आपको किस विषय में मदद चाहिए?").selectOption("SAFETY");
  await page.getByLabel("बताएँ कि क्या हुआ").fill("निजी सहायता चाहिए।");
  await page
    .getByRole("button", { name: "अनुरोध जाँचें", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /मैंने अनुरोध/ }).check();
  await page
    .getByRole("button", { name: "सहायता अनुरोध भेजें", exact: true })
    .click();
  await expect(page.locator(".support-original")).toContainText(
    "निजी सहायता चाहिए।",
  );
  await page
    .getByLabel("जवाब लिखें", { exact: true })
    .fill("अतिरिक्त जानकारी।");
  await page.getByRole("button", { name: "जवाब जाँचें", exact: true }).click();
  await page.getByRole("checkbox", { name: /मैंने जवाब/ }).check();
  await page.getByRole("button", { name: "जवाब भेजें", exact: true }).click();
  await expect(page.locator(".support-updates")).toContainText(
    "अतिरिक्त जानकारी।",
  );
  expect(writes).toHaveLength(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
