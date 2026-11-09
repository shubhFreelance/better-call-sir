CREATE TABLE "PromotionActivity" (
 "id" TEXT PRIMARY KEY,
 "teacherId" UUID NOT NULL REFERENCES "Teacher"(id) ON DELETE CASCADE,
 "promotionId" UUID REFERENCES "TeacherPromotion"(id) ON DELETE CASCADE,
 "viewerId" UUID NOT NULL REFERENCES "Account"(id) ON DELETE CASCADE,
 "audience" TEXT NOT NULL CHECK ("audience" IN ('GUARDIAN','STUDENT')),
 "kind" TEXT NOT NULL CHECK ("kind" IN ('CARD_CLICK','PROFILE_VISIT')),
 "day" DATE NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("kind" <> 'CARD_CLICK' OR "promotionId" IS NOT NULL)
);
CREATE INDEX "PromotionActivity_teacherId_day_idx" ON "PromotionActivity"("teacherId", "day");
CREATE INDEX "PromotionActivity_promotionId_day_idx" ON "PromotionActivity"("promotionId", "day");
CREATE INDEX "PromotionActivity_viewerId_idx" ON "PromotionActivity"("viewerId");
CREATE INDEX "PromotionActivity_day_idx" ON "PromotionActivity"("day");
