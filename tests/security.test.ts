import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
function scan(content: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "bcs-secret-scan-")),
    file = path.join(dir, "fixture.txt");
  try {
    writeFileSync(file, content);
    const result = spawnSync(
      process.execPath,
      ["scripts/secrets-scan.mjs", file],
      { encoding: "utf8" },
    );
    return { ...result, report: JSON.parse(result.stdout) };
  } finally {
    rmSync(dir, { recursive: true });
  }
}
test("secrets scan rejects a synthetic token and never includes source or token values in its report", () => {
  const token = "ghp_" + randomBytes(18).toString("hex");
  const result = scan("token=" + token);
  assert.equal(result.status, 1);
  assert(result.report.findings.length > 0);
  assert.equal(result.stdout.includes(token), false);
  assert.equal(result.stdout.includes("sourceContent"), false);
});
test("only the exact synthetic loopback database credential is allowed", () => {
  const example = [
    "postgresql",
    ":",
    "//",
    "bcs_dev:",
    "bcs_dev_local",
    "@127.0.0.1:5432/bcs_dev",
  ].join("");
  assert.equal(scan(example).status, 0);
  assert.equal(scan(example.replace("127.0.0.1", "db.example.com")).status, 1);
});
test("benign input passes and a missing input file fails the scanner", () => {
  assert.equal(scan("ordinary synthetic text").status, 0);
  const result = spawnSync(
    process.execPath,
    ["scripts/secrets-scan.mjs", "/tmp/bcs-nonexistent-secret-input"],
    { encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
});
