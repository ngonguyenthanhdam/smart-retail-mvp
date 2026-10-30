-- Keep cancelled/failed import metadata while allowing administrators to clear the visible history.
ALTER TABLE "import_jobs" ADD COLUMN "dismissed_at" TIMESTAMPTZ(6);
