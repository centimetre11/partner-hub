-- CreateTable
CREATE TABLE "UserGoogleMeetCredential" (
    "userId" TEXT NOT NULL,
    "googleEmail" TEXT,
    "refreshToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserGoogleMeetCredential_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "UserGoogleMeetCredential" ADD CONSTRAINT "UserGoogleMeetCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
