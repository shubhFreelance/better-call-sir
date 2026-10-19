-- Epoch-zero receipts remain recoverable; older receipts from a later epoch require current-record review.
ALTER TABLE "Idempotency" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0 CHECK("authVersion">=0);
