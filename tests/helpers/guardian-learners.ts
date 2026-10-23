import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { dashboard } from "./dashboard-redesign";
import { chooseHindi, checkHindi } from "./hindi";
import { translateText } from "../../apps/web/app/locale";
export function guardianLearnerChecks() {
  for (const hindi of [false, true])
    test(`guardian sees two verified learners and separate scoped invitations ${hindi ? "Hindi phone" : "English desktop"}`, async ({
      page,
    }) => {
      await dashboard(page, "GUARDIAN");
      if (hindi) {
        await chooseHindi(page);
        await page.setViewportSize({ width: 360, height: 850 });
      }
      const t = (s: string) => translateText(hindi, s);
      await page.route("**/api/v1/guardian-verifications?*", (route) =>
        route.fulfill({
          json: {
            items: [
              {
                id: "proof1",
                learnerName: "Anshuman",
                status: "APPROVED",
                managementMode: "GUARDIAN_ONLY",
              },
              {
                id: "proof2",
                learnerName: "Riya",
                status: "APPROVED",
                managementMode: "SHARED",
              },
            ],
            nextCursor: null,
          },
        }),
      );
      await page.route("**/api/v1/student-guardian-grants?*", (route) =>
        route.fulfill({
          json: {
            items: [
              {
                id: "invite1",
                studentName: "Ram",
                studentAccountId: "ram-id",
                status: "PENDING",
                supportMode: "MANAGE",
              },
              {
                id: "invite2",
                studentName: "Meera",
                studentAccountId: "meera-id",
                status: "ACTIVE",
                supportMode: "ADVICE",
              },
            ],
            nextCursor: new URL(route.request().url()).searchParams.has(
              "cursor",
            )
              ? null
              : "next",
          },
        }),
      );
      await page.route(
        "**/api/v1/delegated-students/meera-id/profile",
        (route) =>
          route.fulfill({
            json: {
              version: 1,
              supportMode: "ADVICE",
              editStatus: "EDITABLE",
              education: {
                stage: "COLLEGE",
                institutionName: "Synthetic college",
                subjects: ["Maths"],
                courseName: "BSc",
                university: "Synthetic university",
                studyYear: 1,
              },
            },
          }),
      );
      await page.goto("/dashboard");
      const hub = page.locator(".guardian-learners"),
        own = hub.locator(".guardian-learner-group").first(),
        invited = hub.locator(".guardian-learner-group").last();
      await expect(
        own.getByRole("heading", { name: "Anshuman", exact: true }),
      ).toBeVisible();
      await expect(
        own.getByRole("heading", { name: "Riya", exact: true }),
      ).toBeVisible();
      await expect(
        own.getByText(t("Relationship verified"), { exact: true }),
      ).toHaveCount(2);
      const ram = invited.locator("li").filter({
          has: page.getByRole("heading", { name: "Ram", exact: true }),
        }),
        meera = invited.locator("li").filter({
          has: page.getByRole("heading", { name: "Meera", exact: true }),
        });
      await expect(
        ram.getByRole("link", { name: t("Review invitation"), exact: true }),
      ).toHaveAttribute("href", "/dashboard/supported-students");
      await expect(
        ram.getByRole("link", {
          name: t("Manage shared learning"),
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(
        meera.getByRole("link", {
          name: t("View shared learning"),
          exact: true,
        }),
      ).toHaveAttribute(
        "href",
        "/dashboard/supported-students?student=meera-id",
      );
      await expect(
        invited.getByText(t("Relationship verified"), { exact: true }),
      ).toHaveCount(0);
      await invited
        .getByRole("button", { name: t("Load more records"), exact: true })
        .click();
      await expect(invited.locator("li")).toHaveCount(2);
      await expect(
        invited.getByRole("button", {
          name: t("Load more records"),
          exact: true,
        }),
      ).toHaveCount(0);
      await meera
        .getByRole("link", { name: t("View shared learning"), exact: true })
        .focus();
      await expect(
        meera.getByRole("link", {
          name: t("View shared learning"),
          exact: true,
        }),
      ).toBeFocused();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (hindi) await checkHindi(page);
      const axe = await new AxeBuilder({ page })
        .include(".guardian-learners")
        .analyze();
      expect(
        axe.violations.filter((v) =>
          ["serious", "critical"].includes(v.impact || ""),
        ),
      ).toEqual([]);
      await hub.screenshot({
        path: `test-results/guardian-learners-${hindi ? "hi-phone" : "en-desktop"}.png`,
      });
      await meera
        .getByRole("link", { name: t("View shared learning"), exact: true })
        .click();
      await expect(page.locator(".supported-student-context")).toContainText(
        "Meera",
      );
      await expect(
        page.getByRole("button", {
          name: t("Edit shared education"),
          exact: true,
        }),
      ).toHaveCount(0);
    });
  test("pending guardian can distinguish adult invitations, closed access and failed private refresh", async ({
    page,
  }) => {
    await dashboard(page, "GUARDIAN");
    let failed = false,
      removed = false;
    await page.route("**/api/v1/guardian-verifications?*", (route) =>
      route.fulfill({
        json: {
          items: [
            {
              id: "pending-proof",
              learnerName: "Anshuman",
              status: "PENDING",
              managementMode: "GUARDIAN_ONLY",
            },
          ],
          nextCursor: null,
        },
      }),
    );
    await page.route("**/api/v1/student-guardian-grants?*", (route) =>
      route.fulfill(
        failed
          ? {
              status: 403,
              json: { code: "FORBIDDEN", message: "Access paused" },
            }
          : {
              json: {
                items: [
                  {
                    id: "active",
                    studentName: "Ram",
                    studentAccountId: "ram-id",
                    status: removed ? "REVOKED" : "ACTIVE",
                    supportMode: "MANAGE",
                  },
                ],
                nextCursor: null,
              },
            },
      ),
    );
    await page.goto("/dashboard");
    const hub = page.locator(".guardian-learners"),
      own = hub.locator(".guardian-learner-group").first(),
      invited = hub.locator(".guardian-learner-group").last();
    await expect(
      own.getByText("Staff review pending", { exact: true }),
    ).toBeVisible();
    await expect(
      invited.getByRole("link", {
        name: "Manage shared learning",
        exact: true,
      }),
    ).toHaveAttribute("href", "/dashboard/supported-students?student=ram-id");
    failed = true;
    await invited
      .getByRole("button", { name: "Reload history", exact: true })
      .click();
    await expect(
      invited.getByRole("link", {
        name: "Manage shared learning",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      invited.getByRole("heading", { name: "Ram", exact: true }),
    ).toHaveCount(0);
    await expect(
      own.getByRole("heading", { name: "Anshuman", exact: true }),
    ).toBeVisible();
    failed = false;
    removed = true;
    await invited
      .getByRole("button", { name: "Retry history", exact: true })
      .click();
    await expect(
      invited.getByText("Invitation access removed", { exact: true }),
    ).toBeVisible();
    await expect(
      invited.getByRole("link", {
        name: "Manage shared learning",
        exact: true,
      }),
    ).toHaveCount(0);
  });
  test("teacher dashboard does not request guardian learner or invitation records", async ({
    page,
  }) => {
    const f = await dashboard(page, "TEACHER");
    await page.goto("/dashboard");
    await expect(page.locator(".hiring-overview")).toBeVisible();
    await expect(page.locator(".guardian-learners")).toHaveCount(0);
    expect(
      f.reads.some(
        (p) =>
          p.includes("guardian-verifications") ||
          p.includes("student-guardian-grants"),
      ),
    ).toBe(false);
  });
}
