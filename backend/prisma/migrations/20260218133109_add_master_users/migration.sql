-- CreateTable
CREATE TABLE "public"."master_users" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(191) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "contact" VARCHAR(50) NOT NULL,
    "rank" VARCHAR(50) NOT NULL,
    "job_code_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "master_users_email_key" ON "public"."master_users"("email");

-- CreateIndex
CREATE INDEX "idx_master_users_job_code_id" ON "public"."master_users"("job_code_id");

-- AddForeignKey
ALTER TABLE "public"."master_users" ADD CONSTRAINT "master_users_job_code_id_fkey" FOREIGN KEY ("job_code_id") REFERENCES "public"."job_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
