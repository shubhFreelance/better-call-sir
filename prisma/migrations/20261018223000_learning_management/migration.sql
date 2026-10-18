ALTER TABLE "Child" ADD COLUMN "learningManagementMode" TEXT NOT NULL DEFAULT 'GUARDIAN_ONLY', ADD COLUMN "learningManagementVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Child" ADD CONSTRAINT "Child_learning_management_check" CHECK ("learningManagementMode" IN ('GUARDIAN_ONLY','SHARED','STUDENT_LED') AND "learningManagementVersion">0);
UPDATE "Child" c SET "learningManagementMode"=v."managementMode" FROM "GuardianVerification" v WHERE v.id=c."guardianVerificationId" AND v.status='APPROVED';
ALTER TABLE "TuitionRequest" ADD COLUMN "guardianDecisionRequested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Placement" ADD COLUMN "familyAcceptanceActorId" UUID REFERENCES "Account"(id);
ALTER TABLE "CandidateDecision" DROP CONSTRAINT decision_state;
ALTER TABLE "CandidateDecision" ADD CONSTRAINT decision_state CHECK ("candidateVersion">0 AND action IN ('ACCEPTED','DECLINED','GUARDIAN_SELECTED','STUDENT_SELECTED','DEMO_SELECTED'));
