ALTER TABLE "public"."departments" RENAME COLUMN "code" TO "site_code";
ALTER INDEX IF EXISTS "public"."departments_code_key" RENAME TO "departments_site_code_key";

ALTER TABLE "public"."master_users" RENAME COLUMN "job_code_id" TO "site_code_id";
ALTER INDEX IF EXISTS "public"."idx_master_users_job_code_id" RENAME TO "idx_master_users_site_code_id";
ALTER TABLE "public"."master_users" RENAME CONSTRAINT "master_users_job_code_id_fkey" TO "master_users_site_code_id_fkey";

ALTER TABLE "public"."devices" RENAME COLUMN "job_code_id" TO "site_code_id";
ALTER TABLE "public"."devices" RENAME CONSTRAINT "devices_job_code_id_fkey" TO "devices_site_code_id_fkey";