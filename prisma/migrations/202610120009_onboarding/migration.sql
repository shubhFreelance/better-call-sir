ALTER TABLE "Child" ADD COLUMN version INTEGER NOT NULL DEFAULT 1, ADD COLUMN "studentAccessRevokedAt" TIMESTAMP(3);
ALTER TABLE "Child" ADD CONSTRAINT child_version_positive CHECK (version>0);
CREATE TABLE "OnboardingProgress" (
 id UUID PRIMARY KEY, "accountId" UUID NOT NULL REFERENCES "Account"(id), kind TEXT NOT NULL,
 draft JSONB NOT NULL DEFAULT '{}', "completedResourceId" UUID, version INTEGER NOT NULL DEFAULT 1,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT onboarding_kind CHECK (kind IN ('PARENT','TEACHER','STUDENT')),
 CONSTRAINT onboarding_version CHECK (version>0),
 CONSTRAINT onboarding_owner UNIQUE ("accountId",kind)
);
CREATE FUNCTION validate_onboarding_completion() RETURNS trigger AS $$
BEGIN
 IF NEW."completedResourceId" IS NOT NULL AND NOT (
  (NEW.kind='PARENT' AND EXISTS (SELECT 1 FROM "TuitionRequest" WHERE id=NEW."completedResourceId" AND "guardianId"=NEW."accountId")) OR
  (NEW.kind='TEACHER' AND EXISTS (SELECT 1 FROM "Teacher" WHERE id=NEW."completedResourceId" AND "accountId"=NEW."accountId"))
 ) THEN RAISE EXCEPTION 'Onboarding completion must belong to the principal' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER onboarding_completion_owner BEFORE INSERT OR UPDATE ON "OnboardingProgress" FOR EACH ROW EXECUTE FUNCTION validate_onboarding_completion();
