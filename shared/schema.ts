import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const planTierValues = ["free", "pro"] as const;
export type PlanTier = (typeof planTierValues)[number];

export const moduleSlugValues = ["travel", "camping", "cruises"] as const;
export type ModuleSlug = (typeof moduleSlugValues)[number];

export const featureKeyValues = [
  "trip_core",
  "ai_packing",
  "ai_itinerary",
  "ai_safety",
  "ai_phrases",
  "ai_weather",
  "google_maps",
  "camping_access",
] as const;
export type FeatureKey = (typeof featureKeyValues)[number];

export const supportedLanguageValues = ["en", "es", "zh", "ja", "ko"] as const;
export type SupportedLanguage = (typeof supportedLanguageValues)[number];

export const tripTypeValues = ["one_way", "round_trip"] as const;
export type TripType = (typeof tripTypeValues)[number];

export const subscriptionStatusValues = [
  "inactive",
  "active",
  "trialing",
  "past_due",
  "canceled",
  "expired",
] as const;
export type SubscriptionStatus = (typeof subscriptionStatusValues)[number];

export const adminGrantStatusValues = ["active", "revoked", "expired"] as const;
export type AdminGrantStatus = (typeof adminGrantStatusValues)[number];

// === TABLE DEFINITIONS ===
export const users = pgTable("annai_travel_users", {
  id: serial("id").primaryKey(),
  annaiUserId: text("annai_user_id").unique(),
  appleAppAccountToken: text("apple_app_account_token").unique(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  securityQuestion: text("security_question"),
  securityAnswer: text("security_answer"),
  subscriptionStatus: text("subscription_status").notNull().default("free"),
  proAccess: boolean("pro_access").notNull().default(false),
  proAccessReason: text("pro_access_reason"),
  proAccessUpdatedAt: timestamp("pro_access_updated_at"),
  preferredLanguage: text("preferred_language").notNull().default("en"),
  homeCurrency: text("home_currency").notNull().default("USD"),
  citizenship: text("citizenship"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const trips = pgTable("annai_travel_trips", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  origin: text("origin"),
  destination: text("destination").notNull(),
  tripType: text("trip_type").notNull().default("one_way"),
  budgetTargetCents: integer("budget_target_cents"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  notes: text("notes"),
  citizenship: text("citizenship"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const packingLists = pgTable("annai_travel_packing_lists", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  item: text("item").notNull(),
  isPacked: boolean("is_packed").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const budgetItems = pgTable("annai_travel_budget_items", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  description: text("description").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").default("USD"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const travelDocuments = pgTable("annai_travel_documents", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  docType: text("doc_type").notNull(),
  label: text("label").notNull(),
  referenceNumber: text("reference_number"),
  notes: text("notes"),
  attachmentName: text("attachment_name"),
  attachmentDataUrl: text("attachment_data_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const itineraryItems = pgTable("annai_travel_itinerary_items", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  dayNumber: integer("day_number").notNull(),
  timeSlot: text("time_slot"),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  googlePlaceUrl: text("google_place_url"),
  sourceFingerprint: text("source_fingerprint"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const aiResponseCache = pgTable("annai_travel_ai_response_cache", {
  id: serial("id").primaryKey(),
  cacheKey: text("cache_key").notNull().unique(),
  feature: text("feature").notNull(),
  destinationNormalized: text("destination_normalized").notNull(),
  requestFingerprint: text("request_fingerprint").notNull(),
  requestPayload: jsonb("request_payload").notNull(),
  responsePayload: jsonb("response_payload").notNull(),
  promptVersion: text("prompt_version").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  lastHitAt: timestamp("last_hit_at"),
  hitCount: integer("hit_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const subscriptions = pgTable("annai_travel_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  status: text("status").notNull().default("inactive"),
  platform: text("platform"),
  productId: text("product_id"),
  expiresAt: timestamp("expires_at"),
  originalTransactionId: text("original_transaction_id"),
  isSandbox: boolean("is_sandbox").notNull().default(true),
  lastVerifiedAt: timestamp("last_verified_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const subscriptionWebhookEvents = pgTable("annai_travel_subscription_webhook_events", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),
  eventKey: text("event_key").notNull().unique(),
  eventType: text("event_type"),
  status: text("status").notNull().default("received"),
  payloadHash: text("payload_hash"),
  errorMessage: text("error_message"),
  receivedAt: timestamp("received_at").defaultNow(),
  processedAt: timestamp("processed_at"),
});

export const giftedEntitlements = pgTable("annai_travel_gifted_entitlements", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  grantedByUserId: integer("granted_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  planTier: text("plan_tier").notNull().default("pro"),
  reason: text("reason"),
  startsAt: timestamp("starts_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const couponCodes = pgTable("annai_travel_coupon_codes", {
  id: serial("id").primaryKey(),
  codeHash: text("code_hash").notNull().unique(),
  label: text("label"),
  durationDays: integer("duration_days").notNull().default(30),
  createdByUserId: integer("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  redeemedByUserId: integer("redeemed_by_user_id").references(() => users.id, { onDelete: "set null" }),
  redeemedAt: timestamp("redeemed_at"),
  expiresAt: timestamp("expires_at"),
  disabledAt: timestamp("disabled_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === RELATIONS ===
export const usersRelations = relations(users, ({ many }) => ({
  trips: many(trips),
  giftedEntitlements: many(giftedEntitlements),
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
export const insertAiResponseCacheSchema = createInsertSchema(aiResponseCache).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSubscriptionWebhookEventSchema = createInsertSchema(subscriptionWebhookEvents).omit({
  id: true,
  receivedAt: true,
});
export const insertGiftedEntitlementSchema = createInsertSchema(giftedEntitlements).omit({
  id: true,
  createdAt: true,
});
export const insertCouponCodeSchema = createInsertSchema(couponCodes).omit({
  id: true,
  createdAt: true,
});

// === EXPLICIT API CONTRACT TYPES ===
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type TravelerProfile = Pick<User, "id" | "username" | "preferredLanguage" | "homeCurrency" | "citizenship">;

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

export type AiResponseCache = typeof aiResponseCache.$inferSelect;
export type InsertAiResponseCache = z.infer<typeof insertAiResponseCacheSchema>;
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type SubscriptionWebhookEvent = typeof subscriptionWebhookEvents.$inferSelect;
export type InsertSubscriptionWebhookEvent = z.infer<typeof insertSubscriptionWebhookEventSchema>;
export type GiftedEntitlement = typeof giftedEntitlements.$inferSelect;
export type InsertGiftedEntitlement = z.infer<typeof insertGiftedEntitlementSchema>;
export type CouponCode = typeof couponCodes.$inferSelect;
export type InsertCouponCode = z.infer<typeof insertCouponCodeSchema>;
