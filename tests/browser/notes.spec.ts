import { ids } from "../../packages/test-fixtures/src";
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { validator } from "../helpers/contract";
import type { components } from "@bcs/api-client";
const guardian = "10000000-0000-4000-8000-000000000071",
  child = "20000000-0000-4000-8000-000000000071",
  teacher = "30000000-0000-4000-8000-000000000071",
  noteId = "40000000-0000-4000-8000-000000000071";
const now = () => new Date().toISOString();
async function mock(page: Page, mode = "normal", role = "GUARDIAN") {
  let note: components["schemas"]["NoteRecord"] = {
    id: noteId,
    childId: child,
    text: "Aarav feels more confident when a new topic starts with one worked example. Please give him a moment to explain his thinking before the next question.",
    sharedTeacherId: null,
    acknowledgedAt: null,
    version: 1,
    createdAt: now(),
    learner: { alias: "Aarav", grade: 8, board: "CBSE" },
    sharedTeacher: null,
    sharingActive: false,
  };
  if (
    [
      "shared",
      "edit",
      "teacher",
      "ack",
      "withdraw",
      "uncertain-withdraw",
    ].includes(mode) ||
    role === "TEACHER"
  )
    note = {
      ...note,
      sharedTeacherId: teacher,
      sharedTeacher: { id: teacher, name: "Ananya Sharma" },
      sharingActive: true,
      version: 2,
    };
  if (mode === "edit") note = { ...note, acknowledgedAt: now(), version: 3 };
  let notes =
      mode === "empty" || mode === "uncertain-create" || mode === "no-child"
        ? []
        : [note],
    writes: { path: string; body: any; key: string }[] = [],
    paths: string[] = [],
    replays = new Map<string, any>(),
    stale = mode === "stale-edit",
    failRead = false;
  const check = (name: string, data: any) => {
    const valid = validator(name);
    expect(valid(data), JSON.stringify(valid.errors)).toBe(true);
    return data;
  };
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    paths.push(path);
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: guardian,
            name:
              role === "TEACHER"
                ? "Ananya · synthetic teacher"
                : "Kavita · synthetic guardian",
            role,
            verified: mode !== "unverified",
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (path.endsWith("/dashboard"))
      return route.fulfill({
        json: {
          role,
          window: {
            start: now(),
            end: now(),
            timezone: "Asia/Kolkata",
            metricVersion: "synthetic",
          },
          metrics: {},
          children:
            mode === "no-child"
              ? []
              : [{ id: child, alias: "Aarav", grade: 8, board: "CBSE" }],
          teachers: [{ id: teacher, name: "Ananya Sharma" }],
          placements: [
            {
              id: "50000000-0000-4000-8000-000000000071",
              childId: child,
              teacherId: teacher,
              status: mode === "no-teacher" ? "CLOSED" : "ACTIVE",
            },
          ],
          consent: { withdrawnAt: mode === "no-consent" ? now() : null },
        },
      });
    if (req.method() === "GET" && path.endsWith("/notes")) {
      if (failRead) {
        failRead = false;
        return route.fulfill({
          status: 503,
          json: {
            code: "UNAVAILABLE",
            message: "Current notes could not be loaded.",
          },
        });
      }
      return route.fulfill({ json: check("NoteRecords", { items: notes }) });
    }
    if (req.method() === "POST") {
      const body = req.postDataJSON(),
        key = req.headers()["idempotency-key"];
      writes.push({ path, body, key });
      expect(key).toBeTruthy();
      expect(req.headers()["x-csrf-token"]).toBe("synthetic-csrf");
      if (replays.has(key))
        return route.fulfill({ status: 201, json: replays.get(key) });
      if (path.endsWith("/updates") && stale) {
        stale = false;
        note = { ...note, version: note.version + 1 };
        notes = [note];
        return route.fulfill({
          status: 409,
          json: {
            code: "CONFLICT",
            message: "Note changed. Refresh before saving edits.",
          },
        });
      }
      if (path.endsWith("/notes")) {
        note = {
          ...note,
          text: body.text,
          childId: body.childId,
          sharedTeacherId: null,
          sharingActive: false,
        };
      } else if (path.endsWith("/updates")) {
        expect(body.expectedVersion).toBe(note.version);
        note = {
          ...note,
          text: body.text,
          sharedTeacherId: null,
          sharedTeacher: null,
          sharingActive: false,
          acknowledgedAt: null,
          version: note.version + 1,
        };
      } else if (path.endsWith("/shares")) {
        expect(body.expectedVersion).toBe(note.version);
        note = {
          ...note,
          sharedTeacherId: body.teacherId,
          sharedTeacher: body.teacherId
            ? { id: teacher, name: "Ananya Sharma" }
            : null,
          sharingActive: !!body.teacherId,
          acknowledgedAt: null,
          version: note.version + 1,
        };
      } else if (path.endsWith("/acknowledgements")) {
        expect(body.expectedVersion).toBe(note.version);
        note = { ...note, acknowledgedAt: now(), version: note.version + 1 };
      } else throw new Error("Unexpected note write");
      notes = [note];
      const result = path.endsWith("/acknowledgements")
        ? check("NoteAcknowledgement", {
            id: note.id,
            acknowledgedAt: note.acknowledgedAt,
            version: note.version,
          })
        : check("Note", {
            id: note.id,
            guardianId: guardian,
            childId: note.childId,
            text: note.text,
            sharedTeacherId: note.sharedTeacherId,
            acknowledgedAt: note.acknowledgedAt,
            version: note.version,
            createdAt: note.createdAt,
          });
      replays.set(key, result);
      if (mode.startsWith("uncertain") && writes.length === 1)
        return route.abort("failed");
      if (mode === "failed-refresh") failRead = true;
      return route.fulfill({ status: 201, json: result });
    }
    return route.fulfill({
      status: 404,
      json: { code: "NOT_FOUND", message: "Unexpected synthetic route" },
    });
  });
  return { writes, paths, getNote: () => note };
}
async function write(page: Page) {
  await page
    .getByRole("button", { name: "Write a private note", exact: true })
    .click();
  await page
    .getByLabel("Learning note", { exact: true })
    .fill("A worked example helps Aarav get started.");
  await page.getByRole("button", { name: "Review private note" }).click();
  await page.getByRole("checkbox", { name: /I reviewed this note/ }).check();
}
test("create validates, reviews privacy and persists without silently sharing", async ({
  page,
}) => {
  const state = await mock(page, "empty");
  await page.goto("/dashboard/notes");
  await page
    .getByRole("button", { name: "Write a private note", exact: true })
    .click();
  await page.getByRole("button", { name: "Review private note" }).click();
  await expect(
    page.getByText("Write a note of up to 5,000 characters.", { exact: true }),
  ).toBeVisible();
  expect(state.writes).toHaveLength(0);
  await page
    .getByLabel("Learning note", { exact: true })
    .fill("One worked example makes a new topic easier.");
  await page.getByRole("button", { name: "Review private note" }).click();
  await page.getByRole("button", { name: "Save note privately" }).click();
  expect(state.writes).toHaveLength(0);
  await page.getByRole("checkbox", { name: /I reviewed this note/ }).check();
  await page.getByRole("button", { name: "Save note privately" }).click();
  await expect(
    page.getByText("Note saved privately.", { exact: true }),
  ).toBeVisible();
  expect(state.getNote().sharedTeacherId).toBeNull();
  expect(state.writes).toHaveLength(1);
  await page.reload();
  await expect(page.locator(".notes-card")).toContainText("One worked example");
});
test("lost create response keeps edits locked and replays the same payload and key", async ({
  page,
}) => {
  const state = await mock(page, "uncertain-create");
  await page.goto("/dashboard/notes");
  await write(page);
  await page.getByRole("button", { name: "Save note privately" }).click();
  await expect(
    page.getByText(/We couldn’t confirm this decision/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Back to editing" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Retry same decision" }).click();
  await expect(
    page.getByText("Note saved privately.", { exact: true }),
  ).toBeVisible();
  expect(state.writes[0]).toEqual(state.writes[1]);
  expect(state.writes).toHaveLength(2);
});
test("share names the active teacher and withdrawal explains that already-read information cannot be recalled", async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto("/dashboard/notes");
  await page.getByRole("button", { name: "Review sharing" }).click();
  await page.getByLabel("Teacher to share with").selectOption(teacher);
  await page
    .getByRole("checkbox", { name: /I reviewed the full note/ })
    .check();
  await page.getByRole("button", { name: "Confirm sharing" }).click();
  await expect(page.locator(".notes-card")).toContainText(
    "Shared with Ananya Sharma",
  );
  expect(state.writes[0].body).toEqual({
    expectedVersion: 1,
    teacherId: teacher,
  });
  await page.getByRole("button", { name: "Review withdrawal" }).click();
  await expect(page.getByText(/cannot recall information/)).toBeVisible();
  await page.getByRole("checkbox", { name: /I want to withdraw/ }).check();
  await page
    .getByRole("button", { name: "Withdraw access", exact: true })
    .click();
  await expect(page.locator(".notes-card")).toContainText("Private · only you");
  expect(state.getNote().sharedTeacherId).toBeNull();
});
test("editing a shared note explicitly saves privately and clears teacher acknowledgement", async ({
  page,
}) => {
  const state = await mock(page, "edit");
  await page.goto("/dashboard/notes");
  await page.getByRole("button", { name: "Edit note" }).click();
  await expect(
    page.getByRole("button", { name: "Write a private note", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Review withdrawal" }),
  ).toBeDisabled();
  await expect(page.getByText(/Saving edits withdraws/)).toBeVisible();
  await page
    .getByLabel("Learning note", { exact: true })
    .fill("Updated learning context.");
  await page.getByRole("button", { name: "Review private note" }).click();
  await page.getByRole("checkbox", { name: /I reviewed this note/ }).check();
  await page.getByRole("button", { name: "Save note privately" }).click();
  await expect(page.locator(".notes-card")).toContainText(
    "Updated learning context.",
  );
  expect(state.getNote().acknowledgedAt).toBeNull();
  expect(state.getNote().sharedTeacherId).toBeNull();
  expect(state.writes[0].body.expectedVersion).toBe(3);
});
test("stale edits survive an explicit refresh and use the current version", async ({
  page,
}) => {
  const state = await mock(page, "stale-edit");
  await page.goto("/dashboard/notes");
  await page.getByRole("button", { name: "Edit note" }).click();
  await page
    .getByLabel("Learning note", { exact: true })
    .fill("Preserved edits.");
  await page.getByRole("button", { name: "Review private note" }).click();
  await page.getByRole("checkbox", { name: /I reviewed this note/ }).check();
  await page.getByRole("button", { name: "Save note privately" }).click();
  await expect(page.getByText(/Note changed/)).toBeVisible();
  await page.getByRole("button", { name: "Refresh current note" }).click();
  await page.getByRole("button", { name: "Back to editing" }).click();
  await expect(page.getByLabel("Learning note", { exact: true })).toHaveValue(
    "Preserved edits.",
  );
  await page.getByRole("button", { name: "Review private note" }).click();
  await page.getByRole("checkbox", { name: /I reviewed this note/ }).check();
  await page.getByRole("button", { name: "Save note privately" }).click();
  await expect(
    page.getByText("Note saved privately.", { exact: true }),
  ).toBeVisible();
  expect(state.writes[1].body.expectedVersion).toBe(2);
});
test("teacher acknowledges a current shared note without a guardian editor", async ({
  page,
}) => {
  const state = await mock(page, "teacher", "TEACHER");
  await page.goto("/dashboard/notes");
  await expect(
    page.getByRole("link", { name: "Shared learning notes", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Write a private note", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Acknowledge note", exact: true })
    .click();
  await page.locator(".notes-workspace").screenshot({
    path: "test-results/notes-teacher-review.png",
    style: "nextjs-portal{display:none!important}",
  });
  await page
    .getByRole("checkbox", { name: /I have read this shared note/ })
    .check();
  await page.getByRole("button", { name: "Confirm acknowledgement" }).click();
  await expect(page.locator(".notes-card")).toContainText("Acknowledged");
  expect(state.writes[0].body).toEqual({ expectedVersion: 2 });
  await expect(
    page.getByRole("button", { name: "Acknowledge note", exact: true }),
  ).toHaveCount(0);
  await page
    .locator(".notes-workspace")
    .screenshot({
      path: "test-results/notes-teacher.png",
      style: "nextjs-portal{display:none!important}",
    });
  await page.setViewportSize({ width: 360, height: 800 });
  await page
    .locator(".notes-workspace")
    .screenshot({
      path: "test-results/notes-teacher-mobile.png",
      style: "nextjs-portal{display:none!important}",
    });
});
test("student direct access never queries notes and inactive consent disables guardian writes", async ({
  page,
}) => {
  const state = await mock(page, "normal", "STUDENT");
  await page.goto("/dashboard/notes");
  await expect(
    page.getByText(/Private notes are available to guardians/),
  ).toBeVisible();
  expect(state.paths.some((p) => p.endsWith("/notes"))).toBe(false);
  await page.unroute("**/api/v1/**");
  await mock(page, "no-consent");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Write a private note", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "Edit note" })).toBeDisabled();
});
test("notes screens fit desktop and mobile with keyboard controls and accessible colors", async ({
  page,
}) => {
  await mock(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboard/notes");
  await page
    .locator(".notes-workspace")
    .screenshot({ path: "test-results/notes-guardian-desktop.png" });
  await page.getByRole("button", { name: "Review sharing" }).click();
  await page.getByLabel("Teacher to share with").selectOption(teacher);
  await page
    .getByRole("checkbox", { name: /I reviewed the full note/ })
    .focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("checkbox", { name: /I reviewed the full note/ }),
  ).toBeChecked();
  await page
    .locator(".notes-workspace")
    .screenshot({ path: "test-results/notes-sharing-review.png" });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.setViewportSize({ width: 360, height: 800 });
  await page
    .getByRole("button", { name: "Write a private note", exact: true })
    .click();
  await page
    .getByLabel("Learning note", { exact: true })
    .fill("A worked example helps Aarav get started.");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations.filter((x) =>
      ["serious", "critical"].includes(x.impact || ""),
    ),
  ).toEqual([]);
  await page
    .locator(".notes-workspace")
    .screenshot({ path: "test-results/notes-guardian-mobile.png" });
});

test("no active named teacher leaves sharing unavailable rather than inventing a recipient", async ({
  page,
}) => {
  const state = await mock(page, "no-teacher");
  await page.goto("/dashboard/notes");
  await page.getByRole("button", { name: "Review sharing" }).click();
  await expect(
    page.getByText(/No named active teacher is available/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm sharing" }),
  ).toBeDisabled();
  expect(state.writes).toHaveLength(0);
});

test("real guardian shares a private note, teacher acknowledges it and withdrawal removes teacher access", async ({
  page,
  context,
}) => {
  const login = async (p: Page, name: string) => {
    await p.goto("/login");
    await p.getByText("Development accounts", { exact: true }).click();
    await p.getByRole("button", { name: new RegExp(name) }).click();
    await expect(
      p.getByRole("heading", { name: new RegExp(`Hello, ${name}`) }),
    ).toBeVisible();
  };
  const text = "Synthetic browser learning note " + randomUUID();
  await login(page, "Kavita");
  await page.goto("/dashboard/notes");
  await page
    .getByRole("button", { name: "Write a private note", exact: true })
    .click();
  await page.getByLabel("Learner", { exact: true }).selectOption(ids.child);
  await page.getByLabel("Learning note", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Review private note" }).click();
  await page.getByRole("checkbox", { name: /I reviewed this note/ }).check();
  await page.getByRole("button", { name: "Save note privately" }).click();
  const card = page.locator(".notes-card").filter({ hasText: text });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Review sharing" }).click();
  await page.getByLabel("Teacher to share with").selectOption(ids.teacher);
  await page
    .getByRole("checkbox", { name: /I reviewed the full note/ })
    .check();
  await page.getByRole("button", { name: "Confirm sharing" }).click();
  await expect(card).toContainText("Shared with Ananya Sharma");
  const teacherContext = await context.browser()!.newContext();
  try {
    const teacherPage = await teacherContext.newPage();
    await login(teacherPage, "Ananya");
    await teacherPage.goto("/dashboard/notes");
    const teacherCard = teacherPage
      .locator(".notes-card")
      .filter({ hasText: text });
    await expect(teacherCard).toBeVisible();
    await teacherCard
      .getByRole("button", { name: "Acknowledge note", exact: true })
      .click();
    await teacherPage
      .getByRole("checkbox", { name: /I have read this shared note/ })
      .check();
    await teacherPage
      .getByRole("button", { name: "Confirm acknowledgement" })
      .click();
    await expect(teacherCard).toContainText("Acknowledged");
    await page.getByRole("button", { name: "Refresh notes" }).click();
    await expect(card).toContainText("Acknowledged");
    await card.getByRole("button", { name: "Review withdrawal" }).click();
    await page.getByRole("checkbox", { name: /I want to withdraw/ }).check();
    await page
      .getByRole("button", { name: "Withdraw access", exact: true })
      .click();
    await expect(card).toContainText("Private · only you");
    await teacherPage.getByRole("button", { name: "Refresh notes" }).click();
    await expect(
      teacherPage.locator(".notes-card").filter({ hasText: text }),
    ).toHaveCount(0);
  } finally {
    await teacherContext.close();
  }
});

test("a saved note with a failed refresh blocks a fresh write until current records are recovered", async ({
  page,
}) => {
  const state = await mock(page, "failed-refresh");
  await page.goto("/dashboard/notes");
  await write(page);
  await page.getByRole("button", { name: "Save note privately" }).click();
  await expect(
    page.getByText(/Your decision was saved, but current details/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Write a private note", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Refresh current note" }).click();
  await expect(page.locator(".notes-card")).toContainText(
    "A worked example helps Aarav",
  );
  expect(state.writes).toHaveLength(1);
  await expect(
    page.getByRole("button", { name: "Write a private note", exact: true }),
  ).toBeEnabled();
});

test("guardians without a learner receive an onboarding path instead of an unusable note form", async ({
  page,
}) => {
  const state = await mock(page, "no-child");
  await page.goto("/dashboard/notes");
  await expect(
    page.getByRole("button", { name: "Write a private note", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("link", { name: "Complete learner onboarding" }),
  ).toHaveAttribute("href", "/onboarding/parent");
  expect(state.writes).toHaveLength(0);
});
