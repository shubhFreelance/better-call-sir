-- Enforce ownership even for writes that bypass the API. No cascading deletion of learning or financial evidence.
ALTER TABLE "Child" ADD CONSTRAINT "Child_ownership_key" UNIQUE ("id", "guardianId");
ALTER TABLE "TuitionRequest" ADD CONSTRAINT "TuitionRequest_ownership_key" UNIQUE ("id", "guardianId", "childId");
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_ownership_key" UNIQUE ("id", "guardianId", "teacherId", "childId");
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_ownership_key" UNIQUE ("id", "teacherId", "guardianId");
ALTER TABLE "RecommendationRun" ADD CONSTRAINT "RecommendationRun_ownership_key" UNIQUE ("id", "requestId");
ALTER TABLE "TuitionRequest" ADD CONSTRAINT request_guardian_key UNIQUE (id,"guardianId");
ALTER TABLE "Placement" ADD CONSTRAINT placement_call_key UNIQUE (id,"guardianId","teacherId");
ALTER TABLE "Placement" ADD CONSTRAINT placement_lesson_key UNIQUE (id,"teacherId","childId");
ALTER TABLE "Session" ADD CONSTRAINT core_owner_0_fk FOREIGN KEY ("accountId") REFERENCES "Account" ("id");
ALTER TABLE "Child" ADD CONSTRAINT core_owner_1_fk FOREIGN KEY ("studentAccountId") REFERENCES "Account" ("id");
ALTER TABLE "Invitation" ADD CONSTRAINT core_owner_2_fk FOREIGN KEY ("childId", "guardianId") REFERENCES "Child" ("id", "guardianId");
ALTER TABLE "TuitionRequest" ADD CONSTRAINT core_owner_3_fk FOREIGN KEY ("childId", "guardianId") REFERENCES "Child" ("id", "guardianId");
ALTER TABLE "Placement" ADD CONSTRAINT core_owner_4_fk FOREIGN KEY ("requestId", "guardianId", "childId") REFERENCES "TuitionRequest" ("id", "guardianId", "childId");
ALTER TABLE "Reservation" ADD CONSTRAINT core_owner_5_fk FOREIGN KEY ("guardianId") REFERENCES "Account" ("id");
ALTER TABLE "Lesson" ADD CONSTRAINT core_owner_6_fk FOREIGN KEY ("placementId", "teacherId", "childId") REFERENCES "Placement" ("id", "teacherId", "childId");
ALTER TABLE "Lesson" ADD CONSTRAINT core_owner_7_fk FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id");
ALTER TABLE "Lesson" ADD CONSTRAINT core_owner_8_fk FOREIGN KEY ("reservationId") REFERENCES "Reservation" ("id");
ALTER TABLE "Invoice" ADD CONSTRAINT core_owner_9_fk FOREIGN KEY ("placementId") REFERENCES "Placement" ("id");
ALTER TABLE "Invoice" ADD CONSTRAINT core_owner_10_fk FOREIGN KEY ("payerId") REFERENCES "Account" ("id");
ALTER TABLE "Payment" ADD CONSTRAINT core_owner_11_fk FOREIGN KEY ("reservationId") REFERENCES "Reservation" ("id");
ALTER TABLE "Refund" ADD CONSTRAINT core_owner_12_fk FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id");
ALTER TABLE "Note" ADD CONSTRAINT core_owner_13_fk FOREIGN KEY ("childId", "guardianId") REFERENCES "Child" ("id", "guardianId");
ALTER TABLE "Note" ADD CONSTRAINT core_owner_14_fk FOREIGN KEY ("sharedTeacherId") REFERENCES "Teacher" ("id");
ALTER TABLE "SupportCase" ADD CONSTRAINT core_owner_15_fk FOREIGN KEY ("accountId") REFERENCES "Account" ("id");
ALTER TABLE "Membership" ADD CONSTRAINT core_owner_16_fk FOREIGN KEY ("guardianId") REFERENCES "Account" ("id");
ALTER TABLE "Consultation" ADD CONSTRAINT core_owner_17_fk FOREIGN KEY ("placementId", "guardianId", "teacherId") REFERENCES "Placement" ("id", "guardianId", "teacherId");
ALTER TABLE "Idempotency" ADD CONSTRAINT core_owner_18_fk FOREIGN KEY ("accountId") REFERENCES "Account" ("id");
ALTER TABLE "Audit" ADD CONSTRAINT core_owner_19_fk FOREIGN KEY ("actorId") REFERENCES "Account" ("id");
ALTER TABLE "Demo" ADD CONSTRAINT core_owner_20_fk FOREIGN KEY ("requestId", "guardianId") REFERENCES "TuitionRequest" ("id", "guardianId");
ALTER TABLE "Demo" ADD CONSTRAINT core_owner_21_fk FOREIGN KEY ("reservationId", "teacherId", "guardianId") REFERENCES "Reservation" ("id", "teacherId", "guardianId");
ALTER TABLE "RecommendationPresentation" ADD CONSTRAINT core_owner_22_fk FOREIGN KEY ("runId", "requestId") REFERENCES "RecommendationRun" ("id", "requestId");
ALTER TABLE "Child" ADD CONSTRAINT child_distinct_student CHECK ("studentAccountId" IS NULL OR "studentAccountId"<>"guardianId");
CREATE FUNCTION validate_invoice_payer() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Placement" p JOIN "Teacher" t ON t.id=p."teacherId" WHERE p.id=NEW."placementId" AND t."accountId"=NEW."payerId") THEN
    RAISE EXCEPTION 'Invoice payer must be the assigned teacher' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER invoice_payer_owner BEFORE INSERT OR UPDATE ON "Invoice" FOR EACH ROW EXECUTE FUNCTION validate_invoice_payer();
