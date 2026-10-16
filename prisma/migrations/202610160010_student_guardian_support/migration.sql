CREATE TABLE "StudentGuardianGrant" (
 id UUID PRIMARY KEY, "studentAccountId" UUID NOT NULL REFERENCES "IndependentStudentProfile"("accountId") ON DELETE CASCADE,
 "recipientEmail" TEXT NOT NULL, "supportMode" TEXT NOT NULL CHECK("supportMode" IN ('ADVICE','MANAGE')),
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACTIVE','DECLINED','REVOKED')), "acceptedById" UUID REFERENCES "Account"(id),
 "expiresAt" TIMESTAMP(3) NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(status<>'ACTIVE' OR "acceptedById" IS NOT NULL)
);
CREATE INDEX "StudentGuardianGrant_studentAccountId_id_idx" ON "StudentGuardianGrant"("studentAccountId",id);
CREATE INDEX "StudentGuardianGrant_recipientEmail_id_idx" ON "StudentGuardianGrant"("recipientEmail",id);
CREATE UNIQUE INDEX student_one_active_guardian ON "StudentGuardianGrant"("studentAccountId") WHERE status='ACTIVE';
CREATE UNIQUE INDEX student_one_pending_guardian ON "StudentGuardianGrant"("studentAccountId") WHERE status='PENDING';
CREATE OR REPLACE FUNCTION validate_student_case_owner() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' AND NEW."studentEnquiryId" IS NOT DISTINCT FROM OLD."studentEnquiryId" AND NEW."accountId"=OLD."accountId" THEN RETURN NEW; END IF;
 IF NEW."studentEnquiryId" IS NOT NULL THEN
  IF NEW."requestId" IS NOT NULL OR NEW."placementId" IS NOT NULL OR NEW."reservationId" IS NOT NULL OR NOT EXISTS(SELECT 1 FROM "StudentEnquiry" e WHERE e.id=NEW."studentEnquiryId" AND (e."studentAccountId"=NEW."accountId" OR EXISTS(SELECT 1 FROM "StudentGuardianGrant" g WHERE g."studentAccountId"=e."studentAccountId" AND g."acceptedById"=NEW."accountId" AND g.status='ACTIVE' AND g."supportMode"='MANAGE') OR EXISTS(SELECT 1 FROM "StudentCandidate" c JOIN "Teacher" t ON t.id=c."teacherId" WHERE c."enquiryId"=e.id AND t."accountId"=NEW."accountId" AND c.position IS NOT NULL) OR EXISTS(SELECT 1 FROM "StudentArrangement" a JOIN "Teacher" t ON t.id=a."teacherId" WHERE a."enquiryId"=e.id AND t."accountId"=NEW."accountId"))) THEN RAISE EXCEPTION 'Student support context must belong to the reporter' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN SELECT region INTO NEW.region FROM "StudentEnquiry" WHERE id=NEW."studentEnquiryId"; END IF;
 END IF; RETURN NEW; END $$;
