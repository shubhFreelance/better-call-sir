ALTER TABLE "OnboardingProgress" DROP CONSTRAINT onboarding_kind;
ALTER TABLE "OnboardingProgress" ADD CONSTRAINT onboarding_kind CHECK (kind IN ('PARENT','TEACHER','STUDENT','ENQUIRY','TEACHER_REVISION'));
