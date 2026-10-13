import { execFileSync, spawnSync } from "node:child_process";
import {readdirSync,readFileSync} from 'node:fs';
import path from 'node:path';
const files = process.argv.slice(2);
const walk=(dir)=>readdirSync(dir,{withFileTypes:true}).flatMap(item=>item.isDirectory()?walk(path.join(dir,item.name)):/\.(js|map)$/.test(item.name)?[path.join(dir,item.name)]:[]);
const selected = files[0]==='--bundle'?walk('apps/web/.next/static'):files.length
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
const batch=selected.filter(file=>!/^\.secretlintrc(?:\.(?:json|yaml|yml|js))?$|^\.secretlintignore/.test(path.basename(file)));
const result = batch.length ? spawnSync(
  process.execPath,
  [
    "node_modules/secretlint/bin/secretlint.js",
    "--no-glob",
    "--no-gitignore",
    "--secretlintrc",path.resolve(".secretlintrc.json"),
    "--format",
    "json",
    "--",
    ...batch,
  ],
  { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
) : {status:0,stdout:"[]",error:null};
if (result.error) throw result.error;
if (result.status !== 0 && result.status !== 1)
  throw new Error("Secrets scanner failed to run.");
let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  throw new Error("Secrets scanner did not produce a valid report.");
}
// Secretlint always excludes its own config names; scan skipped explicit inputs through stdin.
if (!Array.isArray(report)) throw new Error("Secrets scanner returned invalid coverage.");
const covered=new Set(report.map(file=>path.resolve(file.filePath)));
for(const file of selected.filter(file=>!covered.has(path.resolve(file)))) {
  const fallback=spawnSync(process.execPath,["node_modules/secretlint/bin/secretlint.js","--secretlintrc",path.resolve(".secretlintrc.json"),"--stdinFileName",path.resolve("explicit-scan-input"+path.extname(file)),"--format","json"],{input:readFileSync(file),encoding:"utf8",maxBuffer:10*1024*1024});
  if(fallback.error||![0,1].includes(fallback.status))throw new Error("Secrets scanner could not scan an explicit input.");
  let entry;try{entry=JSON.parse(fallback.stdout);}catch{throw new Error("Secrets scanner returned invalid input evidence.");}
  if(!Array.isArray(entry)||entry.length!==1)throw new Error("Secrets scanner skipped an explicit input.");
  report.push({...entry[0],filePath:path.resolve(file)});
}
if (report.length !== selected.length)
  throw new Error("Secrets scanner did not cover every selected file.");
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
