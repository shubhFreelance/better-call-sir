import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function mock(page: Page, signedIn = false, failLogout = false) {
  const writes: { path: string; csrf?: string }[] = [],
    reads: string[] = [];
  let active = signedIn;
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        status: active ? 200 : 401,
        json: active
          ? {
              account: {
                id: "10000000-0000-4000-8000-000000000984",
                name: "Synthetic navigation owner",
                role: "INDEPENDENT_STUDENT",
                verified: false,
              },
              csrfToken: "synthetic-csrf",
            }
          : { code: "UNAUTHENTICATED", message: "Sign in." },
      });
    if (req.method() !== "GET") {
      writes.push({ path, csrf: req.headers()["x-csrf-token"] });
      if (path.endsWith("/auth/logout")) {
        if (failLogout)
          return route.fulfill({
            status: 503,
            json: { code: "UNAVAILABLE", message: "Service unavailable." },
          });
        active = false;
        return route.fulfill({ json: { ok: true } });
      }
    }
    reads.push(path);
    if (path.endsWith("/teachers"))
      return route.fulfill({ json: { items: [] } });
    if (path.endsWith("/cases"))
      return route.fulfill({ json: { items: [], nextCursor: null } });
    return route.fulfill({
      status: 403,
      json: { code: "FORBIDDEN", message: "Unexpected private request" },
    });
  });
  return { writes, reads };
}

test("shared Hindi navigation, notices and footer persist across routes and reload", async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto("/support");
  await page.getByRole("button", { name: "Switch English and Hindi" }).click();
  await expect(page.locator(".dev-strip")).toHaveAttribute("lang", "hi");
  await expect(page.locator(".dev-strip")).toContainText(
    "कोई लाइव भुगतान या कॉल नहीं",
  );
  await expect(
    page.getByRole("navigation", { name: "मुख्य नेविगेशन" }),
  ).toBeVisible();
  await expect(page.locator("header .logo")).toHaveAccessibleName(
    "Better Call Sir मुख्य पृष्ठ",
  );
  const footer = page.locator("footer");
  await expect(footer).toHaveAttribute("lang", "hi");
  await expect(footer).toContainText(
    "यह विकास संस्करण है। लाइव सेवाएँ चालू नहीं हैं।",
  );
  await expect(footer).toContainText("शुरुआती शिक्षा, स्कूल और कॉलेज");
  await expect(footer).toHaveCSS("font-family", /Noto Sans Devanagari/);
  await expect(
    footer.getByRole("link", { name: "अपनी ज़रूरत बताएँ" }),
  ).toHaveAttribute("href", "/onboarding/parent");
  await page.screenshot({ path: "test-results/navigation-hindi-desktop.png" });
  await footer.screenshot({ path: "test-results/footer-hindi-desktop.png" });
  await footer.getByRole("link", { name: "शिक्षक खोजें", exact: true }).click();
  await expect(page).toHaveURL(/\/teachers$/);
  await expect(page.locator(".dev-strip")).toHaveAttribute("lang", "hi");
  await page.reload();
  await expect(page.locator("footer")).toHaveAttribute("lang", "hi");
  await page.getByRole("button", { name: "अंग्रेज़ी और हिन्दी बदलें" }).click();
  await expect(page.locator("footer")).toHaveAttribute("lang", "en");
  await expect(page.locator(".dev-strip")).toContainText(
    "No live payments or calls",
  );
  expect(state.writes).toEqual([]);
});

test("mobile menu exposes Hindi, follows the wrapping banner and restores keyboard focus", async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto("/support");
  for (const width of [320, 360, 430, 768]) {
    await page.setViewportSize({ width, height: 900 });
    const toggle = page.locator(".mobile-menu"),
      nav = page.locator("#site-navigation");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(toggle).toHaveAttribute("aria-controls", "site-navigation");
    await nav
      .getByRole("button", {
        name: /Switch English and Hindi|अंग्रेज़ी और हिन्दी बदलें/,
      })
      .click();
    if ((await page.locator("header").getAttribute("lang")) === "en") {
      await nav
        .getByRole("button", { name: "Switch English and Hindi" })
        .click();
    }
    await expect(nav).toHaveAccessibleName("मुख्य नेविगेशन");
    await expect(toggle).toHaveAccessibleName("नेविगेशन खोलें या बंद करें");
    const headerBox = (await page.locator("header").boundingBox())!,
      navBox = (await nav.boundingBox())!;
    expect(Math.abs(navBox.y - headerBox.y - headerBox.height)).toBeLessThan(2);
    for (const link of await nav.getByRole("link").all())
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 360) {
      const axe = await new AxeBuilder({ page }).analyze();
      expect(
        axe.violations.filter((v) =>
          ["serious", "critical"].includes(v.impact || ""),
        ),
      ).toEqual([]);
      await page.screenshot({ path: "test-results/navigation-hindi-mobile.png" });
    }
    await nav.getByRole("link", { name: "शिक्षक खोजें", exact: true }).focus();
    await page.keyboard.press("Escape");
    await expect(toggle).toBeFocused();
    await expect(nav).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  }
  await page.setViewportSize({ width: 360, height: 800 });
  await page.locator(".mobile-menu").click();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "हमें आपके लिए खोजने दें", exact: true })
    .click();
  await expect(page).toHaveURL(/\/teachers\?tab=assisted$/);
  await expect(page.locator("#site-navigation")).toBeHidden();
  await page
    .locator("footer")
    .screenshot({ path: "test-results/footer-hindi-mobile.png" });
  expect(state.writes).toEqual([]);
});

test("mobile Hindi sign-out uses the existing CSRF endpoint and removes account controls", async ({
  page,
}) => {
  const state = await mock(page, true);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/support");
  await page.locator(".mobile-menu").click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Switch English and Hindi" })
    .click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "साइन आउट", exact: true })
    .click();
  await expect(page).toHaveURL("/");
  await expect(page.locator("#site-navigation")).toBeHidden();
  await expect(page.getByRole("link", { name: /साइन इन/ })).toBeVisible();
  expect(state.writes).toEqual([
    { path: "/api/v1/auth/logout", csrf: "synthetic-csrf" },
  ]);
  await page.reload();
  await expect(page.getByRole("link", { name: /साइन इन/ })).toBeVisible();
});

test("unconfirmed Hindi sign-out keeps account access and explains recovery", async ({
  page,
}) => {
  const state = await mock(page, true, true);
  await page.goto("/support");
  await page.getByRole("button", { name: "Switch English and Hindi" }).click();
  const dialog = page.waitForEvent("dialog");
  const click = page
    .getByRole("button", { name: "साइन आउट", exact: true })
    .click();
  const notice = await dialog;
  expect(notice.message()).toBe(
    "साइन आउट की पुष्टि नहीं हुई। अपना खाता जाँचकर फिर कोशिश करें।",
  );
  await notice.accept();
  await click;
  await expect(page).toHaveURL(/\/support$/);
  await expect(page.getByRole("link", { name: /मेरा डैशबोर्ड/ })).toBeVisible();
  expect(state.writes).toHaveLength(1);
});
