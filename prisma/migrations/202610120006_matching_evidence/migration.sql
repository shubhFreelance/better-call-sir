-- AlterTable
ALTER TABLE "Recommendation" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "position" INTEGER,
ADD COLUMN     "presentedAt" TIMESTAMP(3),
ADD COLUMN     "runId" UUID,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "RecommendationRun" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "requestVersion" INTEGER NOT NULL,
    "operatorId" UUID NOT NULL,
    "rankerVersion" TEXT NOT NULL,
    "featureVersion" TEXT NOT NULL,
    "eligiblePool" JSONB NOT NULL,
    "rankedCandidates" JSONB NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationPresentation" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "candidateIds" UUID[],
    "kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationPresentation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateDecision" (
    "id" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "candidateVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecommendationRun_requestId_createdAt_idx" ON "RecommendationRun"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "RecommendationPresentation_requestId_createdAt_idx" ON "RecommendationPresentation"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "CandidateDecision_candidateId_idx" ON "CandidateDecision"("candidateId");


ALTER TABLE "RecommendationRun" ADD CONSTRAINT run_request_fk FOREIGN KEY ("requestId") REFERENCES "TuitionRequest"(id);
ALTER TABLE "RecommendationRun" ADD CONSTRAINT run_operator_fk FOREIGN KEY ("operatorId") REFERENCES "Account"(id);
ALTER TABLE "Recommendation" ADD CONSTRAINT candidate_request_fk FOREIGN KEY ("requestId") REFERENCES "TuitionRequest"(id);
ALTER TABLE "Recommendation" ADD CONSTRAINT candidate_teacher_fk FOREIGN KEY ("teacherId") REFERENCES "Teacher"(id);
ALTER TABLE "Recommendation" ADD CONSTRAINT candidate_run_fk FOREIGN KEY ("runId") REFERENCES "RecommendationRun"(id);
ALTER TABLE "Recommendation" ADD CONSTRAINT candidate_version CHECK (version>0 AND (position IS NULL OR position>0));
ALTER TABLE "RecommendationPresentation" ADD CONSTRAINT presentation_run_fk FOREIGN KEY ("runId") REFERENCES "RecommendationRun"(id);
ALTER TABLE "RecommendationPresentation" ADD CONSTRAINT presentation_request_fk FOREIGN KEY ("requestId") REFERENCES "TuitionRequest"(id);
ALTER TABLE "RecommendationPresentation" ADD CONSTRAINT presentation_actor_fk FOREIGN KEY ("actorId") REFERENCES "Account"(id);
ALTER TABLE "CandidateDecision" ADD CONSTRAINT decision_candidate_fk FOREIGN KEY ("candidateId") REFERENCES "Recommendation"(id);
ALTER TABLE "CandidateDecision" ADD CONSTRAINT decision_run_fk FOREIGN KEY ("runId") REFERENCES "RecommendationRun"(id);
ALTER TABLE "CandidateDecision" ADD CONSTRAINT decision_actor_fk FOREIGN KEY ("actorId") REFERENCES "Account"(id);
CREATE TRIGGER recommendation_run_append_only BEFORE UPDATE OR DELETE ON "RecommendationRun" FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
CREATE TRIGGER presentation_append_only BEFORE UPDATE OR DELETE ON "RecommendationPresentation" FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
CREATE TRIGGER decision_append_only BEFORE UPDATE OR DELETE ON "CandidateDecision" FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
