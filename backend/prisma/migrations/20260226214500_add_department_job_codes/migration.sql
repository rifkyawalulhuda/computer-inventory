CREATE TABLE "public"."department_job_codes" (
    "id" SERIAL NOT NULL,
    "department_id" INTEGER NOT NULL,
    "job_code" VARCHAR(5) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_job_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "department_job_codes_job_code_key" ON "public"."department_job_codes"("job_code");
CREATE INDEX "idx_department_job_codes_department_id" ON "public"."department_job_codes"("department_id");

ALTER TABLE "public"."department_job_codes"
ADD CONSTRAINT "department_job_codes_department_id_fkey"
FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;