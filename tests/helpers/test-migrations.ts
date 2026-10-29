import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { Pool } from "pg";
export async function migrateTestDatabase(env: NodeJS.ProcessEnv) {
  if (env.BCS_TEST_SQL_MIGRATIONS !== "1") {
    execFileSync(
      process.execPath,
      ["node_modules/prisma/build/index.js", "migrate", "deploy"],
      { env, stdio: "pipe" },
    );
    return;
  }
  const url = new URL(env.MIGRATION_DATABASE_URL || env.DATABASE_URL || "");
  assert(
    ["localhost", "127.0.0.1"].includes(url.hostname),
    "SQL test migrations require loopback PostgreSQL.",
  );
  assert(
    /^\/bcs_(?:test|backup|bootstrap|teacherqa)_[a-f0-9]{32}$/.test(
      url.pathname,
    ),
    "SQL test migrations require a disposable test database.",
  );
  const pool = new Pool({ connectionString: url.href });
  try {
    // Empty metadata table supports runtime-permission tests; SQL mode never claims CLI-applied migrations.
    await pool.query(
      `CREATE TABLE "_prisma_migrations" (id VARCHAR(36) PRIMARY KEY,checksum VARCHAR(64) NOT NULL,finished_at TIMESTAMPTZ,migration_name VARCHAR(255) NOT NULL,logs TEXT,rolled_back_at TIMESTAMPTZ,started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,applied_steps_count INTEGER NOT NULL DEFAULT 0)`,
    );
    for (const migration of readdirSync("prisma/migrations").sort()) {
      const file = `prisma/migrations/${migration}/migration.sql`;
      if (existsSync(file)) await pool.query(readFileSync(file, "utf8"));
    }
  } finally {
    await pool.end();
  }
}
