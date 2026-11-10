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
        own = hub.locator(".guardian-relationships"),
        invited = hub.locator(".guardian-support-invitations");
      await expect(hub.locator(".guardian-family-panel")).toHaveCSS(
        "background-color",
        "rgb(3, 79, 70)",
      );
      await expect(own).toHaveCSS("background-color", "rgb(255, 255, 235)");
      await expect(invited.locator("summary")).toHaveCSS(
        "background-color",
        "rgb(240, 215, 255)",
      );
      await expect(invited).toHaveAttribute("open", "");
      await expect(invited.locator("summary")).toContainText(
        translateText(hindi, "{0} invitations", ["2+"]),
      );
      await expect(invited.locator("summary")).toContainText(
        translateText(hindi, "{0} awaiting reply", [1]),
      );
      await expect(
        invited.getByRole("heading", { name: "Ram", exact: true }),
      ).toBeVisible();
      await invited.locator("summary").focus();
      await invited.locator("summary").press("Enter");
      await expect(invited).not.toHaveAttribute("open", "");
      await invited.locator("summary").press("Enter");
      await expect(invited).toHaveAttribute("open", "");
      await expect(
        own.locator(".guardian-relationship-list > li").first(),
      ).toHaveCSS("background-color", "rgb(255, 255, 255)");
      await expect(
        own.getByRole("link", {
          name: translateText(hindi, "View relationship for {0}", ["Anshuman"]),
          exact: true,
        }),
      ).toHaveAttribute("href", "/guardian-verification?request=proof1");
      await expect(
        own.getByRole("link", { name: t("Verify learner"), exact: true }),
      ).toHaveAttribute("href", "/guardian-verification?new=1");
      await expect(
        own.getByText(t("Verification choice"), { exact: true }),
      ).toHaveCount(0);
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
      await expect(invited.locator(".guardian-support-list")).toHaveCSS(
        "background-color",
        "rgb(255, 255, 255)",
      );
      await expect(
        ram.getByRole("link", {
          name: translateText(hindi, "Review invitation from {0}", ["Ram"]),
          exact: true,
        }),
      ).toHaveAttribute("href", "/dashboard/supported-students");
      await expect(
        ram.getByRole("link", {
          name: translateText(hindi, "Manage shared learning for {0}", ["Ram"]),
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(
        meera.getByRole("link", {
          name: translateText(hindi, "View shared learning for {0}", ["Meera"]),
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
        .getByRole("link", {
          name: translateText(hindi, "View shared learning for {0}", ["Meera"]),
          exact: true,
        })
        .focus();
      await expect(
        meera.getByRole("link", {
          name: translateText(hindi, "View shared learning for {0}", ["Meera"]),
          exact: true,
        }),
      ).toBeFocused();
      await expect(invited).toHaveCSS("border-color", "rgb(218, 183, 236)");
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
        .getByRole("link", {
          name: translateText(hindi, "View shared learning for {0}", ["Meera"]),
          exact: true,
        })
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
      own = hub.locator(".guardian-relationships"),
      invited = hub.locator(".guardian-support-invitations");
    await expect(
      own.getByText("Staff review pending", { exact: true }),
    ).toBeVisible();
    await expect(
      invited.getByRole("link", {
        name: "Manage shared learning for Ram",
        exact: true,
      }),
    ).toHaveAttribute("href", "/dashboard/supported-students?student=ram-id");
    failed = true;
    await invited
      .getByRole("button", { name: "Reload history", exact: true })
      .click();
    await expect(
      invited.getByRole("link", {
        name: "Manage shared learning for Ram",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      invited.getByRole("heading", { name: "Ram", exact: true }),
    ).toHaveCount(0);
    await expect(invited.locator("summary")).toContainText(
      "Invitations unavailable",
    );
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
        name: "Manage shared learning for Ram",
        exact: true,
      }),
    ).toHaveCount(0);
  });
  for (const hindi of [false, true])
    test(`empty invitations stay compact through loading and a new invitation ${hindi ? "Hindi phone" : "English desktop"}`, async ({
      page,
    }) => {
      await dashboard(page, "GUARDIAN");
      if (hindi) await chooseHindi(page);
      await page.setViewportSize({ width: hindi ? 320 : 1440, height: 1000 });
      const t = (s: string) => translateText(hindi, s);
      let release!: () => void;
      const loaded = new Promise<void>((resolve) => (release = resolve));
      let items: any[] = [],
        calls = 0;
      await page.route("**/api/v1/guardian-verifications?*", (route) =>
        route.fulfill({
          json: {
            items: [
              {
                id: "sumi",
                learnerName: "Sumi",
                status: "APPROVED",
                managementMode: "SHARED",
              },
              {
                id: "ami",
                learnerName: "Ami",
                status: "APPROVED",
                managementMode: "GUARDIAN_ONLY",
              },
              {
                id: "kamla",
                learnerName: "Kamla",
                status: "APPROVED",
                managementMode: "STUDENT_LED",
              },
            ],
            nextCursor: null,
          },
        }),
      );
      await page.route("**/api/v1/student-guardian-grants?*", async (route) => {
        calls++;
        await loaded;
        await route.fulfill({ json: { items, nextCursor: null } });
      });
      await page.goto("/dashboard");
      const hub = page.locator(".guardian-learners"),
        invited = hub.locator(".guardian-support-invitations"),
        summary = invited.locator("summary"),
        own = hub.locator(".guardian-relationships");
      await expect(summary).toContainText(t("Loading invitations…"));
      await expect(summary).not.toContainText(t("No invitations"));
      release();
      await expect(summary).toContainText(t("No invitations"));
      await expect(invited).toHaveJSProperty("open", true);
      await expect(own.locator(".guardian-relationship-list > li")).toHaveCount(
        3,
      );
      await expect(own.locator(".guardian-relationships-footer")).toHaveCSS(
        "background-color",
        "rgba(0, 0, 0, 0)",
      );
      await expect(own.locator(".history-controls > p")).toBeHidden();
      const panel = await hub.locator(".guardian-family-panel").boundingBox(),
        box = await invited.boundingBox(),
        main = await own.boundingBox();
      expect(box!.height).toBeLessThan(400);
      if (hindi) {
        expect(main!.width).toBeGreaterThan(panel!.width * 0.9);
        expect(box!.y).toBeGreaterThan(main!.y);
      } else {
        expect(box!.x).toBeGreaterThan(main!.x + main!.width);
        expect(Math.abs(box!.y - main!.y)).toBeLessThan(2);
        const learners = own.locator(".guardian-relationship-list > li");
        const first = await learners.nth(0).boundingBox(),
          second = await learners.nth(1).boundingBox();
        expect(second!.x).toBeGreaterThan(first!.x);
        expect(Math.abs(second!.y - first!.y)).toBeLessThan(2);
      }
      await expect(
        own.locator(".guardian-relationship-list h3").first(),
      ).toHaveCSS("font-size", hindi ? "16px" : "18px");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        (await new AxeBuilder({ page }).include(".guardian-learners").analyze())
          .violations,
      ).toEqual([]);
      await hub.screenshot({
        path: `test-results/guardian-minimal-empty-${hindi ? "hi" : "en"}.png`,
        style: "nextjs-portal{display:none!important}",
      });
      await expect(invited).toHaveJSProperty("open", true);
      await expect(
        invited.getByText(translateText(hindi, "Showing {0} records.", [0]), {
          exact: true,
        }),
      ).toBeHidden();
      await expect(
        invited.getByRole("link", {
          name: t("Manage invitations & shared access"),
          exact: true,
        }),
      ).toHaveAttribute("href", "/dashboard/supported-students");
      items = [
        {
          id: "new-invitation",
          studentName: "Independent learner",
          studentAccountId: "adult-id",
          status: "PENDING",
          supportMode: "ADVICE",
        },
      ];
      const beforeRefresh = calls;
      await invited
        .getByRole("button", { name: t("Reload history"), exact: true })
        .click();
      await expect(
        invited.getByRole("heading", {
          name: "Independent learner",
          exact: true,
        }),
      ).toBeVisible();
      await expect(summary).toContainText(
        translateText(hindi, "{0} invitations", ["1"]),
      );
      await expect(summary).toContainText(
        translateText(hindi, "{0} awaiting reply", [1]),
      );
      expect(calls).toBe(beforeRefresh + 1);
      await expect(
        invited.getByRole("group", {
          name: t("Student invitation history"),
          exact: true,
        }),
      ).toBeFocused();
      await expect(
        invited.getByRole("link", {
          name: translateText(hindi, "Review invitation from {0}", [
            "Independent learner",
          ]),
          exact: true,
        }),
      ).toHaveAttribute("href", "/dashboard/supported-students");
      await summary.focus();
      await summary.press("Enter");
      await expect(invited).toHaveJSProperty("open", false);
      await expect(
        invited.getByRole("heading", {
          name: "Independent learner",
          exact: true,
        }),
      ).toBeHidden();
      if (hindi) await checkHindi(page);
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
