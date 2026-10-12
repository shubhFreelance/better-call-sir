-- AlterTable
ALTER TABLE "TuitionRequest" ADD COLUMN     "matchStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "region" TEXT NOT NULL DEFAULT 'Raipur',
ADD COLUMN     "schedulePreferences" JSONB,
ADD COLUMN     "scheduleStatus" TEXT NOT NULL DEFAULT 'UNCONFIRMED';

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL,
    "cityName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Waitlist" (
    "id" UUID NOT NULL,
    "guardianId" UUID NOT NULL,
    "grade" INTEGER NOT NULL,
    "board" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Waitlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Region_countryCode_stateCode_cityName_key" ON "Region"("countryCode", "stateCode", "cityName");

-- CreateIndex
CREATE INDEX "Waitlist_guardianId_status_idx" ON "Waitlist"("guardianId", "status");


INSERT INTO "Region" (id,"countryCode","stateCode","cityName",enabled) VALUES ('Raipur','IN','CG','Raipur',true),('Delhi','IN','DL','Delhi',false);
INSERT INTO "Region" (id,"countryCode","stateCode","cityName",enabled) SELECT DISTINCT region,'IN','UNCONFIGURED',region,false FROM "Account" WHERE region NOT IN (SELECT id FROM "Region");
ALTER TABLE "Account" ADD CONSTRAINT account_region_fk FOREIGN KEY (region) REFERENCES "Region"(id);
ALTER TABLE "Teacher" ADD CONSTRAINT teacher_region_fk FOREIGN KEY (region) REFERENCES "Region"(id);
ALTER TABLE "TuitionRequest" ADD CONSTRAINT request_region_fk FOREIGN KEY (region) REFERENCES "Region"(id);
ALTER TABLE "Waitlist" ADD CONSTRAINT waitlist_guardian_fk FOREIGN KEY ("guardianId") REFERENCES "Account"(id);
ALTER TABLE "Waitlist" ADD CONSTRAINT waitlist_bounds CHECK (grade BETWEEN 1 AND 12 AND mode IN ('HOME','ONLINE'));
ALTER TABLE "TuitionRequest" ADD CONSTRAINT request_schedule_state CHECK ("scheduleStatus" IN ('UNCONFIRMED','CONFIRMED') AND ("scheduleStatus"='UNCONFIRMED' OR "schedulePreferences" IS NOT NULL));
