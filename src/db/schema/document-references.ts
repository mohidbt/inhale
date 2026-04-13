import { pgTable, text, timestamp, serial, integer, index } from "drizzle-orm/pg-core";
import { documents } from "./documents";

export const documentReferences = pgTable("document_references", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  markerText: text("marker_text").notNull(),
  markerIndex: integer("marker_index").notNull(),
  rawText: text("raw_text"),
  title: text("title"),
  authors: text("authors"),
  year: text("year"),
  doi: text("doi"),
  url: text("url"),
  semanticScholarId: text("semantic_scholar_id"),
  abstract: text("abstract"),
  venue: text("venue"),
  citationCount: integer("citation_count"),
  pageNumber: integer("page_number"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("document_references_document_id_idx").on(table.documentId),
]);
