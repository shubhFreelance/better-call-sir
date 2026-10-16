ALTER TABLE "Child"
  ALTER COLUMN grade DROP NOT NULL, ALTER COLUMN board DROP NOT NULL,
  ADD COLUMN "educationStage" TEXT NOT NULL DEFAULT 'SCHOOL',
  ADD COLUMN "earlyYearsLevel" TEXT,
  ADD COLUMN "courseName" TEXT,
  ADD COLUMN university TEXT,
  ADD COLUMN "studyYear" INTEGER;
ALTER TABLE "Child" ADD CONSTRAINT learner_education_shape CHECK (
  ("educationStage" = 'SCHOOL' AND grade IS NOT NULL AND grade BETWEEN 1 AND 12 AND board IS NOT NULL AND length(board) BETWEEN 1 AND 80 AND "earlyYearsLevel" IS NULL AND "courseName" IS NULL AND university IS NULL AND "studyYear" IS NULL)
  OR ("educationStage" = 'EARLY_YEARS' AND grade IS NULL AND board IS NULL AND "earlyYearsLevel" IS NOT NULL AND "earlyYearsLevel" IN ('NURSERY','KG1','KG2') AND "courseName" IS NULL AND university IS NULL AND "studyYear" IS NULL)
  OR ("educationStage" = 'COLLEGE' AND grade IS NULL AND board IS NULL AND "earlyYearsLevel" IS NULL AND ("courseName" IS NULL OR length("courseName") BETWEEN 1 AND 160) AND (university IS NULL OR length(university) BETWEEN 1 AND 160) AND ("studyYear" IS NULL OR "studyYear" BETWEEN 1 AND 10))
);
