import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { validator, operationValidator } from "./contract";
import { checkHindi } from "./hindi";
import { hindiMessages } from "../../apps/web/app/hindi-messages";
const actor = "10000000-0000-4000-8000-000000000911",
  guardian = "10000000-0000-4000-8000-000000000912",
  id = "20000000-0000-4000-8000-000000000911",
  evidenceId = "30000000-0000-4000-8000-000000000911";
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1x8AAAAASUVORK5CYII=",
  "base64",
);
function record(overrides: any = {}) {
  const now = new Date().toISOString();
  return {
    id,
    learnerId: null,
    guardianId: guardian,
    region: "Raipur",
    guardianName: "Synthetic Guardian",
    learnerName: "Synthetic Learner",
    relationship: "PARENT",
    ageBand: "UNDER_15",
    managementMode: "SHARED",
    studentEmail: null,
    studentAccountId: null,
    studentAcknowledgedAt: null,
    acknowledgmentMethod: "STAFF_CALL",
    guardianAcknowledgedAt: now,
    documentNamesGuardian: false,
    currentEvidenceId: null,
    status: "DRAFT",
    reason: null,
    reviewerId: null,
    reviewReference: null,
    reviewedAt: null,
    callMethod: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    evidence: null,
    policyVersion: "guardian-verification-v1",
    ...overrides,
  };
}
async function setup(
  page: Page,
  options: {
    role?: string;
    empty?: boolean;
    uncertain?: boolean;
    readFailure?: boolean;
    history?: boolean;
    mfaPending?: boolean;
    deleted?: boolean;
  } = {},
) {
  const role = options.role || "GUARDIAN",
    staff = ["ADMIN", "REVIEWER"].includes(role);
  let fail = false,
    aborted = false;
  let row = record({
    guardianId: staff || role === "STUDENT" ? guardian : actor,
    ...(staff
      ? {
          status: "PENDING",
          currentEvidenceId: evidenceId,
          evidence: {
            id: evidenceId,
            status: "CLEAN",
            mediaType: "image/png",
            version: 2,
            uploadedAt: new Date().toISOString(),
          },
        }
      : {}),
    ...(role === "STUDENT"
      ? {
          studentEmail: "student@example.test",
          acknowledgmentMethod: "STUDENT_ACCOUNT",
        }
      : {}),
  });
  if (options.deleted)
    row = {
      ...row,
      status: "DELETED",
      guardianName: "Deleted guardian",
      learnerName: "Deleted learner",
    };
  let present = !options.empty;
  const writes: { path: string; body: any; key: string }[] = [],
    reads: URL[] = [],
    replays = new Map<string, any>();
  const checked = (schema: string, value: any) => {
    const v = validator(schema);
    expect(v(value), JSON.stringify(v.errors)).toBe(true);
    return value;
  };
  function result() {
    const r = structuredClone(row);
    if (!staff) {
      delete r.reviewReference;
      delete r.reviewerId;
    }
    return checked("GuardianVerification", r);
  }
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      u = new URL(req.url()),
      p = u.pathname;
    if (p.endsWith("/auth/mfa"))
      return route.fulfill({
        json: {
          enabled: true,
          verifiedUntil: options.mfaPending
            ? null
            : new Date(Date.now() + 600000).toISOString(),
          recoveryCodesRemaining: 8,
        },
      });
    if (p.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: actor,
            name:
              role === "STUDENT" ? "Synthetic Student" : "Synthetic Account",
            role,
            verified: false,
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (req.method() === "GET") {
      reads.push(u);
      if (
        fail &&
        (p.includes("guardian-verifications") ||
          p.endsWith("/guardian-verification-invitations"))
      )
        return route.fulfill({
          status: 403,
          json: {
            code: "FORBIDDEN",
            message: "Synthetic backend private detail",
          },
        });
      if (p.endsWith("/guardian-verification-invitations")) {
        const values =
          role === "STUDENT"
            ? [
                checked("GuardianVerificationInvitation", {
                  id: row.id,
                  guardianName: row.guardianName,
                  learnerName: row.learnerName,
                  relationship: row.relationship,
                  ageBand: row.ageBand,
                  managementMode: row.managementMode,
                  studentAcknowledgedAt: row.studentAcknowledgedAt,
                  version: row.version,
                  status: row.status,
                }),
              ]
            : [];
        return route.fulfill({ json: { items: values, nextCursor: null } });
      }
      if (p.endsWith("/guardian-verifications")) {
        if (
          p.includes("/admin/") &&
          u.searchParams.get("status") &&
          u.searchParams.get("status") !== row.status
        )
          return route.fulfill({ json: { items: [], nextCursor: null } });
        const first = present ? [result()] : [],
          last = record({
            id: "20000000-0000-4000-8000-000000000919",
            guardianId: actor,
            learnerName: "Last history learner",
            status: "REJECTED",
          });
        return route.fulfill({
          json: {
            items:
              options.history && u.searchParams.has("cursor") ? [last] : first,
            nextCursor:
              options.history && !u.searchParams.has("cursor") ? row.id : null,
          },
        });
      }
      if (p.endsWith("/guardian-verifications/" + row.id))
        return route.fulfill({ json: result() });
      if (p.endsWith("/children"))
        return route.fulfill({ json: { items: [] } });
      return route.fulfill({ json: { items: [] } });
    }
    const body = req.postDataJSON(),
      key = req.headers()["idempotency-key"];
    writes.push({ path: p, body, key });
    if (replays.has(key))
      return route.fulfill({ status: 201, json: replays.get(key) });
    let schemaPath = "";
    if (p.endsWith("/guardian-verifications") && !p.includes("/admin/")) {
      checked("GuardianVerificationInput", body);
      row = record({ ...body, guardianId: actor });
      delete row.adultDeclaration;
      delete row.authorityDeclaration;
      delete row.verificationPermission;
      present = true;
      schemaPath = "/guardian-verifications";
    } else if (p.endsWith("/evidence")) {
      expect(body.expectedVersion).toBe(row.version);
      expect(body.mediaType).toBe("image/png");
      expect(Buffer.from(body.contentBase64, "base64")).toEqual(image);
      row = {
        ...row,
        currentEvidenceId: evidenceId,
        evidence: {
          id: evidenceId,
          status: "QUARANTINED",
          mediaType: "image/png",
          version: 1,
          uploadedAt: new Date().toISOString(),
        },
        version: row.version + 1,
      };
      schemaPath = "/guardian-verifications/{id}/evidence";
    } else if (p.endsWith("/submissions")) {
      expect(body.expectedVersion).toBe(row.version);
      row = { ...row, status: "PENDING", version: row.version + 1 };
      schemaPath = "/guardian-verifications/{id}/submissions";
    } else if (p.endsWith("/student-acknowledgments")) {
      expect(body.expectedVersion).toBe(row.version);
      row = {
        ...row,
        status: body.decision === "DECLINE" ? "REJECTED" : row.status,
        studentAcknowledgedAt:
          body.decision === "DECLINE" ? null : new Date().toISOString(),
        version: row.version + 1,
      };
      const receipt = {
        id: row.id,
        status: body.decision === "DECLINE" ? "REJECTED" : "ACKNOWLEDGED",
      };
      replays.set(key, receipt);
      return route.fulfill({ status: 201, json: receipt });
    } else if (p.endsWith("/decisions")) {
      checked("GuardianVerificationDecision", body);
      expect(body.expectedVersion).toBe(row.version);
      row = {
        ...row,
        status:
          body.decision === "APPROVE"
            ? "APPROVED"
            : body.decision === "REVOKE"
              ? "REVOKED"
              : body.decision === "REJECT"
                ? "REJECTED"
                : "CHANGES_REQUESTED",
        reason: body.reason,
        reviewReference: "review:private-911",
        reviewerId: actor,
        reviewedAt: new Date().toISOString(),
        callMethod: body.callMethod || null,
        studentAcknowledgedAt: body.studentAcknowledgmentObserved
          ? new Date().toISOString()
          : row.studentAcknowledgedAt,
        version: row.version + 1,
      };
      schemaPath = "/admin/guardian-verifications/{id}/decisions";
    } else if (p.endsWith("/cancellations")) {
      row = { ...row, status: "CANCELLED", version: row.version + 1 };
      schemaPath = "/guardian-verifications/{id}/cancellations";
    } else
      return route.fulfill({
        status: 400,
        json: {
          code: "INVALID_FIXTURE",
          message: "Unexpected synthetic request",
        },
      });
    const value = result(),
      v = operationValidator(schemaPath, "post", "201");
    expect(v(value), JSON.stringify(v.errors)).toBe(true);
    replays.set(key, value);
    if (options.uncertain && !aborted) {
      aborted = true;
      return route.abort("failed");
    }
    if (options.readFailure) fail = true;
    return route.fulfill({ status: 201, json: value });
  });
  await page.goto("/guardian-verification");
  await expect(
    page.getByRole("heading", {
      name: options.mfaPending
        ? "Protect your staff access."
        : "Guardian verification",
      exact: true,
    }),
  ).toBeVisible();
  return {
    writes,
    reads,
    recover: () => {
      fail = false;
    },
    state: () => row,
  };
}
async function openOwner(page: Page) {
  await page
    .getByRole("button", { name: "View verification", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Your relationship verification",
      exact: true,
    }),
  ).toBeVisible();
}
async function openStaff(page: Page) {
  await page
    .getByRole("button", { name: "Review guardian evidence", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("textbox", {
      name: "Feedback for the guardian",
      exact: true,
    }),
  ).toBeVisible();
}
async function staffFields(page: Page) {
  await page
    .getByRole("checkbox", {
      name: "I independently checked adult status and authority. A matching report name alone is insufficient.",
      exact: true,
    })
    .check();
  await page
    .getByRole("combobox", { name: "Completed call review", exact: true })
    .selectOption("VIDEO");
  await page
    .getByRole("checkbox", {
      name: "I observed the student acknowledgment during this call.",
      exact: true,
    })
    .check();
  await page
    .getByRole("textbox", { name: "Feedback for the guardian", exact: true })
    .fill("Synthetic staff approval");
  await page
    .getByRole("textbox", { name: /^Protected review reference/ })
    .fill("review:synthetic");
  await page
    .getByRole("checkbox", {
      name: "I reviewed this learner, guardian, evidence and the exact decision.",
      exact: true,
    })
    .check();
}
export function guardianVerificationTests() {
  test("erased relationship history has localized tombstones and no image or mutation controls", async ({
    page,
  }) => {
    await setup(page, { deleted: true });
    await openOwner(page);
    await page
      .getByRole("button", { name: "Switch English and Hindi", exact: true })
      .click();
    await checkHindi(page);
    await expect(
      page.getByRole("button", {
        name: hindiMessages["Upload school report"],
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", {
        name: hindiMessages["Download private school report"],
        exact: true,
      }),
    ).toHaveCount(0);
  });

  test("staff authenticator verification precedes every guardian review query", async ({
    page,
  }) => {
    const f = await setup(page, { role: "ADMIN", mfaPending: true });
    expect(
      f.reads.filter((u) => u.pathname.includes("guardian-verifications")),
    ).toHaveLength(0);
    await expect(
      page.getByRole("heading", {
        name: "Review the relationship behind the account.",
        exact: true,
      }),
    ).toHaveCount(0);
  });
  for (const role of ["STUDENT", "ADMIN"])
    test(
      role.toLowerCase() +
        " relationship review is fully Hindi and accessible on phones",
      async ({ page }) => {
        await setup(page, { role });
        if (role === "ADMIN") await openStaff(page);
        else
          await page
            .getByRole("button", {
              name: "Review guardian relationship",
              exact: true,
            })
            .click();
        await page
          .getByRole("button", {
            name: "Switch English and Hindi",
            exact: true,
          })
          .click();
        await page.setViewportSize({ width: 360, height: 900 });
        await checkHindi(page);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        const scan = await new AxeBuilder({ page })
          .include(".guardian-verification-workspace")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        expect(
          scan.violations.filter((v) =>
            ["serious", "critical"].includes(v.impact || ""),
          ),
        ).toEqual([]);
        await page
          .locator(
            role === "ADMIN"
              ? ".guardian-verification-editor"
              : ".guardian-acknowledgment",
          )
          .screenshot({
            path: `test-results/guardian-${role.toLowerCase()}-hindi-mobile.png`,
          });
      },
    );

  test("guardian reviews the learner, management choice and separate verification permission before creating a request", async ({
    page,
  }) => {
    const f = await setup(page, { empty: true });
    await page
      .getByRole("button", { name: "Start guardian verification", exact: true })
      .click();
    await page
      .getByLabel("Guardian's full name", { exact: true })
      .fill("Synthetic Parent");
    await page
      .getByLabel("Learner's name on the school report", { exact: true })
      .fill("Synthetic Child");
    await page
      .getByRole("radio", { name: /Guardian and student manage together/ })
      .check();
    await page
      .getByRole("checkbox", {
        name: "I am an adult authorized to act for this learner, and I acknowledge this guardian relationship.",
        exact: true,
      })
      .check();
    await page
      .getByRole("checkbox", {
        name: "I permit private review of these relationship details and the school report for verification. This does not grant learning-data consent.",
        exact: true,
      })
      .check();
    await page
      .getByRole("button", { name: "Review relationship details", exact: true })
      .click();
    expect(f.writes).toHaveLength(0);
    await expect(
      page.getByText("Synthetic Parent · Synthetic Child"),
    ).toBeVisible();
    await page
      .getByRole("checkbox", {
        name: "I reviewed the names, management choice and verification permission.",
        exact: true,
      })
      .check();
    await page
      .getByRole("button", { name: "Save relationship details", exact: true })
      .click();
    await expect(
      page.getByText("Relationship details saved for verification."),
    ).toBeVisible();
    expect(f.writes).toHaveLength(1);
    expect(f.writes[0].body.managementMode).toBe("SHARED");
    expect(f.writes[0].body.verificationPermission).toBe(true);
    expect(f.writes[0].body).not.toHaveProperty("learningConsent");
    await expect(
      page.getByRole("heading", {
        name: "Upload the school report",
        exact: true,
      }),
    ).toBeVisible();
  });
  test("school reports validate type, stay private in quarantine and submit only the recorded current version", async ({
    page,
  }) => {
    const f = await setup(page);
    await openOwner(page);
    const input = page.getByLabel(
      "School marksheet or performance-card image",
      { exact: true },
    );
    await input.setInputFiles({
      name: "not-an-image.html",
      mimeType: "text/html",
      buffer: Buffer.from("bad"),
    });
    await expect(
      page.getByText("Choose a PNG or JPEG image of at most 5 MiB."),
    ).toBeVisible();
    expect(f.writes).toHaveLength(0);
    await input.setInputFiles({
      name: "school-report.png",
      mimeType: "image/png",
      buffer: image,
    });
    await page
      .getByRole("button", { name: "Upload school report", exact: true })
      .click();
    await expect(page.getByText("Scan pending", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Download private school report" }),
    ).toHaveCount(0);
    await page
      .getByRole("checkbox", {
        name: "Send this relationship and its current report to staff for review.",
        exact: true,
      })
      .check();
    await page
      .getByRole("button", { name: "Send for staff review", exact: true })
      .click();
    await expect(
      page.getByText(
        "Verification submitted. Follow acknowledgment, scan and staff-review progress here.",
      ),
    ).toBeVisible();
    expect(f.writes.map((x) => x.body.expectedVersion)).toEqual([1, 2]);
    expect(f.state().status).toBe("PENDING");
  });
  for (const action of ["ACKNOWLEDGE", "DECLINE"])
    test(
      "student " +
        action.toLowerCase() +
        " records the visible guardian and management choice without granting learning consent",
      async ({ page }) => {
        const f = await setup(page, { role: "STUDENT" });
        await page
          .getByRole("button", {
            name: "Review guardian relationship",
            exact: true,
          })
          .click();
        await expect(
          page.getByText("Guardian and student manage together", {
            exact: true,
          }),
        ).toBeVisible();
        await page
          .getByRole("combobox", { name: "Your decision", exact: true })
          .selectOption(action);
        await page
          .getByRole("checkbox", {
            name: "I reviewed this person, the management choice and my decision.",
            exact: true,
          })
          .check();
        await page
          .getByRole("button", {
            name: "Confirm relationship decision",
            exact: true,
          })
          .click();
        await expect(
          page.getByText(
            action === "DECLINE"
              ? "Guardian relationship declined."
              : "Guardian relationship acknowledgment recorded.",
            { exact: true },
          ),
        ).toBeVisible();
        expect(f.writes).toHaveLength(1);
        expect(f.writes[0].body).toEqual({
          expectedVersion: 1,
          decision: action,
          confirmed: true,
        });
        await expect(
          page.getByRole("button", {
            name: "Confirm relationship decision",
            exact: true,
          }),
        ).toHaveCount(0);
      },
    );
  test("staff approval stays blocked until missing-name call review, adult authority and observed acknowledgment are recorded", async ({
    page,
  }) => {
    const f = await setup(page, { role: "REVIEWER" });
    await openStaff(page);
    const approve = page.getByRole("button", {
      name: "Record verification decision",
      exact: true,
    });
    await expect(approve).toBeDisabled();
    await page
      .getByRole("textbox", { name: "Feedback for the guardian", exact: true })
      .fill("Synthetic review");
    await page
      .getByRole("textbox", { name: /^Protected review reference/ })
      .fill("private:record");
    await page
      .getByRole("checkbox", {
        name: "I reviewed this learner, guardian, evidence and the exact decision.",
        exact: true,
      })
      .check();
    await expect(approve).toBeDisabled();
    await staffFields(page);
    await approve.click();
    await expect(
      page.getByText("Guardian verification review recorded."),
    ).toBeVisible();
    expect(f.writes).toHaveLength(1);
    expect(f.writes[0].body.callMethod).toBe("VIDEO");
    expect(f.writes[0].body.adultAndAuthorityChecked).toBe(true);
    expect(f.state().status).toBe("APPROVED");
  });
  test("unknown staff approval retries the already-committed body and key once without allowing another decision", async ({
    page,
  }) => {
    const f = await setup(page, { role: "ADMIN", uncertain: true });
    await openStaff(page);
    await staffFields(page);
    await page
      .getByRole("button", {
        name: "Record verification decision",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", { name: "Retry same decision", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", {
        name: "Feedback for the guardian",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Close evidence review", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Retry same decision", exact: true })
      .click();
    await expect(
      page.getByText("Guardian verification review recorded."),
    ).toBeVisible();
    expect(f.writes).toHaveLength(2);
    expect(f.writes[1]).toEqual(f.writes[0]);
    expect(f.state().version).toBe(2);
  });
  test("confirmed review followed by denied reads hides private details and recovers without another write", async ({
    page,
  }) => {
    const f = await setup(page, { role: "ADMIN", readFailure: true });
    await openStaff(page);
    await staffFields(page);
    await page
      .getByRole("button", {
        name: "Record verification decision",
        exact: true,
      })
      .click();
    await expect(
      page.getByText(
        "Private verification details are unavailable. Refresh before making another change.",
      ),
    ).toBeVisible();
    await expect(page.getByText("review:private-911")).toHaveCount(0);
    await expect(
      page.getByText("Synthetic backend private detail"),
    ).toHaveCount(0);
    f.recover();
    await page
      .getByRole("button", {
        name: "Refresh verification details",
        exact: true,
      })
      .click();
    await expect(
      page.getByText("review:private-911", { exact: false }),
    ).toBeVisible();
    expect(f.writes).toHaveLength(1);
    await expect(
      page.getByRole("button", {
        name: "Record verification decision",
        exact: true,
      }),
    ).toHaveCount(0);
  });
  test("guardian history reaches later records and explicit close restores heading focus", async ({
    page,
  }) => {
    await setup(page, { history: true });
    await page
      .getByRole("button", { name: "Load more records", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Last history learner", exact: true }),
    ).toBeVisible();
    await openOwner(page);
    await page
      .getByRole("button", { name: "Close verification", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "A trusted adult, a clear relationship.",
        exact: true,
      }),
    ).toBeFocused();
  });
  test("Hindi relationship form fits phones and supports keyboard and accessible controls", async ({
    page,
  }) => {
    await setup(page, { empty: true });
    await page
      .getByRole("button", { name: "Start guardian verification", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Switch English and Hindi", exact: true })
      .click();
    await checkHindi(page);
    for (const width of [320, 360, 390, 430]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        (await page
          .getByRole("button", {
            name: hindiMessages["Review relationship details"],
            exact: true,
          })
          .boundingBox())!.height,
      ).toBeGreaterThanOrEqual(44);
    }
    const name = page.getByLabel(hindiMessages["Guardian's full name"], {
      exact: true,
    });
    await name.focus();
    await expect(name).toBeFocused();
    const axe = await new AxeBuilder({ page })
      .include(".guardian-verification-workspace")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      axe.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact || ""),
      ),
    ).toEqual([]);
    await page.locator(".guardian-verification-editor").screenshot({
      path: "test-results/guardian-verification-hindi-mobile.png",
    });
  });
}
