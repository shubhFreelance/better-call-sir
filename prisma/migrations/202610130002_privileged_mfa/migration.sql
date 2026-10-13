ALTER TABLE "Session" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ADD COLUMN "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ADD COLUMN "mfaVerifiedAt" TIMESTAMP(3);
CREATE TABLE "MfaCredential" (
 "accountId" UUID PRIMARY KEY REFERENCES "Account" (id),
 "encryptedSecret" TEXT NOT NULL,
 "enrollmentFamilyId" UUID,
 "enrollmentExpiresAt" TIMESTAMP(3),
 "enabledAt" TIMESTAMP(3),
 "lastUsedStep" BIGINT NOT NULL DEFAULT -1,
 "recoveryHashes" TEXT[] NOT NULL DEFAULT '{}'
);
