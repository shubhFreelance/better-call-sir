import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { teachers, ids } from "../packages/test-fixtures/src";
import { contract, validator, operationValidator } from "./helpers/contract";
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((f) =>
    f.isDirectory()
      ? files(path.join(dir, f.name))
      : f.name.endsWith(".ts")
        ? [path.join(dir, f.name)]
        : [],
  );
}
test("every implemented API operation has a versioned contract and documented failure responses", () => {
  const source = files("apps/api/src/modules")
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
  const operations = [...source.matchAll(/@(Get|Post)\(["']([^"']+)["']\)/g)];
  assert(operations.length >= 40);
  for (const [, method, route] of operations) {
    const p = "/" + route.replace(/:(\w+)/g, "{$1}");
    const op = contract.paths[p]?.[method.toLowerCase()];
    assert(op, `${method} ${p} missing from contract`);
    assert(op.responses[method === "Post" ? "201" : "200"]);
    for (const status of ["400", "401", "403", "404", "409"])
      assert(op.responses[status], `${p} ${status}`);
  }
});
test("public teacher projection validates and private fields are rejected", () => {
  const validate = validator("Teacher");
  const sample = {
    ...teachers[0],
    id: ids.teacher,
    boards: ["CBSE", "CGBSE"],
    grades: [6, 7, 8, 9, 10],
    capabilityLabel: "Reviewed subject coverage",
    consultationOptIn: true,
  };
  assert(validate(sample), JSON.stringify(validate.errors));
  assert.equal(validate({ ...sample, phone: "+919999999999" }), false);
});
test("intake contract rejects extra role fields, unsupported taxonomy, fractional money and unsupported grade", () => {
  const validate = validator("Intake"),
    body = {
      alias: "Synthetic",
      grade: 8,
      board: "CBSE",
      subject: "Maths",
      mode: "ONLINE",
      language: "Hindi",
      locality: "Raipur",
      budgetPaise: 100000,
      schedule: "Evenings",
    };
  assert(validate(body));
  for (const patch of [
    { role: "ADMIN" },
    { grade: 11 },
    { subject: "Physics" },
    { budgetPaise: 100000.5 },
  ])
    assert.equal(validate({ ...body, ...patch }), false);
});
test("generated client contains all operation identifiers and stays separate from backend persistence", () => {
  const generated = readFileSync(
    "packages/api-client/src/generated.ts",
    "utf8",
  );
  for (const item of Object.values(contract.paths) as Record<
    string,
    { operationId: string }
  >[])
    for (const op of Object.values(item))
      assert(generated.includes(op.operationId));
  const web = files("apps/web/app")
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
  assert(!web.includes("@prisma/client"));
  assert(!web.includes("apps/api"));
  assert(!web.includes("DATABASE_URL"));
});

test("demo contract validates time, version and outcome boundaries", () => {
  const proposal = validator("DemoProposal");
  const body = {
    requestId: ids.child,
    teacherId: ids.teacher,
    startsAt: new Date().toISOString(),
    duration: 30,
  };
  assert(proposal(body));
  for (const patch of [
    { duration: 0 },
    { duration: 60 },
    { duration: 30.5 },
    { startsAt: "tomorrow" },
    { guardianAccepted: true },
  ])
    assert.equal(proposal({ ...body, ...patch }), false);
  const acceptance = validator("DemoAcceptance");
  assert(acceptance({ expectedVersion: 1 }));
  assert.equal(acceptance({ expectedVersion: 0 }), false);
  assert.equal(
    validator("DemoOutcome")({
      expectedVersion: 1,
      outcome: "PAID",
      reason: "Invalid",
    }),
    false,
  );
});

test("foundation examples validate against their operation response schemas", () => {
  for (const route of [
    "/catalog",
    "/teachers",
    "/teachers/{slug}",
    "/auth/otp/request",
    "/auth/otp/verify",
    "/auth/session",
    "/auth/refresh",
    "/auth/logout",
    "/dev/accounts",
    "/dev/session",
    "/consents",
    "/consents/withdraw",
    "/requests",
    "/requests/{id}",
    "/children",
  ])
    for (const [method, op] of Object.entries(contract.paths[route]) as [
      string,
      any,
    ][])
      for (const [status, response] of Object.entries(op.responses) as [
        string,
        any,
      ][]) {
        const media = response.content["application/json"];
        assert(media.examples, `${method} ${route} ${status} example missing`);
        const validate = operationValidator(route, method, status);
        for (const example of Object.values(media.examples) as {
          value: unknown;
        }[])
          assert(
            validate(example.value),
            `${method} ${route} ${status}: ${JSON.stringify(validate.errors)}`,
          );
      }
});
test("OTP contract accepts email/code formats and rejects phone or malformed input",()=>{
 const request=validator('OtpRequest'),verify=validator('OtpVerify');
 assert(request({email:'otp@example.test'}));assert(verify({email:'otp@example.test',code:'123456',name:'Synthetic'}));
 for(const email of ['plain-text','@example.test','learner@','learner example@test'])assert.equal(request({email}),false);
 assert.equal(request({phone:'+919999999991'}),false);
 for(const code of ['12345','1234567','abcdef'])assert.equal(verify({email:'otp@example.test',code,name:'Synthetic'}),false);
});

test('Phase 2 contracts constrain evidence, schedules, capacity and private waitlist inputs',()=>{
 const upload=validator('EvidenceUpload');
 const evidence={expectedVersion:1,kind:'IDENTITY',mediaType:'application/pdf',contentBase64:'JVBERi0='};
 assert(upload(evidence));assert.equal(upload({...evidence,status:'CLEAN'}),false);assert.equal(upload({...evidence,mediaType:'image/svg+xml'}),false);
 const schedule=validator('SchedulePreferences');const windows={timezone:'Asia/Kolkata',slots:[{startsAt:'2026-10-15T06:00:00Z',endsAt:'2026-10-15T07:00:00Z'}]};
 assert(schedule(windows));assert.equal(schedule({...windows,timezone:'UTC'}),false);assert.equal(schedule({...windows,slots:[]}),false);
 const capacity=validator('CapacityInput');assert(capacity({expectedVersion:1,maxActiveStudents:10,travelAccepted:true}));assert.equal(capacity({expectedVersion:1,maxActiveStudents:101,travelAccepted:true}),false);
 const waitlist=validator('WaitlistInput');const unsupported={grade:11,board:'ICSE',subject:'History',language:'English',mode:'ONLINE',region:'Delhi'};
 assert(waitlist(unsupported));assert.equal(waitlist({...unsupported,alias:'Unnecessary child identity'}),false);
});
