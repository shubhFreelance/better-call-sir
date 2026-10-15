import {
  beginGuardian,
  existingLearner,
  reviewGuardian,
  submitGuardian,
} from "./guardian-journey";
import { operationValidator } from "../helpers/contract";
import { test, expect } from "@playwright/test";
import { spawn, ChildProcess } from "node:child_process";
let server: ChildProcess;
test.beforeAll(async () => {
  server = spawn(process.execPath, ["scripts/mock-server.mjs"], {
    env: { ...process.env, MOCK_PORT: "4120" },
    stdio: "pipe",
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch("http://127.0.0.1:4120/api/v1/catalog")).ok) return;
    } catch {}
    if (server.exitCode !== null)
      throw new Error("Foundation mock exited before readiness.");
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Foundation mock readiness timed out.");
});
test.afterAll(async () => {
  if (server) {
    server.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      if (server.exitCode !== null) return resolve();
      server.once("exit", () => resolve());
    });
  }
});
for (const consentFailure of [false, true])
  test(`guardian intake renders against contract mocks: ${consentFailure ? "consent denied" : "saved example"}`, async ({
    page,
    playwright,
  }) => {
    const mock = await playwright.request.newContext();
    const requests: string[] = [];
    let progress = {
      kind: "PARENT",
      state: "DRAFT",
      draft: {},
      version: 0,
      completedResourceId: null as string | null,
    };
    await page.route("**/api/v1/**", async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      requests.push(request.method() + " " + url.pathname);
      if (url.pathname === "/api/v1/onboarding/enquiry")
        return route.fulfill({
          json: {
            kind: "ENQUIRY",
            state: "DRAFT",
            draft: {},
            version: 0,
            completedResourceId: null,
          },
        });
      if (url.pathname.startsWith("/api/v1/onboarding/parent")) {
        if (request.method() === "POST") {
          if (url.pathname.endsWith("/drafts"))
            progress = {
              ...progress,
              draft: request.postDataJSON().draft,
              version: progress.version + 1,
            };
          else
            progress = {
              ...progress,
              state: "READY",
              draft: {},
              version: progress.version + 1,
              completedResourceId: "40000000-0000-4000-8000-000000000001",
            };
        }
        const check = operationValidator(
          "/onboarding/{kind}" +
            (request.method() === "POST"
              ? url.pathname.endsWith("/drafts")
                ? "/drafts"
                : "/completions"
              : ""),
          request.method().toLowerCase(),
          request.method() === "POST" ? "201" : "200",
        );
        expect(check(progress), JSON.stringify(check.errors)).toBe(true);
        await route.fulfill({
          status: request.method() === "POST" ? 201 : 200,
          json: progress,
        });
        return;
      }
      const response = await mock.fetch(
        "http://127.0.0.1:4120" + url.pathname + url.search,
        {
          method: request.method(),
          headers: {
            ...request.headers(),
            Cookie: "bcs_access=synthetic-mock-session",
            ...(consentFailure && url.pathname === "/api/v1/consents"
              ? { Prefer: "code=403" }
              : {}),
          },
          ...(request.postData() ? { data: request.postData()! } : {}),
        },
      );
      expect(response.headers()["x-bcs-mock"]).toBe("synthetic-contract");
      await route.fulfill({ response });
    });
    try {
      await page.goto("/onboarding/parent");
      await expect(
        page.getByLabel("Learner alias", { exact: true }),
      ).toHaveCount(0);
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Agree and continue" }).click();
      if (consentFailure) {
        await expect(
          page.getByText(/Role, ownership, consent, CSRF or Origin denied/),
        ).toBeVisible();
        expect(requests).not.toContain("POST /api/v1/onboarding/parent/drafts");
        await expect(
          page.getByLabel("Learner alias", { exact: true }),
        ).toHaveCount(0);
      } else {
        await existingLearner(page);
        await reviewGuardian(page, "Tuesday after 5pm");
        expect(await submitGuardian(page)).toBe(
          "40000000-0000-4000-8000-000000000001",
        );
        expect(requests).toContain("POST /api/v1/consents");
        expect(requests).toContain(
          "POST /api/v1/onboarding/parent/completions",
        );
      }
    } finally {
      await mock.dispose();
    }
  });
