import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { dashboard } from "../helpers/dashboard-redesign";
import { translateText } from "../../apps/web/app/locale";
const teacherId = "30000000-0000-4000-8000-000000000001",
  promotionId = "80000000-0000-4000-8000-000000000701";
function report(query: URLSearchParams) {
  const month = query.get("month")!,
    page = Number(query.get("page") || 1),
    leadPage = Number(query.get("leadPage") || 1),
    selected = query.get("teacherId");
  const teacher = {
    id: teacherId,
    name: "Synthetic Meera",
    slug: "meera-sahu",
    status: "APPROVED",
    requests: 12,
    approved: 8,
    clicks: 19,
    visits: 31,
  };
  return {
    month,
    timezone: "Asia/Kolkata",
    retentionDays: 90,
    asOf: new Date().toISOString(),
    firstRecordedAt: month + "-01T00:00:00Z",
    teacher: selected
      ? {
          id: teacherId,
          name: teacher.name,
          slug: teacher.slug,
          status: teacher.status,
        }
      : null,
    summary: {
      requests: 12,
      approved: 8,
      pending: 2,
      active: 3,
      paused: 1,
      expired: 2,
      rejected: 2,
      cancelled: 2,
      clicks: 72,
      parents: 12,
      students: 7,
      visits: 95,
      visitsToday: 4,
      visitsMonth: 31,
      clicksMonth: 19,
      enquiries: 11,
      interestedParents: 8,
      interestedStudents: 3,
    },
    daily: [
      { day: month + "-02", clicks: 5, visits: 10 },
      { day: month + "-01", clicks: 14, visits: 21 },
    ],
    campaigns: [
      {
        id: promotionId,
        teacherName: teacher.name,
        placement: "SPACE",
        status: "ACTIVE",
        endsAt: new Date(Date.now() + 86400000).toISOString(),
        clicks: 19,
        visits: 14,
      },
    ],
    teachers: {
      total: 11,
      page,
      items:
        page === 2
          ? [teacher]
          : Array.from({ length: 10 }, (_, i) => ({
              ...teacher,
              id: i
                ? "30000000-0000-4000-8000-" + String(i + 1).padStart(12, "0")
                : teacherId,
              name: i ? "Synthetic teacher " + i : teacher.name,
            })),
    },
    enquiries: {
      detailsAccess: "ADMIN",
      demoContact: null as null | {
        demo: true;
        teacherName: string;
        name: string;
        email: string;
        phone: string;
        subject: string;
      },
      total: 11,
      page: leadPage,
      items: Array.from({ length: leadPage === 1 ? 10 : 1 }, (_, i) => ({
        id:
          "80000000-0000-4000-8000-" +
          String(i + leadPage * 100).padStart(12, "0"),
        teacherName: teacher.name,
        name:
          leadPage === 2
            ? "Synthetic returning parent"
            : "Synthetic parent " + i,
        audience: "GUARDIAN",
        subject: "Maths",
        status: "PENDING",
        createdAt: month + "-02T00:00:00Z",
      })),
    },
  };
}
async function setup(page: Page, role = "TEACHER") {
  await dashboard(page, role);
  let denied = false;
  const reads: URL[] = [];
  await page.route("**/api/v1/promotions/analytics?*", (route) => {
    const url = new URL(route.request().url());
    reads.push(url);
    const data = report(url.searchParams);
    if (role === "TEACHER") {
      data.enquiries.detailsAccess = "PRO_REQUIRED";
      data.enquiries.items = [];
      data.enquiries.demoContact = {
        demo: true,
        teacherName: "Meera Sahu",
        name: "Asha Verma",
        email: "asha.parent@example.test",
        phone: "00000 00000",
        subject: "Science",
      };
    }
    return denied
      ? route.fulfill({
          status: 403,
          json: {
            code: "FORBIDDEN",
            message: "Your role cannot perform this action.",
          },
        })
      : route.fulfill({ json: data });
  });
  return {
    reads,
    deny: () => (denied = true),
    restore: () => (denied = false),
  };
}
for (const hi of [false, true])
  test(`teacher insights retain metrics, Pro-lock identities and preview a demo contact (${hi ? "Hindi phone" : "desktop"})`, async ({
    page,
  }) => {
    if (hi)
      await page.addInitScript(() =>
        localStorage.setItem("bcs.interface-language", "hi"),
      );
    const t = (s: string) => translateText(hi, s),
      state = await setup(page);
    await page.setViewportSize({ width: hi ? 360 : 1440, height: 1000 });
    await page.goto("/dashboard/promotion-insights");
    const view = page.locator(".promotion-insights");
    await expect(
      view.getByRole("heading", { name: t("Promotion insights"), exact: true }),
    ).toBeVisible();
    await expect(view.locator(".insight-summary dd")).toHaveText([
      "12",
      "8",
      "3",
      "19",
      "4",
      "31",
    ]);
    await expect(view.locator(".insight-leads li")).toHaveCount(0);
    await expect(view.locator(".insight-pro-lock")).toBeVisible();
    await expect(
      view.locator(".insight-interest-title .status-badge"),
    ).toHaveText("Pro");
    await expect(view.getByText("Asha Verma", { exact: true })).toHaveCount(0);
    await view
      .getByRole("button", { name: t("Preview Pro details"), exact: true })
      .click();
    const modal = page.getByRole("dialog");
    await expect(modal).toContainText("Asha Verma");
    await expect(modal).toContainText("asha.parent@example.test");
    await expect(modal).toContainText("00000 00000");
    await expect(
      modal.locator('a[href^="tel:"],a[href^="mailto:"]'),
    ).toHaveCount(0);
    expect(
      (await new AxeBuilder({ page }).include("dialog").analyze()).violations,
    ).toEqual([]);
    await modal.screenshot({
      path: `test-results/pro-contact-preview-${hi ? "hi" : "en"}.png`,
      style: "nextjs-portal{display:none!important}",
    });
    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();
    await expect(
      view.getByRole("button", { name: t("Preview Pro details"), exact: true }),
    ).toBeFocused();
    await expect(view.locator(".insight-summary dd")).toHaveText([
      "12",
      "8",
      "3",
      "19",
      "4",
      "31",
    ]);
    await view
      .getByRole("combobox", { name: t("Activity month"), exact: true })
      .selectOption({ index: 1 });
    await expect(view.locator(".insight-pro-lock")).toBeVisible();
    expect(state.reads.at(-1)!.searchParams.get("leadPage")).toBe("1");
    const info = view.getByRole("button", {
      name: t("How promotion activity is counted"),
      exact: true,
    });
    await info.scrollIntoViewIfNeeded();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await info.click();
    await expect(page.getByRole("tooltip")).toContainText(
      t(
        "Browsing is not consent to contact. Names below come only from existing enquiries; no private viewer contacts are shared.",
      ),
    );
    await page.keyboard.press("Escape");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (await new AxeBuilder({ page }).include(".promotion-insights").analyze())
        .violations,
    ).toEqual([]);
    await view.screenshot({
      path: `test-results/promotion-insights-${hi ? "hi" : "en"}.png`,
      style: "nextjs-portal{display:none!important}",
    });
    state.deny();
    await view
      .getByRole("button", {
        name: t("Refresh promotion insights"),
        exact: true,
      })
      .click();
    await expect(view.getByRole("alert")).toBeVisible();
    await expect(view.locator(".insight-summary")).toHaveCount(0);
    await expect(view.locator(".insight-leads")).toHaveCount(0);
    state.restore();
    await view
      .getByRole("button", { name: t("Retry promotion insights"), exact: true })
      .click();
    await expect(view.locator(".insight-summary")).toBeVisible();
  });
