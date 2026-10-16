import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { validator } from "../helpers/contract";
import { ids } from "../../packages/test-fixtures/src";
const childId = "20000000-0000-4000-8000-000000000095",
  parentId = "10000000-0000-4000-8000-000000000095",
  studentId = "10000000-0000-4000-8000-000000000096",
  familyId = "90000000-0000-4000-8000-000000000095";
async function login(page: Page, name = "Kavita") {
  await page.goto("/login");
  await page.getByText("Development accounts", { exact: true }).click();
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(
    page.getByRole("heading", { name: new RegExp(`Hello, ${name}`) }),
  ).toBeVisible();
}
async function mock(
  page: Page,
  mode:
    | "normal"
    | "stale"
    | "uncertain-revoke"
    | "uncertain-switch"
    | "student"
    | "invitation"
    | "invitation-unknown"
    | "invitation-stale"
    | "invitation-expired"
    | "invitation-status-error"
    | "uncertain-consent"
    | "switch-not-committed"
    | "unverified" = "normal",
) {
  let role = mode === "student" ? "STUDENT" : "GUARDIAN",
    version = 1,
    revoked = false,
    stale = mode === "stale",
    switches = 0,
    revocations = 0,
    invitations = 0,
    activations = 0;
  let consentWithdrawn = false;
  const keys: string[] = [],
    bodies: any[] = [],
    paths: string[] = [];
  const invitationKeys: string[] = [],
    invitationBodies: any[] = [];
  let invitationConflict = mode === "invitation-stale";
  const invitationExpiry = new Date(Date.now() + 86400000).toISOString();
  let sessions = [
    { familyId, expiresAt: new Date(Date.now() + 86400000).toISOString() },
  ];
  const child = {
    id: childId,
    guardianId: parentId,
    alias: "Synthetic Learner",
    grade: 8,
    board: "CBSE",
    studentAccountId: mode.startsWith("invitation") ? null : studentId,
    version: 1,
    studentAccessRevokedAt: null,
  };
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    paths.push(path);
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: role === "STUDENT" ? studentId : parentId,
            name:
              role === "STUDENT" ? "Synthetic Learner" : "Synthetic Guardian",
            role,
            verified: role === "GUARDIAN" && mode !== "unverified",
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (path.endsWith("/dashboard/hiring")) {
      const result = {
        role,
        asOf: new Date().toISOString(),
        definitionVersion: "hiring-v1",
        section: new URL(req.url()).searchParams.get("section") || "ENQUIRIES",
        counts: {
          enquiries: 0,
          openEnquiries: 0,
          pendingResponses: 0,
          termsPending: 0,
          activeArrangements: 0,
        },
        enquiries: [],
        arrangements: [],
        learners: [
          {
            id: child.id,
            alias: child.alias,
            grade: child.grade,
            board: child.board,
          },
        ],
        learnersLimited: false,
        nextCursor: null,
        ...(role === "GUARDIAN"
          ? {
              gate: {
                verified: mode !== "unverified",
                consent: !consentWithdrawn,
                privacyPaused: false,
              },
            }
          : {}),
      };
      const check = validator("HiringDashboard");
      expect(check(result), JSON.stringify(check.errors)).toBe(true);
      return route.fulfill({ json: result });
    }
    if (path.endsWith("/dashboard/learning")) {
      const metrics = {
        lessons: 4,
        classesTaken: 3,
        completedLessons: 3,
        uniqueStudentsTaught: 1,
        cancelled: 0,
        absent: 0,
        disputed: 0,
        attendanceDue: 4,
        attendanceRecorded: 3,
        pendingAttendance: 1,
        pendingConfirmations: 1,
      };
      const demos = {
        scheduled: 0,
        completed: 0,
        cancelled: 0,
        noShow: 0,
        disputed: 0,
      };
      const result = {
        role,
        window: {
          from: new Date(Date.now() - 30 * 86400000).toISOString(),
          to: new Date().toISOString(),
          timezone: "Asia/Kolkata",
          metricVersion: "learning-dashboard-v2",
          basis: "LESSON_STARTS_AT",
          endExclusive: true,
        },
        lastUpdated: new Date().toISOString(),
        metrics,
        activeStudents: 0,
        demos,
        serviceKinds: [{ kind: "RECURRING", metrics }],
        learners: [
          {
            learner: {
              id: child.id,
              alias: child.alias,
              grade: child.grade,
              board: child.board,
            },
            metrics,
            demos,
            assignments: [],
            assignmentsLimited: false,
            nextLesson: null,
          },
        ],
        nextCursor: null,
        ...(role === "GUARDIAN" ? { membership: null } : {}),
      };
      const check = validator("LearningDashboard");
      expect(check(result), JSON.stringify(check.errors)).toBe(true);
      return route.fulfill({ json: result });
    }
    if (path.endsWith("/dashboard"))
      return route.fulfill({
        json: {
          role,
          window: {
            start: new Date(Date.now() - 30 * 86400000).toISOString(),
            end: new Date().toISOString(),
            timezone: "Asia/Kolkata",
            metricVersion: "synthetic-v1",
          },
          metrics: { classesTaken: 3, pendingAttendance: 1, disputed: 0 },
          children: [child],
          teachers: [],
          lessons: [],
          placements: [],
          ...(role === "GUARDIAN"
            ? {
                consent: {
                  withdrawnAt: consentWithdrawn
                    ? new Date().toISOString()
                    : null,
                },
                requests: [],
                reservations: [],
              }
            : {}),
        },
      });
    if (path.endsWith("/children")) {
      const result = { items: [child] };
      const check = validator("Children");
      expect(check(result), JSON.stringify(check.errors)).toBe(true);
      return route.fulfill({ json: result });
    }
    if (path.endsWith("/student-sessions")) {
      if (req.method() === "GET") {
        const result = {
          items: sessions,
          childVersion: version,
          accessRevoked: revoked,
        };
        const check = validator("StudentSessions");
        expect(check(result), JSON.stringify(check.errors)).toBe(true);
        return route.fulfill({ json: result });
      }
      switches++;
      if (mode === "switch-not-committed")
        return route.fulfill({
          status: 503,
          json: {
            code: "UNAVAILABLE",
            message: "Synthetic failure before commit",
          },
        });
      expect(req.postDataJSON().expectedVersion).toBe(version);
      role = "STUDENT";
      version++;
      if (mode === "uncertain-switch")
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: "unreadable student session",
        });
      return route.fulfill({
        status: 201,
        json: {
          account: { id: studentId, name: child.alias, role, verified: false },
          csrfToken: "synthetic-student-csrf",
        },
      });
    }
    if (path.endsWith("/student-access-revocations")) {
      revocations++;
      keys.push(req.headers()["idempotency-key"]);
      bodies.push(req.postDataJSON());
      if (stale) {
        stale = false;
        version++;
        return route.fulfill({
          status: 409,
          json: { code: "CONFLICT", message: "Student access has changed." },
        });
      }
      if (!(mode === "uncertain-revoke" && revocations > 1)) {
        expect(req.postDataJSON().expectedVersion).toBe(version);
        sessions = [];
        revoked = req.postDataJSON().familyId === null;
        version++;
      }
      if (mode === "uncertain-revoke" && revocations === 1)
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: "unreadable revocation",
        });
      return route.fulfill({
        status: 201,
        json: { status: "REVOKED", childVersion: version },
      });
    }
    if (path.endsWith("/consents/withdraw")) {
      consentWithdrawn = true;
      sessions = [];
      if (mode === "uncertain-consent")
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: "unreadable consent response",
        });
      return route.fulfill({ status: 201, json: { status: "WITHDRAWN" } });
    }
    if (path.endsWith("/invitation")) {
      if (mode === "invitation-status-error")
        return route.fulfill({
          status: 503,
          json: { code: "UNAVAILABLE", message: "Unavailable" },
        });
      return route.fulfill({
        json: {
          state:
            mode === "invitation-expired" && invitations === 0
              ? "EXPIRED"
              : invitations
                ? "ACTIVE"
                : "NONE",
          expiresAt: invitations
            ? invitationExpiry
            : mode === "invitation-expired"
              ? new Date(Date.now() - 3600000).toISOString()
              : null,
          childVersion: version,
        },
      });
    }
    if (path.endsWith("/invitation-replacements")) {
      const body = req.postDataJSON(),
        key = req.headers()["idempotency-key"];
      invitationKeys.push(key);
      invitationBodies.push(body);
      expect(validator("InvitationReplacement")(body)).toBe(true);
      if (invitationConflict) {
        invitationConflict = false;
        version++;
        return route.fulfill({
          status: 409,
          json: {
            code: "CONFLICT",
            message:
              "Learner access changed. Refresh before replacing the invitation.",
          },
        });
      }
      const replay = invitationKeys.slice(0, -1).includes(key);
      if (!replay) {
        expect(body.expectedVersion).toBe(version);
        version++;
        invitations++;
      }
      if (mode === "invitation-unknown" && invitationKeys.length === 1)
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: "unreadable invitation response",
        });
      const result = {
        status: replay ? "CODE_UNAVAILABLE" : "ISSUED",
        token: replay ? null : "synthetic-private-invitation-code",
        expiresAt: invitationExpiry,
        childVersion: version,
      };
      expect(validator("InvitationReplacementResult")(result)).toBe(true);
      return route.fulfill({ status: 201, json: result });
    }
    if (path.endsWith("/invitations/activate")) {
      activations++;
      const body = req.postDataJSON();
      if (body.token !== "synthetic-private-invitation-code")
        return route.fulfill({
          status: 409,
          json: {
            code: "INVITATION_INVALID",
            message:
              "Invitation expired, used, or belongs to another guardian.",
          },
        });
      role = "STUDENT";
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: "unreadable activation",
      });
    }
    return route.fulfill({
      status: 404,
      json: { code: "NOT_FOUND", message: "Synthetic route unavailable" },
    });
  });
  return {
    keys,
    bodies,
    paths,
    invitationKeys,
    invitationBodies,
    getSwitches: () => switches,
    getInvitations: () => invitations,
    getActivations: () => activations,
  };
}
test("real guardian invitation and student device access stay owner-bound and revocable", async ({
  page,
  browser,
}) => {
  await login(page);
  const session = await (await page.request.get("/api/v1/auth/session")).json(),
    alias = `UI Learner ${crypto.randomUUID().slice(0, 8)}`;
  const created = await page.request.post("/api/v1/requests", {
    headers: {
      Origin: "http://localhost:3000",
      "X-CSRF-Token": session.csrfToken,
      "Idempotency-Key": crypto.randomUUID(),
    },
    data: {
      schoolName: "Synthetic school",
      schoolSubjects: ["Maths", "Science", "English"],
      alias,
      grade: 8,
      board: "CBSE",
      subject: "Maths",
      mode: "ONLINE",
      language: "English",
      locality: "Shankar Nagar",
      budgetPaise: 300000,
      schedule: "After school",
    },
  });
  expect(created.status()).toBe(201);
  const child = (await created.json()).childId;
  await page.goto(`/dashboard/family?learner=${child}`);
  await page
    .getByRole("button", { name: "Create first student invitation" })
    .click();
  await page
    .getByRole("checkbox", { name: /I am the learner’s guardian/ })
    .check();
  await page
    .getByRole("button", { name: "Create invitation", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: `Invitation for ${alias}` }),
  ).toBeVisible();
  await expect(page.getByLabel("Private invitation code")).toHaveCount(0);
  await page.getByRole("button", { name: "Reveal invitation code" }).click();
  let token = await page.getByLabel("Private invitation code").inputValue();
  const previousToken = token;
  await page.reload();
  await expect(page.getByLabel("Private invitation code")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Replace student invitation", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: /I am the learner’s guardian/ })
    .check();
  await page
    .getByRole("button", {
      name: "Confirm invitation replacement",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Reveal invitation code" }).click();
  token = await page.getByLabel("Private invitation code").inputValue();
  expect(token).not.toBe(previousToken);
  const context = await browser.newContext();
  const device = await context.newPage();
  try {
    await login(device, "Vivek");
    await device.goto("http://localhost:3000/onboarding/student");
    await device.getByLabel("Guardian invitation code").fill(token);
    await device
      .getByRole("checkbox", { name: /I am the inviting guardian/ })
      .check();
    await device
      .getByRole("button", { name: "Authorize student access" })
      .click();
    await expect(
      device.getByText(
        "Invitation expired, used, or belongs to another guardian.",
      ),
    ).toBeVisible();
    await expect(device.getByLabel("Guardian invitation code")).toHaveValue(
      token,
    );
    await login(device);
    await device.goto("http://localhost:3000/onboarding/student");
    await device.getByLabel("Guardian invitation code").fill(token);
    await device
      .getByRole("checkbox", { name: /I am the inviting guardian/ })
      .check();
    await device
      .getByRole("button", { name: "Authorize student access" })
      .click();
    await expect(
      device.getByRole("heading", { name: "Set up your student space." }),
    ).toBeVisible();
    await device
      .getByLabel("How do you like to learn? (optional)")
      .fill("More worked examples, please.");
    await device
      .getByRole("checkbox", {
        name: "These education details are correct",
        exact: true,
      })
      .check();
    await device.getByRole("radio", { name: /I need guardian help/ }).check();
    await device
      .getByRole("button", { name: "Review student setup", exact: true })
      .click();
    await device
      .getByRole("button", {
        name: "Confirm and save student setup",
        exact: true,
      })
      .click();
    await expect(
      device.getByRole("heading", {
        name: "Your student setup is saved.",
        exact: true,
      }),
    ).toBeVisible();
    await device.reload();
    await expect(
      device.getByLabel("How do you like to learn? (optional)"),
    ).toHaveValue("More worked examples, please.");
    await device
      .getByRole("checkbox", {
        name: "These education details are correct",
        exact: true,
      })
      .check();
    await device.getByRole("radio", { name: /I need guardian help/ }).check();
    await device
      .getByRole("button", { name: "Review student setup", exact: true })
      .click();
    await device
      .getByRole("button", {
        name: "Confirm and save student setup",
        exact: true,
      })
      .click();
    await expect(
      device.getByRole("heading", {
        name: "Your student setup is saved.",
        exact: true,
      }),
    ).toBeVisible();
    await device
      .getByRole("link", { name: "Open dashboard", exact: true })
      .click();
    await expect(
      device.getByRole("heading", { name: new RegExp(`Hello, ${alias}`) }),
    ).toBeVisible();
    await expect(
      device.getByRole("link", { name: "Learners & access", exact: true }),
    ).toHaveCount(0);
    await expect(
      device.getByRole("link", { name: "Private notes", exact: true }),
    ).toHaveCount(0);
    expect((await device.request.get("/api/v1/notes")).status()).toBe(403);
    const replay = await page.request.post("/api/v1/invitations/activate", {
      headers: {
        Origin: "http://localhost:3000",
        "X-CSRF-Token": session.csrfToken,
      },
      data: { token },
    });
    expect(replay.status()).toBe(409);
    await page.getByRole("button", { name: "Refresh student access" }).click();
    await expect(
      page.getByRole("button", { name: `Authorize this device for ${alias}` }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Revoke all student access", exact: true })
      .click();
    await page
      .getByLabel("Reason for revoking access")
      .fill("Remove the test student device");
    await page
      .getByRole("checkbox", { name: /I understand which student access/ })
      .check();
    await page
      .getByRole("button", { name: "Confirm access revocation" })
      .click();
    await expect(
      page.getByText(
        "All student access revoked. A guardian must authorize access again.",
      ),
    ).toBeVisible();
    expect((await device.request.get("/api/v1/dashboard")).status()).toBe(401);
    await login(device);
    await device.goto(
      `http://localhost:3000/dashboard/family?learner=${child}`,
    );
    await device
      .getByRole("button", { name: `Authorize this device for ${alias}` })
      .click();
    await device
      .getByRole("checkbox", { name: /I am the learner’s guardian/ })
      .check();
    await device
      .getByRole("button", { name: "Confirm student device switch" })
      .click();
    await expect(
      device.getByRole("heading", {
        name: "These controls belong to your guardian.",
      }),
    ).toBeVisible();
    const current = await (
      await device.request.get("/api/v1/auth/session")
    ).json();
    expect(current.account.role).toBe("STUDENT");
    expect(current.account.id).not.toBe(ids.student);
  } finally {
    await context.close();
  }
});
test("uncertain revocation keeps payload and retry key, freezes learner switching and consent controls", async ({
  page,
}) => {
  const state = await mock(page, "uncertain-revoke");
  await page.goto("/dashboard/family");
  await page
    .getByRole("button", { name: "Revoke all student access", exact: true })
    .click();
  await page
    .getByLabel("Reason for revoking access")
    .fill("A device is no longer used");
  await page
    .getByRole("checkbox", { name: /I understand which student access/ })
    .check();
  await page.getByRole("button", { name: "Confirm access revocation" }).click();
  await expect(
    page.getByText(/We couldn’t confirm the revocation/),
  ).toBeVisible();
  await expect(page.getByLabel("Choose a learner")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Withdraw guardian consent" }),
  ).toBeDisabled();
  await expect(page.getByLabel("Reason for revoking access")).toHaveValue(
    "A device is no longer used",
  );
  await page.getByRole("button", { name: "Retry access revocation" }).click();
  await expect(
    page.getByText(
      "All student access revoked. A guardian must authorize access again.",
    ),
  ).toBeVisible();
  expect(state.keys).toHaveLength(2);
  expect(state.keys[0]).toBe(state.keys[1]);
  expect(state.bodies[0]).toEqual(state.bodies[1]);
  await expect(page.getByLabel("Choose a learner")).toBeEnabled();
});
test("stale selected-session revocation preserves reason and uses the refreshed learner version", async ({
  page,
}) => {
  const state = await mock(page, "stale");
  await page.goto("/dashboard/family");
  await page.getByRole("button", { name: "Revoke session 90000000" }).click();
  await page
    .getByLabel("Reason for revoking access")
    .fill("Remove this session only");
  await page
    .getByRole("checkbox", { name: /I understand which student access/ })
    .check();
  await page.getByRole("button", { name: "Confirm access revocation" }).click();
  await expect(page.getByText("Student access has changed.")).toBeVisible();
  await page.getByRole("button", { name: "Refresh student access" }).click();
  await expect(page.getByLabel("Reason for revoking access")).toHaveValue(
    "Remove this session only",
  );
  await page.getByRole("button", { name: "Confirm access revocation" }).click();
  await expect(
    page.getByText("Selected student session revoked."),
  ).toBeVisible();
  expect(state.bodies[1]).toMatchObject({ expectedVersion: 2, familyId });
});
test("an unreadable device-switch response checks the session instead of repeating authorization", async ({
  page,
}) => {
  const state = await mock(page, "uncertain-switch");
  await page.goto("/dashboard/family");
  await page
    .getByRole("button", {
      name: "Authorize this device for Synthetic Learner",
    })
    .click();
  await page
    .getByRole("checkbox", { name: /I am the learner’s guardian/ })
    .check();
  await page
    .getByRole("button", { name: "Confirm student device switch" })
    .click();
  await expect(
    page.getByText(/We couldn’t confirm the device switch/),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Private notes", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Guardian consent" }),
  ).toHaveCount(0);
  let inspections = 0;
  await page.route("**/auth/session", async (route) => {
    inspections++;
    if (inspections === 1)
      return route.fulfill({
        status: 503,
        json: {
          code: "UNAVAILABLE",
          message: "Session inspection is unavailable. Retry later.",
        },
      });
    return route.fallback();
  });
  await page.getByRole("button", { name: "Check device access" }).click();
  await expect(
    page.getByText("Session inspection is unavailable. Retry later."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Private notes", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Check device access" }).click();
  await expect(
    page.getByRole("heading", {
      name: "These controls belong to your guardian.",
    }),
  ).toBeVisible();
  expect(state.getSwitches()).toBe(1);
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Your next step in learning." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Private notes", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("Your family’s learning, together.")).toHaveCount(
    0,
  );
});
test("private invitation stays out of storage and links; activation rejects invalid codes and recovers an unknown result", async ({
  page,
}) => {
  const state = await mock(page, "invitation");
  await page.goto("/dashboard/family");
  await page
    .getByRole("button", { name: "Create first student invitation" })
    .click();
  await page
    .getByRole("checkbox", { name: /I am the learner’s guardian/ })
    .check();
  await page
    .getByRole("button", { name: "Create invitation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Reveal invitation code" }),
  ).toBeVisible();
  await expect(page.getByLabel("Private invitation code")).toHaveCount(0);
  await page.getByRole("button", { name: "Reveal invitation code" }).click();
  await expect(page.getByLabel("Private invitation code")).toHaveValue(
    "synthetic-private-invitation-code",
  );
  expect(
    await page.evaluate(() => JSON.stringify([localStorage, sessionStorage])),
  ).not.toContain("synthetic-private-invitation-code");
  expect(
    await page
      .locator("a")
      .evaluateAll((a) => a.map((x) => (x as HTMLAnchorElement).href)),
  ).not.toEqual(
    expect.arrayContaining([
      expect.stringContaining("synthetic-private-invitation-code"),
    ]),
  );
  await page.reload();
  await expect(page.getByLabel("Private invitation code")).toHaveCount(0);
  expect(state.getInvitations()).toBe(1);
  await page.goto("/onboarding/student");
  await page.getByRole("button", { name: "Authorize student access" }).click();
  expect(state.getActivations()).toBe(0);
  await expect(page.getByLabel("Guardian invitation code")).toBeFocused();
  await expect(page.getByLabel("Guardian invitation code")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(
    page.getByText(
      "Enter the invitation code and confirm the intended student device.",
    ),
  ).toBeVisible();
  await page.getByLabel("Guardian invitation code").fill("expired-code");
  await page
    .getByRole("checkbox", { name: /I am the inviting guardian/ })
    .check();
  await page.getByRole("button", { name: "Authorize student access" }).click();
  await expect(
    page.getByText("Invitation expired, used, or belongs to another guardian."),
  ).toBeVisible();
  await expect(page.getByLabel("Guardian invitation code")).toHaveValue(
    "expired-code",
  );
  await page
    .getByLabel("Guardian invitation code")
    .fill("synthetic-private-invitation-code");
  await page.getByRole("button", { name: "Authorize student access" }).click();
  await expect(page.getByText(/We couldn’t confirm activation/)).toBeVisible();
  await page.getByRole("button", { name: "Check device access" }).click();
  await expect(
    page.getByRole("heading", { name: "Set up your student space." }),
  ).toBeVisible();
  expect(state.getActivations()).toBe(2);
});
test("guardian overview and access confirmation work on mobile with no serious accessibility findings", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Your family’s learning, together." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Manage Synthetic Learner’s access" }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: "test-results/family-overview-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: "test-results/family-overview-mobile.png",
    fullPage: true,
  });
  const inspect = async () => {
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
  };
  await inspect();
  await page
    .getByRole("link", { name: "Manage Synthetic Learner’s access" })
    .click();
  await page
    .getByRole("button", { name: "Revoke all student access", exact: true })
    .click();
  await inspect();
  await page.screenshot({
    path: "test-results/family-access-mobile.png",
    fullPage: true,
  });
  await page.goto("/onboarding/student");
  await inspect();
  await page.screenshot({
    path: "test-results/student-activation-mobile.png",
    fullPage: true,
  });
});
test("student overview and guardian-only access route never fetch family controls", async ({
  page,
}) => {
  const state = await mock(page, "student");
  await page.goto("/dashboard");
  await expect(
    page.getByRole("link", { name: "Learning preferences", exact: true }),
  ).toHaveAttribute("href", "/onboarding/student");
  await expect(
    page.getByRole("heading", { name: "Your next step in learning." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Learners & access", exact: true }),
  ).toHaveCount(0);
  await page.goto("/dashboard/family");
  await expect(
    page.getByRole("heading", {
      name: "These controls belong to your guardian.",
    }),
  ).toBeVisible();
  expect(state.paths.filter((p) => p.includes("/children"))).toEqual([]);
});

test("uncertain consent withdrawal blocks student changes and recovers by reading current consent", async ({
  page,
}) => {
  await mock(page, "uncertain-consent");
  await page.goto("/dashboard/family");
  await page.getByRole("button", { name: "Withdraw guardian consent" }).click();
  await page
    .getByRole("checkbox", { name: /I understand that withdrawal pauses/ })
    .check();
  await page
    .getByRole("button", { name: "Confirm consent withdrawal" })
    .click();
  await expect(page.getByText(/We couldn’t confirm withdrawal/)).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Authorize this device for Synthetic Learner",
    }),
  ).toBeDisabled();
  await expect(page.getByLabel("Choose a learner")).toBeDisabled();
  await page.getByRole("button", { name: "Check consent status" }).click();
  await expect(
    page.getByText(
      "Consent is pending or withdrawn. New matching and student authorization remain paused.",
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Choose a learner")).toBeEnabled();
  await expect(
    page.getByRole("button", {
      name: "Authorize this device for Synthetic Learner",
    }),
  ).toBeDisabled();
});
test("an uncommitted device switch returns to current guardian access without repeating authorization", async ({
  page,
}) => {
  const state = await mock(page, "switch-not-committed");
  await page.goto("/dashboard/family");
  await page
    .getByRole("button", {
      name: "Authorize this device for Synthetic Learner",
    })
    .click();
  await page
    .getByRole("checkbox", { name: /I am the learner’s guardian/ })
    .check();
  await page
    .getByRole("button", { name: "Confirm student device switch" })
    .click();
  await expect(
    page.getByText(/We couldn’t confirm the device switch/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Check device access" }).click();
  await expect(
    page.getByText(/This browser is still signed in as the guardian/),
  ).toBeVisible();
  await expect(page.getByLabel("Choose a learner")).toBeEnabled();
  await expect(
    page.getByRole("button", {
      name: "Authorize this device for Synthetic Learner",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm student device switch" }),
  ).toHaveCount(0);
  expect(state.getSwitches()).toBe(1);
});

test("unverified guardians cannot open learner controls or authorize student access", async ({
  page,
}) => {
  const state = await mock(page, "unverified");
  await page.goto("/dashboard/family");
  await expect(
    page.getByRole("heading", { name: "Guardian verification is pending." }),
  ).toBeVisible();
  expect(state.paths.filter((p) => p.includes("/children"))).toEqual([]);
  await page.goto("/onboarding/student");
  await expect(page.getByLabel("Guardian invitation code")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Authorize student access" }),
  ).toBeDisabled();
});

test("unknown invitation creation retries metadata only then requires acknowledged replacement", async ({
  page,
}) => {
  const state = await mock(page, "invitation-unknown");
  await page.goto("/dashboard/family");
  await page
    .getByRole("button", { name: "Create first student invitation" })
    .click();
  await page
    .getByRole("checkbox", { name: /I am the learner’s guardian/ })
    .check();
  await page
    .getByRole("button", { name: "Create invitation", exact: true })
    .click();
  await expect(
    page.getByText(/We couldn’t confirm the invitation/),
  ).toBeVisible();
  await expect(page.getByLabel("Choose a learner")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Refresh invitation status" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Retry invitation request" }).click();
  await expect(
    page.getByText(/The request was already completed/),
  ).toBeVisible();
  expect(state.getInvitations()).toBe(1);
  expect(state.invitationKeys[0]).toBe(state.invitationKeys[1]);
  expect(state.invitationBodies[0]).toEqual(state.invitationBodies[1]);
  await expect(
    page.getByRole("button", { name: "Reveal invitation code" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Refresh invitation status" }).click();
  await page
    .getByRole("button", { name: "Replace student invitation", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Confirm invitation replacement",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: /I am the learner’s guardian/ })
    .check();
  await page
    .getByRole("button", {
      name: "Confirm invitation replacement",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Reveal invitation code" }),
  ).toBeVisible();
  expect(state.getInvitations()).toBe(2);
  expect(state.invitationKeys[2]).not.toBe(state.invitationKeys[0]);
});
test("stale invitation keeps review visible and requires refresh and renewed acknowledgement", async ({
  page,
}) => {
  const state = await mock(page, "invitation-stale");
  await page.goto("/dashboard/family");
  await page
    .getByRole("button", { name: "Create first student invitation" })
    .click();
  await page
    .getByRole("checkbox", { name: /I am the learner’s guardian/ })
    .check();
  await page
    .getByRole("button", { name: "Create invitation", exact: true })
    .click();
  await expect(page.getByText(/Learner access changed/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create invitation", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Refresh invitation status" }).click();
  await page
    .getByRole("button", { name: "Create first student invitation" })
    .click();
  await expect(
    page.getByRole("checkbox", { name: /I am the learner’s guardian/ }),
  ).not.toBeChecked();
  await page
    .getByRole("checkbox", { name: /I am the learner’s guardian/ })
    .check();
  await page
    .getByRole("button", { name: "Create invitation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Reveal invitation code" }),
  ).toBeVisible();
  expect(state.invitationBodies[1].expectedVersion).toBe(2);
});
test("expired invitation replacement is clear, cancellable and accessible on mobile", async ({
  page,
}) => {
  const state = await mock(page, "invitation-expired");
  await page.goto("/dashboard/family");
  await expect(
    page.getByText("Invitation expired", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Replace student invitation", exact: true })
    .click();
  await expect(page.getByText(/All earlier codes stop working/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(state.getInvitations()).toBe(0);
  await page
    .getByRole("button", { name: "Replace student invitation", exact: true })
    .click();
  await page.screenshot({
    path: "test-results/invitation-replacement-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/invitation-replacement-mobile.png",
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
test("invitation status failure blocks creation and replacement", async ({
  page,
}) => {
  await mock(page, "invitation-status-error");
  await page.goto("/dashboard/family");
  await expect(
    page.getByText(/Invitation status could not be loaded/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Refresh invitation status" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Create first student invitation" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Replace student invitation",
      exact: true,
    }),
  ).toHaveCount(0);
});
