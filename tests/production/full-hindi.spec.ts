import { test, expect } from "@playwright/test";

test("Hindi first paint, metadata, controls and recovery use the persisted cookie under production CSP", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await context.addCookies([
    {
      name: "bcs.interface-language",
      value: "hi",
      url: "http://localhost:3001",
      sameSite: "Lax",
    },
  ]);
  const response = await page.goto("/teachers");
  const source = await response!.text();
  expect(response!.headers()["content-security-policy"]).not.toContain(
    "unsafe-eval",
  );
  expect(source).toContain('<html lang="hi"');
  expect(source).toContain("अच्छी पढ़ाई सही मेल से शुरू होती है।");
  await expect(page).toHaveTitle("Better Call Sir · अपने अनुरूप शिक्षक खोजें");
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  await expect(
    page.getByRole("textbox", { name: "शिक्षक खोजें", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("शिक्षा का स्तर", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "अंग्रेज़ी और हिन्दी बदलें" }).click();
  const cookies = await context.cookies();
  expect(
    cookies.find((cookie) => cookie.name === "bcs.interface-language")?.value,
  ).toBe("en");
  const english = await page.request.get("/teachers");
  expect(await english.text()).toContain('<html lang="en"');
  await page.getByRole("button", { name: "Switch English and Hindi" }).click();
  const missing = await page.request.get("/.env");
  expect(missing.status()).toBe(404);
  expect((await missing.json()).code).toBe("NOT_FOUND");
  const recovery = await page.request.get("/page-unavailable");
  expect(await recovery.text()).toContain("यह पृष्ठ अभी उपलब्ध नहीं है।");
  expect(errors).toEqual([]);
});

for (const editing of [false, true]) {
  test(`Hindi learner ${editing ? "edit" : "create"} fields remain translated on mobile under production CSP`, async ({
    page,
    context,
  }) => {
    const id = "20000000-0000-4000-8000-000000000941",
      writes: string[] = [],
      errors: string[] = [];
    const learner = {
      id,
      alias: "Synthetic learner",
      education: {
        stage: "SCHOOL",
        grade: 8,
        board: "CBSE",
        institutionName: "Synthetic school",
        subjects: ["Maths"],
      },
      version: 1,
      editStatus: "EDITABLE",
      enquiryEligible: true,
    };
    page.on("pageerror", (error) => errors.push(error.message));
    await context.addCookies([
      {
        name: "bcs.interface-language",
        value: "hi",
        url: "http://localhost:3001",
      },
    ]);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.route("**/api/v1/**", async (route) => {
      const request = route.request(),
        path = new URL(request.url()).pathname;
      if (request.method() !== "GET") {
        writes.push(path);
        return route.fulfill({
          status: 403,
          json: {
            code: "FORBIDDEN",
            message: "No writes expected during field review.",
          },
        });
      }
      if (path.endsWith("/auth/session"))
        return route.fulfill({
          json: {
            account: {
              id: "10000000-0000-4000-8000-000000000941",
              role: "GUARDIAN",
              verified: true,
              name: "Synthetic guardian",
            },
            csrfToken: "synthetic-csrf",
          },
        });
      if (path.endsWith("/learner-profiles/" + id))
        return route.fulfill({ json: learner });
      if (path.endsWith("/learner-profiles"))
        return route.fulfill({
          json: {
            creationStatus: "READY",
            items: editing ? [learner] : [],
            nextCursor: null,
          },
        });
      return route.fulfill({
        status: 404,
        json: { code: "NOT_FOUND", message: "Synthetic route unavailable." },
      });
    });
    const response = await page.goto(
      "/dashboard/learners" + (editing ? "" : "?new=1"),
    );
    expect(response!.headers()["content-security-policy"]).not.toContain(
      "unsafe-eval",
    );
    if (editing)
      await page
        .getByRole("button", {
          name: /इनकी प्रोफ़ाइल बदलें.*Synthetic learner/,
        })
        .click();
    for (const label of [
      "विद्यार्थी का नाम या उपनाम",
      "कक्षा",
      "स्कूल बोर्ड",
      "स्कूल / संस्थान का नाम",
      "पढ़ने वाले विषय",
    ])
      await expect(page.getByLabel(label, { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
  });
}
