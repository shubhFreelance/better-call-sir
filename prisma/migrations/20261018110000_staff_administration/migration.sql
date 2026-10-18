ALTER TABLE "Account" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0 CHECK("authVersion">=0);
ALTER TABLE "Session" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0 CHECK("authVersion">=0);
CREATE TABLE "StaffChange" (
 id UUID PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('CREATE','CHANGE','SUSPEND','RECOVER')),
 "targetAccountId" UUID REFERENCES "Account"(id), email TEXT NOT NULL, name TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('ADMIN','OPERATOR','REVIEWER','FINANCE')), region TEXT NOT NULL,
 "expectedAuthVersion" INTEGER NOT NULL CHECK("expectedAuthVersion">=0),
 "proposerId" UUID NOT NULL REFERENCES "Account"(id), "proposerAuthVersion" INTEGER NOT NULL CHECK("proposerAuthVersion">=0), "approverId" UUID REFERENCES "Account"(id),
 reason TEXT NOT NULL, "evidenceRef" TEXT NOT NULL, "decisionReason" TEXT,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), "expiresAt" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "decidedAt" TIMESTAMP(3),
 CHECK("proposerId" IS DISTINCT FROM "targetAccountId"),
 CHECK("approverId" IS NULL OR ("approverId"<>"proposerId" AND "approverId" IS DISTINCT FROM "targetAccountId")),
 CHECK(status<>'APPROVED' OR "approverId" IS NOT NULL)
);
CREATE INDEX "StaffChange_status_id_idx" ON "StaffChange"(status,id);
