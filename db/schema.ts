import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  code: text("code").notNull().default(""),
  size: text("size").notNull().default(""),
  color: text("color").notNull().default(""),
  cost: integer("cost").notNull().default(0),
  price: integer("price").notNull().default(0),
  status: text("status", { enum: ["available", "sold"] }).notNull().default("available"),
  imageKey: text("image_key"),
  soldBy: text("sold_by"),
  soldAt: text("sold_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
