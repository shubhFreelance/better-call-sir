CREATE TABLE "GuardianVerification" (
 "id" UUID PRIMARY KEY, "learnerId" UUID REFERENCES "Child"("id"), "guardianId" UUID NOT NULL REFERENCES "Account"("id"), "region" TEXT NOT NULL,
 "guardianName" TEXT NOT NULL, "learnerName" TEXT NOT NULL, "relationship" TEXT NOT NULL CHECK ("relationship" IN ('PARENT','SIBLING','OTHER')),
 "ageBand" TEXT NOT NULL CHECK ("ageBand" IN ('UNDER_15','15_TO_17','18_PLUS')),
 "managementMode" TEXT NOT NULL DEFAULT 'GUARDIAN_ONLY' CHECK ("managementMode" IN ('GUARDIAN_ONLY','SHARED','STUDENT_LED')),
 "studentEmail" TEXT, "studentAccountId" UUID REFERENCES "Account"("id"), "studentAcknowledgedAt" TIMESTAMP(3),
 "acknowledgmentMethod" TEXT NOT NULL CHECK ("acknowledgmentMethod" IN ('STUDENT_ACCOUNT','STAFF_CALL')),
 "guardianAcknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "documentNamesGuardian" BOOLEAN NOT NULL,
 "currentEvidenceId" UUID, "status" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT','PENDING','CHANGES_REQUESTED','APPROVED','REJECTED','CANCELLED','REVOKED','DELETED')),
 "reason" TEXT, "reviewerId" UUID REFERENCES "Account"("id"), "reviewReference" TEXT, "reviewedAt" TIMESTAMP(3), "callMethod" TEXT CHECK ("callMethod" IN ('VIDEO','PHONE')),
 "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version">0), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CHECK ("studentAccountId" IS NULL OR "studentAccountId"<>"guardianId")
);
CREATE INDEX "GuardianVerification_guardianId_id_idx" ON "GuardianVerification"("guardianId","id");
CREATE INDEX "GuardianVerification_region_status_id_idx" ON "GuardianVerification"("region","status","id");
CREATE INDEX "GuardianVerification_studentEmail_id_idx" ON "GuardianVerification"("studentEmail","id");
CREATE TABLE "GuardianEvidence" (
 "id" UUID PRIMARY KEY, "verificationId" UUID NOT NULL REFERENCES "GuardianVerification"("id"), "mediaType" TEXT NOT NULL CHECK ("mediaType" IN ('image/png','image/jpeg')),
 "size" INTEGER NOT NULL CHECK ("size">0 AND "size"<=5242880), "sha256" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'QUARANTINED' CHECK ("status" IN ('QUARANTINED','CLEAN','INFECTED','DELETED')),
 "scannerVersion" TEXT, "scannedAt" TIMESTAMP(3), "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "version" INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX "GuardianEvidence_verificationId_id_idx" ON "GuardianEvidence"("verificationId","id");
ALTER TABLE "GuardianVerification" ADD CONSTRAINT "GuardianVerification_currentEvidenceId_fkey" FOREIGN KEY ("currentEvidenceId") REFERENCES "GuardianEvidence"("id");
ALTER TABLE "Child" ADD COLUMN "guardianVerificationId" UUID REFERENCES "GuardianVerification"("id");
CREATE UNIQUE INDEX "Child_guardianVerificationId_key" ON "Child"("guardianVerificationId");
CREATE FUNCTION protect_guardian_verification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."guardianId"<>OLD."guardianId" OR NEW.region<>OLD.region OR (OLD."learnerId" IS NOT NULL AND NEW."learnerId" IS DISTINCT FROM OLD."learnerId") THEN
  RAISE EXCEPTION 'Guardian verification ownership and consumption are immutable';
 END IF;
 IF OLD.status IN ('APPROVED','REVOKED') AND NEW.status<>'DELETED' AND
  ROW(NEW."guardianName",NEW."learnerName",NEW.relationship,NEW."ageBand",NEW."managementMode",NEW."studentEmail",NEW."studentAccountId",NEW."studentAcknowledgedAt",NEW."guardianAcknowledgedAt",NEW."acknowledgmentMethod",NEW."documentNamesGuardian",NEW."currentEvidenceId") IS DISTINCT FROM
  ROW(OLD."guardianName",OLD."learnerName",OLD.relationship,OLD."ageBand",OLD."managementMode",OLD."studentEmail",OLD."studentAccountId",OLD."studentAcknowledgedAt",OLD."guardianAcknowledgedAt",OLD."acknowledgmentMethod",OLD."documentNamesGuardian",OLD."currentEvidenceId") THEN
  RAISE EXCEPTION 'Approved relationship evidence cannot be rewritten';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guardian_verification_protection BEFORE UPDATE ON "GuardianVerification" FOR EACH ROW EXECUTE FUNCTION protect_guardian_verification();
