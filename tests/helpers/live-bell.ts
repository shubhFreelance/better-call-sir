import { test, expect } from "@playwright/test";
import { dashboard } from "./dashboard-redesign";
import { chooseHindi } from "../helpers/hindi";
for (const hindi of [false, true])
  test(`live notification bell is compact, owned and keyboard accessible (${hindi})`, async ({
    page,
  }) => {
    await dashboard(page, "TEACHER");
 await page.route("**/api/v1/direct-enquiries**",route=>route.fulfill({json:{items:[],counts:{},nextCursor:null}}));
 await page.route("**/api/v1/student-opportunities**",route=>route.fulfill({json:{items:[],nextCursor:null}}));
    if (hindi) await chooseHindi(page);
    await page.setViewportSize(
      hindi ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    let unread = 2;
    await page.route("**/api/v1/live**", (route) => route.abort());
    await page.route("**/api/v1/inbox**", (route) => {
      if (route.request().method() === "POST") {
        unread = 1;
        return route.fulfill({ status: 201, json: { read: true } });
      }
      return route.fulfill({
        json: {
          items: [
            {
              id: "20000000-0000-4000-8000-000000000661",
              topic: "request.created",
              important: true,
              readAt: unread === 1 ? new Date().toISOString() : null,
              createdAt: new Date().toISOString(),
              actionPath: "/dashboard/enquiries",
            },
          ],
          tasks: [],
          unread,
          nextCursor: null,
        },
      });
    });
    await page.goto("/dashboard");
    const bell = page.locator(".live-bell-trigger");
    await expect(bell.locator(".live-bell-badge")).toHaveText("2");
    await bell.click();
    const panel = page.locator(".live-bell-panel");
    await expect(panel).toBeVisible();
    const close = panel.locator('.live-bell-close');
    await expect(close).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
    await expect(close).toHaveCSS('border-top-color','rgba(0, 0, 0, 0)');
    await close.hover();
    await expect(close).toHaveCSS('border-radius','50%');
    await expect(close).toHaveCSS('border-top-color','rgb(240, 215, 255)');
    const mark = panel.locator('.live-bell-item > button');
    await expect(mark).toHaveCSS('border-top-color','rgba(0, 0, 0, 0)');
    await mark.hover();
    await expect(mark).toHaveCSS('border-radius','50%');
    await expect(mark).toHaveCSS('border-top-color','rgb(240, 215, 255)');
    await expect(panel.locator('.live-bell-item > button')).toHaveCSS('height','44px');
    await expect(panel.locator('.live-bell-symbol')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
    expect((await panel.boundingBox())!.width).toBeLessThanOrEqual(390);
    await panel
      .getByRole("button", {
        name: hindi ? "पढ़ा हुआ चिह्नित करें" : "Mark as read",
      })
      .click();
    await expect(bell.locator(".live-bell-badge")).toHaveText("1");
    await page.keyboard.press("Escape");
    await expect(panel).not.toBeVisible();
    await expect(bell).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await bell.click();
    await page.screenshot({
      path: `test-results/live-bell-${hindi ? "hindi-phone" : "desktop"}.png`,
      fullPage: true,
    });
  });

test("unfinished student setup stays prominent without claiming everything is complete", async ({
  page,
}) => {
  await dashboard(page, "GUARDIAN");
  await page.route("**/api/v1/live**", (route) => route.abort());
  await page.route("**/api/v1/inbox**", (route) =>
    route.fulfill({
      json: {
        items: [],
        unread: 0,
        nextCursor: null,
        tasks: [
          {
            id: "20000000-0000-4000-8000-000000000661",
            title: "Complete student setup",
            actionPath:
              "/guardian-verification?verification=20000000-0000-4000-8000-000000000661",
          },
        ],
      },
    }),
  );
  await page.goto("/dashboard");
  await page.locator(".live-bell-trigger").click();
  const panel = page.locator(".live-bell-panel");
  await expect(panel).toContainText("Complete student setup");
  await expect(
    panel.getByText("You’re all caught up.", { exact: true }),
  ).toHaveCount(0);
  await expect(panel.locator(".is-important")).toHaveCount(1);
  await page.locator("h1").first().click();
  await expect(panel).not.toBeVisible();
});
