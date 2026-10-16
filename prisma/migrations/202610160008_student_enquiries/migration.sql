CREATE TABLE "StudentEnquiry" (
 id UUID PRIMARY KEY,
 "studentAccountId" UUID NOT NULL REFERENCES "IndependentStudentProfile"("accountId") ON DELETE CASCADE,
 "profileVersion" INTEGER NOT NULL CHECK ("profileVersion">0),
 "educationScope" JSONB NOT NULL CHECK (jsonb_typeof("educationScope")='object' AND coalesce("educationScope"->>'stage' IN ('SCHOOL','COLLEGE'),false)),
 "discoveryMethod" TEXT NOT NULL CHECK ("discoveryMethod" IN ('MANUAL','ASSISTED')),
 "preferredTeacherId" UUID REFERENCES "Teacher"(id),
 subject TEXT NOT NULL,
 mode TEXT NOT NULL CHECK (mode IN ('ONLINE','HOME')),
 language TEXT NOT NULL CHECK (language IN ('English','Hindi')),
 locality TEXT NOT NULL,
 "budgetPaise" INTEGER NOT NULL CHECK ("budgetPaise" BETWEEN 50000 AND 2000000),
 preferences JSONB NOT NULL CHECK (jsonb_typeof(preferences)='object'),
 region TEXT NOT NULL REFERENCES "Region"(id),
 status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','WITHDRAWN')),
 version INTEGER NOT NULL DEFAULT 1 CHECK (version>0),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (("discoveryMethod"='MANUAL' AND "preferredTeacherId" IS NOT NULL) OR ("discoveryMethod"='ASSISTED' AND "preferredTeacherId" IS NULL))
);
CREATE INDEX "StudentEnquiry_studentAccountId_id_idx" ON "StudentEnquiry"("studentAccountId",id);
CREATE INDEX "StudentEnquiry_region_status_id_idx" ON "StudentEnquiry"(region,status,id);
CREATE FUNCTION preserve_student_enquiry_criteria() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (to_jsonb(NEW)-'status'-'version') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'version') OR OLD.status<>'SUBMITTED' OR NEW.status<>'WITHDRAWN' OR NEW.version<>OLD.version+1 THEN
  RAISE EXCEPTION 'Submitted student criteria are immutable; only versioned withdrawal is allowed' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER student_enquiry_criteria BEFORE UPDATE ON "StudentEnquiry" FOR EACH ROW EXECUTE FUNCTION preserve_student_enquiry_criteria();
