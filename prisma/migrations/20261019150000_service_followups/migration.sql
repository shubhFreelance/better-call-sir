CREATE TABLE "ServiceFollowup" (
 id UUID PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('PLACEMENT','INDEPENDENT')), "resourceId" UUID NOT NULL,
 status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','SCHEDULED','COMPLETED')), "assignedToId" UUID REFERENCES "Account"(id),
 "nextContactAt" TIMESTAMP(3), "supportCaseId" UUID REFERENCES "SupportCase"(id), version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(kind,"resourceId"), CHECK((status='SCHEDULED')=("nextContactAt" IS NOT NULL))
);
CREATE TABLE "ServiceContact" (
 id UUID PRIMARY KEY, "followupId" UUID NOT NULL REFERENCES "ServiceFollowup"(id), "actorId" UUID NOT NULL REFERENCES "Account"(id),
 outcome TEXT NOT NULL CHECK(outcome IN ('CONTINUING','ENDED','NO_RESPONSE','HELP_REQUESTED')), method TEXT NOT NULL CHECK(method IN ('EMAIL','PHONE','VIDEO','IN_PERSON')),
 "nextContactAt" TIMESTAMP(3), "supportCaseId" UUID REFERENCES "SupportCase"(id), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK((outcome='NO_RESPONSE')=("nextContactAt" IS NOT NULL)), CHECK((outcome='HELP_REQUESTED')=("supportCaseId" IS NOT NULL))
);
CREATE INDEX "ServiceContact_followupId_createdAt_id_idx" ON "ServiceContact"("followupId","createdAt",id);
CREATE FUNCTION preserve_service_contact() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Service contact history is immutable' USING ERRCODE='23514'; END $$;
CREATE TRIGGER service_contact_immutable BEFORE UPDATE OR DELETE ON "ServiceContact" FOR EACH ROW EXECUTE FUNCTION preserve_service_contact();
