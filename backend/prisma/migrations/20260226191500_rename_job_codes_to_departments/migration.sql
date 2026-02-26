ALTER TABLE "public"."job_codes" RENAME TO "departments";
ALTER INDEX "public"."job_codes_pkey" RENAME TO "departments_pkey";
ALTER INDEX "public"."job_codes_code_key" RENAME TO "departments_code_key";