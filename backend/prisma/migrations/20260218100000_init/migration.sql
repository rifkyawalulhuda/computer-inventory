-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."job_codes" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."locations" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."device_categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."device_models" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."employees" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."devices" (
    "id" TEXT NOT NULL,
    "legacy_no" INTEGER,
    "serial_number" TEXT,
    "host_name" TEXT,
    "user_name_raw" TEXT,
    "user_email_raw" TEXT,
    "status_raw" TEXT,
    "location_raw" TEXT,
    "ip_list_raw" TEXT,
    "pic_name_raw" TEXT,
    "notes" TEXT,
    "bitlocker_key" TEXT,
    "job_code_id" INTEGER,
    "category_id" INTEGER,
    "model_id" INTEGER,
    "location_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."device_ips" (
    "id" SERIAL NOT NULL,
    "device_id" TEXT NOT NULL,
    "ip_address" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_ips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."device_assignments" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "employee_id" TEXT,
    "assigned_name" TEXT,
    "assigned_email" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."lease_contracts" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "days_lease" INTEGER,
    "lease_status" TEXT,
    "history_log" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lease_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."remote_access_profiles" (
    "id" TEXT NOT NULL,
    "device_id" TEXT,
    "warehouse" TEXT,
    "user_name" TEXT,
    "device_type" TEXT,
    "pc_name" TEXT,
    "teamviewer_version" TEXT,
    "teamviewer_id" TEXT,
    "unattended_password" TEXT,
    "pic_name" TEXT,
    "contact" TEXT,
    "remarks" TEXT,
    "source_updated_on" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "remote_access_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_codes_code_key" ON "public"."job_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "locations_name_key" ON "public"."locations"("name");

-- CreateIndex
CREATE UNIQUE INDEX "device_categories_name_key" ON "public"."device_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "device_models_name_key" ON "public"."device_models"("name");

-- CreateIndex
CREATE UNIQUE INDEX "employees_email_key" ON "public"."employees"("email");

-- CreateIndex
CREATE UNIQUE INDEX "devices_serial_number_key" ON "public"."devices"("serial_number");

-- CreateIndex
CREATE INDEX "idx_devices_host_name" ON "public"."devices"("host_name");

-- CreateIndex
CREATE INDEX "idx_devices_location_id" ON "public"."devices"("location_id");

-- CreateIndex
CREATE INDEX "idx_devices_category_id" ON "public"."devices"("category_id");

-- CreateIndex
CREATE INDEX "idx_device_ips_ip_address" ON "public"."device_ips"("ip_address");

-- CreateIndex
CREATE UNIQUE INDEX "device_ips_device_id_ip_address_key" ON "public"."device_ips"("device_id", "ip_address");

-- CreateIndex
CREATE INDEX "idx_assignments_device_active" ON "public"."device_assignments"("device_id", "is_active");

-- CreateIndex
CREATE INDEX "idx_lease_contracts_end_date" ON "public"."lease_contracts"("end_date");

-- CreateIndex
CREATE INDEX "idx_lease_contracts_lease_status" ON "public"."lease_contracts"("lease_status");

-- CreateIndex
CREATE INDEX "idx_remote_profiles_pc_name" ON "public"."remote_access_profiles"("pc_name");

-- CreateIndex
CREATE INDEX "idx_remote_profiles_teamviewer_id" ON "public"."remote_access_profiles"("teamviewer_id");

-- AddForeignKey
ALTER TABLE "public"."devices" ADD CONSTRAINT "devices_job_code_id_fkey" FOREIGN KEY ("job_code_id") REFERENCES "public"."job_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."devices" ADD CONSTRAINT "devices_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."device_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."devices" ADD CONSTRAINT "devices_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "public"."device_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."devices" ADD CONSTRAINT "devices_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."device_ips" ADD CONSTRAINT "device_ips_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."device_assignments" ADD CONSTRAINT "device_assignments_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."device_assignments" ADD CONSTRAINT "device_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."lease_contracts" ADD CONSTRAINT "lease_contracts_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."remote_access_profiles" ADD CONSTRAINT "remote_access_profiles_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

