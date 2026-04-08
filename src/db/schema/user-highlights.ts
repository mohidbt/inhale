import { pgTable, text, timestamp, serial, integer, pgEnum, index } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { documents } from "./documents";

export const highlightColorEnum = pgEnum("highlight_color", [
  "yellow",
  "green",
  "blue",
  "pink",
  "orange",
]);

export const userHighlights = pgTable("user_highlights", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  documentId: integer("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  pageNumber: integer("page_number").notNull(),
  textContent: text("text_content").notNull(),
  startOffset: integer("start_offset").notNull(),
  endOffset: integer("end_offset").notNull(),
  color: highlightColorEnum("color").notNull().default("yellow"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
},
(table) => [
  index("user_highlights_user_document_idx").on(table.userId, table.documentId),
]);
