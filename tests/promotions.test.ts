import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextStatus,
  displayStatus,
  pricesOrdered,
  planDefaults,
} from "../apps/api/src/modules/promotions/policy";
test("promotion lifecycle separates review, ownership and expiration", () => {
  assert.equal(nextStatus("PENDING", "APPROVE", false), null);
  assert.equal(nextStatus("PENDING", "APPROVE", true), "ACTIVE");
  assert.equal(nextStatus("ACTIVE", "APPROVE", true), null);
  assert.equal(nextStatus("ACTIVE", "PAUSE", false), "PAUSED");
  assert.equal(nextStatus("PAUSED", "RESUME", false), "ACTIVE");
  assert.equal(nextStatus("PENDING", "REJECT", false), null);
  for (const status of ["CANCELLED", "EXPIRED", "REJECTED"])
    for (const action of ["APPROVE", "RESUME", "PAUSE", "CANCEL"] as const)
      assert.equal(nextStatus(status, action, true), null);
  assert.equal(
    displayStatus({ status: "ACTIVE", endsAt: new Date(1000) }, new Date(1000)),
    "EXPIRED",
  );
  assert.equal(
    displayStatus({ status: "PAUSED", endsAt: new Date(1000) }, new Date(1001)),
    "EXPIRED",
  );
  assert.equal(displayStatus({ status: "PENDING", endsAt: null }), "PENDING");
});
test("space ads retain highest daily price, with homepage above search", () => {
  assert(pricesOrdered([...planDefaults]));
  assert(
    !pricesOrdered(planDefaults.map((p) => ({ ...p, amountPaise: 29900 }))),
  );
  assert(
    !pricesOrdered(
      planDefaults.map((p) => ({ ...p, days: p.id === "SPACE" ? 30 : p.days })),
    ),
  );
  assert(!pricesOrdered([]));
});
