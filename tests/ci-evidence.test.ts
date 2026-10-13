import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
function evidence(results: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), "bcs-ci-evidence-"));
  try {
    execFileSync(process.execPath, ["scripts/ci-evidence.mjs"], {
      env: {
        ...process.env,
        BCS_EVIDENCE_DIR: dir,
        BCS_CHECK_RESULTS: JSON.stringify(results),
      },
    });
    return JSON.parse(readFileSync(path.join(dir, "ci-evidence.json"), "utf8"));
  } finally {
    rmSync(dir, { recursive: true });
  }
}
test("CI evidence binds results to the exact source commit and fails closed for missing checks", () => {
  const report = evidence({ unit: "success", secrets: "failure" });
  assert.equal(
    report.commit,
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  );
  assert.equal(report.checks.unit, "success");
  assert.equal(report.checks.secrets, "failure");
  assert.equal(report.checks.build, "skipped");
  assert.equal(report.checksPassed, false);
});
test("CI evidence records all successful checks without authorizing release", () => {
  const checks = [
    "contractLint",
    "generatedClient",
    "typecheck",
    "unit",
    "integration",
    "contract",
    "mock",
    "securityTests",
    "releaseGate",
    "browser",
    "build",
    "secrets",
    "historySecrets",
    "bundleSecrets",
    "runtimeAudit",
    "toolingAudit",
  ];
  const report = evidence(
    Object.fromEntries(checks.map((name) => [name, "success"])),
  );
  assert.equal(report.checksPassed, true);
  assert.match(report.scope, /does not authorize/);
});
