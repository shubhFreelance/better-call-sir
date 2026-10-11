import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("missing pilot evidence fails closed instead of treating development success as a release", () => {
  const r = spawnSync(process.execPath, ["scripts/release-verify.mjs"], {
    encoding: "utf8",
    env: {
      ...process.env,
      RELEASE_EVIDENCE_FILE: "release/does-not-exist.json",
    },
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Release blocked/);
});
test("fabricated or stale evidence cannot enable unimplemented live workflows", () => {
  const dir = mkdtempSync(join(tmpdir(), "bcs-release-"));
  const file = join(dir, "evidence.json");
  try {
    writeFileSync(
      file,
      JSON.stringify({
        commit: "wrong",
        imageDigests: [],
        stories: {},
        gates: {},
        blockingIssues: [],
      }),
    );
    const r = spawnSync(process.execPath, ["scripts/release-verify.mjs"], {
      encoding: "utf8",
      env: { ...process.env, RELEASE_EVIDENCE_FILE: file },
    });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /current commit/);
    assert.match(r.stderr, /US17/);
    assert.match(r.stderr, /recovery/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
