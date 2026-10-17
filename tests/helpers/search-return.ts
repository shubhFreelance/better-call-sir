import { test, expect, type Page } from "@playwright/test";
import { teachers } from "../../packages/test-fixtures/src";
import { hindiMessages } from "../../apps/web/app/hindi-messages";
const cursor = "30000000-0000-4000-8000-000000000781";
const profile = (n: number) => ({
  ...teachers[0],
  id: `30000000-0000-4000-8000-00000000078${n}`,
  slug: `return-teacher-${n}`,
  name: `Return Teacher ${n}`,
  boards: ["CBSE"],
  grades: [8],
  demoAvailable: true,
  lockInDays: 0,
});
async function setup(page: Page, signedIn = false) {
  const requests: URL[] = [];
  let active = signedIn;
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/session"))
      return route.fulfill({
        status: active ? 200 : 401,
        json: active
          ? {
              account: {
                id: "10000000-0000-4000-8000-000000000781",
                role: "PARENT",
                name: "Synthetic Guardian",
                verified: true,
              },
              csrfToken: "synthetic-csrf",
            }
          : { code: "SESSION_REQUIRED", message: "Sign in" },
      });
    if (url.pathname.endsWith("/auth/logout")) {
      expect(route.request().method()).toBe("POST");
      active = false;
      return route.fulfill({ json: { ok: true } });
    }
    if (/\/teachers\/return-teacher-[12]$/.test(url.pathname))
      return route.fulfill({
        json: profile(url.pathname.endsWith("2") ? 2 : 1),
      });
    if (
      url.pathname.endsWith("/teachers") &&
      url.searchParams.get("q") === "return criteria"
    ) {
      requests.push(url);
      return route.fulfill({
        json: {
          items: [profile(url.searchParams.has("cursor") ? 2 : 1)],
          nextCursor: url.searchParams.has("cursor") ? null : cursor,
        },
      });
    }
    return route.fallback();
  });
  await page.goto("/teachers");
  await page.waitForLoadState("networkidle");
  return requests;
}
export function searchReturnChecks() {
  test("returning to an older search revalidates instead of extending its freshness", async ({
    page,
  }) => {
    await page.clock.install();
    await setup(page);
    await page
      .getByLabel("Search teachers", { exact: true })
      .fill("return criteria");
    await expect(
      page.getByRole("heading", { name: "Return Teacher 1", exact: true }),
    ).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page
      .getByRole("link", { name: "Return Teacher 1", exact: true })
      .click();
    await expect(page.locator(".profile-navigation")).toBeVisible();
    await page.clock.fastForward(16000);
    let revalidated = false;
    await page.route("**/api/v1/teachers?**", async (route) => {
      if (
        new URL(route.request().url()).searchParams.get("q") !==
        "return criteria"
      )
        return route.fallback();
      revalidated = true;
      return route.fulfill({
        status: 503,
        json: { code: "UNAVAILABLE", message: "Synthetic unavailable" },
      });
    });
    await page
      .getByRole("link", { name: "← All teachers", exact: true })
      .click();
    await expect(
      page.getByText("Search unavailable", { exact: true }),
    ).toBeVisible();
    expect(revalidated).toBe(true);
    await expect(
      page.getByLabel("Search teachers", { exact: true }),
    ).toHaveValue("return criteria");
    await expect(
      page.getByRole("heading", { name: "Return Teacher 1", exact: true }),
    ).toHaveCount(0);
  });
  test("school criteria and loaded pages survive profile navigation without an unfiltered restart", async ({
    page,
  }) => {
    const requests = await setup(page);
    const values = {
      "Search teachers": "return criteria",
      "Education stage": "SCHOOL",
      Subject: "Maths",
      "Lesson mode": "ONLINE",
      Board: "CBSE",
      Class: "8",
      Language: "Hindi",
      Locality: "Shankar Nagar",
      "Maximum monthly tuition": "5000",
    };
    for (const [name, value] of Object.entries(values)) {
      const field = page.getByLabel(name, { exact: true });
      if (name === "Search teachers") await field.fill(value);
      else await field.selectOption(value);
    }
    await page
      .getByRole("button", { name: "Load more teachers", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Return Teacher 2", exact: true }),
    ).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page
      .getByRole("link", { name: "Return Teacher 2", exact: true })
      .click();
    await expect(page.locator(".profile-navigation")).toBeVisible();
    await page
      .getByRole("link", { name: "← All teachers", exact: true })
      .click();
    for (const [name, value] of Object.entries(values))
      await expect(page.getByLabel(name, { exact: true })).toHaveValue(value);
    await expect(
      page.getByRole("heading", { name: "Return Teacher 2", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("All matching teachers are shown.", { exact: true }),
    ).toBeVisible();
    const last = requests.at(-1)!.searchParams;
    expect(Object.fromEntries(last)).toMatchObject({
      q: "return criteria",
      stage: "SCHOOL",
      subject: "Maths",
      mode: "ONLINE",
      board: "CBSE",
      grade: "8",
      language: "Hindi",
      locality: "Shankar Nagar",
      maxMonthlyPaise: "500000",
      cursor,
    });
    await page.goBack();
    await expect(page.locator(".profile-navigation")).toBeVisible();
    await page.goForward();
    await expect(page.getByLabel("Class", { exact: true })).toHaveValue("8");
    await expect(
      page.getByRole("heading", { name: "Return Teacher 2", exact: true }),
    ).toBeVisible();
    expect(new URL(page.url()).search).toBe("");
    await page
      .locator("header")
      .getByRole("link", { name: "Better Call Sir home", exact: true })
      .click();
    await expect(page).toHaveURL(/\/$/);
    await page
      .locator("header")
      .getByRole("link", { name: "Find a teacher", exact: true })
      .click();
    await expect(
      page.getByLabel("Search teachers", { exact: true }),
    ).toHaveValue("return criteria");
    await expect(
      page.getByRole("heading", { name: "Return Teacher 2", exact: true }),
    ).toBeVisible();
  });

  test("custom college criteria survive browser Back, reset cleanly and remain memory-only", async ({
    page,
  }) => {
    await setup(page);
    await page
      .getByLabel("Search teachers", { exact: true })
      .fill("return criteria");
    await page
      .getByLabel("Education stage", { exact: true })
      .selectOption("COLLEGE");
    await page
      .getByLabel("Subject", { exact: true })
      .selectOption("__CUSTOM__");
    await page
      .getByLabel("Subject name", { exact: true })
      .fill("Computational design");
    await page.getByLabel("Course / degree", { exact: true }).fill("BDes");
    await page.getByLabel("Study year", { exact: true }).selectOption("3");
    await expect(
      page.getByRole("heading", { name: "Return Teacher 1", exact: true }),
    ).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page
      .getByRole("link", { name: "Return Teacher 1", exact: true })
      .click();
    await expect(page.locator(".profile-navigation")).toBeVisible();
    await page.goBack();
    await expect(page.getByLabel("Subject name", { exact: true })).toHaveValue(
      "Computational design",
    );
    await expect(
      page.getByLabel("Course / degree", { exact: true }),
    ).toHaveValue("BDes");
    await expect(page.getByLabel("Study year", { exact: true })).toHaveValue(
      "3",
    );
    const stored = await page.evaluate(() =>
      JSON.stringify({
        local: { ...localStorage },
        session: { ...sessionStorage },
        cookie: document.cookie,
      }),
    );
    expect(stored).not.toMatch(/Computational design|BDes|return criteria/);
    await page
      .getByRole("button", { name: "Reset filters", exact: true })
      .click();
    await expect(
      page.getByLabel("Search teachers", { exact: true }),
    ).toHaveValue("");
    await expect(
      page.getByLabel("Education stage", { exact: true }),
    ).toHaveValue("");
    await expect(page.getByLabel("Subject name", { exact: true })).toHaveCount(
      0,
    );
    await page
      .getByLabel("Search teachers", { exact: true })
      .fill("return criteria");
    await page.reload();
    await expect(
      page.getByLabel("Search teachers", { exact: true }),
    ).toHaveValue("");
  });

  test("Hindi search returns with canonical criteria after switching language", async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      { name: "bcs.interface-language", value: "hi", url: baseURL! },
    ]);
    await page.addInitScript(() =>
      localStorage.setItem("bcs.interface-language", "hi"),
    );
    const t = (text: string) =>
      hindiMessages[text as keyof typeof hindiMessages] || text;
    const requests = await setup(page);
    await page
      .getByLabel(t("Search teachers"), { exact: true })
      .fill("return criteria");
    await page.getByLabel(t("Language"), { exact: true }).selectOption("Hindi");
    await page
      .getByLabel(t("Locality"), { exact: true })
      .selectOption("Shankar Nagar");
    await expect(
      page.getByRole("heading", { name: "Return Teacher 1", exact: true }),
    ).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page
      .getByRole("link", { name: "Return Teacher 1", exact: true })
      .click();
    await expect(page.locator(".profile-navigation")).toBeVisible();
    await page
      .getByRole("link", { name: t("← All teachers"), exact: true })
      .click();
    await expect(page.getByLabel(t("Language"), { exact: true })).toHaveValue(
      "Hindi",
    );
    await expect(page.getByLabel(t("Locality"), { exact: true })).toHaveValue(
      "Shankar Nagar",
    );
    await page
      .getByRole("button", { name: "अंग्रेज़ी और हिन्दी बदलें", exact: true })
      .click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByLabel("Language", { exact: true })).toHaveValue(
      "Hindi",
    );
    await expect(page.getByLabel("Locality", { exact: true })).toHaveValue(
      "Shankar Nagar",
    );
    expect(requests.at(-1)!.searchParams.get("language")).toBe("Hindi");
    expect(requests.at(-1)!.searchParams.get("locality")).toBe("Shankar Nagar");
  });

  test("confirmed sign-out clears search criteria before another person browses", async ({
    page,
  }) => {
    await setup(page, true);
    await page
      .getByLabel("Search teachers", { exact: true })
      .fill("return criteria");
    await expect(
      page.getByRole("heading", { name: "Return Teacher 1", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await page
      .locator("header")
      .getByRole("link", { name: "Find a teacher", exact: true })
      .click();
    await expect(
      page.getByLabel("Search teachers", { exact: true }),
    ).toHaveValue("");
    await expect(
      page.getByRole("heading", { name: "Return Teacher 1", exact: true }),
    ).toHaveCount(0);
  });
}
