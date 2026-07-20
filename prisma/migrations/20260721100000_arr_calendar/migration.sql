-- CreateTable
CREATE TABLE "ArrCustomerProfile" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "situation" TEXT,
    "todo" TEXT,
    "latestServiceAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArrCustomerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArrCalendarCell" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'NOTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArrCalendarCell_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArrCustomerProfile_customerId_key" ON "ArrCustomerProfile"("customerId");

-- CreateIndex
CREATE INDEX "ArrCalendarCell_year_month_idx" ON "ArrCalendarCell"("year", "month");

-- CreateIndex
CREATE INDEX "ArrCalendarCell_profileId_idx" ON "ArrCalendarCell"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "ArrCalendarCell_profileId_year_month_key" ON "ArrCalendarCell"("profileId", "year", "month");

-- AddForeignKey
ALTER TABLE "ArrCustomerProfile" ADD CONSTRAINT "ArrCustomerProfile_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArrCalendarCell" ADD CONSTRAINT "ArrCalendarCell_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ArrCustomerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
