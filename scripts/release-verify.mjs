import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const file = process.env.RELEASE_EVIDENCE_FILE || "release/evidence.json";
const p0 = [
  "US01",
  "US02",
  "US03",
  "US04",
  "US05",
  "US06",
  "US07",
  "US08",
  "US09",
  "US10",
  "US11",
  "US13",
  "US17",
  "US18",
  "US19",
  "US20",
];
const gates = [
  "contracts",
  "security",
  "transactions",
  "privacy",
  "operations",
  "recovery",
  "deployment",
];
if (!existsSync(file)) {
  console.error(
    "Release blocked: no reviewed pilot evidence. Synthetic development checks cannot authorize live release. See docs/SPRINTS.md.",
  );
  process.exit(1);
}
const evidence = JSON.parse(readFileSync(file, "utf8"));
const head = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const missing = [];
if (evidence.commit !== head)
  missing.push("evidence must match current commit");
if (
  !evidence.imageDigests?.length ||
  !evidence.imageDigests.every((x) => /^sha256:[a-f0-9]{64}$/.test(x))
)
  missing.push("tested immutable image digests");
if (!evidence.approver || !evidence.reviewedAt || !evidence.migrationId)
  missing.push("named approval, review timestamp and migration ID");
for (const story of p0)
  if (
    evidence.stories?.[story]?.status !== "passed" ||
    evidence.stories[story].environment !== "staging"
  )
    missing.push(story + " real staging acceptance");
for (const gate of gates)
  if (
    evidence.gates?.[gate]?.status !== "passed" ||
    !evidence.gates[gate].artifact
  )
    missing.push(gate + " evidence");
if (evidence.blockingIssues?.length !== 0)
  missing.push("unresolved or unreported blocking issues");
if (missing.length) {
  console.error(
    "Release blocked:\n" + missing.map((x) => " - " + x).join("\n"),
  );
  process.exit(1);
}
// This initial verifier is intentionally fail-closed until adapter integration and independent review.
console.error(
  "Release blocked: production adapters and the complete P0 workflows are not implemented in this development milestone. Evidence files cannot override that boundary.",
);
process.exit(1);
