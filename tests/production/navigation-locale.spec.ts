import { test, expect } from "@playwright/test";

test("shared Hindi mobile navigation hydrates, persists and stays keyboard accessible under production CSP", async ({
  page,
}) => {
  const errors: string[] = [],
    unexpected: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        status: 401,
        json: { code: "UNAUTHENTICATED", message: "Sign in." },
      });
    if (path.endsWith("/teachers"))
      return route.fulfill({ json: { items: [] } });
    unexpected.push(path);
    return route.fulfill({
      status: 403,
      json: { code: "FORBIDDEN", message: "Unexpected private request" },
    });
  });
  await page.addInitScript(() =>
    localStorage.setItem("bcs.interface-language", "hi"),
  );
  await page.setViewportSize({ width: 320, height: 800 });
  const response = await page.goto("/support");
  expect(response!.headers()["content-security-policy"]).not.toContain(
    "unsafe-eval",
  );
  await expect(page.locator(".dev-strip")).toContainText(
    "कोई लाइव भुगतान या कॉल नहीं",
  );
  const toggle = page.getByRole("button", {
    name: "नेविगेशन खोलें या बंद करें",
  });
  await toggle.click();
  const nav = page.getByRole("navigation", { name: "मुख्य नेविगेशन" });
  await expect(
    nav.getByRole("button", { name: "अंग्रेज़ी और हिन्दी बदलें" }),
  ).toBeVisible();
  await nav.getByRole("link", { name: "शिक्षक खोजें", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(toggle).toBeFocused();
  await expect(nav).toBeHidden();
  const skip = page.getByRole("link", {
    name: "मुख्य सामग्री पर जाएँ",
    exact: true,
  });
  await skip.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
  await page
    .locator("footer")
    .getByRole("link", { name: "शिक्षक खोजें", exact: true })
    .click();
  await expect(page).toHaveURL(/\/teachers$/);
  await expect(page.locator("footer")).toContainText(
    "लाइव सेवाएँ चालू नहीं हैं।",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(
    page.getByRole("button", { name: "अंग्रेज़ी और हिन्दी बदलें" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  expect(unexpected).toEqual([]);
});
