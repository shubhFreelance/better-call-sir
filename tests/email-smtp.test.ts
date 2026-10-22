import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
const require = createRequire(resolve("packages/email/smtp.cjs"));
const smtp = require("./smtp.cjs"),
  nodemailer = require("nodemailer");
const names = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_FROM",
  "SMTP_PASSWORD",
];
async function settings(fn: () => Promise<void>) {
  const old = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  try {
    Object.assign(process.env, {
      SMTP_HOST: "smtp.gmail.com",
      SMTP_PORT: "465",
      SMTP_SECURE: "true",
      SMTP_USER: "synthetic@gmail.com",
      SMTP_FROM: "synthetic@gmail.com",
      SMTP_PASSWORD: "synthetic-app-password",
    });
    await fn();
  } finally {
    for (const n of names)
      if (old[n] === undefined) delete process.env[n];
      else process.env[n] = old[n];
  }
}
test("Gmail transport enforces TLS, frozen sender, a single recipient and stable message identity without logging secrets", async () => {
  await settings(async () => {
    const original = nodemailer.createTransport,
      configs: any[] = [],
      messages: any[] = [];
    let closed = 0;
    nodemailer.createTransport = (config: any) => {
      configs.push(config);
      return {
        sendMail: async (message: any) => {
          messages.push(message);
          return { accepted: [message.to.address] };
        },
        close: () => {
          closed++;
        },
      };
    };
    try {
      const id = randomUUID(),
        payload = {
          from: smtp.sender(),
          to: "tester@example.test",
          subject: "साइन-इन कोड",
          text: "Synthetic code 123456",
        };
      assert.equal(await smtp.send(payload, id), id);
      assert.equal(configs[0].secure, true);
      assert.equal(configs[0].requireTLS, true);
      assert.equal(configs[0].tls.rejectUnauthorized, true);
      assert.equal(configs[0].tls.servername, "smtp.gmail.com");
      assert.equal(configs[0].debug, false);
      assert.equal(configs[0].logger, false);
      assert.equal(configs[0].disableFileAccess, true);
      assert.equal(configs[0].disableUrlAccess, true);
      assert.deepEqual(messages[0].envelope, {
        from: payload.from,
        to: [payload.to],
      });
      assert.equal(messages[0].messageId, `<bcs-email-${id}@gmail.com>`);
      assert.equal(messages[0].text, payload.text);
      process.env.SMTP_PORT = "587";
      process.env.SMTP_SECURE = "false";
      await smtp.send(payload, id);
      assert.equal(configs[1].secure, false);
      assert.equal(configs[1].requireTLS, true);
      assert.equal(messages[1].messageId, messages[0].messageId);
      assert.equal(closed, 2);
      await assert.rejects(
        smtp.send({ ...payload, from: "another@gmail.com" }, id),
        /EMAIL_CONFIGURATION/,
      );
      assert.equal(configs.length, 2);
    } finally {
      nodemailer.createTransport = original;
    }
  });
});
test("Gmail configuration refuses missing credentials, forged sender, unsafe hosts and plaintext port combinations", async () => {
  await settings(async () => {
    for (const [name, value] of [
      ["SMTP_PASSWORD", ""],
      ["SMTP_HOST", "untrusted.example"],
      ["SMTP_FROM", "another@gmail.com"],
      ["SMTP_USER", "bad\r\nBcc: attacker@gmail.com"],
      ["SMTP_PORT", "25"],
      ["SMTP_SECURE", "false"],
    ]) {
      const old = process.env[name];
      process.env[name] = value;
      assert.throws(() => smtp.sender(), /EMAIL_CONFIGURATION/);
      process.env[name] = old;
    }
  });
});
test("SMTP errors are sanitized and distinguish rejection from an uncertain send, without leaking password or code", async () => {
  await settings(async () => {
    const original = nodemailer.createTransport;
    try {
      for (const [failure, message, definite] of [
        [{ code: "EAUTH" }, "EMAIL_CONFIGURATION", true],
        [{ responseCode: 550 }, "PROVIDER_REJECTED", true],
        [{ code: "ETIMEDOUT", command: "DATA" }, "PROVIDER_UNCERTAIN", false],
      ]) {
        nodemailer.createTransport = () => ({
          sendMail: async () => {
            throw Object.assign(
              Error("Synthetic password and code must remain private"),
              failure,
            );
          },
          close() {},
        });
        await assert.rejects(
          smtp.send(
            {
              from: smtp.sender(),
              to: "tester@example.test",
              subject: "OTP",
              text: "123456",
            },
            randomUUID(),
          ),
          (e: any) => e.message === message && e.definite === definite,
        );
      }
      nodemailer.createTransport = () => ({
        sendMail: async () => ({
          accepted: [],
          rejected: ["tester@example.test"],
        }),
        close() {},
      });
      await assert.rejects(
        smtp.send(
          { from: smtp.sender(), to: "tester@example.test" },
          randomUUID(),
        ),
        /PROVIDER_REJECTED/,
      );
    } finally {
      nodemailer.createTransport = original;
    }
  });
});
