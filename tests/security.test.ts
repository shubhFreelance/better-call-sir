import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync,readFileSync,mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync,execFileSync } from "node:child_process";
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
test('history scanning catches a removed synthetic secret without printing it',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'bcs-history-test-')),token='ghp_'+randomBytes(18).toString('hex'),git=(args:string[])=>execFileSync('git',['-C',dir,...args],{stdio:'pipe'});
 try{git(['init','--quiet']);git(['config','user.name','Synthetic security fixture']);git(['config','user.email','security@example.test']);git(['config','commit.gpgsign','false']);writeFileSync(path.join(dir,'removed.txt'),token);git(['add','removed.txt']);git(['commit','--quiet','-m','Synthetic fixture']);git(['rm','--quiet','removed.txt']);git(['commit','--quiet','-m','Remove fixture']);const scan=spawnSync(process.execPath,['scripts/history-secrets.mjs',dir],{encoding:'utf8'});assert.equal(scan.status,1);const report=JSON.parse(scan.stdout);assert(report.findings.some((x:any)=>x.path==='removed.txt'));assert.equal(scan.stdout.includes(token),false);assert(report.findings.every((x:any)=>/^[0-9a-f]{40}$/.test(x.blob)));}finally{rmSync(dir,{recursive:true,force:true});}
});
test('CI installs only reviewed engine scripts and never retains checkout credentials',()=>{
 const ci=readFileSync('.github/workflows/ci.yml','utf8');assert(ci.includes('persist-credentials: false'));assert(ci.includes('fetch-depth: 0'));assert(ci.includes('npm ci --ignore-scripts'));assert(ci.includes('npm rebuild @prisma/engines esbuild'));assert(!ci.includes('pull_request_target'));assert(!ci.includes('continue-on-error: true'));
 const actions=[...ci.matchAll(/uses:\s+(\S+)/g)].map(x=>x[1]);assert(actions.length>=3);assert(actions.every(x=>/^(actions\/(checkout|setup-node|upload-artifact))@[0-9a-f]{40}$/.test(x)));
 const lock=JSON.parse(readFileSync('package-lock.json','utf8'));for(const [name,pkg] of Object.entries(lock.packages) as [string,any][]){if(!name.startsWith('node_modules/')||pkg.link)continue;assert(pkg.integrity&&pkg.resolved.startsWith('https://registry.npmjs.org/'),name+' must have an immutable verified registry artifact');}
});

test('explicit generated assets and scanner config are scanned even when ignored',()=>{
 mkdirSync('test-results',{recursive:true});const dir=mkdtempSync(path.join('test-results','secret-scan-')),token='ghp_'+randomBytes(18).toString('hex');
 try{for(const name of ['generated.js','.secretlintrc.json']){const file=path.join(dir,name);writeFileSync(file,'const synthetic='+JSON.stringify(token)+';');const result=spawnSync(process.execPath,['scripts/secrets-scan.mjs',file],{encoding:'utf8'});assert.equal(result.status,1);const report=JSON.parse(result.stdout);assert.equal(report.filesScanned,1);assert(report.findings.length>0);assert.equal(result.stdout.includes(token),false);}}finally{rmSync(dir,{recursive:true,force:true});}
});
