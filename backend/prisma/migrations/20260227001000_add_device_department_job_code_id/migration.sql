ALTER TABLE "public"."devices"
ADD COLUMN "department_job_code_id" INTEGER;

CREATE INDEX "idx_devices_department_job_code_id"
ON "public"."devices"("department_job_code_id");

ALTER TABLE "public"."devices"
ADD CONSTRAINT "devices_department_job_code_id_fkey"
FOREIGN KEY ("department_job_code_id")
REFERENCES "public"."department_job_codes"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
