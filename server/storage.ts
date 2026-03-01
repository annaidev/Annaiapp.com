import { db } from "./db";
import { 
  trips, 
  packingLists, 
  type CreateTripRequest, 
  type UpdateTripRequest, 
  type TripResponse, 
  type TripsListResponse,
  type CreatePackingListRequest,
  type UpdatePackingListRequest,
  type PackingListResponse,
  type PackingListsResponse
} from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  // Trips
  getTrips(): Promise<TripsListResponse>;
  getTrip(id: number): Promise<TripResponse | undefined>;
  createTrip(trip: CreateTripRequest): Promise<TripResponse>;
  updateTrip(id: number, updates: UpdateTripRequest): Promise<TripResponse>;
  deleteTrip(id: number): Promise<void>;

  // Packing Lists
  getPackingListsByTrip(tripId: number): Promise<PackingListsResponse>;
  createPackingList(item: CreatePackingListRequest & { tripId: number }): Promise<PackingListResponse>;
  updatePackingList(id: number, updates: UpdatePackingListRequest): Promise<PackingListResponse>;
  deletePackingList(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Trips
  async getTrips(): Promise<TripsListResponse> {
    return await db.select().from(trips);
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
    const [updated] = await db.update(trips)
      .set(updates)
      .where(eq(trips.id, id))
      .returning();
    return updated;
  }

  async deleteTrip(id: number): Promise<void> {
    await db.delete(trips).where(eq(trips.id, id));
  }

  // Packing Lists
  async getPackingListsByTrip(tripId: number): Promise<PackingListsResponse> {
    return await db.select().from(packingLists).where(eq(packingLists.tripId, tripId));
  }

  async createPackingList(item: CreatePackingListRequest & { tripId: number }): Promise<PackingListResponse> {
    const [created] = await db.insert(packingLists).values(item).returning();
    return created;
  }

  async updatePackingList(id: number, updates: UpdatePackingListRequest): Promise<PackingListResponse> {
    const [updated] = await db.update(packingLists)
      .set(updates)
      .where(eq(packingLists.id, id))
      .returning();
    return updated;
  }

  async deletePackingList(id: number): Promise<void> {
    await db.delete(packingLists).where(eq(packingLists.id, id));
  }
}

export const storage = new DatabaseStorage();
