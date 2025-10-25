/*
  Warnings:

  - You are about to drop the column `showPhotoToParent` on the `Child` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "Pass" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "childId" TEXT NOT NULL,
    "logopedId" TEXT,
    "totalLessons" INTEGER NOT NULL,
    "remainingLessons" INTEGER NOT NULL,
    "totalPrice" DECIMAL NOT NULL,
    "validUntil" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Pass_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Pass_logopedId_fkey" FOREIGN KEY ("logopedId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PassUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "passId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "usedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PassUsage_passId_fkey" FOREIGN KEY ("passId") REFERENCES "Pass" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PassUsage_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Child" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentId" TEXT NOT NULL,
    "logopedId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "birthDate" DATETIME,
    "diagnosis" TEXT,
    "conclusion" TEXT,
    "photoUrl" TEXT,
    "showDiagnosisToParent" BOOLEAN DEFAULT false,
    "showConclusionToParent" BOOLEAN DEFAULT false,
    "allowSelfEnroll" BOOLEAN DEFAULT false,
    "isArchived" BOOLEAN DEFAULT false,
    "rateLesson" DECIMAL,
    "rateConsultation" DECIMAL,
    CONSTRAINT "Child_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Child_logopedId_fkey" FOREIGN KEY ("logopedId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Child" ("allowSelfEnroll", "birthDate", "conclusion", "diagnosis", "firstName", "id", "isArchived", "lastName", "logopedId", "parentId", "photoUrl", "rateConsultation", "rateLesson", "showConclusionToParent", "showDiagnosisToParent") SELECT "allowSelfEnroll", "birthDate", "conclusion", "diagnosis", "firstName", "id", "isArchived", "lastName", "logopedId", "parentId", "photoUrl", "rateConsultation", "rateLesson", "showConclusionToParent", "showDiagnosisToParent" FROM "Child";
DROP TABLE "Child";
ALTER TABLE "new_Child" RENAME TO "Child";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PassUsage_lessonId_key" ON "PassUsage"("lessonId");
