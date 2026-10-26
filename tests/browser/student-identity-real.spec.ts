import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";

test("persisted student setup identity reaches the real dashboard without guardian verification prompts", async ({page}) => {
  const config = parseEnv(readFileSync(".env","utf8"));
  expect(config.APP_MODE).toBe("development");
  expect(["localhost","127.0.0.1"]).toContain(new URL(config.DATABASE_URL).hostname);
  const db = new Pool({connectionString:config.DATABASE_URL}), id = randomUUID();
  try {
    await db.query('INSERT INTO "Account" (id,name,email,phone,role,"registrationIntent") VALUES ($1,$2,$3,$4,$5,$6)',[id,"Synthetic pending student",`pending-${id}@example.test`,`+91000000${id.replaceAll("-","")}`,"GUARDIAN","STUDENT"]);
    const login = await page.request.post("/api/v1/dev/session",{headers:{Origin:"http://localhost:3000"},data:{accountId:id}});
    expect(login.status()).toBe(201);
    expect((await login.json()).account.studentSetupPending).toBe(true);
    await page.goto("/dashboard");
    await expect(page.locator(".signed-in-role")).toHaveText("Student setup pending");
    await expect(page.locator(".student-connection")).toBeVisible();
    await expect(page.getByRole("heading",{name:"Connect your student account",exact:true})).toBeVisible();
    await expect(page.getByRole("link",{name:"My parent or guardian needs an account",exact:true})).toHaveCount(0);
    await expect(page.locator(".guardian-priorities,.guardian-verification-editor")).toHaveCount(0);
    await expect(page.locator(".returning-account-actions").getByRole("link",{name:"Guardian setup",exact:true})).toHaveCount(0);
    await page.reload();await expect(page.locator(".signed-in-role")).toHaveText("Student setup pending");
    await page.screenshot({path:"test-results/pending-student-real.png",fullPage:true});
  } finally {
    await db.query('UPDATE "Account" SET disabled=true,phone=NULL WHERE id=$1',[id]);
    await db.query('UPDATE "Session" SET revoked=true WHERE "accountId"=$1',[id]);
    await db.end();
  }
});
