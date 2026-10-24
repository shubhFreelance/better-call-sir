import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomUUID, randomBytes, createHash } from "node:crypto";

test("real same-origin Socket.IO connection delivers durable inbox updates and reconnects", async ({
  page,
}) => {
  const env = parseEnv(readFileSync(".env", "utf8")),
    url = new URL(env.DATABASE_URL!);
  expect(["localhost", "127.0.0.1"]).toContain(url.hostname);
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url.href }),
  });
  const account = await db.account.create({
      data: {
        name: "Synthetic live inbox test",
        phone: "+91000000" + randomUUID().slice(0, 8),
        role: "GUARDIAN",
      },
    }),
    access = randomBytes(32).toString("base64url"),
    refresh = randomBytes(32).toString("base64url"),
    csrf = randomBytes(32).toString("base64url"),
    hash = (s: string) => createHash("sha256").update(s).digest("hex");
  try {
    await db.session.create({
      data: {
        accountId: account.id,
        accessHash: hash(access),
        refreshHash: hash(refresh),
        csrf,
        familyId: randomUUID(),
        accessExpiresAt: new Date(Date.now() + 600000),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    await page
      .context()
      .addCookies([
        {
          name: "bcs_access",
          value: access,
          domain: "localhost",
          path: "/",
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
    await page.goto("/teachers");
    await page.locator(".live-bell-trigger").click();
    await expect(
      page.getByText("Live updates connected", { exact: true }),
    ).toBeVisible();
    const n = await db.inboxNotification.create({
      data: {
        accountId: account.id,
        eventId: randomUUID(),
        topic: "request.created",
        actionPath: "/dashboard/enquiries",
        important: true,
      },
    });
    await expect(page.locator(".live-bell-badge")).toHaveText("1", {
      timeout: 10000,
    });
    await expect(page.locator(".live-bell-panel")).toContainText(
      "New teacher enquiry",
    );
    await page.reload();
    await page.locator(".live-bell-trigger").click();
    await expect(
      page.getByText("Live updates connected", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".live-bell-badge")).toHaveText("1");
    await page
      .getByRole("button", { name: "Mark as read", exact: true })
      .click();
    await expect(page.locator(".live-bell-badge")).toHaveCount(0);
    expect(
      (await db.inboxNotification.findUniqueOrThrow({ where: { id: n.id } }))
        .readAt,
    ).not.toBeNull();
  } finally {
    await page.goto("about:blank");
    await db.inboxNotification.deleteMany({ where: { accountId: account.id } });
    await db.session.deleteMany({ where: { accountId: account.id } });
    await db.account.delete({ where: { id: account.id } });
    await db.$disconnect();
  }
});
