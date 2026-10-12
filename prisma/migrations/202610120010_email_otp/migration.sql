-- Existing synthetic accounts keep their identifiers. New adults sign in using email; children have no contact requirement.
ALTER TABLE "Account" ALTER COLUMN phone DROP NOT NULL, ADD COLUMN email TEXT;
CREATE UNIQUE INDEX "Account_email_key" ON "Account"(email);
ALTER TABLE "Account" ADD CONSTRAINT account_email_normalized CHECK (email IS NULL OR email=lower(email));
ALTER TABLE "Otp" RENAME COLUMN phone TO address;
ALTER INDEX "Otp_phone_key" RENAME TO "Otp_address_key";
-- Previously issued phone challenges expire; no account or learning data is removed.
UPDATE "Otp" SET "expiresAt"=CURRENT_TIMESTAMP;
