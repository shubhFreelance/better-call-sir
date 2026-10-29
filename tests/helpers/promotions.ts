import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { dashboard } from "./dashboard-redesign";
import { translateText } from "../../apps/web/app/locale";
const id = "80000000-0000-4000-8000-000000000701";
const plans = [
  { id: "SEARCH", amountPaise: 29900, days: 7, enabled: true, version: 1 },
  { id: "HOME", amountPaise: 59900, days: 7, enabled: true, version: 1 },
  { id: "SPACE", amountPaise: 99900, days: 7, enabled: true, version: 1 },
];
async function setup(page: Page, role = "TEACHER", pending = false) {
  await dashboard(page, role);
  const posts: { body: any; key: string | undefined }[] = [];
  let campaigns: any[] = pending
    ? [
        {
          id,
          teacherId: id,
          teacherName: "Synthetic Ananya",
          teacherSlug: "ananya-sharma",
          placement: "SEARCH",
          amountPaise: 29900,
          days: 7,
          planVersion: 1,
          status: "PENDING",
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          startsAt: null,
          endsAt: null,
          paymentReference: null,
          reviewNote: null,
          reviewerId: null,
        },
      ]
    : [];
  await page.route("**/api/v1/promotion-plans", (r) =>
    r.fulfill({
      json: {
        items: plans,
        currency: "INR",
        paymentMode: "MANUAL_REVIEW",
        chargesEnabled: false,
      },
    }),
  );
  await page.route("**/api/v1/promotions**", async (r) => {
    const request = r.request();
    if (request.method() === "POST") {
      const body = request.postDataJSON();
      posts.push({ body, key: request.headers()["idempotency-key"] });
      expect(request.headers()["x-csrf-token"]).toBe("synthetic-csrf");
      if (new URL(request.url()).pathname.endsWith("/decision")) {
        campaigns = campaigns.map((c) => ({
          ...c,
          status: "ACTIVE",
          version: 2,
          endsAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        }));
        return r.fulfill({ json: campaigns[0] });
      }
      campaigns = [
        {
          id,
          teacherId: id,
          placement: body.placement,
          status: "PENDING",
          version: 1,
          amountPaise: 29900,
          days: 7,
          createdAt: new Date().toISOString(),
        },
      ];
      return r.fulfill({ json: campaigns[0] });
    }
    return r.fulfill({ json: { items: campaigns, nextCursor: null } });
  });
  return posts;
}
export function promotionChecks(){
for (const hi of [false, true])
  test(`teacher promotion quote, reusable cards and request (${hi ? "Hindi phone" : "English desktop"})`, async ({
    page,
  }) => {
    if (hi)
      await page.addInitScript(() =>
        localStorage.setItem("bcs.interface-language", "hi"),
      );
    const t = (s: string) => translateText(hi, s);
    await page.setViewportSize(
      hi ? { width: 360, height: 900 } : { width: 1440, height: 1050 },
    );
    const posts = await setup(page);
    await page.goto("/dashboard/promotions");
    await expect(
      page.getByRole("heading", {
        name: t("Promote your teaching"),
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".promotion-plan")).toHaveCount(3);
    await expect(page.locator(".promotion-plan-space")).toContainText("999");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const axe = await new AxeBuilder({ page })
      .include(".promotion-workspace")
      .analyze();
    expect(
      axe.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact || ""),
      ),
    ).toEqual([]);
    await page.screenshot({
      path: `test-results/promotions-teacher-${hi ? "hi-phone" : "desktop"}.png`,
      fullPage: true,
    });
    await page
      .locator(".promotion-plan-search")
      .getByRole("button", { name: t("Review promotion"), exact: true })
      .click();
    const modal = page.getByRole("dialog");
    await expect(modal).toContainText("299");
    await expect(
      modal.getByRole("button", {
        name: t("Submit promotion request"),
        exact: true,
      }),
    ).toBeDisabled();
    await modal
      .getByRole("checkbox", {
        name: t("I understand the placement, price and promotion terms."),
        exact: true,
      })
      .check();
    await modal
      .getByRole("button", { name: t("Submit promotion request"), exact: true })
      .click();
    await expect(modal).toBeHidden();
    await expect(page.locator(".promotion-campaign")).toHaveCount(1);
    expect(posts[0].body).toEqual({
      placement: "SEARCH",
      planVersion: 1,
      confirmed: true,
    });
    expect(posts[0].key).toBeTruthy();
  });