test("superadmin compares ten teachers per page, drills into a teacher and opens scoped campaign management", async ({
  page,
}) => {
  const state = await setup(page, "ADMIN");
  let managementRead: URL | undefined;
  await page.route("**/api/v1/promotion-plans", (r) =>
    r.fulfill({
      json: {
        items: [],
        currency: "INR",
        chargesEnabled: false,
        paymentMode: "MANUAL_REVIEW",
      },
    }),
  );
  await page.route("**/api/v1/promotions?*", (r) => {
    managementRead = new URL(r.request().url());
    return r.fulfill({ json: { items: [], nextCursor: null } });
  });
  await page.goto("/dashboard/promotion-insights");
  const teachers = page.getByRole("group", {
    name: "Teacher performance pages",
    exact: true,
  });
  await expect(page.getByRole("table").first().locator("tbody tr")).toHaveCount(
    10,
  );
  await page.setViewportSize({ width: 360, height: 1000 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (await new AxeBuilder({ page }).include(".promotion-insights").analyze())
      .violations,
  ).toEqual([]);
  await page.locator(".promotion-insights").screenshot({
    path: "test-results/promotion-insights-admin-phone.png",
    style: "nextjs-portal{display:none!important}",
  });
  await teachers.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("table").first().locator("tbody tr")).toHaveCount(
    1,
  );
  expect(state.reads.at(-1)!.searchParams.get("page")).toBe("2");
  await page
    .getByRole("link", {
      name: "View insights for Synthetic Meera",
      exact: true,
    })
    .click();
  await expect(page.locator(".insight-toolbar")).toContainText(
    "Synthetic Meera",
  );
  expect(state.reads.at(-1)!.searchParams.get("teacherId")).toBe(teacherId);
  await expect(
    page.getByRole("heading", { name: "Teacher performance", exact: true }),
  ).toHaveCount(0);
  const families = page.getByRole("group", {
    name: "Interested family pages",
    exact: true,
  });
  await families.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".insight-leads li")).toHaveCount(1);
  await expect(page.locator(".insight-leads")).toContainText(
    "Synthetic returning parent",
  );
  await page
    .getByRole("link", { name: "Manage promotions", exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp("/dashboard/promotions\\?teacher=" + teacherId),
  );
  await expect
    .poll(() => managementRead?.searchParams.get("teacherId"))
    .toBe(teacherId);
  await expect(
    page.getByRole("link", { name: "Show all promotions", exact: true }),
  ).toBeVisible();
});
for (const role of ["TEACHER", "ADMIN"])
  test(`promotion insights are reachable from the ${role} overview and sidebar`, async ({
    page,
  }) => {
    await setup(page, role);
    await page.goto("/dashboard");
    const card = page.locator(".promotion-performance-card");
    await expect(card.locator("dd")).toHaveText(["3", "19", "31"]);
    await card
      .getByRole("link", { name: "View promotion insights", exact: true })
      .click();
    await expect(page).toHaveURL(/\/dashboard\/promotion-insights$/);
    await expect(
      page.locator(".promotion-insights .insight-summary"),
    ).toBeVisible();
  });
