CREATE TABLE "user_hidden_notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "notification_key" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_hidden_notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_user_hidden_notifications_user_key"
ON "user_hidden_notifications"("user_id", "notification_key");

CREATE INDEX "idx_user_hidden_notifications_user_id"
ON "user_hidden_notifications"("user_id");

CREATE INDEX "idx_user_hidden_notifications_created_at"
ON "user_hidden_notifications"("created_at");

ALTER TABLE "user_hidden_notifications"
ADD CONSTRAINT "user_hidden_notifications_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "master_users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