test("superadmin reviews a collapsed campaign with explicit payment confirmation", async ({
  page,
}) => {
  const posts = await setup(page, "ADMIN", true);
  await page.goto("/dashboard/promotions");
  await expect(
    page.getByRole("heading", {
      name: "Sponsored teacher placements",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".promotion-pricing-editor > summary")).toHaveCount(
    3,
  );
  await expect(
    page.getByRole("button", { name: "Save pricing", exact: true }),
  ).toHaveCount(0);
  const campaign = page.locator(".promotion-campaign");
  await campaign.locator("summary").click();
  await campaign
    .getByLabel("Review note", { exact: true })
    .fill("Synthetic payment independently reviewed");
  await campaign
    .getByLabel("Payment reference", { exact: true })
    .fill("synthetic-reference-123");
  await campaign
    .getByRole("checkbox", {
      name: "I independently confirmed the full quoted payment. This action does not collect money.",
      exact: true,
    })
    .check();
  await campaign
    .getByRole("checkbox", {
      name: "I reviewed this campaign and the selected action.",
      exact: true,
    })
    .check();
  await page.screenshot({
    path: "test-results/promotions-admin.png",
    fullPage: true,
  });
  await campaign
    .getByRole("button", { name: "Confirm action", exact: true })
    .click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0].body).toMatchObject({
    action: "APPROVE",
    paymentConfirmed: true,
    paymentReference: "synthetic-reference-123",
    expectedVersion: 1,
    confirmed: true,
  });
  await expect(
    page.locator(".promotion-campaign").locator(".status-badge"),
  ).toContainText("Active");
});
test("homepage sponsored profiles are labelled and regular discovery stays available on ad failure", async ({
  page,
}) => {
  await page.route("**/api/v1/**", async (r) => {
    const url = new URL(r.request().url());
    if (url.pathname.endsWith("/auth/session"))
      return r.fulfill({
        status: 401,
        json: { code: "SESSION_REQUIRED", message: "Sign in to continue." },
      });
    if (url.pathname.endsWith("/sponsored-teachers"))
      return r.fulfill({
        json: {
          items: [
            {
              id,
              slug: "ananya-sharma",
              name: "Synthetic Ananya",
              headline: "Maths with confidence",
              subjects: ["Maths"],
              monthlyPaise: 299000,
            },
          ],
        },
      });
    return r.fulfill({ json: { items: [], nextCursor: null } });
  });
  await page.goto("/");
  const sponsored = page.getByRole("region", {
    name: "Sponsored teachers",
    exact: true,
  });
  await expect(sponsored).toBeVisible();
  await expect(sponsored.getByText("Sponsored", { exact: true })).toBeVisible();
  await expect(
    sponsored.getByRole("link", { name: "View profile", exact: true }),
  ).toHaveAttribute("href", "/teachers/ananya-sharma");
  await page.route("**/api/v1/sponsored-teachers**", (r) =>
    r.fulfill({
      status: 503,
      json: { code: "UNAVAILABLE", message: "Unavailable" },
    }),
  );
  await page.reload();
  await expect(
    page.getByText(
      "Sponsored teachers are unavailable. You can still browse the regular results.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Meet all teachers", exact: true }),
  ).toBeVisible();
});
test("an unknown promotion write retries the identical request without allowing edits", async ({
  page,
}) => {
  await setup(page);
  const attempts: { key: string | undefined; body: unknown }[] = [];
  await page.route("**/api/v1/promotions", async (route) => {
    attempts.push({
      key: route.request().headers()["idempotency-key"],
      body: route.request().postDataJSON(),
    });
    if (attempts.length === 1) return route.abort("failed");
    return route.fulfill({ json: { id, status: "PENDING" } });
  });
  await page.goto("/dashboard/promotions");
  await page
    .locator(".promotion-plan-search")
    .getByRole("button", { name: "Review promotion", exact: true })
    .click();
  const modal = page.getByRole("dialog");
  await modal.getByRole("checkbox").check();
  await modal
    .getByRole("button", { name: "Submit promotion request", exact: true })
    .click();
  await expect(
    modal.getByRole("button", { name: "Retry same decision", exact: true }),
  ).toBeVisible();
  await expect(modal.getByRole("checkbox")).toBeDisabled();
  await modal
    .getByRole("button", { name: "Retry same decision", exact: true })
    .click();
  await expect(modal).toBeHidden();
  expect(attempts).toHaveLength(2);
  expect(attempts[0]).toEqual(attempts[1]);
});
test('a changed promotion quote needs explicit refresh and fresh confirmation',async({page})=>{
 await setup(page);let version=1;
 await page.route('**/api/v1/promotion-plans',r=>r.fulfill({json:{items:plans.map(p=>p.id==='SEARCH'?{...p,version,amountPaise:version===1?29900:34900}:p),currency:'INR',paymentMode:'MANUAL_REVIEW',chargesEnabled:false}}));
 await page.route('**/api/v1/promotions',r=>{version=2;return r.fulfill({status:409,json:{code:'CONFLICT',message:'Promotion prices changed. Refresh and review again.'}});});
 await page.goto('/dashboard/promotions');await page.locator('.promotion-plan-search').getByRole('button',{name:'Review promotion',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByRole('checkbox').check();await modal.getByRole('button',{name:'Submit promotion request',exact:true}).click();await expect(modal).toContainText('Promotion prices changed. Refresh and review again.');await expect(modal.getByRole('checkbox')).toBeDisabled();
 await modal.getByRole('button',{name:'Refresh quote',exact:true}).click();await expect(modal).toContainText('349');await expect(modal.getByRole('checkbox')).not.toBeChecked();await expect(modal.getByRole('button',{name:'Submit promotion request',exact:true})).toBeDisabled();await expect(modal.getByRole('checkbox')).toBeEnabled();
});

}
