import { expect, type Page } from "@playwright/test";
export async function beginGuardian(page: Page) {
  const another = page.getByRole("button", { name: "Create another request" });
  const agree = page.getByRole("button", { name: "Agree and continue" });
  await expect(another.or(agree)).toBeVisible();
  if (await another.isVisible()) await another.click();
  await page.getByRole("checkbox").check();
  await agree.click();
  await expect(page.getByLabel("Learner alias", { exact: true })).toBeVisible();
}
export async function existingLearner(page: Page, label = "Aarav · Class 8") {
  await page.getByLabel("Link an existing learner").selectOption({ label });
  if (await page.getByLabel("School name", { exact: true }).isEditable())
    await page
      .getByLabel("School name", { exact: true })
      .fill("Synthetic school");
  if (
    await page
      .getByLabel("Subjects studied in this class", { exact: true })
      .isEditable()
  )
    await page
      .getByLabel("Subjects studied in this class", { exact: true })
      .fill("Maths, Science, English, Hindi");
  await page.getByRole("button", { name: "Continue to tuition needs" }).click();
  await expect(page.getByLabel("Subject", { exact: true })).toBeVisible();
}
export async function reviewGuardian(
  page: Page,
  notes = "Tuesday and Thursday after 5pm",
) {
  await page.getByRole("button", { name: "Continue to schedule" }).click();
  const local = new Date(Date.now() + 2 * 86400000 + 330 * 60000)
    .toISOString()
    .slice(0, 16);
  await page
    .getByLabel("Preferred start time 1 (IST)", { exact: true })
    .fill(local);
  const remove = page.getByRole("button", {
    name: /Remove availability window/,
  });
  while (await remove.count()) await remove.last().click();
  await page.getByLabel("Schedule notes (optional)").fill(notes);
  await page.getByRole("button", { name: "Review request" }).click();
  await expect(
    page.getByRole("heading", { name: "Review your tuition request" }),
  ).toBeVisible();
}
export async function submitGuardian(page: Page) {
  const pending = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      (/\/onboarding\/parent\/completions$/.test(r.url()) ||
        /\/api\/v1\/requests$/.test(r.url())),
  );
  await page.getByRole("button", { name: "Submit tuition request" }).click();
  await expect(
    page.getByRole("heading", { name: "Your tuition request is saved." }),
  ).toBeVisible();
  const response = await pending;
  expect(response.status()).toBe(201);
  const result = await response.json();
  return result.completedResourceId || result.id;
}
