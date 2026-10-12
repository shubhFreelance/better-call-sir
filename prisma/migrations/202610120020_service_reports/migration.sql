ALTER TABLE "Placement" ADD COLUMN "startedAt" TIMESTAMP(3), ADD COLUMN "closedAt" TIMESTAMP(3);
CREATE TABLE "ContinuationObservation" (id UUID PRIMARY KEY, "placementId" UUID NOT NULL UNIQUE REFERENCES "Placement"(id), "dueAt" TIMESTAMP(3) NOT NULL, "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, continued BOOLEAN, CONSTRAINT continuation_not_premature CHECK ("observedAt">="dueAt"));
CREATE INDEX "ContinuationObservation_dueAt_idx" ON "ContinuationObservation"("dueAt");
CREATE TRIGGER continuation_observation_append_only BEFORE UPDATE OR DELETE ON "ContinuationObservation" FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
