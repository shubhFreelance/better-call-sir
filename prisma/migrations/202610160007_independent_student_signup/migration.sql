CREATE TABLE "IndependentStudentProfile" (
 "accountId" UUID PRIMARY KEY REFERENCES "Account"(id),
 education JSONB NOT NULL,
 "managementPreference" TEXT NOT NULL DEFAULT 'SELF_DIRECTED' CHECK ("managementPreference"='SELF_DIRECTED'),
 "adultDeclarationAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "consentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "policyVersion" TEXT NOT NULL DEFAULT 'independent-student-development-v1',
 version INTEGER NOT NULL DEFAULT 1 CHECK (version>0),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "independent_education_object" CHECK (jsonb_typeof(education)='object')
);
