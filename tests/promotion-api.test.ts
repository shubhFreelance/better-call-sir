import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { parseEnv } from "node:util";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { Pool } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ids } from "../packages/test-fixtures/src";
import { totp } from "../apps/api/src/modules/identity/totp";
import { operationValidator } from "./helpers/contract";
const config = parseEnv(
  readFileSync(existsSync(".env") ? ".env" : ".env.example", "utf8"),
);
const url = new URL(config.DATABASE_URL);
assert(["localhost", "127.0.0.1"].includes(url.hostname));
const pool = new Pool({ connectionString: url.href }),
  name = "bcs_promotions_" + randomUUID().replaceAll("-", "");
url.pathname = "/" + name;
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.href }),
});
let server: ChildProcess;
class Client {
  cookies = "";
  csrf = "";
  async call(
    path: string,
    body?: unknown,
    key = randomUUID(),
    csrf = this.csrf,
  ) {
    const r = await fetch("http://127.0.0.1:4199/api/v1" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Cookie: this.cookies,
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf,
        "Idempotency-Key": key,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await r.json();
    const cookies = r.headers.getSetCookie();
    if (cookies.length)
      this.cookies = cookies.map((c) => c.split(";")[0]).join("; ");
    if (data.csrfToken) this.csrf = data.csrfToken;
    return { status: r.status, data };
  }
}
async function login(id: string) {
  const c = new Client();
  const r = await c.call("/dev/session", { accountId: id });
  assert.equal(r.status, 201);
  if (r.data.account.role === "ADMIN") {
    const e = await c.call("/auth/mfa/enrollment", {});
    const v = await c.call("/auth/mfa/verification", {
      code: totp(e.data.secret, BigInt(Math.floor(Date.now() / 30000))),
    });
    assert.equal(v.status, 201);
  }
  return c;
}
let teacher: Client, admin: Client, parent: Client, other: Client;
before(
  async () => {
    await pool.query(`CREATE DATABASE "${name}"`);
    const migration = new Pool({ connectionString: url.href });
    // Test the checked-in SQL independently of the hosted Prisma CLI engine.
    for (const file of readdirSync("prisma/migrations").sort())
      if (existsSync(`prisma/migrations/${file}/migration.sql`))
        await migration.query(
          readFileSync(`prisma/migrations/${file}/migration.sql`, "utf8"),
        );
    await migration.end();
    const env = {
      ...process.env,
      ...config,
      DATABASE_URL: url.href,
      APP_MODE: "development",
      NODE_ENV: "test",
      PORT: "4199",
      WEB_ORIGIN: "http://localhost:3000",
      MFA_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
      OTP_HASH_KEY: randomBytes(32).toString("base64"),
      EMAIL_DELIVERY_MODE: "sandbox",
    };
    execFileSync(process.execPath, ["--import", "tsx", "prisma/seed.ts"], {
      env,
      stdio: "pipe",
    });
    execFileSync(
      process.execPath,
      ["node_modules/typescript/bin/tsc", "-p", "apps/api/tsconfig.json"],
      { env, stdio: "pipe" },
    );
    server = spawn(process.execPath, ["apps/api/dist/main.js"], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let log = "";
    server.stdout?.on("data", (b) => {
      log += b.toString();
    });
    server.stderr?.on("data", (b) => {
      log += b.toString();
    });
    for (let i = 0; i < 100; i++) {
      if (server.exitCode !== null) throw new Error("API exited: " + log);
      try {
        if ((await fetch("http://127.0.0.1:4199/api/v1/health/ready")).ok)
          break;
      } catch {}
      if (i === 99)
        throw new Error("Promotion API readiness timed out: " + log);
      await new Promise((r) => setTimeout(r, 100));
    }
    [teacher, admin, parent, other] = await Promise.all(
      [
        ids.teacherAccount,
        ids.admin,
        ids.guardian,
        "10000000-0000-4000-8000-000000000011",
      ].map(login),
    );
  },
  { timeout: 60000 },
);
after(async () => {
  if (server) {
    server.kill();
    await new Promise<void>((resolve) =>
      server.exitCode !== null
        ? resolve()
        : server.once("exit", () => resolve()),
    );
  }
  await db.$disconnect();
  await pool.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await pool.end();
});
const request = (placement = "SEARCH", planVersion = 1) => ({
  placement,
  planVersion,
  confirmed: true,
});
const decision = (action: string, expectedVersion: number, extra = {}) => ({
  action,
  expectedVersion,
  reason: "Synthetic reviewed campaign decision",
  confirmed: true,
  ...extra,
});
let campaign: string;
test("promotion boundaries enforce role, CSRF, strict bodies and owned cursors", async () => {
  assert.equal((await new Client().call("/promotions")).status, 401);
  assert.equal((await parent.call("/promotions")).status, 403);
  assert.equal((await parent.call("/promotions", request())).status, 403);
  assert.equal(
    (await teacher.call("/promotions", request(), randomUUID(), "wrong"))
      .status,
    403,
  );
  assert.equal(
    (await teacher.call("/promotions", { ...request(), amountPaise: 1 }))
      .status,
    400,
  );
  const plans = await new Client().call("/promotion-plans");
  assert.equal(plans.status, 200);
  assert.deepEqual(
    plans.data.items.map((p: any) => p.amountPaise),
    [29900, 59900, 99900],
  );
  const valid = operationValidator("/promotion-plans", "get", "200");
  assert(valid(plans.data), JSON.stringify(valid.errors));
  const key = randomUUID(),
    created = await teacher.call("/promotions", request(), key);
  assert.equal(created.status, 201, JSON.stringify(created.data));
  campaign = created.data.id;
  assert.equal(
    (await teacher.call("/promotions", request(), key)).data.id,
    campaign,
  );
  assert.equal((await teacher.call("/promotions", request())).status, 409);
  assert.equal(
    await db.inboxNotification.count({
      where: { accountId: ids.teacherAccount, topic: "promotion.requested" },
    }),
    1,
  );
  assert.equal(
    await db.inboxNotification.count({
      where: { accountId: ids.admin, topic: "promotion.requested" },
    }),
    1,
  );
  assert.equal(
    (await other.call("/promotions?cursor=" + campaign)).status,
    404,
  );
  assert.equal(
    (
      await other.call(
        "/promotions/" + campaign + "/decision",
        decision("CANCEL", 1),
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await teacher.call(
        "/promotions/" + campaign + "/decision",
        decision("APPROVE", 1),
      )
    ).status,
    409,
  );
});
test("activation requires admin payment review; price quotes stay immutable", async () => {
  assert.equal(
    (
      await admin.call(
        "/promotions/" + campaign + "/decision",
        decision("APPROVE", 1),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await admin.call("/admin/promotion-plans/SEARCH", {
        expectedVersion: 1,
        amountPaise: 90000,
        days: 7,
        enabled: true,
        confirmed: true,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await admin.call("/admin/promotion-plans/SEARCH", {
        expectedVersion: 1,
        amountPaise: 39900,
        days: 7,
        enabled: true,
        confirmed: true,
      })
    ).status,
    201,
  );
  const before = await new Client().call("/teachers");
  const active = await admin.call(
    "/promotions/" + campaign + "/decision",
    decision("APPROVE", 1, {
      paymentReference: "synthetic-payment-001",
      paymentConfirmed: true,
    }),
  );
  assert.equal(active.status, 201, JSON.stringify(active.data));
  assert.equal(active.data.amountPaise, 29900);
  const notice = await db.inboxNotification.findFirstOrThrow({
    where: { accountId: ids.teacherAccount, topic: "promotion.approve" },
  });
  assert.equal(notice.important, true);
  assert.equal(notice.actionPath, "/dashboard/promotions");
  assert.equal(
    new Date(active.data.endsAt).getTime() -
      new Date(active.data.startsAt).getTime(),
    7 * 86400000,
  );
  const response = await new Client().call(
    "/teachers?promotionPlacement=SEARCH",
  );
  assert.equal(response.status, 200);
  assert(response.data.sponsored.some((t: any) => t.id === ids.teacher));
  assert.deepEqual(response.data.items, before.data.items);
  const valid = operationValidator("/teachers", "get", "200");
  assert(valid(response.data), JSON.stringify(valid.errors));
  assert.equal(
    (
      await admin.call(
        "/promotions/" + campaign + "/decision",
        decision("PAUSE", 1),
      )
    ).status,
    409,
  );
  assert.deepEqual(
    (
      await new Client().call(
        "/teachers?promotionPlacement=SEARCH&maxMonthlyPaise=50000",
      )
    ).data.sponsored,
    [],
  );
  assert.deepEqual(
    (
      await new Client().call(
        "/teachers?promotionPlacement=SEARCH&subject=Biology",
      )
    ).data.sponsored,
    [],
  );
});
test("promotion activity and scoped reports measure real daily audience without disclosing viewers", async () => {
  const event = {teacherId:ids.teacher,promotionId:campaign,kind:"CARD_CLICK"};
  assert.equal((await new Client().call("/promotion-activity",event)).status,401);
  assert.equal((await teacher.call("/promotion-activity",event)).status,403);
  assert.equal((await parent.call("/promotion-activity",event,randomUUID(),"wrong")).status,403);
  assert.equal((await parent.call("/promotion-activity",{...event,viewerId:ids.admin})).status,400);
  assert.equal((await parent.call("/promotion-activity",{...event,promotionId:randomUUID()})).data.recorded,false);
  const writes = await Promise.all([parent.call("/promotion-activity",event),parent.call("/promotion-activity",event)]);
  assert.equal(writes.filter(r=>r.data.recorded).length,1,JSON.stringify(writes));
  const student = await login(ids.student);
  assert.equal((await student.call("/promotion-activity",event)).data.recorded,true);
  for (const viewer of [parent,student]) assert.equal((await viewer.call("/promotion-activity",{...event,kind:"PROFILE_VISIT"})).data.recorded,true);
  assert.equal((await parent.call("/promotion-activity",{teacherId:ids.teacher,kind:"PROFILE_VISIT"})).data.recorded,false);
  assert.equal((await parent.call("/promotions/analytics")).status,403);
  assert.equal((await other.call("/promotions/analytics?teacherId="+ids.teacher)).status,403);
  assert.equal((await other.call("/promotions?teacherId="+ids.teacher)).status,403);
  assert.equal((await teacher.call("/promotions/analytics?month=2026-13")).status,400);
  assert.equal((await teacher.call("/promotions/analytics?month=9999-01")).status,400);
  const r=await teacher.call("/promotions/analytics");
  assert.equal(r.status,200,JSON.stringify(r.data));
  const validate=operationValidator("/promotions/analytics","get","200");
  assert(validate(r.data),JSON.stringify(validate.errors));
  assert.equal(r.data.summary.clicks,2);assert.equal(r.data.summary.parents,1);assert.equal(r.data.summary.students,1);
  assert.equal(r.data.summary.visitsToday,2);assert.equal(r.data.summary.visitsMonth,2);
  assert.equal(r.data.campaigns[0].id,campaign);assert.equal(r.data.campaigns[0].clicks,2);
  assert.equal(r.data.daily.length,1);
  const reportText=JSON.stringify(r.data);
  assert(!reportText.includes(ids.guardian));assert(!reportText.includes(ids.student));assert(!reportText.includes('viewerId'));
  const all=await admin.call("/promotions/analytics");assert.equal(all.status,200,JSON.stringify(all.data));assert.equal(all.data.summary.clicks,2);
  const requestRow=await db.tuitionRequest.findUniqueOrThrow({where:{id:ids.request}});
  for (let i=0;i<11;i++) {
    const sourceId=randomUUID();
    await db.tuitionRequest.create({data:{...requestRow,id:sourceId,discoveryMethod:"MANUAL",preferredTeacherId:ids.teacher}});
    await db.directEnquiry.create({data:{kind:"GUARDIAN",sourceId,ownerId:ids.guardian,childId:ids.child,teacherId:ids.teacher,region:"Raipur"}});
  }
  const leads=await teacher.call("/promotions/analytics");
  assert.equal(leads.data.summary.enquiries,11);assert.equal(leads.data.summary.interestedParents,1);
  assert.equal(leads.data.enquiries.items.length,10);assert.equal((await teacher.call("/promotions/analytics?leadPage=2")).data.enquiries.items.length,1);
  assert(leads.data.enquiries.items.every((e:any)=>e.name&&!('email' in e)&&!('phone' in e)));
  assert.equal((await admin.call("/promotions?teacherId="+ids.teacher)).data.items.every((p:any)=>p.teacherId===ids.teacher),true);
  const privacy=await db.privacyRequest.create({data:{kind:"DELETION",scope:"ACCOUNT",resourceId:ids.guardian,accountId:ids.guardian,reason:"Synthetic analytics privacy pause"}});
  assert.equal((await parent.call("/promotion-activity",event)).data.recorded,false);
  assert.equal((await teacher.call("/promotions/analytics")).data.summary.clicks,0);
  assert.equal((await teacher.call("/promotions/analytics")).data.enquiries.total,0);
  await db.privacyRequest.delete({where:{id:privacy.id}});
  await db.consent.update({where:{guardianId:ids.guardian},data:{withdrawnAt:new Date()}});
  assert.equal((await teacher.call("/promotions/analytics")).data.enquiries.total,0);
  await db.consent.update({where:{guardianId:ids.guardian},data:{withdrawnAt:null}});
  const old = new Date(Date.now()-100*86400000);
  await db.promotionActivity.create({data:{id:randomUUID(),teacherId:ids.teacher,viewerId:ids.guardian,audience:"GUARDIAN",kind:"PROFILE_VISIT",day:old,createdAt:old}});
  assert.equal((await teacher.call("/promotions/analytics")).data.summary.visits,2);
});

test("pause/resume, expiry, disabled plans and teachers stop public delivery", async () => {
  const paused = await teacher.call(
    "/promotions/" + campaign + "/decision",
    decision("PAUSE", 2),
  );
  assert.equal(paused.status, 201);
  assert.equal((await parent.call("/promotion-activity",{teacherId:ids.teacher,promotionId:campaign,kind:"CARD_CLICK"})).data.recorded,false);
  assert.deepEqual(
    (await new Client().call("/teachers?promotionPlacement=SEARCH")).data
      .sponsored,
    [],
  );
  const resumed = await teacher.call(
    "/promotions/" + campaign + "/decision",
    decision("RESUME", 3),
  );
  assert.equal(resumed.status, 201);
  assert.equal(resumed.data.endsAt, paused.data.endsAt);
  const staffPaused = await admin.call(
    "/promotions/" + campaign + "/decision",
    decision("PAUSE", 4),
  );
  assert.equal(staffPaused.status, 201);
  assert.equal(staffPaused.data.pausedByAdmin, true);
  assert.equal(
    (
      await teacher.call(
        "/promotions/" + campaign + "/decision",
        decision("RESUME", 5),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await admin.call(
        "/promotions/" + campaign + "/decision",
        decision("RESUME", 5),
      )
    ).status,
    201,
  );
  await db.promotionPlan.update({
    where: { id: "SEARCH" },
    data: { enabled: false },
  });
  assert.deepEqual(
    (await new Client().call("/teachers?promotionPlacement=SEARCH")).data
      .sponsored,
    [],
  );
  await db.promotionPlan.update({
    where: { id: "SEARCH" },
    data: { enabled: true },
  });
  await db.teacher.update({
    where: { id: ids.teacher },
    data: { maxActiveStudents: 1 },
  });
  assert.deepEqual(
    (await new Client().call("/teachers?promotionPlacement=SEARCH")).data
      .sponsored,
    [],
  );
  await db.teacher.update({
    where: { id: ids.teacher },
    data: { maxActiveStudents: 10 },
  });
  await db.account.update({
    where: { id: ids.teacherAccount },
    data: { disabled: true },
  });
  assert.deepEqual(
    (await new Client().call("/teachers?promotionPlacement=SEARCH")).data
      .sponsored,
    [],
  );
  await db.account.update({
    where: { id: ids.teacherAccount },
    data: { disabled: false },
  });
  await db.teacherPromotion.update({
    where: { id: campaign },
    data: {
      startsAt: new Date(Date.now() - 9 * 86400000),
      endsAt: new Date(Date.now() - 86400000),
    },
  });
  assert.deepEqual(
    (await new Client().call("/teachers?promotionPlacement=SEARCH")).data
      .sponsored,
    [],
  );
  assert.equal(
    (await teacher.call("/promotions?status=EXPIRED")).data.items[0].status,
    "EXPIRED",
  );
  assert.equal(
    (
      await teacher.call(
        "/promotions/" + campaign + "/decision",
        decision("RESUME", 4),
      )
    ).status,
    409,
  );
});
test("space placements use owned education/subject and do not expose private data", async () => {
  const created = await teacher.call("/promotions", request("SPACE"));
  assert.equal(created.status, 201);
  const id = created.data.id;
  assert.equal(
    (
      await admin.call(
        "/promotions/" + id + "/decision",
        decision("APPROVE", 1, {
          paymentReference: "synthetic-payment-001",
          paymentConfirmed: true,
        }),
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await admin.call(
        "/promotions/" + id + "/decision",
        decision("APPROVE", 1, {
          paymentReference: "synthetic-payment-002",
          paymentConfirmed: true,
        }),
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await new Client().call(
        "/teachers?promotionPlacement=SPACE&learnerId=" +
          ids.child +
          "&subject=Maths",
      )
    ).status,
    401,
  );
  const dedicated = await parent.call(
    "/sponsored-teachers?promotionPlacement=SPACE&learnerId=" +
      ids.child +
      "&subject=Maths",
  );
  assert.equal(dedicated.status, 200);
  const sponsoredValid = operationValidator(
    "/sponsored-teachers",
    "get",
    "200",
  );
  assert(sponsoredValid(dedicated.data));
  assert.equal(
    (
      await parent.call(
        "/teachers?promotionPlacement=SPACE&learnerId=" +
          ids.otherChild +
          "&subject=Maths",
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await parent.call(
        "/teachers?promotionPlacement=SPACE&learnerId=" +
          ids.child +
          "&subject=Biology",
      )
    ).status,
    409,
  );
  const result = await parent.call(
    "/teachers?promotionPlacement=SPACE&learnerId=" +
      ids.child +
      "&subject=Maths",
  );
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert(result.data.sponsored.some((t: any) => t.id === ids.teacher));
  for (const t of result.data.sponsored)
    for (const key of [
      "learnerId",
      "accountId",
      "paymentReference",
      "campaignId",
      "reviewNote",
    ])
      assert.equal(key in t, false);
  await db.consent.update({
    where: { guardianId: ids.guardian },
    data: { withdrawnAt: new Date() },
  });
  assert.equal(
    (
      await parent.call(
        "/teachers?promotionPlacement=SPACE&learnerId=" +
          ids.child +
          "&subject=Maths",
      )
    ).status,
    403,
  );
});
test("parallel requests cannot duplicate campaigns and admin approval requires recent MFA", async () => {
  const responses = await Promise.all([
    teacher.call("/promotions", request("HOME")),
    teacher.call("/promotions", request("HOME")),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
  const id = responses.find((r) => r.status === 201)!.data.id;
  await db.session.updateMany({
    where: { accountId: ids.admin },
    data: { mfaVerifiedAt: new Date(Date.now() - 360000) },
  });
  assert.equal(
    (
      await admin.call(
        "/promotions/" + id + "/decision",
        decision("APPROVE", 1, {
          paymentReference: "synthetic-payment-003",
          paymentConfirmed: true,
        }),
      )
    ).status,
    403,
  );
});

test("teacher erasure cancels campaigns and scrubs private review notes and cached decisions", async () => {
  await db.session.updateMany({
    where: { accountId: ids.admin },
    data: { mfaVerifiedAt: new Date() },
  });
  const privacy = await teacher.call("/privacy-requests", {
    kind: "DELETION",
    scope: "ACCOUNT",
    resourceId: ids.teacherAccount,
    reason: "Synthetic teacher erasure",
  });
  assert.equal(privacy.status, 201, JSON.stringify(privacy.data));
  const result = await admin.call(
    "/admin/privacy-requests/" + privacy.data.id + "/reviews",
    {
      expectedVersion: 1,
      action: "FULFIL",
      reason: "Synthetic privacy review",
      policyVersion: "synthetic-v1",
      retentionReason:
        "Retain minimal paid promotion amount, reference and audit evidence",
      confirmed: true,
    },
  );
  assert.equal(result.status, 201, JSON.stringify(result.data));
  const campaigns = await db.teacherPromotion.findMany({
    where: { teacherId: ids.teacher },
  });
  assert(campaigns.length);
  assert.equal(await db.promotionActivity.count({where:{teacherId:ids.teacher}}),0);
  for (const row of campaigns) {
    assert.equal(row.status, "CANCELLED");
    assert.equal(row.reviewNote, null);
    assert.equal(
      await db.idempotency.count({
        where: { operation: { contains: "/promotions/" + row.id } },
      }),
      0,
    );
  }
  assert.equal(
    await db.idempotency.count({ where: { accountId: ids.teacherAccount } }),
    0,
  );
  assert.deepEqual(
    (
      await new Client().call(
        "/sponsored-teachers?promotionPlacement=SPACE&subject=Maths",
      )
    ).data.code,
    "LEARNING_SPACE_REQUIRED",
  );
  assert.deepEqual(
    (await new Client().call("/sponsored-teachers?promotionPlacement=HOME"))
      .data.items,
    [],
  );
});

test("family erasure removes viewer activity as well as private enquiry access", async () => {
  const t=await db.teacher.findFirstOrThrow({where:{accountId:{not:ids.teacherAccount}}});
  await db.promotionActivity.create({data:{id:randomUUID(),teacherId:t.id,viewerId:ids.guardian,kind:"PROFILE_VISIT",audience:"GUARDIAN",day:new Date()}});
  const privacy=await parent.call("/privacy-requests",{kind:"DELETION",scope:"ACCOUNT",resourceId:ids.guardian,reason:"Synthetic viewer erasure"});
  assert.equal(privacy.status,201,JSON.stringify(privacy.data));
  const result=await admin.call("/admin/privacy-requests/"+privacy.data.id+"/reviews",{expectedVersion:1,action:"FULFIL",reason:"Synthetic privacy review",policyVersion:"synthetic-v1",retentionReason:"Retain reviewed nonpersonal financial audit only",confirmed:true});
  assert.equal(result.status,201,JSON.stringify(result.data));
  assert.equal(await db.promotionActivity.count({where:{viewerId:{in:[ids.guardian,ids.student]}}}),0);
});
