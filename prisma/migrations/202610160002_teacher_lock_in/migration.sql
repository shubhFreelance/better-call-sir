ALTER TABLE "Teacher" ADD COLUMN "lockInDays" INTEGER;
ALTER TABLE "Teacher" ADD CONSTRAINT "teacher_lock_in_days" CHECK ("lockInDays" IS NULL OR "lockInDays" IN (0, 15, 30));
