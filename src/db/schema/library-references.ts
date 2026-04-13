import { pgTable, text, timestamp, serial, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";

export const libraryReferences = pgTable("library_references", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  authors: text("authors"),
  year: text("year"),
  doi: text("doi"),
  url: text("url"),
  semanticScholarId: text("semantic_scholar_id"),
  abstract: text("abstract"),
  venue: text("venue"),
  citationCount: integer("citation_count"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  index("library_references_user_id_idx").on(table.userId),
  // Partial unique index — enforces per-user DOI uniqueness only for rows with a DOI.
  // Enables race-free ON CONFLICT upsert in save route; rows without a DOI remain duplicable.
  uniqueIndex("library_references_user_doi_unique_idx")
    .on(table.userId, table.doi)
    .where(sql`${table.doi} IS NOT NULL`),
]);
