import { test, expect } from "@playwright/test";
test("real guardian logout and email-only sign-in reopen the saved verification without registration or re-upload", async ({
  page,
}) => {
  const email = `return-guardian-${crypto.randomUUID()}@example.test`,
    learner = "Saved learner " + crypto.randomUUID().slice(0, 8);
  await page.goto("/signup/guardian");
  await page.getByLabel("Your name", { exact: true }).fill("Saved parent");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  const code = page.waitForResponse(
    (r) =>
      r.url().endsWith("/auth/otp/request") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Send verification code", exact: true })
    .click();
  await page
    .getByLabel("Six-digit code", { exact: true })
    .fill((await (await code).json()).developmentCode);
  const verified = page.waitForResponse(
    (r) =>
      r.url().endsWith("/auth/otp/verify") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Verify and continue to setup", exact: true })
    .click();
  const first = await (await verified).json();
  expect(first.accountCreated).toBe(true);
  await expect(page).toHaveURL(/\/onboarding\/guardian$/);
  const proof = await page.request.post("/api/v1/guardian-verifications", {
    headers: {
      Origin: "http://localhost:3000",
      "X-CSRF-Token": first.csrfToken,
      "Idempotency-Key": crypto.randomUUID(),
    },
    data: {
      guardianName: "Saved parent",
      learnerName: learner,
      relationship: "PARENT",
      ageBand: "UNDER_15",
      managementMode: "SHARED",
      studentEmail: null,
      acknowledgmentMethod: "STAFF_CALL",
      documentNamesGuardian: true,
      adultDeclaration: true,
      authorityDeclaration: true,
      verificationPermission: true,
      policyVersion: "guardian-verification-v1",
    },
  });
  expect(proof.status()).toBe(201);
  const saved = await proof.json();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/login");
  await expect(page.getByLabel("Your name", { exact: true })).toHaveCount(0);
  await page.getByLabel("Email address", { exact: true }).fill(email);
  const again = page.waitForResponse(
    (r) =>
      r.url().endsWith("/auth/otp/request") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Send sign-in code", exact: true })
    .click();
  await page
    .getByLabel("Six-digit code", { exact: true })
    .fill((await (await again).json()).developmentCode);
  const returned = page.waitForResponse(
    (r) =>
      r.url().endsWith("/auth/otp/verify") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Verify and continue", exact: true })
    .click();
  const next = await (await returned).json();
  expect(next.accountCreated).toBe(false);
  expect(next.account.id).toBe(first.account.id);
  expect(next.account.name).toBe("Saved parent");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page
    .getByRole("link", {
      name: "Review saved verification requests",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: learner, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "View verification", exact: true })
    .click();
  await expect(page.locator(".guardian-verification-editor")).toContainText(
    learner,
  );
  await expect(page.locator(".guardian-verification-editor")).toContainText(
    "Draft",
  );
  const reloaded = await (
    await page.request.get("/api/v1/guardian-verifications/" + saved.id)
  ).json();
  expect(reloaded.id).toBe(saved.id);
  expect(reloaded.managementMode).toBe("SHARED");
  expect(reloaded.currentEvidenceId).toBeNull();
});
