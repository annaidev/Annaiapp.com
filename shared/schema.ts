import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === TABLE DEFINITIONS ===
export const trips = pgTable("trips", {
  id: serial("id").primaryKey(),
  destination: text("destination").notNull(),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const packingLists = pgTable("packing_lists", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  item: text("item").notNull(),
  isPacked: boolean("is_packed").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// === RELATIONS ===
export const tripsRelations = relations(trips, ({ many }) => ({
  packingLists: many(packingLists),
}));

export const packingListsRelations = relations(packingLists, ({ one }) => ({
  trip: one(trips, {
    fields: [packingLists.tripId],
    references: [trips.id],
  }),
}));

// === BASE SCHEMAS ===
export const insertTripSchema = createInsertSchema(trips).omit({ id: true, createdAt: true });
export const insertPackingListSchema = createInsertSchema(packingLists).omit({ id: true, createdAt: true });

// === EXPLICIT API CONTRACT TYPES ===
export type Trip = typeof trips.$inferSelect;
export type InsertTrip = z.infer<typeof insertTripSchema>;
export type CreateTripRequest = InsertTrip;
export type UpdateTripRequest = Partial<InsertTrip>;
export type TripResponse = Trip;
export type TripsListResponse = Trip[];

export type PackingList = typeof packingLists.$inferSelect;
export type InsertPackingList = z.infer<typeof insertPackingListSchema>;
export type CreatePackingListRequest = InsertPackingList;
export type UpdatePackingListRequest = Partial<InsertPackingList>;
export type PackingListResponse = PackingList;
export type PackingListsResponse = PackingList[];
