CREATE TABLE "LessonConfirmation" (
 id UUID PRIMARY KEY, "lessonId" UUID NOT NULL REFERENCES "Lesson"(id), "actorId" UUID NOT NULL REFERENCES "Account"(id),
 action TEXT NOT NULL, reason TEXT NOT NULL, "lessonVersion" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT lesson_confirmation_state CHECK (action IN ('CONFIRMED','DISPUTED') AND "lessonVersion">0),
 CONSTRAINT lesson_confirmation_actor UNIQUE ("lessonId","actorId")
);
CREATE INDEX "LessonConfirmation_lessonId_createdAt_idx" ON "LessonConfirmation"("lessonId","createdAt");
CREATE TABLE "LessonFeedback" (
 id UUID PRIMARY KEY, "lessonId" UUID NOT NULL REFERENCES "Lesson"(id), "guardianId" UUID NOT NULL REFERENCES "Account"(id),
 rating INTEGER NOT NULL, comment TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT lesson_feedback_rating CHECK (rating BETWEEN 1 AND 5),
 CONSTRAINT lesson_feedback_guardian UNIQUE ("lessonId","guardianId")
);
CREATE FUNCTION validate_lesson_family_actor() RETURNS trigger AS $$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM "Lesson" l JOIN "Child" c ON c.id=l."childId"
  WHERE l.id=NEW."lessonId" AND (c."guardianId"=NEW."actorId" OR c."studentAccountId"=NEW."actorId")
 ) THEN RAISE EXCEPTION 'Lesson confirmation actor must belong to the learner family' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER lesson_confirmation_family BEFORE INSERT ON "LessonConfirmation" FOR EACH ROW EXECUTE FUNCTION validate_lesson_family_actor();
CREATE FUNCTION validate_lesson_feedback_owner() RETURNS trigger AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "Lesson" l JOIN "Child" c ON c.id=l."childId" WHERE l.id=NEW."lessonId" AND c."guardianId"=NEW."guardianId")
 THEN RAISE EXCEPTION 'Lesson feedback must belong to the guardian' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER lesson_feedback_family BEFORE INSERT ON "LessonFeedback" FOR EACH ROW EXECUTE FUNCTION validate_lesson_feedback_owner();
CREATE TRIGGER lesson_confirmation_append_only BEFORE UPDATE OR DELETE ON "LessonConfirmation" FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
CREATE TRIGGER lesson_feedback_append_only BEFORE UPDATE OR DELETE ON "LessonFeedback" FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
