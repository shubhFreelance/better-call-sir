ALTER TABLE "StudentEnquiry" DROP CONSTRAINT "StudentEnquiry_status_check";
ALTER TABLE "StudentEnquiry" ADD CONSTRAINT "StudentEnquiry_status_check" CHECK(status IN ('SUBMITTED','HIRED','WITHDRAWN'));
ALTER TABLE "StudentEnquiry" ADD COLUMN "matchStatus" TEXT NOT NULL DEFAULT 'PENDING' CHECK("matchStatus" IN ('PENDING','MATCHED','NO_MATCH')), ADD COLUMN "matchRunId" UUID REFERENCES "Audit"(id), ADD COLUMN "selectedCandidateId" UUID, ADD COLUMN "excludedTeacherId" UUID REFERENCES "Teacher"(id), ADD COLUMN "rematchFromArrangementId" UUID UNIQUE;
CREATE TABLE "StudentCandidate" (
 id UUID PRIMARY KEY, "enquiryId" UUID NOT NULL REFERENCES "StudentEnquiry"(id) ON DELETE CASCADE, "teacherId" UUID NOT NULL REFERENCES "Teacher"(id), "runId" UUID NOT NULL REFERENCES "Audit"(id), score INTEGER NOT NULL, reasons TEXT[] NOT NULL, position INTEGER CHECK(position BETWEEN 1 AND 10), response TEXT NOT NULL DEFAULT 'PENDING' CHECK(response IN ('PENDING','ACCEPTED','DECLINED')), "expiresAt" TIMESTAMP(3) NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), UNIQUE("enquiryId","teacherId"), UNIQUE(id,"enquiryId")
);
CREATE INDEX "StudentCandidate_teacherId_expiresAt_idx" ON "StudentCandidate"("teacherId","expiresAt");
ALTER TABLE "StudentEnquiry" ADD CONSTRAINT student_selection_owner FOREIGN KEY("selectedCandidateId",id) REFERENCES "StudentCandidate"(id,"enquiryId");
CREATE TABLE "StudentArrangement" (
 id UUID PRIMARY KEY, "enquiryId" UUID UNIQUE REFERENCES "StudentEnquiry"(id) ON DELETE SET NULL, "studentAccountId" UUID NOT NULL REFERENCES "Account"(id), "teacherId" UUID NOT NULL REFERENCES "Teacher"(id), region TEXT NOT NULL REFERENCES "Region"(id), terms JSONB NOT NULL CHECK(jsonb_typeof(terms)='object'), status TEXT NOT NULL DEFAULT 'TERMS_PENDING' CHECK(status IN ('TERMS_PENDING','CONFIRMED','CLOSED')), "studentAcceptedAt" TIMESTAMP(3), "teacherAcceptedAt" TIMESTAMP(3), "closedAt" TIMESTAMP(3), "closureReason" TEXT, version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(status<>'CONFIRMED' OR ("studentAcceptedAt" IS NOT NULL AND "teacherAcceptedAt" IS NOT NULL))
);
CREATE INDEX "StudentArrangement_studentAccountId_id_idx" ON "StudentArrangement"("studentAccountId",id);
CREATE INDEX "StudentArrangement_teacherId_status_idx" ON "StudentArrangement"("teacherId",status);
ALTER TABLE "StudentEnquiry" ADD CONSTRAINT student_rematch_arrangement_fk FOREIGN KEY("rematchFromArrangementId") REFERENCES "StudentArrangement"(id);
CREATE OR REPLACE FUNCTION preserve_student_enquiry_criteria() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (to_jsonb(NEW)-'status'-'version'-'matchStatus'-'matchRunId'-'selectedCandidateId') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'version'-'matchStatus'-'matchRunId'-'selectedCandidateId') OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Student enquiry criteria are immutable and changes require a new version' USING ERRCODE='23514'; END IF;
 RETURN NEW; END $$;
CREATE FUNCTION preserve_student_arrangement_terms() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.terms IS DISTINCT FROM OLD.terms OR NEW."studentAccountId"<>OLD."studentAccountId" OR NEW."teacherId"<>OLD."teacherId" OR NEW.region<>OLD.region OR (NEW."enquiryId" IS DISTINCT FROM OLD."enquiryId" AND NEW."enquiryId" IS NOT NULL) THEN RAISE EXCEPTION 'Agreed tuition terms and participants are immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER student_terms_immutable BEFORE UPDATE ON "StudentArrangement" FOR EACH ROW EXECUTE FUNCTION preserve_student_arrangement_terms();
ALTER TABLE "SupportCase" ADD COLUMN "studentEnquiryId" UUID REFERENCES "StudentEnquiry"(id) ON DELETE SET NULL;
CREATE FUNCTION validate_student_case_owner() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW."studentEnquiryId" IS NOT NULL THEN
  IF NEW."requestId" IS NOT NULL OR NEW."placementId" IS NOT NULL OR NEW."reservationId" IS NOT NULL OR NOT EXISTS(SELECT 1 FROM "StudentEnquiry" e WHERE e.id=NEW."studentEnquiryId" AND (e."studentAccountId"=NEW."accountId" OR EXISTS(SELECT 1 FROM "StudentCandidate" c JOIN "Teacher" t ON t.id=c."teacherId" WHERE c."enquiryId"=e.id AND t."accountId"=NEW."accountId" AND c.position IS NOT NULL) OR EXISTS(SELECT 1 FROM "StudentArrangement" a JOIN "Teacher" t ON t.id=a."teacherId" WHERE a."enquiryId"=e.id AND t."accountId"=NEW."accountId"))) THEN RAISE EXCEPTION 'Student support context must belong to the reporter' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN SELECT region INTO NEW.region FROM "StudentEnquiry" WHERE id=NEW."studentEnquiryId"; END IF;
 END IF; RETURN NEW; END $$;
CREATE TRIGGER student_case_owner BEFORE INSERT OR UPDATE ON "SupportCase" FOR EACH ROW EXECUTE FUNCTION validate_student_case_owner();
