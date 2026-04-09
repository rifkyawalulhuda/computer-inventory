CREATE TABLE "email_account_notification_logs" (
    "id" TEXT NOT NULL,
    "original_email_account_id" TEXT,
    "recipient_user_id" TEXT NOT NULL,
    "notification_type" VARCHAR(40) NOT NULL,
    "actor_name" VARCHAR(100) NOT NULL,
    "department" VARCHAR(50) NOT NULL,
    "job_code" VARCHAR(30),
    "user_name" VARCHAR(191) NOT NULL,
    "email" VARCHAR(191) NOT NULL,
    "license_type" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_account_notification_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_email_account_notification_logs_recipient_user_id"
ON "email_account_notification_logs"("recipient_user_id");

CREATE INDEX "idx_email_account_notification_logs_notification_type"
ON "email_account_notification_logs"("notification_type");

CREATE INDEX "idx_email_account_notification_logs_created_at"
ON "email_account_notification_logs"("created_at");
