import { db } from "./db";
import { 
  users, trips, packingLists, budgetItems, travelDocuments, itineraryItems,
  type User, type InsertUser,
  type CreateTripRequest, type UpdateTripRequest, type TripResponse, type TripsListResponse,
  type CreatePackingListRequest, type UpdatePackingListRequest, type PackingListResponse, type PackingListsResponse,
  type InsertBudgetItem, type BudgetItemResponse, type BudgetItemsResponse,
  type InsertTravelDocument, type TravelDocumentResponse, type TravelDocumentsResponse,
  type InsertItineraryItem, type ItineraryItemResponse, type ItineraryItemsResponse
} from "@shared/schema";
import { eq } from "drizzle-orm";

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
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }
  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }
  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }
  async updateUserPassword(id: number, hashedPassword: string): Promise<void> {
    await db.update(users).set({ password: hashedPassword }).where(eq(users.id, id));
  }

  async getTrips(userId: number): Promise<TripsListResponse> {
    return await db.select().from(trips).where(eq(trips.userId, userId));
  }
  async getTrip(id: number): Promise<TripResponse | undefined> {
    const [trip] = await db.select().from(trips).where(eq(trips.id, id));
    return trip;
  }
  async createTrip(trip: CreateTripRequest): Promise<TripResponse> {
    const [created] = await db.insert(trips).values(trip).returning();
    return created;
  }
  async updateTrip(id: number, updates: UpdateTripRequest): Promise<TripResponse> {
    const [updated] = await db.update(trips).set(updates).where(eq(trips.id, id)).returning();
    return updated;
  }
  async deleteTrip(id: number): Promise<void> {
    await db.delete(trips).where(eq(trips.id, id));
  }

  async getPackingListsByTrip(tripId: number): Promise<PackingListsResponse> {
    return await db.select().from(packingLists).where(eq(packingLists.tripId, tripId));
  }
  async createPackingList(item: CreatePackingListRequest & { tripId: number }): Promise<PackingListResponse> {
    const [created] = await db.insert(packingLists).values(item).returning();
    return created;
  }
  async updatePackingList(id: number, updates: UpdatePackingListRequest): Promise<PackingListResponse> {
    const [updated] = await db.update(packingLists).set(updates).where(eq(packingLists.id, id)).returning();
    return updated;
  }
  async deletePackingList(id: number): Promise<void> {
    await db.delete(packingLists).where(eq(packingLists.id, id));
  }

  async getBudgetItemsByTrip(tripId: number): Promise<BudgetItemsResponse> {
    return await db.select().from(budgetItems).where(eq(budgetItems.tripId, tripId));
  }
  async createBudgetItem(item: InsertBudgetItem): Promise<BudgetItemResponse> {
    const [created] = await db.insert(budgetItems).values(item).returning();
    return created;
  }
  async updateBudgetItem(id: number, updates: Partial<InsertBudgetItem>): Promise<BudgetItemResponse> {
    const [updated] = await db.update(budgetItems).set(updates).where(eq(budgetItems.id, id)).returning();
    return updated;
  }
  async deleteBudgetItem(id: number): Promise<void> {
    await db.delete(budgetItems).where(eq(budgetItems.id, id));
  }

  async getTravelDocumentsByTrip(tripId: number): Promise<TravelDocumentsResponse> {
    return await db.select().from(travelDocuments).where(eq(travelDocuments.tripId, tripId));
  }
  async createTravelDocument(doc: InsertTravelDocument): Promise<TravelDocumentResponse> {
    const [created] = await db.insert(travelDocuments).values(doc).returning();
    return created;
  }
  async updateTravelDocument(id: number, updates: Partial<InsertTravelDocument>): Promise<TravelDocumentResponse> {
    const [updated] = await db.update(travelDocuments).set(updates).where(eq(travelDocuments.id, id)).returning();
    return updated;
  }
  async deleteTravelDocument(id: number): Promise<void> {
    await db.delete(travelDocuments).where(eq(travelDocuments.id, id));
  }

  async getItineraryItemsByTrip(tripId: number): Promise<ItineraryItemsResponse> {
    return await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, tripId));
  }
  async createItineraryItem(item: InsertItineraryItem): Promise<ItineraryItemResponse> {
    const [created] = await db.insert(itineraryItems).values(item).returning();
    return created;
  }
  async updateItineraryItem(id: number, updates: Partial<InsertItineraryItem>): Promise<ItineraryItemResponse> {
    const [updated] = await db.update(itineraryItems).set(updates).where(eq(itineraryItems.id, id)).returning();
    return updated;
  }
  async deleteItineraryItem(id: number): Promise<void> {
    await db.delete(itineraryItems).where(eq(itineraryItems.id, id));
  }
}

export const storage = new DatabaseStorage();
