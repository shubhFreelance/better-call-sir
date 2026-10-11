-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Account" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'GUARDIAN',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "region" TEXT NOT NULL DEFAULT 'Raipur',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Otp" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Otp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "accessHash" TEXT NOT NULL,
    "refreshHash" TEXT NOT NULL,
    "csrf" TEXT NOT NULL,
    "accessExpiresAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "rotated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" UUID NOT NULL,
    "guardianId" UUID NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'tuition-and-learning-records',
    "policyVersion" TEXT NOT NULL DEFAULT 'development-v1',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Child" (
    "id" UUID NOT NULL,
    "guardianId" UUID NOT NULL,
    "alias" TEXT NOT NULL,
    "grade" INTEGER NOT NULL,
    "board" TEXT NOT NULL,
    "studentAccountId" UUID,

    CONSTRAINT "Child_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "guardianId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Teacher" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "bio" TEXT NOT NULL,
    "subjects" TEXT[],
    "boards" TEXT[],
    "grades" INTEGER[],
    "languages" TEXT[],
    "modes" TEXT[],
    "localities" TEXT[],
    "monthlyPaise" INTEGER NOT NULL,
    "experience" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "screeningComplete" BOOLEAN NOT NULL DEFAULT false,
    "consultationOptIn" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "avatarColor" TEXT NOT NULL DEFAULT '#e4eee5',

    CONSTRAINT "Teacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TuitionRequest" (
    "id" UUID NOT NULL,
    "guardianId" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "locality" TEXT NOT NULL,
    "budgetPaise" INTEGER NOT NULL,
    "schedule" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TuitionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "reasons" TEXT[],
    "rankerVersion" TEXT NOT NULL DEFAULT 'rules-v1',
    "response" TEXT NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "guardianId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'HOLD',
    "expiresAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "topic" TEXT NOT NULL DEFAULT '',
    "scopeAccepted" BOOLEAN NOT NULL DEFAULT false,
    "amountPaise" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Placement" (
    "id" UUID NOT NULL,
    "guardianId" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "monthlyPaise" INTEGER NOT NULL,
    "policyVersion" TEXT NOT NULL DEFAULT 'pilot-v1',
    "guardianAccepted" BOOLEAN NOT NULL DEFAULT false,
    "teacherAccepted" BOOLEAN NOT NULL DEFAULT false,
    "guardianStarted" BOOLEAN NOT NULL DEFAULT false,
    "teacherReceiptConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'TERMS_PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Placement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "placementId" UUID NOT NULL,
    "payerId" UUID NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "policyVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DUE',

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "reservationId" UUID NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'CAPTURED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" UUID NOT NULL,
    "placementId" UUID,
    "reservationId" UUID,
    "teacherId" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "attendance" TEXT NOT NULL DEFAULT 'PENDING',
    "disputed" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" UUID NOT NULL,
    "guardianId" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "sharedTeacherId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportCase" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "guardianId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "allowance" INTEGER NOT NULL DEFAULT 4,
    "used" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consultation" (
    "id" UUID NOT NULL,
    "guardianId" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "placementId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "outcome" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "Idempotency" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "operation" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Idempotency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outbox" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "aggregateId" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Audit" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "requestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_phone_key" ON "Account"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Otp_phone_key" ON "Otp"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Session_accessHash_key" ON "Session"("accessHash");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshHash_key" ON "Session"("refreshHash");

-- CreateIndex
CREATE INDEX "Session_accountId_idx" ON "Session"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Consent_guardianId_key" ON "Consent"("guardianId");

-- CreateIndex
CREATE UNIQUE INDEX "Child_studentAccountId_key" ON "Child"("studentAccountId");

-- CreateIndex
CREATE INDEX "Child_guardianId_idx" ON "Child"("guardianId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_accountId_key" ON "Teacher"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_slug_key" ON "Teacher"("slug");

-- CreateIndex
CREATE INDEX "Teacher_status_idx" ON "Teacher"("status");

-- CreateIndex
CREATE INDEX "TuitionRequest_guardianId_status_idx" ON "TuitionRequest"("guardianId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Recommendation_requestId_teacherId_key" ON "Recommendation"("requestId", "teacherId");

-- CreateIndex
CREATE INDEX "Reservation_guardianId_idx" ON "Reservation"("guardianId");

-- CreateIndex
CREATE INDEX "Reservation_teacherId_startsAt_idx" ON "Reservation"("teacherId", "startsAt");

-- CreateIndex
CREATE INDEX "Reservation_status_expiresAt_idx" ON "Reservation"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Placement_requestId_key" ON "Placement"("requestId");

-- CreateIndex
CREATE INDEX "Placement_guardianId_status_idx" ON "Placement"("guardianId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_placementId_key" ON "Invoice"("placementId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reservationId_key" ON "Payment"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerEventId_key" ON "Payment"("providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_paymentId_key" ON "Refund"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_reservationId_key" ON "Lesson"("reservationId");

-- CreateIndex
CREATE INDEX "Lesson_childId_startsAt_idx" ON "Lesson"("childId", "startsAt");

-- CreateIndex
CREATE INDEX "Lesson_teacherId_startsAt_idx" ON "Lesson"("teacherId", "startsAt");

-- CreateIndex
CREATE INDEX "Note_guardianId_idx" ON "Note"("guardianId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_guardianId_key" ON "Membership"("guardianId");

-- CreateIndex
CREATE INDEX "Consultation_guardianId_idx" ON "Consultation"("guardianId");

-- CreateIndex
CREATE UNIQUE INDEX "Idempotency_accountId_operation_key_key" ON "Idempotency"("accountId", "operation", "key");

-- CreateIndex
CREATE INDEX "Outbox_processedAt_createdAt_idx" ON "Outbox"("processedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Audit_aggregateId_createdAt_idx" ON "Audit"("aggregateId", "createdAt");


CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "Reservation" ADD CONSTRAINT reservation_valid_interval CHECK ("endsAt" > "startsAt");
ALTER TABLE "Reservation" ADD CONSTRAINT reservation_no_overlap EXCLUDE USING gist (
  "teacherId" WITH =, tsrange("startsAt", "endsAt", '[)') WITH &&
) WHERE (status IN ('HOLD', 'CONFIRMED'));
ALTER TABLE "Reservation" ADD CONSTRAINT reservation_nonnegative_amount CHECK ("amountPaise" >= 0);
ALTER TABLE "Membership" ADD CONSTRAINT membership_allowance CHECK (used >= 0 AND reserved >= 0 AND used + reserved <= allowance);
ALTER TABLE "Invoice" ADD CONSTRAINT invoice_positive_amount CHECK ("amountPaise" > 0);
ALTER TABLE "Refund" ADD CONSTRAINT refund_positive_amount CHECK ("amountPaise" > 0);
ALTER TABLE "Payment" ADD CONSTRAINT payment_positive_amount CHECK ("amountPaise" > 0 AND currency = 'INR');
ALTER TABLE "Child" ADD CONSTRAINT child_guardian_fk FOREIGN KEY ("guardianId") REFERENCES "Account"(id);
ALTER TABLE "Consent" ADD CONSTRAINT consent_guardian_fk FOREIGN KEY ("guardianId") REFERENCES "Account"(id);
ALTER TABLE "Teacher" ADD CONSTRAINT teacher_account_fk FOREIGN KEY ("accountId") REFERENCES "Account"(id);
ALTER TABLE "TuitionRequest" ADD CONSTRAINT request_child_fk FOREIGN KEY ("childId") REFERENCES "Child"(id);
ALTER TABLE "Placement" ADD CONSTRAINT placement_teacher_fk FOREIGN KEY ("teacherId") REFERENCES "Teacher"(id);
ALTER TABLE "Placement" ADD CONSTRAINT placement_child_fk FOREIGN KEY ("childId") REFERENCES "Child"(id);
ALTER TABLE "Reservation" ADD CONSTRAINT reservation_teacher_fk FOREIGN KEY ("teacherId") REFERENCES "Teacher"(id);
ALTER TABLE "Lesson" ADD CONSTRAINT lesson_child_fk FOREIGN KEY ("childId") REFERENCES "Child"(id);
CREATE FUNCTION prevent_audit_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Audit records are append-only'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON "Audit" FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
