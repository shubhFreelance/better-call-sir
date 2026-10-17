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
