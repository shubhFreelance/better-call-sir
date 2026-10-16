ALTER TABLE "SupportCase" ADD COLUMN "requestId" UUID REFERENCES "TuitionRequest"(id);
CREATE INDEX "SupportCase_accountId_requestId_idx" ON "SupportCase"("accountId","requestId");
CREATE FUNCTION validate_case_enquiry_owner() RETURNS trigger AS $$
BEGIN
 IF NEW."requestId" IS NOT NULL THEN
  IF NOT EXISTS (SELECT 1 FROM "TuitionRequest" r JOIN "Child" c ON c.id=r."childId" WHERE r.id=NEW."requestId" AND (NEW."accountId" IN (r."guardianId",c."studentAccountId") OR EXISTS (SELECT 1 FROM "Recommendation" x JOIN "Teacher" t ON t.id=x."teacherId" WHERE x."requestId"=r.id AND t."accountId"=NEW."accountId") OR EXISTS (SELECT 1 FROM "Placement" p JOIN "Teacher" t ON t.id=p."teacherId" WHERE p."requestId"=r.id AND t."accountId"=NEW."accountId"))) THEN RAISE EXCEPTION 'Case enquiry must belong to reporting participant' USING ERRCODE='23514'; END IF;
  IF NEW."placementId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Placement" WHERE id=NEW."placementId" AND "requestId"=NEW."requestId") THEN RAISE EXCEPTION 'Case enquiry and arrangement must match' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN SELECT a.region INTO NEW.region FROM "TuitionRequest" r JOIN "Account" a ON a.id=r."guardianId" WHERE r.id=NEW."requestId"; END IF;
 END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER support_case_enquiry_owner BEFORE INSERT OR UPDATE ON "SupportCase" FOR EACH ROW EXECUTE FUNCTION validate_case_enquiry_owner();
