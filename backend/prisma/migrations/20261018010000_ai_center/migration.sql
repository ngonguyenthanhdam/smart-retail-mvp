-- Bounded AI metadata only; existing operational tables and artifacts are unchanged.
-- CreateTable
CREATE TABLE "ai_datasets" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "location_id" UUID,
    "name" VARCHAR(150) NOT NULL,
    "source_kind" VARCHAR(30) NOT NULL,
    "external" BOOLEAN NOT NULL DEFAULT false,
    "synthetic" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(30) NOT NULL DEFAULT 'STAGING',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "summary" JSONB,
    "snapshot_hash" CHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "published_at" TIMESTAMPTZ(6),

    CONSTRAINT "ai_datasets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_dataset_files" (
    "id" UUID NOT NULL,
    "dataset_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "bytes" INTEGER NOT NULL,
    "rows" INTEGER NOT NULL DEFAULT 0,
    "kind" VARCHAR(30),
    "status" VARCHAR(40) NOT NULL,
    "mapping" JSONB,
    "profile" JSONB,
    "issues" JSONB,
    "removed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_dataset_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_training_jobs" (
    "id" UUID NOT NULL,
    "dataset_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "model_version" VARCHAR(100) NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "config" JSONB NOT NULL,
    "result" JSONB,
    "error" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "ai_training_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_deployments" (
    "id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "previous_version" VARCHAR(100) NOT NULL,
    "model_version" VARCHAR(100) NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_chat_sessions" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "location_id" UUID,
    "title" VARCHAR(150) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_chat_messages" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "content" TEXT NOT NULL,
    "sources" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_audit_events" (
    "id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" VARCHAR(60) NOT NULL,
    "record_id" VARCHAR(100) NOT NULL,
    "detail" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_datasets_owner_id_created_at_idx" ON "ai_datasets"("owner_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_datasets_status_expires_at_idx" ON "ai_datasets"("status", "expires_at");

-- CreateIndex
CREATE INDEX "ai_dataset_files_dataset_id_idx" ON "ai_dataset_files"("dataset_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_training_jobs_model_version_key" ON "ai_training_jobs"("model_version");

-- CreateIndex
CREATE INDEX "ai_training_jobs_owner_id_created_at_idx" ON "ai_training_jobs"("owner_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_deployments_created_at_idx" ON "ai_deployments"("created_at");

-- CreateIndex
CREATE INDEX "ai_chat_sessions_owner_id_updated_at_idx" ON "ai_chat_sessions"("owner_id", "updated_at");

-- CreateIndex
CREATE INDEX "ai_chat_messages_session_id_created_at_idx" ON "ai_chat_messages"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_audit_events_actor_id_created_at_idx" ON "ai_audit_events"("actor_id", "created_at");

-- AddForeignKey
ALTER TABLE "ai_datasets" ADD CONSTRAINT "ai_datasets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_datasets" ADD CONSTRAINT "ai_datasets_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_dataset_files" ADD CONSTRAINT "ai_dataset_files_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "ai_datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_training_jobs" ADD CONSTRAINT "ai_training_jobs_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "ai_datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_training_jobs" ADD CONSTRAINT "ai_training_jobs_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_deployments" ADD CONSTRAINT "ai_deployments_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_chat_sessions" ADD CONSTRAINT "ai_chat_sessions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_chat_sessions" ADD CONSTRAINT "ai_chat_sessions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_chat_messages" ADD CONSTRAINT "ai_chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ai_chat_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_audit_events" ADD CONSTRAINT "ai_audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ai_one_training_process" ON "ai_training_jobs" ((1)) WHERE "status" = 'RUNNING';
CREATE UNIQUE INDEX "ai_one_deployment" ON "ai_deployments" ((1)) WHERE "status" = 'PENDING';
ALTER TABLE "ai_datasets" ADD CONSTRAINT "ai_dataset_status" CHECK ("status" IN ('STAGING','PUBLISHED','EXPIRED'));
ALTER TABLE "ai_datasets" ADD CONSTRAINT "ai_dataset_external_scope" CHECK (NOT "external" OR "location_id" IS NULL);
ALTER TABLE "ai_dataset_files" ADD CONSTRAINT "ai_file_bounds" CHECK ("bytes" >= 0 AND "bytes" <= 10485760 AND "rows" >= 0 AND "rows" <= 400000);
ALTER TABLE "ai_training_jobs" ADD CONSTRAINT "ai_training_status" CHECK ("status" IN ('RUNNING','COMPLETED','FAILED','CANCELLED'));
ALTER TABLE "ai_chat_messages" ADD CONSTRAINT "ai_chat_role" CHECK ("role" IN ('USER','ASSISTANT'));
