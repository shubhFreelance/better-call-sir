import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { Pool } from "pg";
import { verifiedStaffSession, cleanupStaffFixtures } from "./staff-fixture";
const origin = "http://localhost:3000";
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1x8AAAAASUVORK5CYII=",
  "base64",
);
async function post(
  client: APIRequestContext,
  path: string,
  body: unknown,
  csrf?: string,
) {
  const response = await client.post("/api/v1" + path, {
    data: body,
    headers: {
      Origin: origin,
      "Idempotency-Key": randomUUID(),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
  });
  expect(response.status()).toBe(201);
  return response.json();
}
test("real guardian report reaches the admin queue and downloads as the original private image after worker scan", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  const staff = await browser.newContext({ baseURL: origin }),
    anonymous = await browser.newContext({ baseURL: origin });
  let accountId: string | undefined,
    verification: any,
    csrf: string | undefined;
  try {
    const email = "report-delivery-" + randomUUID() + "@example.test",
      learner = "Scan check " + randomUUID().slice(0, 8);
    const challenge = await post(page.request, "/auth/otp/request", {
      email,
      locale: "en",
    });
    expect(challenge.status).toBe("SANDBOX");
    const session = await post(page.request, "/auth/otp/verify", {
      email,
      name: "Synthetic report delivery guardian",
      code: challenge.developmentCode,
    });
    accountId = session.account.id;
    csrf = session.csrfToken;
    verification = await post(
      page.request,
      "/guardian-verifications",
      {
        guardianName: session.account.name,
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
      csrf,
    );
    verification = await post(
      page.request,
      `/guardian-verifications/${verification.id}/evidence`,
      {
        expectedVersion: verification.version,
        mediaType: "image/png",
        contentBase64: image.toString("base64"),
      },
      csrf,
    );
    expect(verification.evidence.status).toBe("QUARANTINED");
    verification = await post(
      page.request,
      `/guardian-verifications/${verification.id}/submissions`,
      { expectedVersion: verification.version, confirmed: true },
      csrf,
    );
    expect(verification.status).toBe("PENDING");
    const admin = await verifiedStaffSession(staff.request);
    expect(admin.account.role).toBe("ADMIN");
    const adminPage = await staff.newPage();
    await adminPage.goto("/guardian-verification");
    const row = adminPage
      .locator(".staff-person")
      .filter({
        has: adminPage.getByRole("heading", { name: learner, exact: true }),
      });
    await expect(row).toBeVisible();
    await row
      .getByRole("button", { name: "Review guardian evidence", exact: true })
      .click();
    await expect(
      adminPage.getByRole("button", {
        name: "See uploaded document",
        exact: true,
      }),
    ).toBeVisible({ timeout: 45000 });
    await adminPage.getByRole("button",{name:"See uploaded document",exact:true}).click();
    await expect(adminPage.getByRole("dialog").getByRole("img")).toBeVisible();
    expect(await adminPage.getByRole("dialog").getByRole("img").evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth>0)).toBe(true);
    await adminPage.keyboard.press("Escape");
    const path =
      "/api/v1/guardian-evidence/" +
      verification.currentEvidenceId +
      "/content";
    const response = await staff.request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(response.headers()["content-type"]).toContain("image/png");
    expect(
      createHash("sha256")
        .update(await response.body())
        .digest("hex"),
    ).toBe(createHash("sha256").update(image).digest("hex"));
    expect((await anonymous.request.get(path)).status()).toBe(401);
    await adminPage
      .locator(".guardian-verification-editor")
      .screenshot({ path: "test-results/guardian-admin-report-real.png" });
  } finally {
    if (verification && csrf) {
      const current = await page.request.get(
        "/api/v1/guardian-verifications/" + verification.id,
      );
      if (current.ok()) {
        const row = await current.json();
        if (["DRAFT", "PENDING", "CHANGES_REQUESTED"].includes(row.status))
          await post(
            page.request,
            `/guardian-verifications/${row.id}/cancellations`,
            { expectedVersion: row.version, confirmed: true },
            csrf,
          );
      }
    }
    if (accountId) {
      const env = parseEnv(readFileSync(".env", "utf8")),
        db = new Pool({ connectionString: env.DATABASE_URL });
      try {
        await db.query('UPDATE "Account" SET disabled=true WHERE id=$1', [
          accountId,
        ]);
        await db.query(
          'UPDATE "Session" SET revoked=true WHERE "accountId"=$1',
          [accountId],
        );
      } finally {
        await db.end();
      }
    }
    await cleanupStaffFixtures();
    await staff.close();
    await anonymous.close();
  }
});
