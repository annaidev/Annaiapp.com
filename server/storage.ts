import { db } from "./db";
import {
  users,
  trips,
  packingLists,
  budgetItems,
  travelDocuments,
  itineraryItems,
  aiResponseCache,
  subscriptions,
  subscriptionWebhookEvents,
  giftedEntitlements,
  couponCodes,
  type User,
  type InsertUser,
  type Subscription,
  type SubscriptionWebhookEvent,
  type CreateTripRequest,
  type UpdateTripRequest,
  type TripResponse,
  type TripsListResponse,
  type CreatePackingListRequest,
  type UpdatePackingListRequest,
  type PackingListResponse,
  type PackingListsResponse,
  type InsertBudgetItem,
  type BudgetItemResponse,
  type BudgetItemsResponse,
  type InsertTravelDocument,
  type TravelDocumentResponse,
  type TravelDocumentsResponse,
  type InsertItineraryItem,
  type ItineraryItemResponse,
  type ItineraryItemsResponse,
  type AiResponseCache,
  type GiftedEntitlement,
  type InsertGiftedEntitlement,
  type CouponCode,
  type InsertCouponCode,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { and, desc, eq, isNull, lte, or, sql, gt } from "drizzle-orm";

export type SubscriptionUpsert = {
  status: string;
  platform?: string | null;
  productId?: string | null;
  expiresAt?: Date | null;
  originalTransactionId?: string | null;
  isSandbox?: boolean;
  lastVerifiedAt?: Date | null;
};

export type WebhookEventStatus = "received" | "processed" | "failed" | "ignored_duplicate";

export type ReserveWebhookEventInput = {
  platform: "ios" | "android";
  eventKey: string;
  eventType?: string | null;
  payloadHash?: string | null;
};

function mergeDefined<T extends Record<string, any>>(base: T, patch: Partial<T>): T {
  const next = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      (next as any)[key] = value;
    }
  }
  return next;
}

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByAnnaiUserId(annaiUserId: string): Promise<User | undefined>;
  getUserByAppleAppAccountToken(appleAppAccountToken: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<User>): Promise<User | undefined>;
  deleteUser(id: number): Promise<void>;
  setUserAnnaiUserId(id: number, annaiUserId: string): Promise<User>;
  updateUserPassword(id: number, hashedPassword: string): Promise<void>;
  getSubscription(userId: number): Promise<Subscription | undefined>;
  getSubscriptionByOriginalTransactionId(originalTransactionId: string): Promise<Subscription | undefined>;
  upsertSubscription(userId: number, data: SubscriptionUpsert): Promise<Subscription>;
  reserveSubscriptionWebhookEvent(input: ReserveWebhookEventInput): Promise<{ isDuplicate: boolean; event: SubscriptionWebhookEvent }>;
  completeSubscriptionWebhookEvent(
    id: number,
    status: Exclude<WebhookEventStatus, "received">,
    errorMessage?: string | null,
  ): Promise<SubscriptionWebhookEvent | undefined>;
  getAiResponseCache(cacheKey: string): Promise<AiResponseCache | undefined>;
  upsertAiResponseCache(entry: Omit<AiResponseCache, "id" | "createdAt" | "updatedAt" | "lastHitAt" | "hitCount">): Promise<AiResponseCache>;
  recordAiCacheHit(cacheKey: string): Promise<void>;
  createGiftedEntitlement(entry: InsertGiftedEntitlement): Promise<GiftedEntitlement>;
  getGiftedEntitlement(id: number): Promise<GiftedEntitlement | undefined>;
  getActiveGiftedEntitlement(userId: number): Promise<GiftedEntitlement | undefined>;
  listGiftedEntitlements(): Promise<GiftedEntitlement[]>;
  revokeGiftedEntitlement(id: number): Promise<GiftedEntitlement | undefined>;
  createCouponCode(entry: InsertCouponCode): Promise<CouponCode>;
  getCouponCodeByHash(codeHash: string): Promise<CouponCode | undefined>;
  redeemCouponCode(id: number, userId: number): Promise<CouponCode | undefined>;

  getTrips(userId: number): Promise<TripsListResponse>;
  getTrip(id: number): Promise<TripResponse | undefined>;
  createTrip(trip: CreateTripRequest): Promise<TripResponse>;
  updateTrip(id: number, updates: UpdateTripRequest): Promise<TripResponse>;
  deleteTrip(id: number): Promise<void>;

  getPackingListsByTrip(tripId: number): Promise<PackingListsResponse>;
  getPackingList(id: number): Promise<PackingListResponse | undefined>;
  createPackingList(item: CreatePackingListRequest & { tripId: number }): Promise<PackingListResponse>;
  updatePackingList(id: number, updates: UpdatePackingListRequest): Promise<PackingListResponse>;
  deletePackingList(id: number): Promise<void>;

  getBudgetItemsByTrip(tripId: number): Promise<BudgetItemsResponse>;
  getBudgetItem(id: number): Promise<BudgetItemResponse | undefined>;
  createBudgetItem(item: InsertBudgetItem): Promise<BudgetItemResponse>;
  updateBudgetItem(id: number, updates: Partial<InsertBudgetItem>): Promise<BudgetItemResponse>;
  deleteBudgetItem(id: number): Promise<void>;

  getTravelDocumentsByTrip(tripId: number): Promise<TravelDocumentsResponse>;
  getTravelDocument(id: number): Promise<TravelDocumentResponse | undefined>;
  createTravelDocument(doc: InsertTravelDocument): Promise<TravelDocumentResponse>;
  updateTravelDocument(id: number, updates: Partial<InsertTravelDocument>): Promise<TravelDocumentResponse>;
  deleteTravelDocument(id: number): Promise<void>;

  getItineraryItemsByTrip(tripId: number): Promise<ItineraryItemsResponse>;
  getItineraryItem(id: number): Promise<ItineraryItemResponse | undefined>;
  createItineraryItem(item: InsertItineraryItem): Promise<ItineraryItemResponse>;
  updateItineraryItem(id: number, updates: Partial<InsertItineraryItem>): Promise<ItineraryItemResponse>;
  deleteItineraryItem(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  private get orm() {
    if (!db) {
      throw new Error("Database is not configured for this environment.");
    }
    return db;
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await this.orm.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByAnnaiUserId(annaiUserId: string): Promise<User | undefined> {
    const [user] = await this.orm.select().from(users).where(eq(users.annaiUserId, annaiUserId));
    return user;
  }

  async getUserByAppleAppAccountToken(appleAppAccountToken: string): Promise<User | undefined> {
    const [user] = await this.orm.select().from(users).where(eq(users.appleAppAccountToken, appleAppAccountToken));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await this.orm.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await this.orm
      .insert(users)
      .values({
        ...user,
        annaiUserId: user.annaiUserId ?? randomUUID(),
      })
      .returning();
    return created;
  }

  async updateUser(id: number, data: Partial<User>): Promise<User | undefined> {
    const [updated] = await this.orm
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  async deleteUser(id: number): Promise<void> {
    await this.orm.delete(users).where(eq(users.id, id));
  }

  async setUserAnnaiUserId(id: number, annaiUserId: string): Promise<User> {
    const [updated] = await this.orm
      .update(users)
      .set({ annaiUserId })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  async updateUserPassword(id: number, hashedPassword: string): Promise<void> {
    await this.orm.update(users).set({ password: hashedPassword }).where(eq(users.id, id));
  }

  async getSubscription(userId: number): Promise<Subscription | undefined> {
    const [subscription] = await this.orm.select().from(subscriptions).where(eq(subscriptions.userId, userId));
    return subscription;
  }

  async getSubscriptionByOriginalTransactionId(originalTransactionId: string): Promise<Subscription | undefined> {
    const [subscription] = await this.orm
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.originalTransactionId, originalTransactionId));
    return subscription;
  }

  async upsertSubscription(userId: number, data: SubscriptionUpsert): Promise<Subscription> {
    const existing = await this.getSubscription(userId);
    const now = new Date();

    if (!existing) {
      const [created] = await this.orm
        .insert(subscriptions)
        .values({
          userId,
          status: data.status,
          platform: data.platform ?? null,
          productId: data.productId ?? null,
          expiresAt: data.expiresAt ?? null,
          originalTransactionId: data.originalTransactionId ?? null,
          isSandbox: data.isSandbox ?? true,
          lastVerifiedAt: data.lastVerifiedAt ?? now,
          updatedAt: now,
        })
        .returning();
      return created;
    }

    const [updated] = await this.orm
      .update(subscriptions)
      .set({
        status: data.status,
        platform: data.platform ?? null,
        productId: data.productId ?? null,
        expiresAt: data.expiresAt ?? null,
        originalTransactionId: data.originalTransactionId ?? null,
        isSandbox: data.isSandbox ?? existing.isSandbox,
        lastVerifiedAt: data.lastVerifiedAt ?? now,
        updatedAt: now,
      })
      .where(eq(subscriptions.userId, userId))
      .returning();
    return updated;
  }

  async reserveSubscriptionWebhookEvent(input: ReserveWebhookEventInput): Promise<{ isDuplicate: boolean; event: SubscriptionWebhookEvent }> {
    const [existing] = await this.orm
      .select()
      .from(subscriptionWebhookEvents)
      .where(eq(subscriptionWebhookEvents.eventKey, input.eventKey));

    if (existing) {
      if (existing.status === "processed" || existing.status === "ignored_duplicate") {
        return { isDuplicate: true, event: existing };
      }

      const [reset] = await this.orm
        .update(subscriptionWebhookEvents)
        .set({
          status: "received",
          eventType: input.eventType ?? existing.eventType,
          payloadHash: input.payloadHash ?? existing.payloadHash,
          errorMessage: null,
          processedAt: null,
        })
        .where(eq(subscriptionWebhookEvents.id, existing.id))
        .returning();
      return { isDuplicate: false, event: reset };
    }

    const [created] = await this.orm
      .insert(subscriptionWebhookEvents)
      .values({
        platform: input.platform,
        eventKey: input.eventKey,
        eventType: input.eventType ?? null,
        status: "received",
        payloadHash: input.payloadHash ?? null,
        errorMessage: null,
        processedAt: null,
      })
      .returning();
    return { isDuplicate: false, event: created };
  }

  async completeSubscriptionWebhookEvent(
    id: number,
    status: Exclude<WebhookEventStatus, "received">,
    errorMessage?: string | null,
  ): Promise<SubscriptionWebhookEvent | undefined> {
    const [updated] = await this.orm
      .update(subscriptionWebhookEvents)
      .set({
        status,
        errorMessage: errorMessage ?? null,
        processedAt: new Date(),
      })
      .where(eq(subscriptionWebhookEvents.id, id))
      .returning();
    return updated;
  }

  async getAiResponseCache(cacheKey: string): Promise<AiResponseCache | undefined> {
    const [entry] = await this.orm.select().from(aiResponseCache).where(eq(aiResponseCache.cacheKey, cacheKey));
    return entry;
  }

  async upsertAiResponseCache(
    entry: Omit<AiResponseCache, "id" | "createdAt" | "updatedAt" | "lastHitAt" | "hitCount">,
  ): Promise<AiResponseCache> {
    const [saved] = await this.orm
      .insert(aiResponseCache)
      .values({
        ...entry,
        hitCount: 0,
        lastHitAt: null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: aiResponseCache.cacheKey,
        set: {
          feature: entry.feature,
          destinationNormalized: entry.destinationNormalized,
          requestFingerprint: entry.requestFingerprint,
          requestPayload: entry.requestPayload,
          responsePayload: entry.responsePayload,
          promptVersion: entry.promptVersion,
          expiresAt: entry.expiresAt,
          updatedAt: new Date(),
        },
      })
      .returning();
    return saved;
  }

  async recordAiCacheHit(cacheKey: string): Promise<void> {
    await this.orm
      .update(aiResponseCache)
      .set({
        lastHitAt: new Date(),
        updatedAt: new Date(),
        hitCount: sql`${aiResponseCache.hitCount} + 1`,
      })
      .where(eq(aiResponseCache.cacheKey, cacheKey));
  }

  async createGiftedEntitlement(entry: InsertGiftedEntitlement): Promise<GiftedEntitlement> {
    const [created] = await this.orm.insert(giftedEntitlements).values(entry).returning();
    return created;
  }

  async getGiftedEntitlement(id: number): Promise<GiftedEntitlement | undefined> {
    const [gift] = await this.orm.select().from(giftedEntitlements).where(eq(giftedEntitlements.id, id));
    return gift;
  }

  async getActiveGiftedEntitlement(userId: number): Promise<GiftedEntitlement | undefined> {
    const now = new Date();
    const [gift] = await this.orm
      .select()
      .from(giftedEntitlements)
      .where(
        and(
          eq(giftedEntitlements.userId, userId),
          isNull(giftedEntitlements.revokedAt),
          lte(giftedEntitlements.startsAt, now),
          or(isNull(giftedEntitlements.expiresAt), gt(giftedEntitlements.expiresAt, now)),
        ),
      )
      .orderBy(desc(giftedEntitlements.createdAt))
      .limit(1);
    return gift;
  }

  async listGiftedEntitlements(): Promise<GiftedEntitlement[]> {
    return this.orm.select().from(giftedEntitlements).orderBy(desc(giftedEntitlements.createdAt));
  }

  async revokeGiftedEntitlement(id: number): Promise<GiftedEntitlement | undefined> {
    const [updated] = await this.orm
      .update(giftedEntitlements)
      .set({ revokedAt: new Date() })
      .where(eq(giftedEntitlements.id, id))
      .returning();
    return updated;
  }

  async createCouponCode(entry: InsertCouponCode): Promise<CouponCode> {
    const [created] = await this.orm.insert(couponCodes).values(entry).returning();
    return created;
  }

  async getCouponCodeByHash(codeHash: string): Promise<CouponCode | undefined> {
    const [coupon] = await this.orm.select().from(couponCodes).where(eq(couponCodes.codeHash, codeHash));
    return coupon;
  }

  async redeemCouponCode(id: number, userId: number): Promise<CouponCode | undefined> {
    const [updated] = await this.orm
      .update(couponCodes)
      .set({
        redeemedByUserId: userId,
        redeemedAt: new Date(),
      })
      .where(and(eq(couponCodes.id, id), isNull(couponCodes.redeemedAt)))
      .returning();
    return updated;
  }

  async getTrips(userId: number): Promise<TripsListResponse> {
    return this.orm.select().from(trips).where(eq(trips.userId, userId));
  }

  async getTrip(id: number): Promise<TripResponse | undefined> {
    const [trip] = await this.orm.select().from(trips).where(eq(trips.id, id));
    return trip;
  }

  async createTrip(trip: CreateTripRequest): Promise<TripResponse> {
    const [created] = await this.orm.insert(trips).values(trip).returning();
    return created;
  }

  async updateTrip(id: number, updates: UpdateTripRequest): Promise<TripResponse> {
    const [updated] = await this.orm.update(trips).set(updates).where(eq(trips.id, id)).returning();
    return updated;
  }

  async deleteTrip(id: number): Promise<void> {
    await this.orm.delete(trips).where(eq(trips.id, id));
  }

  async getPackingListsByTrip(tripId: number): Promise<PackingListsResponse> {
    return this.orm.select().from(packingLists).where(eq(packingLists.tripId, tripId));
  }

  async getPackingList(id: number): Promise<PackingListResponse | undefined> {
    const [item] = await this.orm.select().from(packingLists).where(eq(packingLists.id, id));
    return item;
  }

  async createPackingList(item: CreatePackingListRequest & { tripId: number }): Promise<PackingListResponse> {
    const [created] = await this.orm.insert(packingLists).values(item).returning();
    return created;
  }

  async updatePackingList(id: number, updates: UpdatePackingListRequest): Promise<PackingListResponse> {
    const [updated] = await this.orm.update(packingLists).set(updates).where(eq(packingLists.id, id)).returning();
    return updated;
  }

  async deletePackingList(id: number): Promise<void> {
    await this.orm.delete(packingLists).where(eq(packingLists.id, id));
  }

  async getBudgetItemsByTrip(tripId: number): Promise<BudgetItemsResponse> {
    return this.orm.select().from(budgetItems).where(eq(budgetItems.tripId, tripId));
  }

  async getBudgetItem(id: number): Promise<BudgetItemResponse | undefined> {
    const [item] = await this.orm.select().from(budgetItems).where(eq(budgetItems.id, id));
    return item;
  }

  async createBudgetItem(item: InsertBudgetItem): Promise<BudgetItemResponse> {
    const [created] = await this.orm.insert(budgetItems).values(item).returning();
    return created;
  }

  async updateBudgetItem(id: number, updates: Partial<InsertBudgetItem>): Promise<BudgetItemResponse> {
    const [updated] = await this.orm.update(budgetItems).set(updates).where(eq(budgetItems.id, id)).returning();
    return updated;
  }

  async deleteBudgetItem(id: number): Promise<void> {
    await this.orm.delete(budgetItems).where(eq(budgetItems.id, id));
  }

  async getTravelDocumentsByTrip(tripId: number): Promise<TravelDocumentsResponse> {
    return this.orm.select().from(travelDocuments).where(eq(travelDocuments.tripId, tripId));
  }

  async getTravelDocument(id: number): Promise<TravelDocumentResponse | undefined> {
    const [doc] = await this.orm.select().from(travelDocuments).where(eq(travelDocuments.id, id));
    return doc;
  }

  async createTravelDocument(doc: InsertTravelDocument): Promise<TravelDocumentResponse> {
    const [created] = await this.orm.insert(travelDocuments).values(doc).returning();
    return created;
  }

  async updateTravelDocument(id: number, updates: Partial<InsertTravelDocument>): Promise<TravelDocumentResponse> {
    const [updated] = await this.orm
      .update(travelDocuments)
      .set(updates)
      .where(eq(travelDocuments.id, id))
      .returning();
    return updated;
  }

  async deleteTravelDocument(id: number): Promise<void> {
    await this.orm.delete(travelDocuments).where(eq(travelDocuments.id, id));
  }

  async getItineraryItemsByTrip(tripId: number): Promise<ItineraryItemsResponse> {
    return this.orm.select().from(itineraryItems).where(eq(itineraryItems.tripId, tripId));
  }

  async getItineraryItem(id: number): Promise<ItineraryItemResponse | undefined> {
    const [item] = await this.orm.select().from(itineraryItems).where(eq(itineraryItems.id, id));
    return item;
  }

  async createItineraryItem(item: InsertItineraryItem): Promise<ItineraryItemResponse> {
    const [created] = await this.orm.insert(itineraryItems).values(item).returning();
    return created;
  }

  async updateItineraryItem(id: number, updates: Partial<InsertItineraryItem>): Promise<ItineraryItemResponse> {
    const [updated] = await this.orm
      .update(itineraryItems)
      .set(updates)
      .where(eq(itineraryItems.id, id))
      .returning();
    return updated;
  }

  async deleteItineraryItem(id: number): Promise<void> {
    await this.orm.delete(itineraryItems).where(eq(itineraryItems.id, id));
  }
}

export class MemStorage implements IStorage {
  private usersData: User[] = [];
  private subscriptionsData: Subscription[] = [];
  private webhookEventsData: SubscriptionWebhookEvent[] = [];
  private tripsData: TripResponse[] = [];
  private packingData: PackingListResponse[] = [];
  private budgetData: BudgetItemResponse[] = [];
  private docsData: TravelDocumentResponse[] = [];
  private itineraryData: ItineraryItemResponse[] = [];
  private aiCacheData: AiResponseCache[] = [];
  private giftedEntitlementsData: GiftedEntitlement[] = [];
  private couponCodesData: CouponCode[] = [];

  private userId = 1;
  private tripId = 1;
  private packingId = 1;
  private budgetId = 1;
  private docId = 1;
  private itineraryId = 1;
  private subscriptionId = 1;
  private webhookEventId = 1;
  private giftedEntitlementId = 1;
  private couponCodeId = 1;

  async getUser(id: number): Promise<User | undefined> {
    return this.usersData.find((u) => u.id === id);
  }

  async getUserByAnnaiUserId(annaiUserId: string): Promise<User | undefined> {
    return this.usersData.find((u) => u.annaiUserId === annaiUserId);
  }

  async getUserByAppleAppAccountToken(appleAppAccountToken: string): Promise<User | undefined> {
    return this.usersData.find((u) => u.appleAppAccountToken === appleAppAccountToken);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return this.usersData.find((u) => u.username === username);
  }

  async createUser(user: InsertUser): Promise<User> {
    const created: User = {
      id: this.userId++,
      annaiUserId: user.annaiUserId ?? randomUUID(),
      appleAppAccountToken: user.appleAppAccountToken ?? null,
      username: user.username,
      password: user.password,
      securityQuestion: user.securityQuestion ?? null,
      securityAnswer: user.securityAnswer ?? null,
      subscriptionStatus: user.subscriptionStatus ?? "free",
      proAccess: user.proAccess ?? false,
      proAccessReason: user.proAccessReason ?? null,
      proAccessUpdatedAt: user.proAccessUpdatedAt ?? null,
      preferredLanguage: user.preferredLanguage ?? "en",
      homeCurrency: user.homeCurrency ?? "USD",
      citizenship: user.citizenship ?? null,
      createdAt: new Date(),
    };
    this.usersData.push(created);
    return created;
  }

  async updateUser(id: number, data: Partial<User>): Promise<User | undefined> {
    const existing = await this.getUser(id);
    if (!existing) return undefined;
    const updated = mergeDefined(existing, data);
    const index = this.usersData.findIndex((entry) => entry.id === id);
    this.usersData[index] = updated;
    return updated;
  }

  async deleteUser(id: number): Promise<void> {
    this.usersData = this.usersData.filter((user) => user.id !== id);
    this.subscriptionsData = this.subscriptionsData.filter((subscription) => subscription.userId !== id);
    this.giftedEntitlementsData = this.giftedEntitlementsData.filter(
      (gift) => gift.userId !== id && gift.grantedByUserId !== id,
    );
    this.couponCodesData = this.couponCodesData.map((coupon) => ({
      ...coupon,
      createdByUserId: coupon.createdByUserId === id ? null : coupon.createdByUserId,
      redeemedByUserId: coupon.redeemedByUserId === id ? null : coupon.redeemedByUserId,
    }));

    const tripIds = new Set(this.tripsData.filter((trip) => trip.userId === id).map((trip) => trip.id));
    this.tripsData = this.tripsData.filter((trip) => trip.userId !== id);
    this.packingData = this.packingData.filter((item) => !tripIds.has(item.tripId));
    this.budgetData = this.budgetData.filter((item) => !tripIds.has(item.tripId));
    this.docsData = this.docsData.filter((item) => !tripIds.has(item.tripId));
    this.itineraryData = this.itineraryData.filter((item) => !tripIds.has(item.tripId));
  }

  async setUserAnnaiUserId(id: number, annaiUserId: string): Promise<User> {
    const existing = await this.getUser(id);
    if (!existing) {
      throw new Error("User not found");
    }
    existing.annaiUserId = annaiUserId;
    return existing;
  }

  async updateUserPassword(id: number, hashedPassword: string): Promise<void> {
    const existing = await this.getUser(id);
    if (!existing) return;
    existing.password = hashedPassword;
  }

  async getSubscription(userId: number): Promise<Subscription | undefined> {
    return this.subscriptionsData.find((subscription) => subscription.userId === userId);
  }

  async getSubscriptionByOriginalTransactionId(originalTransactionId: string): Promise<Subscription | undefined> {
    return this.subscriptionsData.find((subscription) => subscription.originalTransactionId === originalTransactionId);
  }

  async upsertSubscription(userId: number, data: SubscriptionUpsert): Promise<Subscription> {
    const existing = await this.getSubscription(userId);
    if (existing) {
      existing.status = data.status;
      existing.platform = data.platform ?? null;
      existing.productId = data.productId ?? null;
      existing.expiresAt = data.expiresAt ?? null;
      existing.originalTransactionId = data.originalTransactionId ?? null;
      existing.isSandbox = data.isSandbox ?? existing.isSandbox;
      existing.lastVerifiedAt = data.lastVerifiedAt ?? new Date();
      existing.updatedAt = new Date();
      return existing;
    }

    const created: Subscription = {
      id: this.subscriptionId++,
      userId,
      status: data.status,
      platform: data.platform ?? null,
      productId: data.productId ?? null,
      expiresAt: data.expiresAt ?? null,
      originalTransactionId: data.originalTransactionId ?? null,
      isSandbox: data.isSandbox ?? true,
      lastVerifiedAt: data.lastVerifiedAt ?? new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.subscriptionsData.push(created);
    return created;
  }

  async reserveSubscriptionWebhookEvent(input: ReserveWebhookEventInput): Promise<{ isDuplicate: boolean; event: SubscriptionWebhookEvent }> {
    const existing = this.webhookEventsData.find((event) => event.eventKey === input.eventKey);
    if (existing) {
      if (existing.status === "processed" || existing.status === "ignored_duplicate") {
        return { isDuplicate: true, event: existing };
      }
      existing.status = "received";
      existing.eventType = input.eventType ?? existing.eventType;
      existing.payloadHash = input.payloadHash ?? existing.payloadHash;
      existing.errorMessage = null;
      existing.processedAt = null;
      return { isDuplicate: false, event: existing };
    }

    const created: SubscriptionWebhookEvent = {
      id: this.webhookEventId++,
      platform: input.platform,
      eventKey: input.eventKey,
      eventType: input.eventType ?? null,
      status: "received",
      payloadHash: input.payloadHash ?? null,
      errorMessage: null,
      receivedAt: new Date(),
      processedAt: null,
    };
    this.webhookEventsData.push(created);
    return { isDuplicate: false, event: created };
  }

  async completeSubscriptionWebhookEvent(
    id: number,
    status: Exclude<WebhookEventStatus, "received">,
    errorMessage?: string | null,
  ): Promise<SubscriptionWebhookEvent | undefined> {
    const existing = this.webhookEventsData.find((event) => event.id === id);
    if (!existing) return undefined;
    existing.status = status;
    existing.errorMessage = errorMessage ?? null;
    existing.processedAt = new Date();
    return existing;
  }

  async getAiResponseCache(cacheKey: string): Promise<AiResponseCache | undefined> {
    return this.aiCacheData.find((entry) => entry.cacheKey === cacheKey);
  }

  async upsertAiResponseCache(
    entry: Omit<AiResponseCache, "id" | "createdAt" | "updatedAt" | "lastHitAt" | "hitCount">,
  ): Promise<AiResponseCache> {
    const existing = this.aiCacheData.find((item) => item.cacheKey === entry.cacheKey);
    if (existing) {
      existing.feature = entry.feature;
      existing.destinationNormalized = entry.destinationNormalized;
      existing.requestFingerprint = entry.requestFingerprint;
      existing.requestPayload = entry.requestPayload;
      existing.responsePayload = entry.responsePayload;
      existing.promptVersion = entry.promptVersion;
      existing.expiresAt = entry.expiresAt;
      existing.updatedAt = new Date();
      return existing;
    }

    const created: AiResponseCache = {
      id: this.aiCacheData.length + 1,
      cacheKey: entry.cacheKey,
      feature: entry.feature,
      destinationNormalized: entry.destinationNormalized,
      requestFingerprint: entry.requestFingerprint,
      requestPayload: entry.requestPayload,
      responsePayload: entry.responsePayload,
      promptVersion: entry.promptVersion,
      expiresAt: entry.expiresAt,
      lastHitAt: null,
      hitCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.aiCacheData.push(created);
    return created;
  }

  async recordAiCacheHit(cacheKey: string): Promise<void> {
    const existing = this.aiCacheData.find((entry) => entry.cacheKey === cacheKey);
    if (!existing) return;
    existing.hitCount += 1;
    existing.lastHitAt = new Date();
    existing.updatedAt = new Date();
  }

  async createGiftedEntitlement(entry: InsertGiftedEntitlement): Promise<GiftedEntitlement> {
    const created: GiftedEntitlement = {
      id: this.giftedEntitlementId++,
      userId: entry.userId,
      grantedByUserId: entry.grantedByUserId,
      planTier: entry.planTier ?? "pro",
      reason: entry.reason ?? null,
      startsAt: entry.startsAt ?? new Date(),
      expiresAt: entry.expiresAt ?? null,
      revokedAt: entry.revokedAt ?? null,
      createdAt: new Date(),
    };
    this.giftedEntitlementsData.push(created);
    return created;
  }

  async getGiftedEntitlement(id: number): Promise<GiftedEntitlement | undefined> {
    return this.giftedEntitlementsData.find((gift) => gift.id === id);
  }

  async getActiveGiftedEntitlement(userId: number): Promise<GiftedEntitlement | undefined> {
    const now = Date.now();
    return [...this.giftedEntitlementsData]
      .reverse()
      .find(
        (gift) =>
          gift.userId === userId &&
          !gift.revokedAt &&
          gift.startsAt.getTime() <= now &&
          (!gift.expiresAt || gift.expiresAt.getTime() > now),
      );
  }

  async listGiftedEntitlements(): Promise<GiftedEntitlement[]> {
    return [...this.giftedEntitlementsData].sort(
      (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
    );
  }

  async revokeGiftedEntitlement(id: number): Promise<GiftedEntitlement | undefined> {
    const gift = this.giftedEntitlementsData.find((entry) => entry.id === id);
    if (!gift) return undefined;
    gift.revokedAt = new Date();
    return gift;
  }

  async createCouponCode(entry: InsertCouponCode): Promise<CouponCode> {
    const created: CouponCode = {
      id: this.couponCodeId++,
      codeHash: entry.codeHash,
      label: entry.label ?? null,
      durationDays: entry.durationDays ?? 30,
      createdByUserId: entry.createdByUserId ?? null,
      redeemedByUserId: entry.redeemedByUserId ?? null,
      redeemedAt: entry.redeemedAt ?? null,
      expiresAt: entry.expiresAt ?? null,
      disabledAt: entry.disabledAt ?? null,
      createdAt: new Date(),
    };
    this.couponCodesData.push(created);
    return created;
  }

  async getCouponCodeByHash(codeHash: string): Promise<CouponCode | undefined> {
    return this.couponCodesData.find((coupon) => coupon.codeHash === codeHash);
  }

  async redeemCouponCode(id: number, userId: number): Promise<CouponCode | undefined> {
    const coupon = this.couponCodesData.find((entry) => entry.id === id);
    if (!coupon || coupon.redeemedAt) return undefined;
    coupon.redeemedByUserId = userId;
    coupon.redeemedAt = new Date();
    return coupon;
  }

  async getTrips(userId: number): Promise<TripsListResponse> {
    return this.tripsData.filter((t) => t.userId === userId);
  }

  async getTrip(id: number): Promise<TripResponse | undefined> {
    return this.tripsData.find((t) => t.id === id);
  }

  async createTrip(trip: CreateTripRequest): Promise<TripResponse> {
    const created: TripResponse = {
      id: this.tripId++,
      userId: trip.userId ?? null,
      origin: trip.origin ?? null,
      destination: trip.destination,
      tripType: trip.tripType ?? "one_way",
      budgetTargetCents: trip.budgetTargetCents ?? null,
      startDate: trip.startDate ?? null,
      endDate: trip.endDate ?? null,
      notes: trip.notes ?? null,
      citizenship: trip.citizenship ?? null,
      createdAt: new Date(),
    };
    this.tripsData.push(created);
    return created;
  }

  async updateTrip(id: number, updates: UpdateTripRequest): Promise<TripResponse> {
    const existing = await this.getTrip(id);
    if (!existing) {
      throw new Error("Trip not found");
    }
    const updated = mergeDefined(existing, updates as Partial<TripResponse>);
    const index = this.tripsData.findIndex((t) => t.id === id);
    this.tripsData[index] = updated;
    return updated;
  }

  async deleteTrip(id: number): Promise<void> {
    this.tripsData = this.tripsData.filter((t) => t.id !== id);
    this.packingData = this.packingData.filter((p) => p.tripId !== id);
    this.budgetData = this.budgetData.filter((b) => b.tripId !== id);
    this.docsData = this.docsData.filter((d) => d.tripId !== id);
    this.itineraryData = this.itineraryData.filter((i) => i.tripId !== id);
  }

  async getPackingListsByTrip(tripId: number): Promise<PackingListsResponse> {
    return this.packingData.filter((p) => p.tripId === tripId);
  }

  async getPackingList(id: number): Promise<PackingListResponse | undefined> {
    return this.packingData.find((p) => p.id === id);
  }

  async createPackingList(item: CreatePackingListRequest & { tripId: number }): Promise<PackingListResponse> {
    const created: PackingListResponse = {
      id: this.packingId++,
      tripId: item.tripId,
      item: item.item,
      isPacked: item.isPacked ?? false,
      createdAt: new Date(),
    };
    this.packingData.push(created);
    return created;
  }

  async updatePackingList(id: number, updates: UpdatePackingListRequest): Promise<PackingListResponse> {
    const existing = this.packingData.find((p) => p.id === id);
    if (!existing) throw new Error("Packing list item not found");
    const updated = mergeDefined(existing, updates as Partial<PackingListResponse>);
    const index = this.packingData.findIndex((p) => p.id === id);
    this.packingData[index] = updated;
    return updated;
  }

  async deletePackingList(id: number): Promise<void> {
    this.packingData = this.packingData.filter((p) => p.id !== id);
  }

  async getBudgetItemsByTrip(tripId: number): Promise<BudgetItemsResponse> {
    return this.budgetData.filter((b) => b.tripId === tripId);
  }

  async getBudgetItem(id: number): Promise<BudgetItemResponse | undefined> {
    return this.budgetData.find((b) => b.id === id);
  }

  async createBudgetItem(item: InsertBudgetItem): Promise<BudgetItemResponse> {
    const created: BudgetItemResponse = {
      id: this.budgetId++,
      tripId: item.tripId,
      category: item.category,
      description: item.description,
      amount: item.amount,
      currency: item.currency ?? "USD",
      createdAt: new Date(),
    };
    this.budgetData.push(created);
    return created;
  }

  async updateBudgetItem(id: number, updates: Partial<InsertBudgetItem>): Promise<BudgetItemResponse> {
    const existing = this.budgetData.find((b) => b.id === id);
    if (!existing) throw new Error("Budget item not found");
    const updated = mergeDefined(existing, updates as Partial<BudgetItemResponse>);
    const index = this.budgetData.findIndex((b) => b.id === id);
    this.budgetData[index] = updated;
    return updated;
  }

  async deleteBudgetItem(id: number): Promise<void> {
    this.budgetData = this.budgetData.filter((b) => b.id !== id);
  }

  async getTravelDocumentsByTrip(tripId: number): Promise<TravelDocumentsResponse> {
    return this.docsData.filter((d) => d.tripId === tripId);
  }

  async getTravelDocument(id: number): Promise<TravelDocumentResponse | undefined> {
    return this.docsData.find((d) => d.id === id);
  }

  async createTravelDocument(doc: InsertTravelDocument): Promise<TravelDocumentResponse> {
    const created: TravelDocumentResponse = {
      id: this.docId++,
      tripId: doc.tripId,
      docType: doc.docType,
      label: doc.label,
      referenceNumber: doc.referenceNumber ?? null,
      notes: doc.notes ?? null,
      createdAt: new Date(),
    };
    this.docsData.push(created);
    return created;
  }

  async updateTravelDocument(id: number, updates: Partial<InsertTravelDocument>): Promise<TravelDocumentResponse> {
    const existing = this.docsData.find((d) => d.id === id);
    if (!existing) throw new Error("Travel document not found");
    const updated = mergeDefined(existing, updates as Partial<TravelDocumentResponse>);
    const index = this.docsData.findIndex((d) => d.id === id);
    this.docsData[index] = updated;
    return updated;
  }

  async deleteTravelDocument(id: number): Promise<void> {
    this.docsData = this.docsData.filter((d) => d.id !== id);
  }

  async getItineraryItemsByTrip(tripId: number): Promise<ItineraryItemsResponse> {
    return this.itineraryData.filter((i) => i.tripId === tripId);
  }

  async getItineraryItem(id: number): Promise<ItineraryItemResponse | undefined> {
    return this.itineraryData.find((i) => i.id === id);
  }

  async createItineraryItem(item: InsertItineraryItem): Promise<ItineraryItemResponse> {
    const created: ItineraryItemResponse = {
      id: this.itineraryId++,
      tripId: item.tripId,
      dayNumber: item.dayNumber,
      timeSlot: item.timeSlot ?? null,
      title: item.title,
      description: item.description ?? null,
      category: item.category,
      googlePlaceUrl: item.googlePlaceUrl ?? null,
      sourceFingerprint: item.sourceFingerprint ?? null,
      createdAt: new Date(),
    };
    this.itineraryData.push(created);
    return created;
  }

  async updateItineraryItem(id: number, updates: Partial<InsertItineraryItem>): Promise<ItineraryItemResponse> {
    const existing = this.itineraryData.find((i) => i.id === id);
    if (!existing) throw new Error("Itinerary item not found");
    const updated = mergeDefined(existing, updates as Partial<ItineraryItemResponse>);
    const index = this.itineraryData.findIndex((i) => i.id === id);
    this.itineraryData[index] = updated;
    return updated;
  }

  async deleteItineraryItem(id: number): Promise<void> {
    this.itineraryData = this.itineraryData.filter((i) => i.id !== id);
  }
}

export const storage: IStorage = process.env.DATABASE_URL ? new DatabaseStorage() : new MemStorage();
