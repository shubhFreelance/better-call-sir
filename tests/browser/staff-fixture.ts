import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { Pool } from "pg";
import { expect, type APIRequestContext } from "@playwright/test";
import type { Session } from "@bcs/api-client";
import { totp } from "../../apps/api/src/modules/identity/totp";
const created: string[] = [];
export async function createStaffFixture(name = "Operator · synthetic staff") {
  const config = parseEnv(readFileSync(".env", "utf8")),
    url = new URL(config.DATABASE_URL);
  expect(config.APP_MODE).toBe("development");
  expect(["localhost", "127.0.0.1"]).toContain(url.hostname);
  const pool = new Pool({ connectionString: config.DATABASE_URL }),
    id = randomUUID();
  try {
    await pool.query(
      'INSERT INTO "Account" (id,phone,name,role,verified) VALUES ($1,$2,$3,$4,true)',
      [id, "+91000000" + id.replaceAll("-", ""), name, "ADMIN"],
    );
    created.push(id);
  } finally {
    await pool.end();
  }
  return id;
}
export async function staffSession(client: APIRequestContext, id?: string) {
  const accountId = id || (await createStaffFixture());
  const primary = await client.post("/api/v1/dev/session", {
    data: { accountId },
    headers: { Origin: "http://localhost:3000" },
  });
  expect(primary.status()).toBe(201);
  return (await primary.json()) as Session;
}
export async function verifiedStaffSession(client: APIRequestContext) {
  const session = await staffSession(client),
    headers = {
      Origin: "http://localhost:3000",
      "X-CSRF-Token": session.csrfToken,
    };
  const enrollment = await client.post("/api/v1/auth/mfa/enrollment", {
    data: {},
    headers,
  });
  expect(enrollment.status()).toBe(201);
  const code = totp(
      (await enrollment.json()).secret,
      BigInt(Math.floor(Date.now() / 30000)),
    ),
    verified = await client.post("/api/v1/auth/mfa/verification", {
      data: { code },
      headers,
    });
  expect(verified.status()).toBe(201);
  return session;
}
export async function cleanupStaffFixtures() {
  if (!created.length) return;
  const ids = created.splice(0),
    config = parseEnv(readFileSync(".env", "utf8")),
    pool = new Pool({ connectionString: config.DATABASE_URL });
  try {
    await pool.query(
      'UPDATE "Account" SET disabled=true WHERE id=ANY($1::uuid[])',
      [ids],
    );
    await pool.query(
      'UPDATE "Session" SET revoked=true WHERE "accountId"=ANY($1::uuid[])',
      [ids],
    );
    await pool.query(
      'DELETE FROM "MfaCredential" WHERE "accountId"=ANY($1::uuid[])',
      [ids],
    );
  } finally {
    await pool.end();
  }
}
