CREATE TABLE "PrivacyRequest" (id UUID PRIMARY KEY, "accountId" UUID NOT NULL REFERENCES "Account"(id), kind TEXT NOT NULL, scope TEXT NOT NULL, "resourceId" UUID NOT NULL, reason TEXT NOT NULL, correction TEXT, status TEXT NOT NULL DEFAULT 'PENDING', resolution TEXT, "policyVersion" TEXT, version INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT privacy_request_values CHECK (kind IN ('CORRECTION','DELETION') AND scope IN ('NOTE','CHILD','ACCOUNT') AND status IN ('PENDING','COMPLETED','REJECTED') AND version>0 AND ((kind='CORRECTION')=(correction IS NOT NULL))));
CREATE INDEX "PrivacyRequest_accountId_status_idx" ON "PrivacyRequest"("accountId",status);
CREATE TABLE "DeletionRecord" (id UUID PRIMARY KEY, "privacyRequestId" UUID NOT NULL UNIQUE REFERENCES "PrivacyRequest"(id), "accountId" UUID NOT NULL REFERENCES "Account"(id), scope TEXT NOT NULL, "resourceId" UUID NOT NULL, "policyVersion" TEXT NOT NULL, "retentionReason" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TRIGGER deletion_record_append_only BEFORE UPDATE OR DELETE ON "DeletionRecord" FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
CREATE FUNCTION validate_privacy_owner() RETURNS trigger AS $$
BEGIN
 IF (NEW.scope='ACCOUNT' AND NEW."resourceId"<>NEW."accountId") OR (NEW.scope='NOTE' AND NOT EXISTS (SELECT 1 FROM "Note" WHERE id=NEW."resourceId" AND "guardianId"=NEW."accountId")) OR (NEW.scope='CHILD' AND NOT EXISTS (SELECT 1 FROM "Child" WHERE id=NEW."resourceId" AND "guardianId"=NEW."accountId")) THEN RAISE EXCEPTION 'Privacy request must identify an owned resource' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER privacy_request_owner BEFORE INSERT OR UPDATE ON "PrivacyRequest" FOR EACH ROW EXECUTE FUNCTION validate_privacy_owner();
ALTER TABLE "Evidence" DROP CONSTRAINT evidence_metadata;
ALTER TABLE "Evidence" ADD CONSTRAINT evidence_metadata CHECK (size>0 AND size<=5242880 AND version>0 AND status IN ('QUARANTINED','CLEAN','INFECTED','DELETED') AND (status IN ('QUARANTINED','DELETED') OR ("scannerVersion" IS NOT NULL AND "scannedAt" IS NOT NULL)));
