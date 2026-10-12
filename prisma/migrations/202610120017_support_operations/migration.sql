ALTER TABLE "SupportCase" ADD COLUMN region TEXT NOT NULL DEFAULT 'Raipur', ADD COLUMN "assignedToId" UUID REFERENCES "Account"(id),
 ADD COLUMN "placementId" UUID REFERENCES "Placement"(id), ADD COLUMN "reservationId" UUID REFERENCES "Reservation"(id), ADD COLUMN resolution TEXT,
 ADD COLUMN version INTEGER NOT NULL DEFAULT 1, ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "SupportCase" s SET region=a.region FROM "Account" a WHERE a.id=s."accountId";
UPDATE "SupportCase" s SET region=a.region FROM "Child" c JOIN "Account" a ON a.id=c."guardianId" WHERE c."studentAccountId"=s."accountId";
ALTER TABLE "SupportCase" ADD CONSTRAINT support_case_states CHECK (status IN ('OPEN','IN_PROGRESS','WAITING_OWNER','RESOLVED','CLOSED') AND version>0);
CREATE INDEX "SupportCase_region_status_createdAt_idx" ON "SupportCase"(region,status,"createdAt");
CREATE TABLE "CaseUpdate" (id UUID PRIMARY KEY, "caseId" UUID NOT NULL REFERENCES "SupportCase"(id), "actorId" UUID NOT NULL REFERENCES "Account"(id), message TEXT NOT NULL, internal BOOLEAN NOT NULL DEFAULT FALSE, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "CaseUpdate_caseId_createdAt_idx" ON "CaseUpdate"("caseId","createdAt");
CREATE TRIGGER case_update_append_only BEFORE UPDATE OR DELETE ON "CaseUpdate" FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
ALTER TABLE "TuitionRequest" ADD COLUMN "rematchFromPlacementId" UUID UNIQUE REFERENCES "Placement"(id);
CREATE FUNCTION validate_case_owner() RETURNS trigger AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT a.region INTO NEW.region FROM "Account" a WHERE a.id=COALESCE((SELECT "guardianId" FROM "Reservation" WHERE id=NEW."reservationId"),(SELECT "guardianId" FROM "Placement" WHERE id=NEW."placementId"),(SELECT "guardianId" FROM "Child" WHERE "studentAccountId"=NEW."accountId"),NEW."accountId");
 END IF;
 IF NEW."assignedToId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Account" WHERE id=NEW."assignedToId" AND NOT disabled AND (role='ADMIN' OR (role='OPERATOR' AND region=NEW.region))) THEN RAISE EXCEPTION 'Case assignment requires authorized regional staff' USING ERRCODE='23514'; END IF;
 IF NEW."placementId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Placement" p JOIN "Teacher" t ON t.id=p."teacherId" JOIN "Child" c ON c.id=p."childId" WHERE p.id=NEW."placementId" AND NEW."accountId" IN (p."guardianId",t."accountId",c."studentAccountId")) THEN RAISE EXCEPTION 'Case placement must belong to reporting participant' USING ERRCODE='23514'; END IF;
 IF NEW."reservationId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Reservation" r JOIN "Teacher" t ON t.id=r."teacherId" LEFT JOIN "Child" c ON c.id=r."childId" WHERE r.id=NEW."reservationId" AND NEW."accountId" IN (r."guardianId",t."accountId",c."studentAccountId")) THEN RAISE EXCEPTION 'Case reservation must belong to reporting participant' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER case_resource_owner BEFORE INSERT OR UPDATE ON "SupportCase" FOR EACH ROW EXECUTE FUNCTION validate_case_owner();
CREATE FUNCTION validate_rematch_owner() RETURNS trigger AS $$
BEGIN
 IF NEW."rematchFromPlacementId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Placement" WHERE id=NEW."rematchFromPlacementId" AND "guardianId"=NEW."guardianId" AND "childId"=NEW."childId") THEN RAISE EXCEPTION 'Rematch must preserve the family and learner' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER rematch_request_owner BEFORE INSERT OR UPDATE ON "TuitionRequest" FOR EACH ROW EXECUTE FUNCTION validate_rematch_owner();
