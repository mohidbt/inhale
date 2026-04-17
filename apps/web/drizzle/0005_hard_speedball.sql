-- Phase 2.2 Task A: Add S2 enrichment columns + convert authors text → jsonb
-- Safe in-transaction migration for authors column conversion.

BEGIN;

-- Step 1: Add new jsonb column for authors migration
ALTER TABLE "document_references" ADD COLUMN "authors_new" jsonb;
ALTER TABLE "library_references" ADD COLUMN "authors_new" jsonb;

-- Step 2: Migrate existing text data to jsonb array.
-- Splits comma-separated author string into [{name: "..."}] array.
-- NULL or empty string rows → NULL.
UPDATE "document_references"
SET authors_new = (
  SELECT jsonb_agg(jsonb_build_object('name', trim(part)))
  FROM unnest(string_to_array(authors, ',')) AS part
  WHERE trim(part) <> ''
)
WHERE authors IS NOT NULL AND trim(authors) <> '';

UPDATE "library_references"
SET authors_new = (
  SELECT jsonb_agg(jsonb_build_object('name', trim(part)))
  FROM unnest(string_to_array(authors, ',')) AS part
  WHERE trim(part) <> ''
)
WHERE authors IS NOT NULL AND trim(authors) <> '';

-- Step 3: Drop old text column, rename new jsonb column
ALTER TABLE "document_references" DROP COLUMN "authors";
ALTER TABLE "document_references" RENAME COLUMN "authors_new" TO "authors";

ALTER TABLE "library_references" DROP COLUMN "authors";
ALTER TABLE "library_references" RENAME COLUMN "authors_new" TO "authors";

-- Step 4: Add S2 enrichment columns to document_references
ALTER TABLE "document_references" ADD COLUMN "influential_citation_count" integer;
ALTER TABLE "document_references" ADD COLUMN "open_access_pdf_url" text;
ALTER TABLE "document_references" ADD COLUMN "tldr_text" text;
ALTER TABLE "document_references" ADD COLUMN "external_ids" jsonb;
ALTER TABLE "document_references" ADD COLUMN "bibtex" text;

-- Step 5: Add S2 enrichment columns to library_references
ALTER TABLE "library_references" ADD COLUMN "influential_citation_count" integer;
ALTER TABLE "library_references" ADD COLUMN "open_access_pdf_url" text;
ALTER TABLE "library_references" ADD COLUMN "tldr_text" text;
ALTER TABLE "library_references" ADD COLUMN "external_ids" jsonb;
ALTER TABLE "library_references" ADD COLUMN "bibtex" text;

COMMIT;
