ALTER TABLE "TuitionRequest" ADD COLUMN "discoveryMethod" TEXT NOT NULL DEFAULT 'ASSISTED', ADD COLUMN "preferredTeacherId" UUID REFERENCES "Teacher"(id);
ALTER TABLE "TuitionRequest" ADD CONSTRAINT request_discovery_path CHECK (("discoveryMethod"='ASSISTED' AND "preferredTeacherId" IS NULL) OR ("discoveryMethod"='MANUAL' AND "preferredTeacherId" IS NOT NULL));