CREATE FUNCTION validate_refund_amount() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Payment" WHERE id=NEW."paymentId" AND "amountPaise">=NEW."amountPaise") THEN
    RAISE EXCEPTION 'Refund cannot exceed captured payment' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER refund_capture_bound BEFORE INSERT OR UPDATE ON "Refund" FOR EACH ROW EXECUTE FUNCTION validate_refund_amount();
CREATE FUNCTION validate_presentation_candidates() RETURNS trigger AS $$
BEGIN
  IF cardinality(NEW."candidateIds")<>(SELECT count(DISTINCT id) FROM "Recommendation" WHERE id=ANY(NEW."candidateIds") AND "runId"=NEW."runId" AND "requestId"=NEW."requestId") THEN
    RAISE EXCEPTION 'Presentation candidates must belong to the recorded run and request' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER presentation_candidate_owner BEFORE INSERT ON "RecommendationPresentation" FOR EACH ROW EXECUTE FUNCTION validate_presentation_candidates();
CREATE FUNCTION validate_decision_candidate() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Recommendation" WHERE id=NEW."candidateId" AND "runId"=NEW."runId") THEN
    RAISE EXCEPTION 'Decision must identify the current candidate run and version' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER decision_candidate_owner BEFORE INSERT ON "CandidateDecision" FOR EACH ROW EXECUTE FUNCTION validate_decision_candidate();
ALTER TABLE "Reservation" ADD COLUMN provider TEXT NOT NULL DEFAULT 'INTERNAL', ADD COLUMN source TEXT NOT NULL DEFAULT 'INTERNAL', ADD COLUMN "sourceId" UUID;
ALTER TABLE "Reservation" ADD CONSTRAINT reservation_source_fk FOREIGN KEY ("sourceId") REFERENCES "AvailabilityPattern"(id);
CREATE FUNCTION validate_reservation_source() RETURNS trigger AS $$
BEGIN
  IF NEW."sourceId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "AvailabilityPattern" WHERE id=NEW."sourceId" AND "teacherId"=NEW."teacherId" AND kind=CASE WHEN NEW.kind='CONSULTATION' THEN 'CALL' ELSE NEW.kind END) THEN
    RAISE EXCEPTION 'Reservation source must belong to the teacher and booking kind' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER reservation_source_owner BEFORE INSERT OR UPDATE ON "Reservation" FOR EACH ROW EXECUTE FUNCTION validate_reservation_source();
