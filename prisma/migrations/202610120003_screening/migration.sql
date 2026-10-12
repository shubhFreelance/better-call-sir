-- AlterTable
ALTER TABLE "Teacher" ADD COLUMN     "feePolicyVersion" TEXT NOT NULL DEFAULT 'pilot-v1',
ADD COLUMN     "feeTermsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "maxActiveStudents" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "profileRevision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "region" TEXT NOT NULL DEFAULT 'Raipur',
ADD COLUMN     "screeningValidUntil" TIMESTAMP(3),
ADD COLUMN     "travelAccepted" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Evidence" (
    "id" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUARANTINED',
    "scannerVersion" TEXT,
    "scannedAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationCheck" (
    "id" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "reviewerId" UUID NOT NULL,
    "profileRevision" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "evidenceId" UUID NOT NULL,
    "result" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "coverage" JSONB,
    "policyVersion" TEXT NOT NULL DEFAULT 'screening-v1',
    "validUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Evidence_teacherId_status_idx" ON "Evidence"("teacherId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationCheck_teacherId_profileRevision_kind_key" ON "VerificationCheck"("teacherId", "profileRevision", "kind");


ALTER TABLE "Evidence" ADD CONSTRAINT evidence_teacher_fk FOREIGN KEY ("teacherId") REFERENCES "Teacher"(id);
ALTER TABLE "Evidence" ADD CONSTRAINT evidence_metadata CHECK (size > 0 AND size <= 5242880 AND version > 0 AND status IN ('QUARANTINED','CLEAN','INFECTED') AND (status = 'QUARANTINED' OR ("scannerVersion" IS NOT NULL AND "scannedAt" IS NOT NULL)));
ALTER TABLE "Evidence" ADD CONSTRAINT evidence_teacher_key UNIQUE (id,"teacherId");
ALTER TABLE "VerificationCheck" ADD CONSTRAINT check_evidence_owner_fk FOREIGN KEY ("evidenceId","teacherId") REFERENCES "Evidence"(id,"teacherId");
ALTER TABLE "VerificationCheck" ADD CONSTRAINT check_reviewer_fk FOREIGN KEY ("reviewerId") REFERENCES "Account"(id);
ALTER TABLE "VerificationCheck" ADD CONSTRAINT check_values CHECK ("profileRevision">0 AND result IN ('PASSED','FAILED') AND kind IN ('IDENTITY','QUALIFICATIONS','CAPABILITY','REFERENCES'));
ALTER TABLE "Teacher" ADD CONSTRAINT teacher_capacity CHECK ("maxActiveStudents">=1 AND "maxActiveStudents"<=100 AND "profileRevision">0);
-- Existing approved fixtures remain synthetic; this is not a real screening backfill.
UPDATE "Teacher" t SET "screeningValidUntil"=CURRENT_TIMESTAMP+INTERVAL '180 days',"feeTermsAcceptedAt"=CURRENT_TIMESTAMP,"travelAccepted"=TRUE FROM "Account" a WHERE t."accountId"=a.id AND a.phone LIKE '+91000000%' AND t.status='APPROVED' AND t."screeningComplete";
CREATE TRIGGER verification_append_only BEFORE UPDATE OR DELETE ON "VerificationCheck" FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
