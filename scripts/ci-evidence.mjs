import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const required = [
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
  "productionBrowser",
  "build",
  "secrets",
  "historySecrets",
  "bundleSecrets",
  "runtimeAudit",
  "toolingAudit",
];
const results = JSON.parse(process.env.BCS_CHECK_RESULTS || "{}");
const checks = Object.fromEntries(
  required.map((name) => [name, results[name] || "skipped"]),
);
if (
  Object.values(checks).some(
    (value) => !["success", "failure", "cancelled", "skipped"].includes(value),
  )
)
  throw new Error("Invalid CI check outcome.");
const report = {
  schemaVersion: 1,
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  recordedAt: new Date().toISOString(),
  node: process.version,
  workflowUrl: process.env.BCS_WORKFLOW_URL || null,
  checks,
  checksPassed: Object.values(checks).every((value) => value === "success"),
  scope:
    "Synthetic development acceptance; does not authorize Phase 1 review or live release.",
};
const dir = process.env.BCS_EVIDENCE_DIR || "test-results";
mkdirSync(dir, { recursive: true });
writeFileSync(
  path.join(dir, "ci-evidence.json"),
  JSON.stringify(report, null, 2) + "\n",
);
