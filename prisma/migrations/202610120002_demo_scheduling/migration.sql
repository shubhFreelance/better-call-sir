-- CreateTable
CREATE TABLE "Demo" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "guardianId" UUID NOT NULL,
    "reservationId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "guardianAccepted" BOOLEAN NOT NULL DEFAULT false,
    "teacherAccepted" BOOLEAN NOT NULL DEFAULT false,
    "guardianOutcome" TEXT,
    "teacherOutcome" TEXT,
    "supportCaseId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Demo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Demo_reservationId_key" ON "Demo"("reservationId");

-- CreateIndex
CREATE INDEX "Demo_guardianId_idx" ON "Demo"("guardianId");

-- CreateIndex
CREATE INDEX "Demo_teacherId_idx" ON "Demo"("teacherId");

-- CreateIndex
CREATE INDEX "Demo_requestId_teacherId_status_idx" ON "Demo"("requestId", "teacherId", "status");


ALTER TABLE "Demo" ADD CONSTRAINT demo_request_fk FOREIGN KEY ("requestId") REFERENCES "TuitionRequest"(id);
ALTER TABLE "Demo" ADD CONSTRAINT demo_teacher_fk FOREIGN KEY ("teacherId") REFERENCES "Teacher"(id);
ALTER TABLE "Demo" ADD CONSTRAINT demo_guardian_fk FOREIGN KEY ("guardianId") REFERENCES "Account"(id);
ALTER TABLE "Demo" ADD CONSTRAINT demo_reservation_fk FOREIGN KEY ("reservationId") REFERENCES "Reservation"(id);
ALTER TABLE "Demo" ADD CONSTRAINT demo_support_fk FOREIGN KEY ("supportCaseId") REFERENCES "SupportCase"(id);
ALTER TABLE "Demo" ADD CONSTRAINT demo_state_check CHECK (
  version > 0 AND status IN ('PROPOSED','CONFIRMED','COMPLETED','DISPUTED','NOT_COMPLETED','CANCELLED')
  AND (status NOT IN ('CONFIRMED','COMPLETED','DISPUTED','NOT_COMPLETED') OR ("guardianAccepted" AND "teacherAccepted"))
  AND (status NOT IN ('DISPUTED','NOT_COMPLETED') OR "supportCaseId" IS NOT NULL)
  AND ("guardianOutcome" IS NULL OR "guardianOutcome" IN ('COMPLETED','NO_SHOW','DISPUTED'))
  AND ("teacherOutcome" IS NULL OR "teacherOutcome" IN ('COMPLETED','NO_SHOW','DISPUTED'))
);
CREATE UNIQUE INDEX demo_active_candidate ON "Demo" ("requestId", "teacherId") WHERE status IN ('PROPOSED','CONFIRMED','DISPUTED');
