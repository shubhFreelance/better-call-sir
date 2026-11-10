ALTER TABLE "Account" ADD COLUMN "superAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Account" ADD CONSTRAINT "account_super_admin_role" CHECK (NOT "superAdmin" OR role = 'ADMIN');
ALTER TABLE "StaffChange" DROP CONSTRAINT "StaffChange_check1";
ALTER TABLE "StaffChange" ADD CONSTRAINT "staff_change_approval_authority" CHECK (
  "approverId" IS NULL OR
  ("approverId" IS DISTINCT FROM "targetAccountId" AND (kind = 'CREATE' OR "approverId" <> "proposerId"))
);
