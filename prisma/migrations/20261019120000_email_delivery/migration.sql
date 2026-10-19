ALTER TABLE "Account" ADD COLUMN "emailLocale" TEXT NOT NULL DEFAULT 'en' CHECK("emailLocale" IN ('en','hi'));
ALTER TABLE "Otp" ADD COLUMN locale TEXT NOT NULL DEFAULT 'en' CHECK(locale IN ('en','hi'));
CREATE TABLE "EmailDelivery" (
 id UUID PRIMARY KEY, "accountId" UUID REFERENCES "Account"(id), region TEXT NOT NULL DEFAULT 'Raipur', "eventId" TEXT, "dedupeKey" TEXT NOT NULL UNIQUE, "requestHash" TEXT,
 "maxAttempts" INTEGER NOT NULL DEFAULT 5 CHECK("maxAttempts" BETWEEN 5 AND 50), kind TEXT NOT NULL CHECK(kind IN ('OTP','NOTIFICATION')), topic TEXT NOT NULL, locale TEXT NOT NULL DEFAULT 'en' CHECK(locale IN ('en','hi')), "actionPath" TEXT, "recipientHash" TEXT, "encryptedContent" TEXT, "otpHash" TEXT,
 provider TEXT NOT NULL CHECK(provider IN ('SANDBOX','RESEND')), "providerId" UUID UNIQUE, status TEXT NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','SENDING','ACCEPTED','DELIVERED','DELAYED','BOUNCED','COMPLAINED','FAILED','UNKNOWN','SUPPRESSED','SANDBOX')),
 "failureCode" TEXT, attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0), version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), "firstAttemptAt" TIMESTAMP(3), "leaseUntil" TIMESTAMP(3), "nextAttemptAt" TIMESTAMP(3), "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CHECK(kind<>'OTP' OR "accountId" IS NULL)
);
CREATE INDEX "EmailDelivery_status_nextAttemptAt_idx" ON "EmailDelivery"(status,"nextAttemptAt");
CREATE INDEX "EmailDelivery_accountId_createdAt_id_idx" ON "EmailDelivery"("accountId","createdAt",id);
CREATE INDEX "EmailDelivery_region_status_createdAt_id_idx" ON "EmailDelivery"(region,status,"createdAt",id);
CREATE TABLE "EmailAttempt" (id UUID PRIMARY KEY,"deliveryId" UUID NOT NULL REFERENCES "EmailDelivery"(id),number INTEGER NOT NULL CHECK(number>0),outcome TEXT NOT NULL DEFAULT 'STARTED' CHECK(outcome IN ('STARTED','ACCEPTED','SANDBOX','REJECTED','UNCERTAIN','SUPPRESSED')),"failureCode" TEXT,"startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"completedAt" TIMESTAMP(3),UNIQUE("deliveryId",number));
CREATE TABLE "EmailReceipt" (id TEXT PRIMARY KEY,"deliveryId" UUID REFERENCES "EmailDelivery"(id),"providerId" UUID NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('ACCEPTED','DELIVERED','DELAYED','BOUNCED','COMPLAINED')),"payloadHash" TEXT NOT NULL,"occurredAt" TIMESTAMP(3) NOT NULL,"receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "EmailReceipt_providerId_idx" ON "EmailReceipt"("providerId");
CREATE FUNCTION preserve_email_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'deliveryId')<>(to_jsonb(OLD)-'deliveryId') OR OLD."deliveryId" IS NOT NULL AND NEW."deliveryId" IS DISTINCT FROM OLD."deliveryId" THEN RAISE EXCEPTION 'Email receipt history is immutable' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER email_receipt_immutable BEFORE UPDATE OR DELETE ON "EmailReceipt" FOR EACH ROW EXECUTE FUNCTION preserve_email_receipt();
CREATE FUNCTION preserve_email_attempt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR OLD.outcome<>'STARTED' OR (to_jsonb(NEW)-ARRAY['outcome','failureCode','completedAt'])<>(to_jsonb(OLD)-ARRAY['outcome','failureCode','completedAt']) THEN RAISE EXCEPTION 'Email attempt history is immutable' USING ERRCODE='23514'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER email_attempt_immutable BEFORE UPDATE OR DELETE ON "EmailAttempt" FOR EACH ROW EXECUTE FUNCTION preserve_email_attempt();
