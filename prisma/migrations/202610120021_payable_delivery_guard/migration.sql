CREATE FUNCTION guard_payable_delivery() RETURNS trigger AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW."paymentId",NEW."lessonId",NEW."teacherId",NEW."amountPaise",NEW.currency,NEW."policyVersion") IS DISTINCT FROM (OLD."paymentId",OLD."lessonId",OLD."teacherId",OLD."amountPaise",OLD.currency,OLD."policyVersion") THEN RAISE EXCEPTION 'Accepted payable terms are immutable; financial adjustments require separate records' USING ERRCODE='23514'; END IF;
 IF NEW.status='ELIGIBLE' AND NOT EXISTS (SELECT 1 FROM "Lesson" WHERE id=NEW."lessonId" AND status='COMPLETED' AND attendance IN ('PRESENT','LATE') AND NOT disputed AND recap IS NOT NULL) THEN RAISE EXCEPTION 'Payable eligibility requires delivered, recapped, undisputed revision evidence' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER payable_delivery_guard BEFORE INSERT OR UPDATE ON "TeacherPayable" FOR EACH ROW EXECUTE FUNCTION guard_payable_delivery();
