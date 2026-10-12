ALTER TABLE "Reservation"
 ADD COLUMN subject TEXT NOT NULL DEFAULT 'Maths',
 ADD COLUMN language TEXT NOT NULL DEFAULT 'English',
 ADD COLUMN "pricePolicyVersion" TEXT NOT NULL DEFAULT 'revision-dev-v1-zero-platform-fee',
 ADD COLUMN "payablePaise" INTEGER NOT NULL DEFAULT 0,
 ADD CONSTRAINT reservation_revision_details CHECK ("payablePaise">=0 AND (kind<>'REVISION' OR (subject IN ('Maths','Science') AND language IN ('English','Hindi') AND "payablePaise"<="amountPaise")));
ALTER TABLE "Lesson" ADD COLUMN recap TEXT, ADD COLUMN "recapSubmittedAt" TIMESTAMP(3);
CREATE TABLE "TeacherPayable" (
 id UUID PRIMARY KEY, "paymentId" UUID NOT NULL UNIQUE REFERENCES "Payment"(id), "lessonId" UUID NOT NULL UNIQUE REFERENCES "Lesson"(id),
 "teacherId" UUID NOT NULL REFERENCES "Teacher"(id), "amountPaise" INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'INR',
 "policyVersion" TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'HELD_SERVICE', "eligibleAt" TIMESTAMP(3), version INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT teacher_payable_values CHECK ("amountPaise">0 AND currency='INR' AND status IN ('HELD_SERVICE','HELD_CONFIRMATION','HELD_DISPUTE','ELIGIBLE','REFUND_PENDING','REVIEW_REQUIRED') AND version>0)
);
CREATE INDEX "TeacherPayable_teacherId_status_idx" ON "TeacherPayable"("teacherId",status);
CREATE FUNCTION validate_revision_lesson() RETURNS trigger AS $$
BEGIN
 IF NEW.kind='REVISION' AND NOT EXISTS (SELECT 1 FROM "Reservation" r WHERE r.id=NEW."reservationId" AND r.kind='REVISION' AND r.status='CONFIRMED' AND r."teacherId"=NEW."teacherId" AND r."childId"=NEW."childId")
 THEN RAISE EXCEPTION 'Revision lesson must match its confirmed reservation' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER revision_lesson_owner BEFORE INSERT OR UPDATE ON "Lesson" FOR EACH ROW EXECUTE FUNCTION validate_revision_lesson();
CREATE FUNCTION validate_teacher_payable() RETURNS trigger AS $$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM "Payment" p JOIN "Reservation" r ON r.id=p."reservationId" JOIN "Lesson" l ON l."reservationId"=r.id
  WHERE p.id=NEW."paymentId" AND l.id=NEW."lessonId" AND l."teacherId"=NEW."teacherId" AND r.kind='REVISION' AND p."amountPaise">=NEW."amountPaise"
 ) THEN RAISE EXCEPTION 'Teacher payable must match captured revision service and cannot exceed capture' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER teacher_payable_bound BEFORE INSERT OR UPDATE ON "TeacherPayable" FOR EACH ROW EXECUTE FUNCTION validate_teacher_payable();
