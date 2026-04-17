ALTER TABLE "documents" ADD COLUMN "last_opened_at" timestamp with time zone;
CREATE INDEX IF NOT EXISTS "documents_user_last_opened_idx" ON "documents" ("user_id","last_opened_at" DESC NULLS LAST);