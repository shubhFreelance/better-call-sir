import { execFileSync, spawnSync } from "node:child_process";
const files = process.argv.slice(2);
const selected = files.length
  ? files
  : [
      ...new Set(
        execFileSync(
          "git",
          ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
          { encoding: "utf8" },
        )
          .split("\0")
          .filter(Boolean),
      ),
    ];
if (!selected.length)
  throw new Error("No source files selected for secrets scanning.");
const result = spawnSync(
  process.execPath,
  [
    "node_modules/secretlint/bin/secretlint.js",
    "--no-glob",
    "--format",
    "json",
    "--",
    ...selected,
  ],
  { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
);
if (result.error) throw result.error;
if (result.status !== 0 && result.status !== 1)
  throw new Error("Secrets scanner failed to run.");
let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  throw new Error("Secrets scanner did not produce a valid report.");
}
const findings = report.flatMap((file) =>
  file.messages.map((message) => ({
    file: file.filePath,
    rule: message.ruleId,
    messageId: message.messageId,
    severity: message.severity,
    line: message.loc.start.line,
    column: message.loc.start.column,
  })),
);
process.stdout.write(
  JSON.stringify({ filesScanned: report.length, findings }, null, 2) + "\n",
);
process.exitCode = findings.length ? 1 : result.status;
