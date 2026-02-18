/*
  Warnings:

  - You are about to alter the column `code` on the `job_codes` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(5)`.
  - Added the required column `address` to the `job_codes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `phone_number` to the `job_codes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `site_name` to the `job_codes` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."job_codes" ADD COLUMN     "address" TEXT NOT NULL,
ADD COLUMN     "phone_number" VARCHAR(30) NOT NULL,
ADD COLUMN     "site_name" VARCHAR(30) NOT NULL,
ALTER COLUMN "code" SET DATA TYPE VARCHAR(5);
