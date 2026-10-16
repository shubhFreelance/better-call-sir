ALTER TABLE "Teacher" ADD COLUMN "teachingCoverage" JSONB;
ALTER TABLE "Teacher" ADD CONSTRAINT teacher_coverage_array CHECK ("teachingCoverage" IS NULL OR (jsonb_typeof("teachingCoverage")='array' AND jsonb_array_length("teachingCoverage") BETWEEN 1 AND 200));
CREATE INDEX teacher_coverage_gin ON "Teacher" USING GIN ("teachingCoverage" jsonb_path_ops);
ALTER TABLE "Waitlist" DROP CONSTRAINT waitlist_bounds;
ALTER TABLE "Waitlist" ALTER COLUMN grade DROP NOT NULL, ALTER COLUMN board DROP NOT NULL, ADD COLUMN "educationStage" TEXT NOT NULL DEFAULT 'SCHOOL', ADD COLUMN "earlyYearsLevel" TEXT, ADD COLUMN "courseName" TEXT, ADD COLUMN "studyYear" INTEGER;
ALTER TABLE "Waitlist" ADD CONSTRAINT waitlist_education_shape CHECK (mode IN ('HOME','ONLINE') AND (
 ("educationStage"='SCHOOL' AND grade IS NOT NULL AND grade BETWEEN 1 AND 12 AND board IS NOT NULL AND "earlyYearsLevel" IS NULL AND "courseName" IS NULL AND "studyYear" IS NULL)
 OR ("educationStage"='EARLY_YEARS' AND grade IS NULL AND board IS NULL AND "earlyYearsLevel" IS NOT NULL AND "earlyYearsLevel" IN ('NURSERY','KG1','KG2') AND "courseName" IS NULL AND "studyYear" IS NULL)
 OR ("educationStage"='COLLEGE' AND grade IS NULL AND board IS NULL AND "earlyYearsLevel" IS NULL AND "courseName" IS NOT NULL AND "studyYear" IS NOT NULL AND "studyYear" BETWEEN 1 AND 10)
));
