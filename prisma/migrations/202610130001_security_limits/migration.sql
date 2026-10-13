CREATE TABLE "RateBucket" (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL CHECK (count > 0),
  "resetsAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "RateBucket_resetsAt_idx" ON "RateBucket" ("resetsAt");
