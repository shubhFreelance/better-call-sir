import { test } from "node:test";
import assert from "node:assert/strict";
import { api, ApiError } from "../packages/api-client/src";
test("browser API transport is bounded, rejects redirects and honors caller cancellation", async () => {
  const original = globalThis.fetch,
    base = process.env.NEXT_PUBLIC_API_BASE;
  try {
    delete process.env.NEXT_PUBLIC_API_BASE;
    let options: RequestInit | undefined;
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "/api/v1/teachers");
      options = init;
      return new Response('{"items":[]}', { status: 200 });
    };
    const controller = new AbortController();
    await api("/teachers", { signal: controller.signal });
    assert.equal(options?.redirect, "error");
    assert.equal(options?.credentials, "include");
    assert.equal(options?.cache, "no-store");
    assert(options?.signal);
    controller.abort();
    assert.equal(options!.signal!.aborted, true);
  } finally {
    globalThis.fetch = original;
    if (base === undefined) delete process.env.NEXT_PUBLIC_API_BASE;
    else process.env.NEXT_PUBLIC_API_BASE = base;
  }
});
test("browser API rejects cross-origin configuration and paths outside the owned API before sending credentials", async () => {
  const original = globalThis.fetch,
    base = process.env.NEXT_PUBLIC_API_BASE;
  try {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return new Response("{}");
    };
    delete process.env.NEXT_PUBLIC_API_BASE;
    for (const path of [
      "https://attacker.invalid",
      "//attacker.invalid",
      "/../../other",
      "/../other",
    ])
      await assert.rejects(
        api(path),
        (error: any) =>
          error instanceof ApiError && error.code === "INVALID_REQUEST",
      );
    process.env.NEXT_PUBLIC_API_BASE = "https://attacker.invalid/api/v1";
    await assert.rejects(api("/auth/session"));
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
    if (base === undefined) delete process.env.NEXT_PUBLIC_API_BASE;
    else process.env.NEXT_PUBLIC_API_BASE = base;
  }
});
test("unreadable API responses preserve uncertainty and malformed error bodies remain safe", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("not-json", { status: 200 });
    await assert.rejects(
      api("/requests"),
      (error: any) =>
        error instanceof ApiError && error.code === "INVALID_RESPONSE",
    );
    globalThis.fetch = async () => new Response("null", { status: 400 });
    await assert.rejects(
      api("/requests"),
      (error: any) => error instanceof ApiError && error.code === "ERROR",
    );
  } finally {
    globalThis.fetch = original;
  }
});
