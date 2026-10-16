import { test, expect } from "@playwright/test";
import { operationValidator } from "../helpers/contract";
test("production independent hiring consent and optional support hydrate and submit explicit scopes under strict CSP", async ({
  page,
}) => {
  const id = "90000000-0000-4000-8000-000000000987",
    enquiry = "90000000-0000-4000-8000-000000000986",
    accountId = "10000000-0000-4000-8000-000000000987",
    teacherId = "20000000-0000-4000-8000-000000000987",
    errors: string[] = [],
    writes: { path: string; body: any }[] = [];
  const arrangement = {
    id,
    enquiryId: enquiry,
    teacherId,
    terms: {
      policyVersion: "independent-hiring-development-v1",
      subject: "Maths",
      mode: "ONLINE",
      language: "English",
      monthlyPaise: 200000,
      platformFeePaise: 50000,
      currency: "INR",
      lockInDays: 0,
      lockInEnforced: false,
      demoAvailable: true,
      classesBooked: false,
      contactSharing: "EMAIL_AFTER_MUTUAL_CONFIRMATION",
    },
    status: "TERMS_PENDING",
    studentAcceptedAt: null as string | null,
    teacherAcceptedAt: null,
    closedAt: null,
    closureReason: null,
    version: 1,
    createdAt: "2026-10-16T00:00:00.000Z",
  };
  let grant: any = null;
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: accountId,
            name: "Synthetic production learner",
            role: "INDEPENDENT_STUDENT",
            verified: false,
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (req.method() === "POST") {
      const body = req.postDataJSON();
      writes.push({ path, body });
      expect(req.headers()["x-csrf-token"]).toBe("synthetic-csrf");
      expect(req.headers()["idempotency-key"]).toBeTruthy();
      if (path.endsWith("/acceptances")) {
        expect(
          operationValidator(
            "/student-arrangements/{id}/acceptances",
            "post",
            "201",
          )({
            ...arrangement,
            studentAcceptedAt: new Date().toISOString(),
            version: 2,
          }),
        ).toBe(true);
        expect(body).toEqual({
          expectedVersion: 1,
          confirmed: true,
          policyVersion: "independent-hiring-development-v1",
          contactShareAccepted: true,
        });
        arrangement.studentAcceptedAt = new Date().toISOString();
        arrangement.version = 2;
        return route.fulfill({ status: 201, json: arrangement });
      }
      if (path.endsWith("/student-guardian-grants")) {
        expect(body.supportMode).toBe("ADVICE");
        expect(body.confirmed).toBe(true);
        grant = {
          id,
          studentAccountId: accountId,
          recipientEmail: body.email,
          supportMode: "ADVICE",
          status: "PENDING",
          acceptedById: null,
          expiresAt: "2026-10-23T00:00:00.000Z",
          version: 1,
          createdAt: "2026-10-16T00:00:00.000Z",
        };
        return route.fulfill({ status: 201, json: grant });
      }
    }
    if (path.endsWith("/student-arrangements/" + id))
      return route.fulfill({ json: arrangement });
    if (path.endsWith("/student-arrangements"))
      return route.fulfill({
        json: { items: [arrangement], nextCursor: null },
      });
    if (path.endsWith("/shortlist"))
      return route.fulfill({
        json: {
          id: enquiry,
          version: 4,
          matchStatus: "MATCHED",
          runId: null,
          selectedCandidateId: id,
          items: [],
        },
      });
    if (path.endsWith("/student-guardian-grants"))
      return route.fulfill({
        json: { items: grant ? [grant] : [], nextCursor: null },
      });
    return route.fulfill({
      status: 403,
      json: { code: "FORBIDDEN", message: "Unexpected private request" },
    });
  });
  await page.setViewportSize({ width: 360, height: 800 });
  const response = await page.goto(
    "/dashboard/student-arrangements?arrangement=" + id,
  );
  expect(response!.headers()["content-security-policy"]).not.toContain(
    "unsafe-eval",
  );
  await expect(
    page.getByRole("button", { name: "Accept reviewed terms" }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "I accept these exact terms", exact: false })
    .check();
  await page.getByRole("button", { name: "Accept reviewed terms" }).click();
  await expect(
    page.getByText("Student side accepted", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Show agreed contact email" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/independent-hiring-production-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Learning support", exact: true })
    .click();
  await page.getByRole("button", { name: "Invite a supporter" }).click();
  await page
    .getByLabel("Supporter’s account email")
    .fill("synthetic-supporter@example.test");
  await page
    .getByRole("button", { name: "Review invitation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Create invitation" }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "I trust this person", exact: false })
    .check();
  await page.getByRole("button", { name: "Create invitation" }).click();
  await expect(
    page.getByRole("heading", {
      name: "synthetic-supporter@example.test",
      exact: true,
    }),
  ).toBeVisible();
  expect(writes).toHaveLength(2);
  expect(errors).toEqual([]);
});