test("zero analytics shows honest empty states and a promotion action", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/v1/promotions/analytics?*", (r) => {
    const data = report(new URL(r.request().url()).searchParams);
    return r.fulfill({
      json: {
        ...data,
        firstRecordedAt: null,
        summary: Object.fromEntries(
          Object.keys(data.summary).map((k) => [k, 0]),
        ),
        daily: [],
        campaigns: [],
        enquiries: {
          detailsAccess: "PRO_REQUIRED",
          demoContact: null,
          items: [],
          total: 0,
          page: 1,
        },
        teachers: { items: [], total: 0, page: 1 },
      },
    });
  });
  await page.goto("/dashboard/promotion-insights");
  await expect(page.locator(".insight-summary dd")).toHaveText([
    "0",
    "0",
    "0",
    "0",
    "0",
    "0",
  ]);
  await expect(
    page.getByText(
      "No recorded activity for this month yet. Activity appears after signed-in families visit or click.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Manage promotions", exact: true }),
  ).toHaveAttribute("href", "/dashboard/promotions");
});
for (const privacy of [false, true])
  test(`sponsored clicks and loaded profile visits carry attribution without blocking navigation (${privacy ? "privacy enabled" : "signed in"})`, async ({
    page,
  }) => {
    if (privacy)
      await page.addInitScript(() =>
        Object.defineProperty(navigator, "doNotTrack", { get: () => "1" }),
      );
    const events: any[] = [];
    const teacher = {
      id: teacherId,
      promotionId,
      slug: "synthetic-meera",
      name: "Synthetic Meera",
      headline: "Clear concepts",
      bio: "Maths with care",
      subjects: ["Maths"],
      boards: ["CBSE"],
      grades: [6],
      teachingCoverage: [
        { stage: "SCHOOL", subject: "Maths", board: "CBSE", grade: 6 },
      ],
      modes: ["ONLINE"],
      languages: ["English"],
      experience: 8,
      monthlyPaise: 250000,
      avatarColor: "#E4E4D0",
      capabilityLabel: "Reviewed subject coverage",
      consultationOptIn: false,
    };
    await page.route("**/api/v1/**", (route) => {
      const req = route.request(),
        path = new URL(req.url()).pathname;
      if (path.endsWith("/auth/session"))
        return route.fulfill({
          json: {
            account: {
              id: "10000000-0000-4000-8000-000000000701",
              name: "Synthetic student",
              role: "INDEPENDENT_STUDENT",
              verified: true,
            },
            csrfToken: "synthetic-csrf",
          },
        });
      if (path.endsWith("/promotion-activity")) {
        expect(req.headers()["x-csrf-token"]).toBe("synthetic-csrf");
        events.push(req.postDataJSON());
        return route.fulfill({ status: 201, json: { recorded: true } });
      }
      if (path.endsWith("/teachers/synthetic-meera"))
        return route.fulfill({ json: teacher });
      if (path.endsWith("/teachers") || path.endsWith("/sponsored-teachers"))
        return route.fulfill({ json: { items: [teacher], nextCursor: null } });
      if (path.endsWith("/independent-student/profile"))
        return route.fulfill({
          json: {
            education: {
              stage: "COLLEGE",
              courseName: "BSc",
              studyYear: 1,
              institutionName: "Synthetic school",
              subjects: ["Maths"],
            },
            editStatus: "EDITABLE",
          },
        });
      if (path.endsWith("/inbox"))
        return route.fulfill({
          json: { items: [], tasks: [], unread: 0, nextCursor: null },
        });
      return route.fulfill({ json: { items: [], nextCursor: null } });
    });
    await page.goto("/");
    const ad = page.locator(".sponsored-teachers .teacher-card");
    await expect(ad).toBeVisible();
    await ad
      .getByRole("link", { name: "View Synthetic Meera", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp("promotion=" + promotionId));
    await expect(page.locator(".profile-main")).toBeVisible();
    if (privacy) expect(events).toHaveLength(0);
    else {
      await expect
        .poll(() => events.some((e) => e.kind === "PROFILE_VISIT"))
        .toBe(true);
      expect(events).toContainEqual({
        teacherId,
        promotionId,
        kind: "CARD_CLICK",
      });
      expect(
        events
          .filter((e) => e.kind === "PROFILE_VISIT")
          .every((e) => e.promotionId === promotionId),
      ).toBe(true);
    }
  });
