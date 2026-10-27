CREATE TABLE "TuitionBooking" (
 "id" UUID NOT NULL, "kind" TEXT NOT NULL, "resourceId" UUID NOT NULL,
 "month" TEXT NOT NULL, "familyConfirmed" BOOLEAN NOT NULL DEFAULT false,
 "teacherConfirmed" BOOLEAN NOT NULL DEFAULT false, "version" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "TuitionBooking_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TuitionBooking_resourceId_key" ON "TuitionBooking"("resourceId");
CREATE TABLE "TuitionCompletion" (
 "id" UUID NOT NULL, "bookingId" UUID NOT NULL, "date" TEXT NOT NULL,
 "completed" BOOLEAN NOT NULL DEFAULT true, "recordedById" UUID NOT NULL,
 "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "version" INTEGER NOT NULL DEFAULT 1,
 CONSTRAINT "TuitionCompletion_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "TuitionCompletion_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "TuitionBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TuitionCompletion_bookingId_date_key" ON "TuitionCompletion"("bookingId","date");
