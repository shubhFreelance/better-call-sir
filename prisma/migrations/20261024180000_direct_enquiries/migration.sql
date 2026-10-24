CREATE TABLE "DirectEnquiry" (
 id UUID PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('GUARDIAN','INDEPENDENT')), "sourceId" UUID NOT NULL,
 "ownerId" UUID NOT NULL REFERENCES "Account"(id), "childId" UUID REFERENCES "Child"(id), "teacherId" UUID NOT NULL REFERENCES "Teacher"(id), region TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROPOSED','ACCEPTED','DECLINED')), proposal JSONB, "arrangementId" UUID,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(kind,"sourceId"), CHECK((kind='GUARDIAN' AND "childId" IS NOT NULL) OR (kind='INDEPENDENT' AND "childId" IS NULL))
);
CREATE INDEX ON "DirectEnquiry"("teacherId","createdAt",id);
CREATE INDEX ON "DirectEnquiry"("ownerId","createdAt",id);
CREATE INDEX ON "DirectEnquiry"(region,"createdAt",id);
INSERT INTO "DirectEnquiry"(id,kind,"sourceId","ownerId","childId","teacherId",region,"createdAt")
 SELECT gen_random_uuid(),'GUARDIAN',r.id,r."guardianId",r."childId",r."preferredTeacherId",r.region,r."createdAt" FROM "TuitionRequest" r
 WHERE r."discoveryMethod"='MANUAL' AND r."preferredTeacherId" IS NOT NULL AND r.status='OPEN' AND NOT EXISTS(SELECT 1 FROM "Placement" p WHERE p."requestId"=r.id);
INSERT INTO "DirectEnquiry"(id,kind,"sourceId","ownerId","teacherId",region,"createdAt")
 SELECT gen_random_uuid(),'INDEPENDENT',r.id,r."studentAccountId",r."preferredTeacherId",r.region,r."createdAt" FROM "StudentEnquiry" r
 WHERE r."discoveryMethod"='MANUAL' AND r."preferredTeacherId" IS NOT NULL AND r.status='SUBMITTED' AND NOT EXISTS(SELECT 1 FROM "StudentArrangement" p WHERE p."enquiryId"=r.id);
