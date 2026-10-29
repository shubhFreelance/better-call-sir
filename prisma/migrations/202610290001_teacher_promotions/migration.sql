CREATE TABLE "PromotionPlan" (
 "id" TEXT PRIMARY KEY CHECK ("id" IN ('HOME','SEARCH','SPACE')),
 "amountPaise" INTEGER NOT NULL CHECK ("amountPaise" BETWEEN 100 AND 1000000),
 "days" INTEGER NOT NULL DEFAULT 7 CHECK ("days" BETWEEN 1 AND 30),
 "enabled" BOOLEAN NOT NULL DEFAULT true,
 "version" INTEGER NOT NULL DEFAULT 1
);
INSERT INTO "PromotionPlan" (id,"amountPaise") VALUES ('SEARCH',29900),('HOME',59900),('SPACE',99900);
CREATE TABLE "TeacherPromotion" (
 "id" UUID PRIMARY KEY,
 "teacherId" UUID NOT NULL REFERENCES "Teacher"(id) ON DELETE CASCADE,
 "placement" TEXT NOT NULL REFERENCES "PromotionPlan"(id),
 "amountPaise" INTEGER NOT NULL CHECK ("amountPaise" BETWEEN 100 AND 1000000),
 "days" INTEGER NOT NULL CHECK ("days" BETWEEN 1 AND 30),
 "planVersion" INTEGER NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','ACTIVE','PAUSED','REJECTED','CANCELLED')),
 "version" INTEGER NOT NULL DEFAULT 1,
 "pausedByAdmin" BOOLEAN NOT NULL DEFAULT false,
 "paymentReference" TEXT UNIQUE,
 "reviewerId" UUID,
 "reviewNote" TEXT,
 "startsAt" TIMESTAMP(3),
 "endsAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CHECK (("startsAt" IS NULL AND "endsAt" IS NULL) OR "endsAt">"startsAt")
);
CREATE INDEX "TeacherPromotion_teacherId_createdAt_id_idx" ON "TeacherPromotion"("teacherId","createdAt","id");
CREATE INDEX "TeacherPromotion_placement_status_endsAt_idx" ON "TeacherPromotion"("placement","status","endsAt");
