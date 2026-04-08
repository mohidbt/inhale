import { pgTable, text, timestamp, serial, integer, index } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { documents } from "./documents";
import { userHighlights } from "./user-highlights";

export const userComments = pgTable(
  "user_comments",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    documentId: integer("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    highlightId: integer("highlight_id").references(() => userHighlights.id, { onDelete: "set null" }),
    pageNumber: integer("page_number").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [index("user_comments_user_document_idx").on(table.userId, table.documentId)]
);
