import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === TABLE DEFINITIONS ===
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  securityQuestion: text("security_question"),
  securityAnswer: text("security_answer"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const trips = pgTable("trips", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  destination: text("destination").notNull(),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  notes: text("notes"),
  citizenship: text("citizenship"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const packingLists = pgTable("packing_lists", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  item: text("item").notNull(),
  isPacked: boolean("is_packed").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const budgetItems = pgTable("budget_items", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  description: text("description").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").default("USD"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const travelDocuments = pgTable("travel_documents", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  docType: text("doc_type").notNull(),
  label: text("label").notNull(),
  referenceNumber: text("reference_number"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const itineraryItems = pgTable("itinerary_items", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  dayNumber: integer("day_number").notNull(),
  timeSlot: text("time_slot"),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// === RELATIONS ===
export const usersRelations = relations(users, ({ many }) => ({
  trips: many(trips),
}));

export const tripsRelations = relations(trips, ({ one, many }) => ({
  user: one(users, {
    fields: [trips.userId],
    references: [users.id],
  }),
  packingLists: many(packingLists),
  budgetItems: many(budgetItems),
  travelDocuments: many(travelDocuments),
  itineraryItems: many(itineraryItems),
}));

export const packingListsRelations = relations(packingLists, ({ one }) => ({
  trip: one(trips, {
    fields: [packingLists.tripId],
    references: [trips.id],
  }),
}));

export const budgetItemsRelations = relations(budgetItems, ({ one }) => ({
  trip: one(trips, {
    fields: [budgetItems.tripId],
    references: [trips.id],
  }),
}));

export const travelDocumentsRelations = relations(travelDocuments, ({ one }) => ({
  trip: one(trips, {
    fields: [travelDocuments.tripId],
    references: [trips.id],
  }),
}));

export const itineraryItemsRelations = relations(itineraryItems, ({ one }) => ({
  trip: one(trips, {
    fields: [itineraryItems.tripId],
    references: [trips.id],
  }),
}));

// === BASE SCHEMAS ===
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertTripSchema = createInsertSchema(trips).omit({ id: true, createdAt: true });
export const insertPackingListSchema = createInsertSchema(packingLists).omit({ id: true, createdAt: true });
export const insertBudgetItemSchema = createInsertSchema(budgetItems).omit({ id: true, createdAt: true });
export const insertTravelDocumentSchema = createInsertSchema(travelDocuments).omit({ id: true, createdAt: true });
export const insertItineraryItemSchema = createInsertSchema(itineraryItems).omit({ id: true, createdAt: true });

// === EXPLICIT API CONTRACT TYPES ===
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

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

export type BudgetItem = typeof budgetItems.$inferSelect;
export type InsertBudgetItem = z.infer<typeof insertBudgetItemSchema>;
export type BudgetItemResponse = BudgetItem;
export type BudgetItemsResponse = BudgetItem[];

export type TravelDocument = typeof travelDocuments.$inferSelect;
export type InsertTravelDocument = z.infer<typeof insertTravelDocumentSchema>;
export type TravelDocumentResponse = TravelDocument;
export type TravelDocumentsResponse = TravelDocument[];

export type ItineraryItem = typeof itineraryItems.$inferSelect;
export type InsertItineraryItem = z.infer<typeof insertItineraryItemSchema>;
export type ItineraryItemResponse = ItineraryItem;
export type ItineraryItemsResponse = ItineraryItem[];
