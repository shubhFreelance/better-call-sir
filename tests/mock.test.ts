import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync, ChildProcess } from "node:child_process";
import { contract, operationValidator } from "./helpers/contract";
import { ids } from "../packages/test-fixtures/src";
let server: ChildProcess;
const headers = {
  Origin: "http://localhost:3000",
  Cookie: "bcs_access=synthetic-mock-session",
  "X-CSRF-Token": "synthetic-mock-csrf",
  "Idempotency-Key": "synthetic-mock-request",
  "Content-Type": "application/json",
};
async function call(path: string, body?: unknown, prefer?: string) {
  const response = await fetch("http://127.0.0.1:4111/api/v1" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...headers, ...(prefer ? { Prefer: prefer } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, data: await response.json() };
}
before(
  async () => {
    server = spawn(process.execPath, ["scripts/mock-server.mjs"], {
      env: { ...process.env, MOCK_PORT: "4111" },
      stdio: "pipe",
    });
    let log = "";
    server.stderr?.on("data", (b) => (log += b.toString()));
    for (let i = 0; i < 100; i++) {
      try {
        if ((await call("/catalog")).status === 200) return;
      } catch {}
      if (server.exitCode !== null)
        throw new Error("Mock startup failed: " + log);
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Mock readiness timed out.");
  },
  { timeout: 15000 },
);
after(async () => {
  if (server) {
    server.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      if (server.exitCode !== null) return resolve();
      server.once("exit", () => resolve());
    });
  }
});
test("contract-generated mock serves foundation discovery, identity and intake examples", async () => {
  const examples: [string, string, unknown?][] = [
    ["/catalog", "/catalog"],
    ["/teachers", "/teachers"],
    ["/teachers/ananya-sharma", "/teachers/{slug}"],
    ["/auth/session", "/auth/session"],
    ["/children", "/children"],
    ["/auth/otp/request", "/auth/otp/request", { email: "otp@example.test" }],
    [
      "/auth/otp/verify",
      "/auth/otp/verify",
      { email: "otp@example.test", code: "123456", name: "Synthetic" },
    ],
    [
      "/consents",
      "/consents",
      {
        purpose: "tuition-and-learning-records",
        policyVersion: "development-v1",
        accepted: true,
      },
    ],
    [
      "/requests",
      "/requests",
      {
        alias: "Synthetic",
        grade: 8,
        board: "CBSE",
        subject: "Maths",
        mode: "HOME",
        language: "English",
        locality: "Shankar Nagar",
        budgetPaise: 400000,
        schedule: "Tuesday after 5pm",
      },
    ],
    ["/requests/" + ids.request, "/requests/{id}"],
  ];
  for (const [path, route, body] of examples) {
    const method = body === undefined ? "get" : "post",
      status = body === undefined ? 200 : 201,
      result = await call(path, body);
    assert.equal(result.status, status, JSON.stringify(result));
    const validate = operationValidator(route, method, String(status));
    assert(validate(result.data), JSON.stringify(validate.errors));
    assert.deepEqual(
      result.data,
      contract.paths[route][method].responses[String(status)].content[
        "application/json"
      ].examples.synthetic.value,
    );
  }
});
test("mock selects documented expired, forbidden, conflict and provider-error states", async () => {
  for (const status of [401, 403, 409, 503]) {
    const result = await call(
      "/requests/" + ids.request,
      undefined,
      "code=" + status,
    );
    assert.equal(result.status, status);
    const validate = operationValidator(
      "/requests/{id}",
      "get",
      String(status),
    );
    assert(validate(result.data));
  }
});
test("mock rejects invalid OTP format and mass assignment before returning a success example", async () => {
  for (const body of [
    { email: "invalid" },
    { email: "otp@example.test", role: "ADMIN" },
  ])
    assert((await call("/auth/otp/request", body)).status >= 400);
});

test("mock gateway refuses production startup", () => {
  const result = spawnSync(process.execPath, ["scripts/mock-server.mjs"], {
    env: { ...process.env, NODE_ENV: "production" },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /synthetic development only/);
});
