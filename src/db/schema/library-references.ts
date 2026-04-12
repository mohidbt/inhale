import { pgTable, text, timestamp, serial, integer, index } from "drizzle-orm/pg-core";
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
  index("library_references_user_doi_idx").on(table.userId, table.doi), // not unique — doi is nullable; dedup is handled in application layer
]);
