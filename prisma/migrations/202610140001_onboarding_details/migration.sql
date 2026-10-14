ALTER TABLE "Teacher" ADD COLUMN address JSONB, ADD COLUMN education JSONB, ADD COLUMN employment JSONB, ADD COLUMN "demoOptIn" BOOLEAN;
ALTER TABLE "Child" ADD COLUMN "schoolName" TEXT, ADD COLUMN "schoolSubjects" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Child" ADD CONSTRAINT child_school_details CHECK (("schoolName" IS NULL OR length("schoolName") BETWEEN 1 AND 160) AND cardinality("schoolSubjects")<=20);
