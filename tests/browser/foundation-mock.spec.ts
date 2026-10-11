import { test, expect } from "@playwright/test";
import { spawn, ChildProcess } from "node:child_process";
let server: ChildProcess;
test.beforeAll(async () => {
  server = spawn(process.execPath, ["scripts/mock-server.mjs"], {
    env: { ...process.env, MOCK_PORT: "4120", PRISM_PORT: "4122" },
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
    await page.route("**/api/v1/**", async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      requests.push(request.method() + " " + url.pathname);
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
      await page
        .getByLabel("Link an existing learner")
        .selectOption({ label: "Aarav · Class 8" });
      await page
        .getByLabel("When do lessons work for your family?")
        .fill("Tuesday after 5pm");
      await page.getByRole("checkbox").check();
      await page
        .getByRole("button", { name: "Save my tuition request" })
        .click();
      if (consentFailure) {
        await expect(
          page.getByText(/Role, ownership, consent, CSRF or Origin denied/),
        ).toBeVisible();
        expect(requests).not.toContain("POST /api/v1/requests");
      } else {
        await expect(page.getByText(/Request 40000000 saved/)).toBeVisible();
        expect(requests).toContain("POST /api/v1/consents");
        expect(requests).toContain("POST /api/v1/requests");
      }
    } finally {
      await mock.dispose();
    }
  });
