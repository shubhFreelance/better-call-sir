import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import * as email from "../packages/email/index.cjs";
test("email encryption binds content to delivery identity, detects tampering and refuses unsafe public origins", () => {
  const names = [
      "EMAIL_CONTENT_KEY",
      "APP_MODE",
      "NODE_ENV",
      "PUBLIC_APP_URL",
      "EMAIL_DELIVERY_MODE",
    ],
    old = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  try {
    process.env.EMAIL_CONTENT_KEY = randomBytes(32).toString("base64");
    process.env.APP_MODE = "development";
    process.env.NODE_ENV = "test";
    process.env.PUBLIC_APP_URL = "http://localhost:3000";
    const input = { to: "synthetic@example.test", code: "123456" },
      encrypted = email.seal(input, "synthetic-delivery");
    assert(!encrypted.includes(input.to));
    assert(!encrypted.includes(input.code));
    assert.deepEqual(email.open(encrypted, "synthetic-delivery"), input);
    assert.throws(() => email.open(encrypted, "another-delivery"));
    const bytes = Buffer.from(encrypted, "base64");
    bytes[20] ^= 1;
    assert.throws(() =>
      email.open(bytes.toString("base64"), "synthetic-delivery"),
    );
    assert.match(email.message(input.to, "hi", "/dashboard").text, /साइन इन/);
    assert.match(
      email.message(input.to, "hi", "/dashboard", "123456").text,
      /5 मिनट/,
    );
    process.env.PUBLIC_APP_URL = "http://unapproved.example";
    assert.throws(() => email.message(input.to, "en", "/dashboard"));
    process.env.NODE_ENV = "production";
    process.env.EMAIL_DELIVERY_MODE = "sandbox";
    assert.throws(() => email.mode());
  } finally {
    for (const n of names)
      if (old[n] === undefined) delete process.env[n];
      else process.env[n] = old[n];
  }
});
