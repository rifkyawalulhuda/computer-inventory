CREATE TABLE "device_change_requests" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "request_type" VARCHAR(40) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "current_step" VARCHAR(40) NOT NULL,
    "requested_by_user_id" TEXT NOT NULL,
    "requested_by_department_id" INTEGER,
    "requested_note" TEXT NOT NULL,
    "requested_department_job_code_id" INTEGER,
    "target_department_id" INTEGER,
    "target_pic_user_id" TEXT,
    "target_department_job_code_id" INTEGER,
    "latest_reject_reason" TEXT,
    "current_reviewer_user_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_change_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "device_change_request_events" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "action" VARCHAR(60) NOT NULL,
    "note" TEXT,
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_change_request_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_device_change_requests_device_id" ON "device_change_requests"("device_id");
CREATE INDEX "idx_device_change_requests_status" ON "device_change_requests"("status");
CREATE INDEX "idx_device_change_requests_current_step" ON "device_change_requests"("current_step");
CREATE INDEX "idx_device_change_requests_requested_by_user_id" ON "device_change_requests"("requested_by_user_id");
CREATE INDEX "idx_device_change_requests_current_reviewer_user_id" ON "device_change_requests"("current_reviewer_user_id");
CREATE INDEX "idx_device_change_requests_target_pic_user_id" ON "device_change_requests"("target_pic_user_id");
CREATE INDEX "idx_device_change_request_events_request_id" ON "device_change_request_events"("request_id");
CREATE INDEX "idx_device_change_request_events_actor_user_id" ON "device_change_request_events"("actor_user_id");

ALTER TABLE "device_change_requests"
ADD CONSTRAINT "device_change_requests_device_id_fkey"
FOREIGN KEY ("device_id") REFERENCES "devices"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "device_change_requests"
ADD CONSTRAINT "device_change_requests_requested_by_user_id_fkey"
FOREIGN KEY ("requested_by_user_id") REFERENCES "master_users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "device_change_requests"
ADD CONSTRAINT "device_change_requests_current_reviewer_user_id_fkey"
FOREIGN KEY ("current_reviewer_user_id") REFERENCES "master_users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "device_change_requests"
ADD CONSTRAINT "device_change_requests_target_pic_user_id_fkey"
FOREIGN KEY ("target_pic_user_id") REFERENCES "master_users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "device_change_requests"
ADD CONSTRAINT "device_change_requests_requested_by_department_id_fkey"
FOREIGN KEY ("requested_by_department_id") REFERENCES "departments"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "device_change_requests"
ADD CONSTRAINT "device_change_requests_target_department_id_fkey"
FOREIGN KEY ("target_department_id") REFERENCES "departments"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "device_change_requests"
ADD CONSTRAINT "device_change_requests_requested_department_job_code_id_fkey"
FOREIGN KEY ("requested_department_job_code_id") REFERENCES "department_job_codes"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "device_change_requests"
ADD CONSTRAINT "device_change_requests_target_department_job_code_id_fkey"
FOREIGN KEY ("target_department_job_code_id") REFERENCES "department_job_codes"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "device_change_request_events"
ADD CONSTRAINT "device_change_request_events_request_id_fkey"
FOREIGN KEY ("request_id") REFERENCES "device_change_requests"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "device_change_request_events"
ADD CONSTRAINT "device_change_request_events_actor_user_id_fkey"
FOREIGN KEY ("actor_user_id") REFERENCES "master_users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
