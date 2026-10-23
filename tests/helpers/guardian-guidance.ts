import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { translateText } from "../../apps/web/app/locale";
export function guardianGuidanceTests() {
  for (const hi of [false, true])
    test(`student guardian handoff preserves identity and explains each actor in ${hi ? "Hindi mobile" : "English desktop"}`, async ({
      page,
    }) => {
      const requests: { path: string; method: string }[] = [];
      await page.setViewportSize(
        hi ? { width: 360, height: 850 } : { width: 1440, height: 1050 },
      );
      await page
        .context()
        .grantPermissions(["clipboard-read", "clipboard-write"]);
      if (hi)
        await page.addInitScript(() =>
          localStorage.setItem("bcs.interface-language", "hi"),
        );
      await page.route("**/api/v1/**", async (route) => {
        const path = new URL(route.request().url()).pathname,
          method = route.request().method();
        requests.push({ path, method });
        if (path.endsWith("/auth/session"))
          return route.fulfill({
            json: {
              account: {
                id: "10000000-0000-4000-8000-000000000989",
                name: "Synthetic pending student",
                role: "GUARDIAN",
                verified: false,
              },
              csrfToken: "synthetic-csrf",
            },
          });
        if (path.endsWith("/independent-student/signup"))
          return route.fulfill({ json: { status: "READY", profile: null } });
        if (path.endsWith("/guardian-verification-invitations"))
          return route.fulfill({ json: { items: [], nextCursor: null } });
        return route.fulfill({
          status: 404,
          json: { code: "NOT_FOUND", message: "Unexpected synthetic route" },
        });
      });
      await page.goto("/onboarding/independent-student");
      const t = (s: string) => translateText(hi, s);
      await page
        .getByRole("radio", {
          name: hi ? /मुझे अभिभावक/ : /I need a guardian to guide me/,
        })
        .check();
      const handoff = page.locator(".guardian-handoff");
      await expect(handoff).toBeVisible();
      await expect(handoff.locator("li")).toHaveCount(3);
      await expect(handoff).toContainText(
        t(
          "Your signup is paused here. Choosing guardian help has not changed your account or given anyone access.",
        ),
      );
      await handoff
        .getByRole("button", {
          name: t("Copy guardian signup link"),
          exact: true,
        })
        .click();
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      expect(new URL(copied).pathname).toBe("/signup/guardian");
      expect(new URL(copied).search).toBe("");
      await expect(handoff.getByRole("status")).toContainText(
        t(
          "Link copied. Share it with your guardian. No message has been sent by the platform.",
        ),
      );
      await page.evaluate(() =>
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText: async () => {
              throw new Error("Synthetic clipboard denial");
            },
          },
        }),
      );
      await handoff
        .getByRole("button", {
          name: t("Copy guardian signup link"),
          exact: true,
        })
        .click();
      await expect(
        handoff.getByLabel(t("Registration link for your guardian")),
      ).toBeFocused();
      await expect(handoff.getByRole("status")).toContainText(
        t("Copy the selected link and share it with your guardian."),
      );
      const a = await new AxeBuilder({ page })
        .include(".guardian-handoff")
        .analyze();
      expect(
        a.violations.filter((v) =>
          ["serious", "critical"].includes(v.impact || ""),
        ),
      ).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await handoff.screenshot({
        path: `test-results/guardian-handoff-${hi ? "hi-mobile" : "en-desktop"}.png`,
      });
      await handoff
        .getByRole("button", {
          name: t("Review independent signup (18+)"),
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("button", {
          name: hi ? "पढ़ाई की जानकारी भरें" : "Continue to education",
          exact: true,
        }),
      ).toBeDisabled();
      await expect(page.locator(".independent-form > h2")).toBeFocused();
      await page
        .getByRole("radio", {
          name: hi ? "मेरी उम्र 18 वर्ष से कम है" : "I am under 18",
          exact: true,
        })
        .check();
      await expect(page.locator(".guardian-handoff")).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: t("Review independent signup (18+)"),
          exact: true,
        }),
      ).toHaveCount(0);
      await page
        .getByRole("link", {
          name: t("Check my guardian relationship request"),
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("heading", {
          name: t("Confirm your guardian"),
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByText(
          t("No guardian relationship requests are waiting for you."),
          { exact: false },
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: t("Start guardian verification"),
          exact: true,
        }),
      ).toHaveCount(0);
      expect(requests.every((r) => r.method === "GET")).toBe(true);
      expect(
        requests.some((r) => r.path.endsWith("/guardian-verifications")),
      ).toBe(false);
    });
}
