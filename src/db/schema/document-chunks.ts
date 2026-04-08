import { pgTable, text, timestamp, serial, integer, index } from "drizzle-orm/pg-core";
import { documents } from "./documents";
import { documentSections } from "./document-sections";

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: serial("id").primaryKey(),
    documentId: integer("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    sectionId: integer("section_id").references(() => documentSections.id, { onDelete: "set null" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    tokenCount: integer("token_count"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("document_chunks_document_idx").on(table.documentId)]
);
