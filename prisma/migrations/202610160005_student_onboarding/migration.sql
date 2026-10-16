CREATE OR REPLACE FUNCTION validate_onboarding_completion() RETURNS trigger AS $$
BEGIN
 IF NEW."completedResourceId" IS NOT NULL AND NOT (
  (NEW.kind IN ('PARENT','ENQUIRY') AND EXISTS (SELECT 1 FROM "TuitionRequest" WHERE id=NEW."completedResourceId" AND "guardianId"=NEW."accountId")) OR
  (NEW.kind='TEACHER' AND EXISTS (SELECT 1 FROM "Teacher" WHERE id=NEW."completedResourceId" AND "accountId"=NEW."accountId")) OR
  (NEW.kind='STUDENT' AND EXISTS (SELECT 1 FROM "Child" WHERE id=NEW."completedResourceId" AND "studentAccountId"=NEW."accountId"))
 ) THEN RAISE EXCEPTION 'Onboarding completion must belong to the principal' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
