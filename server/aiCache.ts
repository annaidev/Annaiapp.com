import { createHash } from "crypto";
import { storage } from "./storage";

export type AiCacheFeature =
  | "packing-list"
  | "trip-plan"
  | "cultural-tips"
  | "safety-advice"
  | "phrases"
  | "weather"
  | "customs-entry";

export type AiCacheConfig = {
  feature: AiCacheFeature;
  ttlHours: number;
  promptVersion: string;
};

type BaseCacheInput = {
  destination: string;
};

type CachePayload = Record<string, unknown>;

const cacheConfigs: Record<AiCacheFeature, AiCacheConfig> = {
  "packing-list": { feature: "packing-list", ttlHours: 24 * 30, promptVersion: "v1" },
  "trip-plan": { feature: "trip-plan", ttlHours: 24 * 30, promptVersion: "v1" },
  "cultural-tips": { feature: "cultural-tips", ttlHours: 24 * 14, promptVersion: "v1" },
  "safety-advice": { feature: "safety-advice", ttlHours: 24 * 3, promptVersion: "v1" },
  phrases: { feature: "phrases", ttlHours: 24 * 14, promptVersion: "v1" },
  weather: { feature: "weather", ttlHours: 24, promptVersion: "v1" },
  "customs-entry": { feature: "customs-entry", ttlHours: 24 * 3, promptVersion: "v1" },
};

export function normalizeDestination(destination: string): string {
  return destination
    .trim()
    .toLowerCase()
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ");
}

function bucketTripLength(days?: number): string {
  if (!days || Number.isNaN(days) || days <= 0) return "standard";
  if (days <= 3) return "1-3";
  if (days <= 7) return "4-7";
  if (days <= 14) return "8-14";
  return "15+";
}

export function buildPackingListCacheInput(input: { destination: string; days?: number }): CachePayload {
  return {
    destination: normalizeDestination(input.destination),
    daysBucket: bucketTripLength(input.days),
  };
}

export function buildTripPlanCacheInput(input: {
  destination: string;
  days: number;
  planDepth: "quick" | "detailed";
  travelStyle: "balanced" | "food" | "culture" | "family" | "relaxed";
}): CachePayload {
  return {
    destination: normalizeDestination(input.destination),
    daysBucket: bucketTripLength(input.days),
    planDepth: input.planDepth,
    travelStyle: input.travelStyle,
  };
}

export function buildDestinationOnlyCacheInput(input: BaseCacheInput): CachePayload {
  return {
    destination: normalizeDestination(input.destination),
  };
}

export function buildSafetyAdviceCacheInput(input: {
  destination: string;
  citizenship?: string;
}): CachePayload {
  return {
    destination: normalizeDestination(input.destination),
    citizenship: input.citizenship?.trim().toLowerCase() || "traveler",
  };
}

export function buildWeatherCacheInput(input: {
  destination: string;
  startDate?: string;
  endDate?: string;
}): CachePayload {
  return {
    destination: normalizeDestination(input.destination),
    startDate: input.startDate?.trim() || "unspecified",
    endDate: input.endDate?.trim() || "unspecified",
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashPayload(payload: CachePayload): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

export function buildAiCacheKey(feature: AiCacheFeature, payload: CachePayload): string {
  const config = cacheConfigs[feature];
  const fingerprint = hashPayload(payload);
  return `${feature}:${config.promptVersion}:${fingerprint}`;
}

export async function getCachedAiPayload<T>(feature: AiCacheFeature, payload: CachePayload): Promise<T | null> {
  const cacheKey = buildAiCacheKey(feature, payload);
  const entry = await storage.getAiResponseCache(cacheKey);
  if (!entry) return null;
  if (entry.expiresAt.getTime() <= Date.now()) return null;

  await storage.recordAiCacheHit(cacheKey);
  return entry.responsePayload as T;
}

export async function saveCachedAiPayload<T>(feature: AiCacheFeature, payload: CachePayload, responsePayload: T): Promise<void> {
  const config = cacheConfigs[feature];
  const destinationNormalized = String(payload.destination ?? "");
  const requestFingerprint = hashPayload(payload);
  const cacheKey = buildAiCacheKey(feature, payload);
  const expiresAt = new Date(Date.now() + config.ttlHours * 60 * 60 * 1000);

  await storage.upsertAiResponseCache({
    cacheKey,
    feature,
    destinationNormalized,
    requestFingerprint,
    requestPayload: payload,
    responsePayload: responsePayload as Record<string, unknown>,
    promptVersion: config.promptVersion,
    expiresAt,
  });
}
