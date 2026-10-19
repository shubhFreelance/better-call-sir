CREATE TABLE "TuitionMinimum" (
 id UUID PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('PLACEMENT','INDEPENDENT')), "resourceId" UUID NOT NULL UNIQUE,
 "monthlyPaise" INTEGER NOT NULL CHECK("monthlyPaise">=0), days INTEGER NOT NULL CHECK(days IN (0,15,30)), "minimumPaise" INTEGER NOT NULL CHECK("minimumPaise"=CASE days WHEN 0 THEN 0 WHEN 15 THEN CEIL("monthlyPaise"::numeric/2)::integer ELSE "monthlyPaise" END),
 "adjustedPaise" INTEGER NOT NULL CHECK("adjustedPaise" BETWEEN 0 AND "minimumPaise"), "policyVersion" TEXT NOT NULL DEFAULT 'minimum-tuition-v1',
 "commencementDate" TEXT, "familyConfirmedAt" TIMESTAMP(3), "teacherConfirmedAt" TIMESTAMP(3), version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(("familyConfirmedAt" IS NULL AND "teacherConfirmedAt" IS NULL) = ("commencementDate" IS NULL))
);
CREATE TABLE "TuitionCredit" (
 id UUID PRIMARY KEY, "minimumId" UUID NOT NULL REFERENCES "TuitionMinimum"(id), "proposerId" UUID NOT NULL REFERENCES "Account"(id), "confirmerId" UUID REFERENCES "Account"(id), "amountPaise" INTEGER NOT NULL CHECK("amountPaise">0), "paidOn" TEXT NOT NULL, reference TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','CONFIRMED','REJECTED')), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "decidedAt" TIMESTAMP(3),
 UNIQUE("minimumId",reference), CHECK("confirmerId" IS NULL OR "confirmerId"<>"proposerId"), CHECK((status='PENDING')=("confirmerId" IS NULL AND "decidedAt" IS NULL))
);
CREATE INDEX "TuitionCredit_minimumId_id_idx" ON "TuitionCredit"("minimumId",id);
CREATE TABLE "TuitionMinimumReview" (
 id UUID PRIMARY KEY, "minimumId" UUID NOT NULL REFERENCES "TuitionMinimum"(id), "caseId" UUID NOT NULL UNIQUE REFERENCES "SupportCase"(id), "requesterId" UUID NOT NULL REFERENCES "Account"(id), region TEXT NOT NULL, reason TEXT NOT NULL CHECK(reason IN ('SAFETY','NON_DELIVERY')),
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','RESOLVED')), "reviewerId" UUID REFERENCES "Account"(id), "decisionReason" TEXT, "adjustedPaise" INTEGER CHECK("adjustedPaise">=0), "decidedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK("reviewerId" IS NULL OR "reviewerId"<>"requesterId"), CHECK((status='PENDING')=("reviewerId" IS NULL AND "decidedAt" IS NULL))
);
CREATE UNIQUE INDEX tuition_minimum_pending_review ON "TuitionMinimumReview"("minimumId") WHERE status='PENDING';
CREATE INDEX "TuitionMinimumReview_region_status_id_idx" ON "TuitionMinimumReview"(region,status,id);
CREATE INDEX "TuitionMinimumReview_minimumId_id_idx" ON "TuitionMinimumReview"("minimumId",id);
CREATE FUNCTION preserve_tuition_minimum() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Minimum tuition history is retained' USING ERRCODE='23514'; END IF;
 IF NEW.kind<>OLD.kind OR NEW."resourceId"<>OLD."resourceId" OR NEW."monthlyPaise"<>OLD."monthlyPaise" OR NEW.days<>OLD.days OR NEW."minimumPaise"<>OLD."minimumPaise" OR NEW."policyVersion"<>OLD."policyVersion" OR NEW."createdAt"<>OLD."createdAt" OR OLD."familyConfirmedAt" IS NOT NULL AND OLD."teacherConfirmedAt" IS NOT NULL AND (NEW."commencementDate" IS DISTINCT FROM OLD."commencementDate" OR NEW."familyConfirmedAt" IS DISTINCT FROM OLD."familyConfirmedAt" OR NEW."teacherConfirmedAt" IS DISTINCT FROM OLD."teacherConfirmedAt") THEN RAISE EXCEPTION 'Minimum tuition terms and confirmed commencement are immutable' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER minimum_tuition_immutable BEFORE UPDATE OR DELETE ON "TuitionMinimum" FOR EACH ROW EXECUTE FUNCTION preserve_tuition_minimum();
CREATE FUNCTION preserve_tuition_entry() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR OLD.status<>'PENDING' OR (to_jsonb(NEW)-ARRAY['status','confirmerId','decidedAt','reviewerId','decisionReason','adjustedPaise'])<>(to_jsonb(OLD)-ARRAY['status','confirmerId','decidedAt','reviewerId','decisionReason','adjustedPaise']) THEN RAISE EXCEPTION 'Tuition entries are immutable after decision' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER tuition_credit_immutable BEFORE UPDATE OR DELETE ON "TuitionCredit" FOR EACH ROW EXECUTE FUNCTION preserve_tuition_entry();
CREATE TRIGGER tuition_review_immutable BEFORE UPDATE OR DELETE ON "TuitionMinimumReview" FOR EACH ROW EXECUTE FUNCTION preserve_tuition_entry();
