ALTER TABLE "Reservation" ADD COLUMN "childId" UUID;
ALTER TABLE "Reservation" ADD CONSTRAINT reservation_child_owner_fk FOREIGN KEY ("childId","guardianId") REFERENCES "Child"(id,"guardianId");
UPDATE "Reservation" r SET "childId"=q."childId" FROM "Demo" d JOIN "TuitionRequest" q ON q.id=d."requestId" WHERE d."reservationId"=r.id AND r."childId" IS NULL;
UPDATE "Reservation" r SET "childId"=p."childId" FROM "Lesson" l JOIN "Placement" p ON p.id=l."placementId" WHERE l."reservationId"=r.id AND r."childId" IS NULL;
CREATE TABLE "Meeting" (
 id UUID PRIMARY KEY, "reservationId" UUID NOT NULL UNIQUE REFERENCES "Reservation"(id), provider TEXT NOT NULL DEFAULT 'GOOGLE_MEET',
 "providerMode" TEXT NOT NULL, "providerSpaceId" TEXT UNIQUE, "joinUrl" TEXT, status TEXT NOT NULL DEFAULT 'PENDING',
 "failureCode" TEXT, "retryAt" TIMESTAMP(3), attempts INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT meeting_values CHECK (provider='GOOGLE_MEET' AND "providerMode" IN ('SANDBOX','LIVE') AND status IN ('PENDING','READY','FAILED','CANCELLED') AND attempts BETWEEN 0 AND 5 AND version>0 AND ((status='READY')=("joinUrl" IS NOT NULL)))
);
CREATE INDEX "Meeting_status_retryAt_idx" ON "Meeting"(status,"retryAt");
CREATE FUNCTION validate_meeting_reservation() RETURNS trigger AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "Reservation" WHERE id=NEW."reservationId" AND kind IN ('DEMO','REVISION','RECURRING') AND status='CONFIRMED' AND "endsAt"-"startsAt"<=interval '40 minutes')
 THEN RAISE EXCEPTION 'Meeting requires a confirmed supported reservation up to 40 minutes' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER meeting_reservation_guard BEFORE INSERT ON "Meeting" FOR EACH ROW EXECUTE FUNCTION validate_meeting_reservation();
