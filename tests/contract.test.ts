import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import Ajv from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { teachers, ids } from "../packages/test-fixtures/src";
const contract = JSON.parse(readFileSync("contracts/openapi.yaml", "utf8"));
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
const defs = JSON.parse(
  JSON.stringify(contract.components.schemas).replaceAll(
    "#/components/schemas/",
    "#/$defs/",
  ),
);
function validator(name: string) {
  return ajv.compile({ $defs: defs, $ref: "#/$defs/" + name });
}
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
