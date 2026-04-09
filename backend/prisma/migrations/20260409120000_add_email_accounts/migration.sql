CREATE TABLE "email_accounts" (
    "id" TEXT NOT NULL,
    "legacy_no" INTEGER,
    "department_id" INTEGER NOT NULL,
    "department_job_code_id" INTEGER,
    "user_name" VARCHAR(191) NOT NULL,
    "email" VARCHAR(191) NOT NULL,
    "location_raw" VARCHAR(191),
    "location_id" INTEGER,
    "license_type" VARCHAR(100) NOT NULL,
    "password" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_accounts_email_key" ON "email_accounts"("email");
CREATE INDEX "idx_email_accounts_department_id" ON "email_accounts"("department_id");
CREATE INDEX "idx_email_accounts_department_job_code_id" ON "email_accounts"("department_job_code_id");
CREATE INDEX "idx_email_accounts_location_id" ON "email_accounts"("location_id");

ALTER TABLE "devices" ADD COLUMN "email_account_id" TEXT;
CREATE UNIQUE INDEX "devices_email_account_id_key" ON "devices"("email_account_id");
CREATE INDEX "idx_devices_email_account_id" ON "devices"("email_account_id");

ALTER TABLE "email_accounts"
ADD CONSTRAINT "email_accounts_department_id_fkey"
FOREIGN KEY ("department_id") REFERENCES "departments"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "email_accounts"
ADD CONSTRAINT "email_accounts_department_job_code_id_fkey"
FOREIGN KEY ("department_job_code_id") REFERENCES "department_job_codes"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "email_accounts"
ADD CONSTRAINT "email_accounts_location_id_fkey"
FOREIGN KEY ("location_id") REFERENCES "locations"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "devices"
ADD CONSTRAINT "devices_email_account_id_fkey"
FOREIGN KEY ("email_account_id") REFERENCES "email_accounts"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
