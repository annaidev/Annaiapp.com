import { db } from "./db";
import {
  users,
  trips,
  packingLists,
  budgetItems,
  travelDocuments,
  itineraryItems,
  type User,
  type InsertUser,
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
} from "@shared/schema";
import { eq } from "drizzle-orm";

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
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserPassword(id: number, hashedPassword: string): Promise<void>;

  getTrips(userId: number): Promise<TripsListResponse>;
  getTrip(id: number): Promise<TripResponse | undefined>;
  createTrip(trip: CreateTripRequest): Promise<TripResponse>;
  updateTrip(id: number, updates: UpdateTripRequest): Promise<TripResponse>;
  deleteTrip(id: number): Promise<void>;

  getPackingListsByTrip(tripId: number): Promise<PackingListsResponse>;
  createPackingList(item: CreatePackingListRequest & { tripId: number }): Promise<PackingListResponse>;
  updatePackingList(id: number, updates: UpdatePackingListRequest): Promise<PackingListResponse>;
  deletePackingList(id: number): Promise<void>;

  getBudgetItemsByTrip(tripId: number): Promise<BudgetItemsResponse>;
  createBudgetItem(item: InsertBudgetItem): Promise<BudgetItemResponse>;
  updateBudgetItem(id: number, updates: Partial<InsertBudgetItem>): Promise<BudgetItemResponse>;
  deleteBudgetItem(id: number): Promise<void>;

  getTravelDocumentsByTrip(tripId: number): Promise<TravelDocumentsResponse>;
  createTravelDocument(doc: InsertTravelDocument): Promise<TravelDocumentResponse>;
  updateTravelDocument(id: number, updates: Partial<InsertTravelDocument>): Promise<TravelDocumentResponse>;
  deleteTravelDocument(id: number): Promise<void>;

  getItineraryItemsByTrip(tripId: number): Promise<ItineraryItemsResponse>;
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

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await this.orm.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await this.orm.insert(users).values(user).returning();
    return created;
  }

  async updateUserPassword(id: number, hashedPassword: string): Promise<void> {
    await this.orm.update(users).set({ password: hashedPassword }).where(eq(users.id, id));
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
  private tripsData: TripResponse[] = [];
  private packingData: PackingListResponse[] = [];
  private budgetData: BudgetItemResponse[] = [];
  private docsData: TravelDocumentResponse[] = [];
  private itineraryData: ItineraryItemResponse[] = [];

  private userId = 1;
  private tripId = 1;
  private packingId = 1;
  private budgetId = 1;
  private docId = 1;
  private itineraryId = 1;

  async getUser(id: number): Promise<User | undefined> {
    return this.usersData.find((u) => u.id === id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return this.usersData.find((u) => u.username === username);
  }

  async createUser(user: InsertUser): Promise<User> {
    const created: User = {
      id: this.userId++,
      username: user.username,
      password: user.password,
      securityQuestion: user.securityQuestion ?? null,
      securityAnswer: user.securityAnswer ?? null,
      createdAt: new Date(),
    };
    this.usersData.push(created);
    return created;
  }

  async updateUserPassword(id: number, hashedPassword: string): Promise<void> {
    const existing = await this.getUser(id);
    if (!existing) return;
    existing.password = hashedPassword;
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
      destination: trip.destination,
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
    const updated = mergeDefined(existing, updates);
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
    const updated = mergeDefined(existing, updates);
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
    const updated = mergeDefined(existing, updates);
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
    const updated = mergeDefined(existing, updates);
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

  async createItineraryItem(item: InsertItineraryItem): Promise<ItineraryItemResponse> {
    const created: ItineraryItemResponse = {
      id: this.itineraryId++,
      tripId: item.tripId,
      dayNumber: item.dayNumber,
      timeSlot: item.timeSlot ?? null,
      title: item.title,
      description: item.description ?? null,
      category: item.category,
      createdAt: new Date(),
    };
    this.itineraryData.push(created);
    return created;
  }

  async updateItineraryItem(id: number, updates: Partial<InsertItineraryItem>): Promise<ItineraryItemResponse> {
    const existing = this.itineraryData.find((i) => i.id === id);
    if (!existing) throw new Error("Itinerary item not found");
    const updated = mergeDefined(existing, updates);
    const index = this.itineraryData.findIndex((i) => i.id === id);
    this.itineraryData[index] = updated;
    return updated;
  }

  async deleteItineraryItem(id: number): Promise<void> {
    this.itineraryData = this.itineraryData.filter((i) => i.id !== id);
  }
}

export const storage: IStorage = process.env.DATABASE_URL ? new DatabaseStorage() : new MemStorage();
