import { test } from "node:test";
import assert from "node:assert/strict";
import { migrateTestDatabase } from "./helpers/test-migrations";
test("SQL migration acceptance refuses application, system and remote databases before connecting", async () => {
  for (const url of [
    "postgresql://localhost/bcs_dev",
    "postgresql://localhost/postgres",
    "postgresql://localhost/bcs_test_not_a_generated_id",
    "postgresql://example.invalid/bcs_test_" + "a".repeat(32),
  ])
    await assert.rejects(() =>
      migrateTestDatabase({ BCS_TEST_SQL_MIGRATIONS: "1", DATABASE_URL: url }),
    );
});
