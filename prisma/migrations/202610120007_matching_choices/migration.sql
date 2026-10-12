-- AlterTable
ALTER TABLE "RecommendationRun" ADD COLUMN     "requestFeatures" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "TuitionRequest" ADD COLUMN     "selectedCandidateId" UUID;


ALTER TABLE "Recommendation" ADD CONSTRAINT candidate_request_key UNIQUE (id,"requestId");
ALTER TABLE "TuitionRequest" ADD CONSTRAINT selected_candidate_owner_fk FOREIGN KEY ("selectedCandidateId",id) REFERENCES "Recommendation"(id,"requestId");
ALTER TABLE "RecommendationRun" ADD CONSTRAINT run_version_positive CHECK ("requestVersion">0);
ALTER TABLE "RecommendationPresentation" ADD CONSTRAINT presentation_kind CHECK (kind IN ('OPERATOR_PUBLISHED','GUARDIAN_SHOWN') AND cardinality("candidateIds") BETWEEN 1 AND 10);
ALTER TABLE "CandidateDecision" ADD CONSTRAINT decision_state CHECK ("candidateVersion">0 AND action IN ('ACCEPTED','DECLINED','GUARDIAN_SELECTED','DEMO_SELECTED'));
