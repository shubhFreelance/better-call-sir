import { test, expect } from "@playwright/test";
import { teachers } from "../../packages/test-fixtures/src";

test("production Hindi search loads the next cursor page under strict CSP", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.addCookies([
    {
      name: "bcs.interface-language",
      value: "hi",
      url: "http://localhost:3001",
    },
  ]);
  const cursor = "30000000-0000-4000-8000-000000000701";
  const profile = (n: number) => ({
    ...teachers[0],
    id: `30000000-0000-4000-8000-00000000070${n}`,
    name: `Production Teacher ${n}`,
    slug: `production-pagination-${n}`,
    boards: ["CBSE"],
    grades: [8],
    lockInDays: 0,
  });
  const pages: string[] = [];
  await page.route("**/api/v1/teachers?**", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get("q") !== "production pagination") return route.fallback();
    pages.push(params.get("cursor") || "");
    return route.fulfill({
      json: {
        items: [profile(params.has("cursor") ? 2 : 1)],
        nextCursor: params.has("cursor") ? null : cursor,
      },
    });
  });
  const response = await page.goto("/teachers");
  expect(response!.headers()["content-security-policy"]).not.toContain(
    "unsafe-eval",
  );
  await page
    .getByRole("textbox", { name: "शिक्षक खोजें", exact: true })
    .fill("production pagination");
  await expect(
    page.getByRole("heading", { name: "Production Teacher 1", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "और शिक्षक देखें", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Production Teacher 2", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("खोज से मेल खाने वाले सभी शिक्षक दिखाए गए हैं।", {
      exact: true,
    }),
  ).toBeVisible();
  expect(pages).toEqual(["", cursor]);
  expect(errors).toEqual([]);
});
