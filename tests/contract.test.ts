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
test("intake contract accepts expanded school subjects while rejecting role fields, invalid money and grades", () => {
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
    { grade: 13 },
    { subject: "" },
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
test('MFA contract separates public status from private enrollment and limits verification inputs',()=>{
 const input=validator('MfaVerificationInput');assert(input({code:'123456'}));assert.equal(input({code:'12345'}),false);assert.equal(input({code:'123456',accountId:ids.admin}),false);
 const status=validator('MfaStatus');assert(status({enabled:true,verifiedUntil:null,recoveryCodesRemaining:8}));assert.equal(status({enabled:true,verifiedUntil:null,recoveryCodesRemaining:8,secret:'private'}),false);
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

test("OTP locale is optional, bounded to English/Hindi and cannot assign account permissions", () => {
 const check=validator("OtpRequest");
 assert(check({email:"guardian@example.test"}));
 for(const locale of ["en","hi"]) assert(check({email:"guardian@example.test",locale}));
 for(const patch of [{locale:"fr"},{locale:null},{locale:"hi",role:"ADMIN"}]) assert.equal(check({email:"guardian@example.test",...patch}),false);
});

test('independent signup contract requires explicit declarations and forbids authority assignment',()=>{
 const validate=validator('IndependentStudentSignup'),body={education:{stage:'COLLEGE',institutionName:'Synthetic college',subjects:['Physics'],courseName:'BSc',university:'Synthetic university',studyYear:1},managementPreference:'SELF_DIRECTED',adultDeclaration:true,consentAccepted:true,policyVersion:'independent-student-development-v1'};
 assert(validate(body));for(const patch of [{adultDeclaration:false},{consentAccepted:false},{managementPreference:'GUARDIAN_GUIDED'},{role:'ADMIN'},{guardianId:ids.guardian},{education:{...body.education,studyYear:0}}])assert.equal(validate({...body,...patch}),false);
});

test('student enquiry contracts preserve weekly limits, explicit review and server-owned account/education fields',()=>{
 const validate=validator('StudentEnquiryInput'),body={expectedProfileVersion:1,discoveryMethod:'ASSISTED',subject:'Maths',mode:'ONLINE',language:'English',locality:'Synthetic locality',budgetPaise:100000,preferences:{timezone:'Asia/Kolkata',weekly:[{weekday:1,startMinute:960,endMinute:1080}]},confirmed:true};
 assert(validate(body));for(const patch of [{studentAccountId:ids.student},{educationScope:{stage:'SCHOOL',grade:8,board:'CBSE'}},{confirmed:false},{budgetPaise:100.5},{preferences:{timezone:'UTC',weekly:body.preferences.weekly}}])assert.equal(validate({...body,...patch}),false);
});

test("staff access contracts require explicit dedicated identities and independent decisions without mass assignment", () => {
  const proposal=validator("StaffProposal"), decision=validator("StaffDecision");
  const common={reason:"Reviewed staffing need",evidenceRef:"review:staff-identity",confirmed:true};
  assert(proposal({...common,kind:"CREATE",email:"reviewer@example.test",name:"Reviewer",role:"REVIEWER",region:"Raipur"}));
  assert(proposal({...common,kind:"RECOVER",targetAccountId:ids.admin,expectedAuthVersion:0}));
  assert(!proposal({...common,kind:"CREATE",email:"reviewer@example.test"}));
  assert(!proposal({...common,kind:"RECOVER",targetAccountId:ids.admin,expectedAuthVersion:0,role:"ADMIN"}));
  assert(!proposal({...common,kind:"CHANGE",targetAccountId:ids.admin,expectedAuthVersion:0,role:"GUARDIAN",region:"Raipur"}));
  assert(decision({expectedVersion:1,decision:"APPROVE",reason:"Independent check",independentlyVerified:true}));
  assert(!decision({expectedVersion:1,decision:"APPROVE",reason:"Independent check",independentlyVerified:false}));
});

test("commercial configuration contracts keep hiring policy bounds, independent review and explicit rollback versions",()=>{
 const validate=validator('CommercialProposal'),common={expectedVersion:0,reason:'Policy review',evidenceRef:'policy:approved',confirmed:true};
 assert(validate({...common,kind:'FEE',fee:{placementBasisPoints:2500,placementCapPaise:150000}}));assert(!validate({...common,kind:'FEE',fee:{placementBasisPoints:2501,placementCapPaise:150000}}));assert(!validate({...common,kind:'FEE',fee:{placementBasisPoints:1000,placementCapPaise:-1}}));assert(validate({...common,kind:'ROLLBACK',restoreVersion:0}));assert(!validate({...common,kind:'ROLLBACK'}));assert(!validate({...common,kind:'ROLLBACK',restoreVersion:0,enabled:true}));
});

test('minimum tuition contracts require explicit versioned confirmation and reject financial mass assignment',()=>{
 const input=validator('TuitionCreditInput'),body={expectedVersion:1,confirmed:true,amountPaise:100001,paidOn:'2026-10-19',reference:'Synthetic credit'};
 assert(input(body));for(const patch of [{amountPaise:0},{amountPaise:1.5},{amountPaise:2000001},{expectedVersion:0},{confirmed:false},{proposerId:ids.guardian}])assert.equal(input({...body,...patch}),false);
 const start=validator('TuitionCommencementInput');assert(start({expectedVersion:1,confirmed:true,action:'CONFIRM',commencementDate:'2026-10-19'}));assert.equal(start({expectedVersion:1,confirmed:true,action:'CONFIRM',commencementDate:'today'}),false);
});
