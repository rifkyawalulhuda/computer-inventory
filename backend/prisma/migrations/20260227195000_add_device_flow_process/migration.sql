ALTER TABLE "devices"
ADD COLUMN "flow_status" VARCHAR(30) NOT NULL DEFAULT 'APPROVED',
ADD COLUMN "flow_assigned_pic_user_id" TEXT,
ADD COLUMN "flow_approved_by_user_id" TEXT,
ADD COLUMN "flow_approved_at" TIMESTAMP(3),
ADD COLUMN "flow_rejected_by_user_id" TEXT,
ADD COLUMN "flow_rejected_at" TIMESTAMP(3),
ADD COLUMN "flow_reject_note" TEXT,
ADD COLUMN "flow_recipient_signature" TEXT,
ADD COLUMN "flow_sender_signature" TEXT,
ADD COLUMN "flow_sender_signed_by_user_id" TEXT,
ADD COLUMN "flow_sender_signed_at" TIMESTAMP(3);

CREATE INDEX "idx_devices_flow_status" ON "devices"("flow_status");
