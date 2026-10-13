import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";
import { validator } from "../helpers/contract";
import { assertParserCsp } from "../helpers/csp";
import {
  createStaffFixture,
  staffSession,
  cleanupStaffFixtures,
} from "./staff-fixture";
import { totp } from "../../apps/api/src/modules/identity/totp";
test.afterEach(async () => cleanupStaffFixtures());
async function staffMock(page: Page, mode = "verify") {
  const paths: string[] = [],
    writes: { path: string; body: unknown }[] = [];
  let enabled = mode !== "enroll",
    verifiedUntil: string | null = null;
  const recoveryCodes = Array.from({ length: 8 }, () =>
      randomBytes(16).toString("base64url"),
    ),
    secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  const check = (name: string, value: unknown) => {
    const valid = validator(name);
    expect(valid(value), JSON.stringify(valid.errors)).toBe(true);
    return value;
  };
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    paths.push(path);
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: "10000000-0000-4000-8000-000000000097",
            name: "Synthetic Staff",
            role: "ADMIN",
            verified: true,
          },
          csrfToken: "synthetic-staff-csrf",
        },
      });
    if (path.endsWith("/auth/mfa"))
      return route.fulfill({
        json:
          mode === "malformed"
            ? {
                enabled: true,
                verifiedUntil: "not-a-time",
                recoveryCodesRemaining: 8,
              }
            : check("MfaStatus", {
                enabled,
                verifiedUntil,
                recoveryCodesRemaining: 8,
              }),
      });
    if (request.method() === "POST") {
      const body = request.postDataJSON();
      expect(request.headers()["x-csrf-token"]).toBe("synthetic-staff-csrf");
      writes.push({ path, body });
      if (path.endsWith("/enrollment"))
        return route.fulfill({
          status: 201,
          json: check("MfaEnrollment", {
            secret,
            otpauthUri: "otpauth://totp/Synthetic?secret=" + secret,
            expiresIn: 600,
          }),
        });
      if (path.endsWith("/verification")) {
        check("MfaVerificationInput", body);
        const first = !enabled;
        enabled = true;
        verifiedUntil = new Date(
          Date.now() + (mode === "quick-expiry" ? 5000 : 600000),
        ).toISOString();
        if (mode === "unknown") return route.abort("failed");
        return route.fulfill({
          status: 201,
          json: check("MfaVerification", {
            verifiedUntil,
            recoveryCodes: first ? recoveryCodes : [],
          }),
        });
      }
      if (path.endsWith("/recovery-codes"))
        return route.fulfill({
          status: 201,
          json: check("MfaRecovery", { recoveryCodes }),
        });
      throw new Error("Unexpected mutation " + path);
    }
    if (path.endsWith("/dashboard"))
      return route.fulfill({
        json: {
          role: "ADMIN",
          window: {
            start: new Date().toISOString(),
            end: new Date().toISOString(),
            timezone: "Asia/Kolkata",
            metricVersion: "synthetic",
          },
          metrics: {},
          flags: [],
          cases: [],
          audit: [],
          jobs: { pending: 0, failed: 0 },
        },
      });
    if (
      path.endsWith("/teachers") ||
      path.endsWith("/requests") ||
      path.endsWith("/demos")
    )
      return route.fulfill({ json: { items: [] } });
    return route.fulfill({
      status: 404,
      json: { code: "NOT_FOUND", message: "Synthetic route not found." },
    });
  });
  return {
    paths,
    writes,
    secret,
    recoveryCodes,
    expire: () => (verifiedUntil = new Date(Date.now() - 1000).toISOString()),
  };
}
test("staff enrollment holds back private queries and keeps setup/recovery secrets out of browser storage", async ({
  page,
}) => {
  const state = await staffMock(page, "enroll");
  await page.goto("/dashboard/admin");
  await expect(
    page.getByRole("heading", { name: "Protect your staff access." }),
  ).toBeVisible();
  expect(
    state.paths.some(
      (x) => x.endsWith("/dashboard") || x.endsWith("/requests"),
    ),
  ).toBe(false);
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  await expect(page.getByLabel("Authenticator setup key")).toHaveText(
    state.secret,
  );
  await page.getByLabel("Authenticator code", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Verify staff access" }).click();
  await expect(
    page.getByRole("heading", { name: "Save your recovery codes" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with verified access" }),
  ).toBeDisabled();
  expect(state.paths.some((x) => x.endsWith("/dashboard"))).toBe(false);
  const storage = await page.evaluate(() =>
    JSON.stringify([localStorage, sessionStorage]),
  );
  for (const value of [state.secret, ...state.recoveryCodes])
    expect(storage).not.toContain(value);
  await page
    .getByRole("checkbox", { name: "I saved these recovery codes securely." })
    .check();
  await page
    .getByRole("button", { name: "Continue with verified access" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Feature controls" }),
  ).toBeVisible();
  await expect(page.getByLabel("Private recovery codes")).toHaveCount(0);
});
test("lost MFA response requires status inspection without replaying a consumed code", async ({
  page,
}) => {
  const state = await staffMock(page, "unknown");
  await page.goto("/dashboard/admin");
  await page.getByLabel("Authenticator code", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Verify staff access" }).click();
  await expect(
    page.getByText(/The result could not be confirmed/),
  ).toBeVisible();
  await expect(
    page.getByLabel("Authenticator code", { exact: true }),
  ).toBeDisabled();
  expect(state.writes).toHaveLength(1);
  expect(state.paths.some((x) => x.endsWith("/dashboard"))).toBe(false);
  await page
    .getByRole("button", { name: "Check current verification" })
    .click();
  await expect(page.getByText(/Verification is recorded/)).toBeVisible();
  await page
    .getByRole("button", { name: "Continue with recorded verification" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Feature controls" }),
  ).toBeVisible();
  expect(state.writes).toHaveLength(1);
});
test("expired staff verification hides cached console content when the current status is rechecked", async ({
  page,
}) => {
  const state = await staffMock(page);
  await page.goto("/dashboard/admin");
  await page.getByLabel("Authenticator code", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Verify staff access" }).click();
  await expect(
    page.getByRole("heading", { name: "Feature controls" }),
  ).toBeVisible();
  state.expire();
  await page.goto("/dashboard/security");
  await expect(
    page.getByRole("heading", { name: "Protect your staff access." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Check current verification" })
    .click();
  await expect(page.getByText(/No current staff verification/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Feature controls" }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Authenticator code", { exact: true }),
  ).toBeVisible();
});
test("malformed MFA status never renders or queries the staff console", async ({
  page,
}) => {
  const state = await staffMock(page, "malformed");
  await page.goto("/dashboard/admin");
  await expect(
    page.getByText(/Current authenticator status could not be verified/),
  ).toBeVisible();
  expect(
    state.paths.some(
      (x) => x.endsWith("/dashboard") || x.endsWith("/requests"),
    ),
  ).toBe(false);
});
test("single-use recovery and recovery-code replacement each require an explicit staff action", async ({
  page,
}) => {
  const state = await staffMock(page);
  await page.goto("/dashboard/admin");
  await page
    .getByRole("button", { name: "Use a recovery code", exact: true })
    .click();
  await page
    .getByLabel("Single-use recovery code", { exact: true })
    .fill(state.recoveryCodes[0]);
  await page.getByRole("button", { name: "Verify staff access" }).click();
  await expect(
    page.getByRole("heading", { name: "Feature controls" }),
  ).toBeVisible();
  expect(state.writes[0].body).toEqual({ code: state.recoveryCodes[0] });
  await page.goto("/dashboard/security");
  await page
    .getByRole("button", { name: "Replace recovery codes", exact: true })
    .click();
  await page
    .getByLabel("New authenticator code", { exact: true })
    .fill("654321");
  await page
    .getByRole("button", { name: "Replace recovery codes", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Save your recovery codes" }),
  ).toBeVisible();
  expect(state.writes[1].path).toBe("/api/v1/auth/mfa/recovery-codes");
  await expect(
    page.getByRole("button", { name: "Continue with verified access" }),
  ).toBeDisabled();
});
test("the local step-up clock removes private console content when proof expires", async ({
  page,
}) => {
  await staffMock(page, "quick-expiry");
  await page.goto("/dashboard/admin");
  await page.getByLabel("Authenticator code", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Verify staff access" }).click();
  await expect(
    page.getByRole("heading", { name: "Feature controls" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Protect your staff access." }),
  ).toBeVisible({ timeout: 10000 });
  await expect(
    page.getByRole("heading", { name: "Feature controls" }),
  ).toHaveCount(0);
});
test("staff verification is keyboard accessible, has no mobile overflow and uses the shared palette", async ({
  page,
}) => {
  await staffMock(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/dashboard/admin");
  await page.getByLabel("Authenticator code", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Verify staff access" }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(
    axe.violations.filter((x) =>
      ["serious", "critical"].includes(x.impact || ""),
    ),
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/staff-security-mobile.png",
    fullPage: true,
  });
});
test("HTML has unique trusted nonces, blocks injected inline scripts and refuses secret-file routes", async ({
  page,
  request,
}) => {
  const response = await page.goto("/");
  const headers = response!.headers(),
    csp = headers["content-security-policy"];
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["cache-control"]).toContain("no-store");
  const nonce = csp.match(/'nonce-([^']+)'/)![1];
  expect(nonce).toBeTruthy();
  const inline = await page
    .locator("script:not([src])")
    .evaluateAll((nodes) =>
      nodes
        .filter((node) => !!node.textContent?.trim())
        .map((node) => (node as HTMLScriptElement).nonce),
    );
  expect(inline.length).toBeGreaterThan(0);
  expect(inline.every((value) => value === nonce)).toBe(true);
  await assertParserCsp(page);
  const next = await request.get("/login", {
    headers: { "x-nonce": "forged-nonce" },
  });
  expect(next.headers()["content-security-policy"]).not.toContain(
    "forged-nonce",
  );
  expect(
    next.headers()["content-security-policy"].match(/'nonce-([^']+)'/)![1],
  ).not.toBe(nonce);
  for (const path of [
    "/.env",
    "/.env.local",
    "/.git/config",
    "/.cache/private-evidence",
    "/node_modules/package.json",
  ]) {
    const denied = await request.get(path);
    expect(denied.status()).toBe(404);
    expect(await denied.json()).toEqual({
      code: "NOT_FOUND",
      message: "Not found.",
    });
  }
});
test("real staff enrollment verifies on the server before private console access and logout revokes it", async ({
  page,
}) => {
  const id = await createStaffFixture("Security staff · isolated fixture"),
    session = await staffSession(page.request, id);
  await page.goto("/dashboard/admin");
  await expect(
    page.getByRole("heading", { name: "Protect your staff access." }),
  ).toBeVisible();
  const denied = await page.request.get("/api/v1/admin/jobs");
  expect(denied.status()).toBe(403);
  expect((await denied.json()).code).toBe("MFA_REQUIRED");
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  const secret = await page.getByLabel("Authenticator setup key").textContent();
  await page
    .getByLabel("Authenticator code", { exact: true })
    .fill(totp(secret!, BigInt(Math.floor(Date.now() / 30000))));
  await page.getByRole("button", { name: "Verify staff access" }).click();
  await expect(
    page.getByRole("heading", { name: "Save your recovery codes" }),
  ).toBeVisible();
  const status = await (await page.request.get("/api/v1/auth/mfa")).json();
  expect(status.enabled).toBe(true);
  expect(status.recoveryCodesRemaining).toBe(8);
  await page
    .getByRole("checkbox", { name: "I saved these recovery codes securely." })
    .check();
  await page
    .getByRole("button", { name: "Continue with verified access" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Feature controls" }),
  ).toBeVisible();
  expect((await page.request.get("/api/v1/admin/jobs")).status()).toBe(200);
  const logout = await page.request.post("/api/v1/auth/logout", {
    data: {},
    headers: {
      Origin: "http://localhost:3000",
      "X-CSRF-Token": session.csrfToken,
    },
  });
  expect(logout.status()).toBe(201);
  expect((await page.request.get("/api/v1/admin/jobs")).status()).toBe(401);
});
