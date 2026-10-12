CREATE TABLE "RecurringSchedule" (
 id UUID PRIMARY KEY, "placementId" UUID NOT NULL, "guardianId" UUID NOT NULL, "teacherId" UUID NOT NULL, "childId" UUID NOT NULL,
 timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata', slots JSONB NOT NULL,
 "validFrom" DATE NOT NULL, "validUntil" DATE NOT NULL,
 status TEXT NOT NULL DEFAULT 'PROPOSED', "guardianAccepted" BOOLEAN NOT NULL DEFAULT false, "teacherAccepted" BOOLEAN NOT NULL DEFAULT false,
 version INTEGER NOT NULL DEFAULT 1, reason TEXT NOT NULL, "materializedUntil" TIMESTAMP(3), "extensionRetryAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT recurring_owner_fk FOREIGN KEY ("placementId","guardianId","teacherId","childId") REFERENCES "Placement"(id,"guardianId","teacherId","childId"),
 CONSTRAINT recurring_state CHECK (status IN ('PROPOSED','ACCEPTED','SUPERSEDED') AND version>0 AND timezone='Asia/Kolkata' AND "validUntil">="validFrom" AND jsonb_array_length(slots) BETWEEN 1 AND 7 AND (status<>'ACCEPTED' OR ("guardianAccepted" AND "teacherAccepted")))
);
CREATE INDEX "RecurringSchedule_placementId_status_idx" ON "RecurringSchedule"("placementId",status);
CREATE UNIQUE INDEX recurring_one_accepted ON "RecurringSchedule"("placementId") WHERE status='ACCEPTED';
CREATE UNIQUE INDEX recurring_one_proposed ON "RecurringSchedule"("placementId") WHERE status='PROPOSED';
ALTER TABLE "Lesson" ADD COLUMN "recurringScheduleId" UUID REFERENCES "RecurringSchedule"(id);
CREATE UNIQUE INDEX "Lesson_recurringScheduleId_startsAt_key" ON "Lesson"("recurringScheduleId","startsAt");
CREATE FUNCTION validate_recurring_lesson() RETURNS trigger AS $$
BEGIN
 IF NEW."recurringScheduleId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "RecurringSchedule" WHERE id=NEW."recurringScheduleId" AND "placementId"=NEW."placementId" AND "teacherId"=NEW."teacherId" AND "childId"=NEW."childId") THEN
  RAISE EXCEPTION 'Recurring lesson must belong to accepted placement schedule' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER recurring_lesson_owner BEFORE INSERT OR UPDATE ON "Lesson" FOR EACH ROW EXECUTE FUNCTION validate_recurring_lesson();
