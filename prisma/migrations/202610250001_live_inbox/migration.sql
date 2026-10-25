CREATE TABLE "InboxNotification" (
 "id" UUID PRIMARY KEY, "accountId" UUID NOT NULL REFERENCES "Account"(id), "eventId" UUID NOT NULL,
 "topic" TEXT NOT NULL, "actionPath" TEXT NOT NULL, "important" BOOLEAN NOT NULL DEFAULT false,
 "readAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("accountId","eventId")
);
CREATE INDEX ON "InboxNotification"("accountId","createdAt",id);
