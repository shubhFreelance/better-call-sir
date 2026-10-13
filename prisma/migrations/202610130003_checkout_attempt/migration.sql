CREATE TABLE "CheckoutAttempt" (
 "orderId" UUID PRIMARY KEY REFERENCES "CheckoutOrder" (id),
 "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "failureCode" TEXT
);
