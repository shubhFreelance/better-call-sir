ALTER TABLE "Invoice" ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Payment" ALTER COLUMN "reservationId" DROP NOT NULL, ADD COLUMN "invoiceId" UUID, ADD COLUMN "checkoutOrderId" UUID;
CREATE UNIQUE INDEX "Payment_invoiceId_key" ON "Payment"("invoiceId");
CREATE UNIQUE INDEX "Payment_checkoutOrderId_key" ON "Payment"("checkoutOrderId");
ALTER TABLE "Payment" ADD CONSTRAINT payment_invoice_fk FOREIGN KEY ("invoiceId") REFERENCES "Invoice"(id);
ALTER TABLE "Payment" ADD CONSTRAINT payment_subject CHECK ("reservationId" IS NOT NULL OR "invoiceId" IS NOT NULL);
CREATE TABLE "CheckoutOrder" (
 id UUID PRIMARY KEY, "accountId" UUID NOT NULL REFERENCES "Account"(id), kind TEXT NOT NULL, "resourceId" UUID NOT NULL,
 "amountPaise" INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'INR', provider TEXT NOT NULL DEFAULT 'RAZORPAY', "providerMode" TEXT NOT NULL,
 "providerOrderId" TEXT, status TEXT NOT NULL DEFAULT 'CREATING', version INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT checkout_values CHECK (kind IN ('INVOICE','REVISION') AND "amountPaise">0 AND currency='INR' AND provider='RAZORPAY' AND "providerMode" IN ('SANDBOX','LIVE') AND status IN ('CREATING','CREATED','PAID','FAILED') AND version>0)
);
CREATE UNIQUE INDEX "CheckoutOrder_providerOrderId_key" ON "CheckoutOrder"("providerOrderId");
CREATE INDEX "CheckoutOrder_accountId_createdAt_idx" ON "CheckoutOrder"("accountId","createdAt");
ALTER TABLE "Payment" ADD CONSTRAINT payment_checkout_fk FOREIGN KEY ("checkoutOrderId") REFERENCES "CheckoutOrder"(id);
CREATE TABLE "BillingEvent" (
 id TEXT PRIMARY KEY, provider TEXT NOT NULL, type TEXT NOT NULL, "checkoutOrderId" UUID REFERENCES "CheckoutOrder"(id),
 "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "processedAt" TIMESTAMP(3), result TEXT NOT NULL
);
CREATE INDEX "BillingEvent_receivedAt_idx" ON "BillingEvent"("receivedAt");
CREATE FUNCTION validate_checkout_resource() RETURNS trigger AS $$
BEGIN
 IF NOT ((NEW.kind='INVOICE' AND EXISTS (SELECT 1 FROM "Invoice" WHERE id=NEW."resourceId" AND "payerId"=NEW."accountId" AND "amountPaise"=NEW."amountPaise")) OR
         (NEW.kind='REVISION' AND EXISTS (SELECT 1 FROM "Reservation" WHERE id=NEW."resourceId" AND "guardianId"=NEW."accountId" AND kind='REVISION' AND "amountPaise"=NEW."amountPaise")))
 THEN RAISE EXCEPTION 'Checkout resource must belong to payer and exact amount' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER checkout_resource_owner BEFORE INSERT OR UPDATE ON "CheckoutOrder" FOR EACH ROW EXECUTE FUNCTION validate_checkout_resource();
