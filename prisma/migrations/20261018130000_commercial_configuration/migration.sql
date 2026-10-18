CREATE TABLE "CommercialState" (id TEXT PRIMARY KEY CHECK(id='hiring'), version INTEGER NOT NULL DEFAULT 0 CHECK(version>=0), "placementBasisPoints" INTEGER NOT NULL DEFAULT 2500 CHECK("placementBasisPoints" BETWEEN 0 AND 2500), "placementCapPaise" INTEGER NOT NULL DEFAULT 150000 CHECK("placementCapPaise" BETWEEN 0 AND 150000));
INSERT INTO "CommercialState" (id) VALUES ('hiring');
CREATE TABLE "CommercialChange" (
 id UUID PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('FEE','REGION','ROLLBACK')), "restoreVersion" INTEGER, "expectedVersion" INTEGER NOT NULL CHECK("expectedVersion">=0), before JSONB NOT NULL, after JSONB NOT NULL,
 "proposerId" UUID NOT NULL REFERENCES "Account"(id), "proposerAuthVersion" INTEGER NOT NULL, "approverId" UUID REFERENCES "Account"(id), reason TEXT NOT NULL, "evidenceRef" TEXT NOT NULL, "decisionReason" TEXT,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','CANCELLED')), version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "decidedAt" TIMESTAMP(3), CHECK("approverId" IS NULL OR "approverId"<>"proposerId"), CHECK(status<>'APPROVED' OR "approverId" IS NOT NULL)
);
CREATE INDEX "CommercialChange_status_id_idx" ON "CommercialChange"(status,id);
CREATE TABLE "CommercialRevision" (version INTEGER PRIMARY KEY CHECK(version>=0), "changeId" UUID UNIQUE REFERENCES "CommercialChange"(id), before JSONB NOT NULL, after JSONB NOT NULL, "proposerId" UUID REFERENCES "Account"(id), "approverId" UUID REFERENCES "Account"(id), reason TEXT NOT NULL, "evidenceRef" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
INSERT INTO "CommercialRevision" (version,before,after,reason,"evidenceRef") SELECT 0,s,s,'Existing pilot fee and region baseline; no new commercial approval implied','migration:legacy-pilot' FROM (SELECT jsonb_build_object('placementBasisPoints',2500,'placementCapPaise',150000,'regions',COALESCE(jsonb_agg(jsonb_build_object('id',id,'countryCode',"countryCode",'stateCode',"stateCode",'cityName',"cityName",'enabled',enabled) ORDER BY id),'[]'::jsonb)) AS s FROM "Region") x;
CREATE FUNCTION preserve_commercial_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Commercial revision history is immutable' USING ERRCODE='23514'; END $$;
CREATE TRIGGER commercial_revision_immutable BEFORE UPDATE OR DELETE ON "CommercialRevision" FOR EACH ROW EXECUTE FUNCTION preserve_commercial_revision();
ALTER TABLE "Placement" ADD COLUMN "placementFeePaise" INTEGER CHECK("placementFeePaise">=0), ADD COLUMN "commercialVersion" INTEGER NOT NULL DEFAULT 0 REFERENCES "CommercialRevision"(version);
UPDATE "Placement" SET "placementFeePaise"=LEAST(ROUND("monthlyPaise"*0.25),150000);
CREATE FUNCTION preserve_placement_commercial_terms() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='INSERT' AND NEW."placementFeePaise" IS NULL THEN NEW."placementFeePaise"=LEAST(ROUND(NEW."monthlyPaise"*0.25),150000); END IF;
 IF TG_OP='UPDATE' AND (NEW."monthlyPaise"<>OLD."monthlyPaise" OR NEW."policyVersion"<>OLD."policyVersion" OR NEW."commercialVersion"<>OLD."commercialVersion" OR NEW."placementFeePaise" IS DISTINCT FROM OLD."placementFeePaise") THEN RAISE EXCEPTION 'Hiring commercial terms are immutable' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER placement_commercial_immutable BEFORE INSERT OR UPDATE ON "Placement" FOR EACH ROW EXECUTE FUNCTION preserve_placement_commercial_terms();

ALTER TABLE "CommercialState" ADD CONSTRAINT commercial_head_revision_fk FOREIGN KEY(version) REFERENCES "CommercialRevision"(version);
