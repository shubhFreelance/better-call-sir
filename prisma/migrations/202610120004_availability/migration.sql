-- CreateTable
CREATE TABLE "AvailabilityPattern" (
    "id" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "validFrom" DATE NOT NULL,
    "validUntil" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "AvailabilityPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityException" (
    "id" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "AvailabilityException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AvailabilityPattern_teacherId_kind_active_idx" ON "AvailabilityPattern"("teacherId", "kind", "active");

-- CreateIndex
CREATE INDEX "AvailabilityException_teacherId_startsAt_idx" ON "AvailabilityException"("teacherId", "startsAt");


ALTER TABLE "AvailabilityPattern" ADD CONSTRAINT availability_teacher_fk FOREIGN KEY ("teacherId") REFERENCES "Teacher"(id);
ALTER TABLE "AvailabilityPattern" ADD CONSTRAINT availability_pattern_bounds CHECK (weekday BETWEEN 0 AND 6 AND "startMinute">=0 AND "endMinute"<=1440 AND "endMinute">"startMinute" AND "validUntil">="validFrom" AND timezone='Asia/Kolkata' AND version>0 AND kind IN ('DEMO','REVISION','RECURRING','CALL'));
ALTER TABLE "AvailabilityPattern" ADD CONSTRAINT availability_pattern_no_overlap EXCLUDE USING gist ("teacherId" WITH =,kind WITH =,weekday WITH =,int4range("startMinute","endMinute",'[)') WITH &&,daterange("validFrom","validUntil"+1,'[)') WITH &&) WHERE (active);
ALTER TABLE "AvailabilityException" ADD CONSTRAINT availability_exception_teacher_fk FOREIGN KEY ("teacherId") REFERENCES "Teacher"(id);
ALTER TABLE "AvailabilityException" ADD CONSTRAINT availability_exception_bounds CHECK ("endsAt">"startsAt" AND version>0);
