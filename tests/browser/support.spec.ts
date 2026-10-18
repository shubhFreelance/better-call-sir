import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { validator, contract } from "../helpers/contract";
import Ajv from "ajv/dist/2020";
import addFormats from "ajv-formats";
const ajv = new Ajv({ strict: false });
addFormats(ajv);
const createInput = ajv.compile(
  contract.paths["/cases"].post.requestBody.content["application/json"].schema,
);
import type { components } from "@bcs/api-client";
const account = "10000000-0000-4000-8000-000000000081",
  caseId = "20000000-0000-4000-8000-000000000081",
  otherId = "20000000-0000-4000-8000-000000000082",
  updateId = "30000000-0000-4000-8000-000000000081";
const linkedRequest = "40000000-0000-4000-8000-000000000081",
  linkedPlacement = "50000000-0000-4000-8000-000000000081";
const timestamp = "2026-10-14T08:30:00.000Z";
async function mock(page: Page, mode = "normal", role = "GUARDIAN") {
  let item: components["schemas"]["SupportCase"] = {
    id: caseId,
    accountId: account,
    region: "Raipur",
    assignedToId: null,
    placementId: null,
    reservationId: null,
    resolution: null,
    category: "ATTENDANCE",
    description:
      "The attendance record shows absent, but Aarav joined the lesson. Please help us review it.",
    status: mode === "resolved" ? "RESOLVED" : "WAITING_OWNER",
    version: 2,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  if (mode === "resolved")
    item.resolution = "The attendance record has been corrected after review.";
  let updates: components["schemas"]["CaseUpdate"][] = [
    {
      id: updateId,
      message: "Please share the date and approximate time you joined.",
      internal: false,
      author: "SUPPORT",
      createdAt: timestamp,
    },
  ];
  const writes: { path: string; body: any; key: string }[] = [],
    reads: string[] = [],
    replays = new Map<string, any>();
  let failRead = false,
    stale = mode === "stale";
  const check = (name: string, data: any) => {
    const valid = validator(name);
    expect(valid(data), JSON.stringify(valid.errors)).toBe(true);
    return data;
  };
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        status: role === "ANONYMOUS" ? 401 : 200,
        json:
          role === "ANONYMOUS"
            ? { code: "UNAUTHENTICATED", message: "Sign in." }
            : {
                account: {
                  id: account,
                  name: "Kavita · synthetic account",
                  role,
                  verified: true,
                },
                csrfToken: "synthetic-csrf",
              },
      });
    if (req.method() === "GET") {
      reads.push(url.pathname + url.search);
      if (path.endsWith("/support/context")) {
        if (mode === "bad-context")
          return route.fulfill({
            status: 404,
            json: { code: "NOT_FOUND", message: "Context unavailable" },
          });
        return route.fulfill({
          json: check("SupportContext", {
            kind: url.searchParams.has("placementId")
              ? "ARRANGEMENT"
              : "ENQUIRY",
            id: url.searchParams.get("placementId") || linkedRequest,
            requestId: linkedRequest,
            placementId: linkedPlacement,
            subject: "Maths",
            mode: "ONLINE",
            status: "OPEN",
            canRequestReplacement: role === "GUARDIAN",
          }),
        });
      }
      if (failRead) {
        failRead = false;
        return route.fulfill({
          status: 503,
          json: {
            code: "UNAVAILABLE",
            message: "Case records are temporarily unavailable.",
          },
        });
      }
      if (path.endsWith("/cases"))
        return route.fulfill({
          json: check("SupportCaseList", {
            items:
              mode === "empty" || mode === "uncertain-create"
                ? []
                : [
                    url.searchParams.has("cursor")
                      ? { ...item, id: otherId }
                      : item,
                  ],
            nextCursor:
              mode === "paging" && !url.searchParams.has("cursor")
                ? caseId
                : null,
          }),
        });
      if (path.includes("/cases/")) {
        if (mode === "foreign")
          return route.fulfill({
            status: 404,
            json: { code: "NOT_FOUND", message: "Case not found." },
          });
        return route.fulfill({
          json: check("SupportCaseDetail", {
            ...item,
            updates: url.searchParams.has("updatesCursor")
              ? [
                  {
                    id: otherId,
                    message: "Earlier owner context.",
                    internal: false,
                    author: "YOU",
                    createdAt: "2026-10-13T08:00:00.000Z",
                  },
                ]
              : updates,
            updatesNextCursor:
              mode === "paging" && !url.searchParams.has("updatesCursor")
                ? updateId
                : null,
          }),
        });
      }
      return route.fulfill({
        status: 404,
        json: { code: "NOT_FOUND", message: "No fixture for this route." },
      });
    }
    const body = req.postDataJSON(),
      key = req.headers()["idempotency-key"];
    writes.push({ path, body, key });
    expect(key).toBeTruthy();
    expect(req.headers()["x-csrf-token"]).toBe("synthetic-csrf");
    expect(
      (path.endsWith("/updates") ? validator("CaseReplyInput") : createInput)(
        body,
      ),
    ).toBe(true);
    if (replays.has(key))
      return route.fulfill({ status: 201, json: replays.get(key) });
    if (stale) {
      stale = false;
      item = { ...item, version: item.version + 1 };
      return route.fulfill({
        status: 409,
        json: {
          code: "CONFLICT",
          message: "Case changed. Refresh before replying.",
        },
      });
    }
    if (path.endsWith("/updates")) {
      expect(body.expectedVersion).toBe(item.version);
      item = { ...item, version: item.version + 1 };
      updates = [
        {
          id: otherId,
          message: body.message,
          internal: false,
          author: "YOU",
          createdAt: timestamp,
        },
        ...updates,
      ];
    } else
      item = {
        ...item,
        category: body.category,
        description: body.description,
        requestId: body.requestId || null,
        placementId: body.placementId || null,
        status: "OPEN",
        version: 1,
      };
    replays.set(key, check("SupportCase", item));
    if (mode === "failed-refresh") failRead = true;
    if (mode.startsWith("uncertain") && writes.length === 1)
      return route.abort("failed");
    return route.fulfill({ status: 201, json: item });
  });
  return { writes, reads, item: () => item };
}
async function create(page: Page) {
  await page
    .getByRole("button", { name: "Create a case", exact: true })
    .click();
  await page.getByLabel("What can we help with?").selectOption("SAFETY");
  await page
    .getByLabel("Tell us what happened")
    .fill("Synthetic safety concern. Please review the situation privately.");
  await page
    .getByRole("button", { name: "Review request", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /I reviewed this request/ }).check();
}
async function reply(page: Page) {
  await page
    .getByLabel("Add a reply", { exact: true })
    .fill("The lesson was on Tuesday at 5 pm IST.");
  await page.getByRole("button", { name: "Review reply", exact: true }).click();
  await page.getByRole("checkbox", { name: /I reviewed this reply/ }).check();
}
test("anonymous guidance is free and does not query private cases", async ({
  page,
}) => {
  const s = await mock(page, "normal", "ANONYMOUS");
  await page.goto("/support");
  await expect(
    page.getByRole("link", { name: "Call 112 in India" }),
  ).toHaveAttribute("href", "tel:112");
  await expect(
    page.getByRole("link", { name: /Sign in to submit/ }),
  ).toBeVisible();
  expect(s.reads).toEqual([]);
});
test("safety request is reviewed, recorded without payment and opens its private conversation", async ({
  page,
}) => {
  const s = await mock(page, "empty");
  await page.goto("/support");
  await create(page);
  expect(s.writes).toHaveLength(0);
  await expect(
    page.getByText(/does not arrange emergency response/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Send support request", exact: true })
    .click();
  await expect(page.locator(".support-original")).toContainText(
    "Synthetic safety concern",
  );
  await expect(page).toHaveURL(new RegExp("case=" + caseId));
  expect(s.writes[0].body.category).toBe("SAFETY");
  expect(s.reads.every((p) => !p.includes("payments"))).toBe(true);
});
test("unknown creation locks the draft and replays the same payload and key", async ({
  page,
}) => {
  const s = await mock(page, "uncertain-create");
  await page.goto("/support");
  await create(page);
  await page
    .getByRole("button", { name: "Send support request", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry same decision" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cancel request" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Back to editing" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Retry same decision" }).click();
  await expect(page.locator(".support-original")).toContainText(
    "Synthetic safety concern",
  );
  expect(s.writes[1]).toEqual(s.writes[0]);
});
test("case and update pagination retain the newest conversation and chronological display", async ({
  page,
}) => {
  const s = await mock(page, "paging");
  await page.goto("/support?case=" + caseId);
  await page.getByRole("button", { name: "Load earlier updates" }).click();
  await expect(page.locator(".support-updates li").first()).toContainText(
    "Earlier owner context",
  );
  await page.getByRole("button", { name: "Load more cases" }).click();
  await expect(page.locator(".support-case-option")).toHaveCount(2);
  await page.getByLabel("Case status").selectOption("OPEN");
  await expect
    .poll(() => s.reads.some((p) => p.includes("status=OPEN")))
    .toBe(true);
  await expect(page.getByRole("button", { name: "Review reply" })).toHaveCount(
    0,
  );
});
test("unknown reply uses the same current version, message and retry key", async ({
  page,
}) => {
  const s = await mock(page, "uncertain-reply");
  await page.goto("/support?case=" + caseId);
  await expect(page).toHaveURL(/case=[a-f0-9-]{36}/);
  await reply(page);
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Retry same decision" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create a case", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Retry same decision" }).click();
  await expect(page.locator(".support-updates")).toContainText(
    "Tuesday at 5 pm",
  );
  expect(s.writes[1]).toEqual(s.writes[0]);
  expect(s.writes[0].body).toEqual({
    expectedVersion: 2,
    message: "The lesson was on Tuesday at 5 pm IST.",
    internal: false,
  });
});
test("stale reply survives refresh and must be reviewed against the current version", async ({
  page,
}) => {
  const s = await mock(page, "stale");
  await page.goto("/support?case=" + caseId);
  await reply(page);
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(
    page.getByText("Case changed. Refresh before replying."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Refresh current case" }).click();
  await expect(page.getByLabel("Add a reply", { exact: true })).toHaveValue(
    "The lesson was on Tuesday at 5 pm IST.",
  );
  await page.getByRole("button", { name: "Review reply", exact: true }).click();
  await page.getByRole("checkbox", { name: /I reviewed this reply/ }).check();
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(page.locator(".support-updates")).toContainText(
    "Tuesday at 5 pm",
  );
  expect(s.writes[1].body.expectedVersion).toBe(3);
});
test("resolved cases display resolution with no reply; inaccessible cases expose no cached content", async ({
  page,
}) => {
  await mock(page, "resolved");
  await page.goto("/support?case=" + caseId);
  await expect(
    page.getByText(/attendance record has been corrected/),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Review reply" })).toHaveCount(
    0,
  );
  await page.unrouteAll();
  await mock(page, "foreign");
  await page.reload();
  await expect(page.getByText(/no longer accessible/)).toBeVisible();
  await expect(page.locator(".support-original")).toHaveCount(0);
});
test("saved requests with failed refresh block fresh writes until recovery", async ({
  page,
}) => {
  const s = await mock(page, "failed-refresh");
  await page.goto("/support");
  await create(page);
  await page
    .getByRole("button", { name: "Send support request", exact: true })
    .click();
  await expect(
    page.getByText(/Your decision was saved, but current details/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create a case", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Refresh current case" }).click();
  await expect(
    page.getByRole("button", { name: "Create a case", exact: true }),
  ).toBeEnabled();
  expect(s.writes).toHaveLength(1);
});
test("student support is free, mobile accessible and preserves drafts across review", async ({
  page,
}) => {
  const s = await mock(page, "normal", "STUDENT");
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/support?case=" + caseId);
  await expect(page.getByText(/tell a trusted adult/)).toBeVisible();
  await reply(page);
  await page.getByRole("button", { name: "Edit reply" }).click();
  await expect(page.getByLabel("Add a reply", { exact: true })).toHaveValue(
    "The lesson was on Tuesday at 5 pm IST.",
  );
  expect(
    s.reads.every((p) => !p.includes("dashboard") && !p.includes("payments")),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (await new AxeBuilder({ page }).include(".support-workspace").analyze())
      .violations,
  ).toEqual([]);
  await page.locator(".support-workspace").screenshot({
    path: "test-results/support-mobile.png",
    style: "nextjs-portal{display:none!important}",
  });
});
test("teacher desktop conversation has consistent gutters and accessible controls", async ({
  page,
}) => {
  await mock(page, "normal", "TEACHER");
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto("/support?case=" + caseId);
  await expect(page.locator(".support-updates")).toContainText(
    "Please share the date",
  );
  expect(
    (await new AxeBuilder({ page }).include(".support-workspace").analyze())
      .violations,
  ).toEqual([]);
  expect(
    await page
      .locator(".support-workspace")
      .evaluate((el) => getComputedStyle(el).paddingLeft),
  ).toBe("24px");
  await page.locator(".support-workspace").screenshot({
    path: "test-results/support-desktop.png",
    style: "nextjs-portal{display:none!important}",
  });
});
test("real guardian creates a case, replies and reopens the same persisted conversation", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByText("Development accounts", { exact: true }).click();
  await page.getByRole("button", { name: /Kavita/ }).click();
  await expect(
    page.getByRole("heading", { name: /Hello, Kavita/ }),
  ).toBeVisible();
  await page.goto("/support");
  await page
    .getByRole("button", { name: "Create a case", exact: true })
    .click();
  const message = "Synthetic support browser case " + randomUUID();
  await page.getByLabel("Tell us what happened").fill(message);
  await page
    .getByRole("button", { name: "Review request", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /I reviewed this request/ }).check();
  await page
    .getByRole("button", { name: "Send support request", exact: true })
    .click();
  await expect(page.locator(".support-original")).toContainText(message);
  await reply(page);
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(page.locator(".support-updates")).toContainText(
    "Tuesday at 5 pm",
  );
  await page.reload();
  await expect(page.locator(".support-original")).toContainText(message);
  await expect(page.locator(".support-updates")).toContainText(
    "Tuesday at 5 pm",
  );
});

test("empty requests stay editable and composing beside an existing case never previews a reply", async ({
  page,
}) => {
  const s = await mock(page);
  await page.goto("/support?case=" + caseId);
  await page
    .getByRole("button", { name: "Create a case", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review request", exact: true })
    .click();
  await expect(
    page.getByText("Describe what happened in up to 3,000 characters."),
  ).toBeVisible();
  expect(s.writes).toHaveLength(0);
  await page
    .getByLabel("Tell us what happened")
    .fill("A new separate request.");
  await page
    .getByRole("button", { name: "Review request", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Send reply", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Back to editing" }).click();
  await expect(page.getByLabel("Tell us what happened")).toHaveValue(
    "A new separate request.",
  );
});

test("enquiry help preserves owned context through case creation and status filtering", async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto("/support?request=" + linkedRequest);
  await expect(
    page.getByRole("heading", { name: "Help with this enquiry" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Review replacement options" }),
  ).toHaveAttribute(
    "href",
    "/dashboard/arrangements?placement=" + linkedPlacement,
  );
  await create(page);
  await page
    .getByRole("button", { name: "Send support request", exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp("request=" + linkedRequest + ".*case=" + caseId),
  );
  expect(state.writes[0].body.requestId).toBe(linkedRequest);
  await expect(page.getByLabel("Add a reply", { exact: true })).toBeVisible();
  await page.getByLabel("Case status", { exact: true }).selectOption("OPEN");
  await expect(page).toHaveURL(new RegExp("request=" + linkedRequest));
  await expect(page).not.toHaveURL(/case=/);
  expect(
    state.reads
      .filter((p) => p.startsWith("/cases?"))
      .every(
        (p) =>
          new URL(p, "http://local.test").searchParams.get("requestId") ===
          linkedRequest,
      ),
  ).toBe(true);
});
test("unavailable support context never opens an unlinked case or unfiltered history", async ({
  page,
}) => {
  const state = await mock(page, "bad-context");
  await page.goto("/support?request=" + linkedRequest + "&case=" + caseId);
  await expect(
    page.getByText(/This support link could not be verified/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create a case", exact: true }),
  ).toBeDisabled();
  expect(state.reads.some((p) => p.startsWith("/cases?"))).toBe(false);
  expect(state.reads.some((p) => p.startsWith("/cases/"))).toBe(false);
  await expect(page.getByLabel("Add a reply", { exact: true })).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
});
test("unknown contextual support create locks context and replays the same owned body", async ({
  page,
}) => {
  const state = await mock(page, "uncertain-context");
  await page.goto("/support?placement=" + linkedPlacement);
  await expect(
    page.getByRole("heading", { name: "Help with this arrangement" }),
  ).toBeVisible();
  await create(page);
  await page
    .getByRole("button", { name: "Send support request", exact: true })
    .click();
  await expect(
    page.getByText(/We couldn’t confirm this decision/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry same decision" }).click();
  await expect(page).toHaveURL(
    new RegExp("placement=" + linkedPlacement + ".*case=" + caseId),
  );
  expect(state.writes).toHaveLength(2);
  expect(state.writes[0].body).toEqual(state.writes[1].body);
  expect(state.writes[0].key).toBe(state.writes[1].key);
  expect(state.writes[0].body.placementId).toBe(linkedPlacement);
});
test("contextual support is clear and accessible on mobile", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/support?request=" + linkedRequest);
  await expect(
    page.getByRole("heading", { name: "Help with this enquiry" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/context-support-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/context-support-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact || ""),
    ),
  ).toEqual([]);
});

test("Hindi anonymous safety guidance stays free and never reads private cases", async ({
  page,
}) => {
  const state = await mock(page, "normal", "ANONYMOUS");
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/support");
  await page.getByLabel("Language / भाषा", { exact: true }).selectOption("hi");
  await expect(
    page.getByRole("heading", { name: "मदद पाने का आसान रास्ता।" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "भारत में 112 पर कॉल करें" }),
  ).toHaveAttribute("href", "tel:112");
  await expect(
    page.getByRole("link", { name: /अपने निजी मामले/ }),
  ).toHaveAttribute("href", "/login?next=%2Fsupport");
  expect(state.reads).toEqual([]);
});

test("Hindi support preserves validation, contextual retries and authored content on mobile", async ({
  page,
}) => {
  const state = await mock(page, "uncertain-context");
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/support?placement=" + linkedPlacement);
  await page.getByLabel("Language / भाषा", { exact: true }).selectOption("hi");
  await expect(
    page.getByRole("heading", { name: "इस व्यवस्था के लिए मदद" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "नया मामला बनाएँ", exact: true })
    .click();
  await page
    .getByRole("button", { name: "अनुरोध जाँचें", exact: true })
    .click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "अधिकतम 3,000 अक्षरों में बताएँ कि क्या हुआ।",
  );
  await page.getByLabel("आपको किस विषय में मदद चाहिए?").selectOption("SAFETY");
  await page
    .getByLabel("बताएँ कि क्या हुआ")
    .fill("मेरी निजी चिंता। Please keep this wording.");
  await page.getByLabel("Language / भाषा", { exact: true }).selectOption("en");
  await expect(page.getByLabel("Tell us what happened")).toHaveValue(
    "मेरी निजी चिंता। Please keep this wording.",
  );
  await page
    .getByRole("button", { name: "Review request", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /I reviewed this request/ }).check();
  await page.getByLabel("Language / भाषा", { exact: true }).selectOption("hi");
  await expect(
    page.getByRole("checkbox", { name: /मैंने अनुरोध/ }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "सहायता अनुरोध भेजें", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "वही निर्णय फिर भेजें" }),
  ).toBeVisible();
  await page.getByLabel("Language / भाषा", { exact: true }).selectOption("en");
  await page.getByRole("button", { name: "Retry same decision" }).click();
  await expect(page.locator(".support-original")).toContainText(
    "मेरी निजी चिंता। Please keep this wording.",
  );
  expect(state.writes).toHaveLength(2);
  expect(state.writes[0]).toEqual(state.writes[1]);
  expect(state.writes[0].body).toEqual({
    category: "SAFETY",
    description: "मेरी निजी चिंता। Please keep this wording.",
    placementId: linkedPlacement,
  });
  await page.getByLabel("Language / भाषा", { exact: true }).selectOption("hi");
  await expect(page.locator("main.support-workspace")).toHaveAttribute(
    "lang",
    "hi",
  );
  await expect(page.locator(".support-updates")).toContainText(
    "Please share the date and approximate time you joined.",
  );
  await expect(page.locator(".support-original")).toHaveCSS(
    "font-family",
    /Noto/,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(
    axe.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact || ""),
    ),
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/support-hindi-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/support-hindi-desktop.png",
    fullPage: true,
  });
});

test("Hindi replies retain retry identity and canonical history filters", async ({
  page,
}) => {
  const state = await mock(page, "uncertain-reply", "TEACHER");
  await page.goto("/support?case=" + caseId);
  await page.getByLabel("Language / भाषा", { exact: true }).selectOption("hi");
  await page
    .getByLabel("जवाब लिखें", { exact: true })
    .fill("मंगलवार को पाँच बजे।");
  await page.getByRole("button", { name: "जवाब जाँचें", exact: true }).click();
  await page.getByRole("checkbox", { name: /मैंने जवाब/ }).check();
  await page.getByRole("button", { name: "जवाब भेजें", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "वही निर्णय फिर भेजें" }),
  ).toBeVisible();
  await page.getByLabel("Language / भाषा", { exact: true }).selectOption("en");
  await page.getByRole("button", { name: "Retry same decision" }).click();
  await expect(page.locator(".support-updates")).toContainText(
    "मंगलवार को पाँच बजे।",
  );
  expect(state.writes).toHaveLength(2);
  expect(state.writes[0]).toEqual(state.writes[1]);
  expect(state.writes[0].body).toEqual({
    expectedVersion: 2,
    message: "मंगलवार को पाँच बजे।",
    internal: false,
  });
  await page.getByLabel("Language / भाषा", { exact: true }).selectOption("hi");
  await page
    .getByLabel("मामले की स्थिति", { exact: true })
    .selectOption("WAITING_OWNER");
  await expect
    .poll(() => state.reads.some((p) => p.includes("status=WAITING_OWNER")))
    .toBe(true);
});

test("Hindi denied context and closed conversations preserve access boundaries", async ({
  page,
}) => {
  const state = await mock(page, "bad-context");
  await page.goto("/support?request=" + linkedRequest + "&case=" + caseId);
  await page.getByLabel("Language / भाषा", { exact: true }).selectOption("hi");
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "इस सहायता लिंक की पुष्टि नहीं हुई।",
  );
  await expect(
    page.getByRole("button", { name: "नया मामला बनाएँ", exact: true }),
  ).toBeDisabled();
  expect(state.reads.some((p) => p.startsWith("/cases"))).toBe(false);
  await page.unroute("**/api/v1/**");
  await mock(page, "resolved");
  await page.goto("/support?case=" + caseId);
  await expect(
    page.getByText(
      "यह मामला सुलझ चुका है और इसमें जवाब नहीं भेज सकते। और मदद के लिए नया मामला बनाएँ।",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("The attendance record has been corrected after review."),
  ).toBeVisible();
  await expect(page.getByLabel("जवाब लिखें", { exact: true })).toHaveCount(0);
});

test("failed case-history pages hide cached case details and recover the same conversation", async ({
  page,
}) => {
  const s = await mock(page, "paging");
  await page.goto("/support?case=" + caseId);
  await expect(
    page.getByText(s.item().description, { exact: true }),
  ).toBeVisible();
  await page.route("**/api/v1/cases?**", (route) =>
    route.fulfill({
      status: 403,
      json: { code: "FORBIDDEN", message: "Synthetic private backend detail" },
    }),
  );
  await page
    .getByRole("button", { name: "Load more cases", exact: true })
    .click();
  await expect(page.locator(".support-case-option")).toHaveCount(0);
  await expect(
    page.getByText(s.item().description, { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Synthetic private backend detail", { exact: true }),
  ).toHaveCount(0);
  await page.unroute("**/api/v1/cases?**");
  await page
    .getByRole("button", { name: "Retry case history", exact: true })
    .click();
  await expect(
    page.getByText(s.item().description, { exact: true }),
  ).toBeVisible();
  expect(s.writes).toHaveLength(0);
});
