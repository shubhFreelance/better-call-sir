-- Extend the provider allowlist without changing existing delivery/history records.
ALTER TABLE "EmailDelivery"
  DROP CONSTRAINT "EmailDelivery_provider_check",
  ADD CONSTRAINT "EmailDelivery_provider_check"
    CHECK (provider IN ('SANDBOX', 'RESEND', 'SMTP'));
