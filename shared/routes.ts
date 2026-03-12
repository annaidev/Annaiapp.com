import { z } from 'zod';
import {
  insertTripSchema,
  insertPackingListSchema,
  insertBudgetItemSchema,
  insertTravelDocumentSchema,
  insertItineraryItemSchema,
  planTierValues,
  moduleSlugValues,
  featureKeyValues,
  subscriptionStatusValues,
  supportedLanguageValues,
  tripTypeValues,
  trips,
  packingLists,
  budgetItems,
  travelDocuments,
  itineraryItems,
} from './schema';
export type {
  InsertTrip,
  UpdateTripRequest,
  InsertPackingList,
  UpdatePackingListRequest,
} from "./schema";

export const errorSchemas = {
  validation: z.object({ message: z.string(), field: z.string().optional() }),
  notFound: z.object({ message: z.string() }),
  unauthorized: z.object({ message: z.string() }),
  internal: z.object({ message: z.string() }),
  upgradeRequired: z.object({
    message: z.string(),
    code: z.literal("UPGRADE_REQUIRED"),
    feature: z.enum(featureKeyValues),
    plan: z.enum(planTierValues),
  }),
};

const subscriptionRecordSchema = z.object({
  status: z.enum(subscriptionStatusValues),
  platform: z.string().nullable(),
  productId: z.string().nullable(),
  expiresAt: z.string().nullable(),
  isActive: z.boolean(),
  isSandbox: z.boolean().optional(),
});

const moduleSchema = z.object({
  slug: z.enum(moduleSlugValues),
  name: z.string(),
  enabled: z.boolean(),
  visible: z.boolean(),
  access: z.enum(["included", "pro", "hidden"]),
  status: z.enum(["live", "beta", "coming_soon", "disabled"]),
  description: z.string(),
});

const entitlementsSchema = z.object({
  plan: z.enum(planTierValues),
  hasProAccess: z.boolean(),
  source: z.string(),
  enabledFeatures: z.array(z.enum(featureKeyValues)),
  enabledModules: z.array(z.enum(moduleSlugValues)),
  subscription: subscriptionRecordSchema.nullable(),
  summary: z.object({
    headline: z.string(),
    detail: z.string(),
  }),
});

const profileSchema = z.object({
  id: z.number().int().positive(),
  username: z.string(),
  preferredLanguage: z.enum(supportedLanguageValues),
  homeCurrency: z.string(),
  citizenship: z.string().nullable(),
});

const proStatusSchema = z.object({
  plan: z.enum(["free", "pro"]),
  hasProAccess: z.boolean(),
  source: z.string(),
  enabledFeatures: z.array(z.enum(featureKeyValues)),
  enabledModules: z.array(z.enum(moduleSlugValues)),
  subscription: subscriptionRecordSchema.nullable(),
  summary: z.object({
    headline: z.string(),
    detail: z.string(),
  }),
  apps: z.array(moduleSchema.extend({ url: z.string().nullable() })),
});

const tripSchema = z.custom<typeof trips.$inferSelect>();

const tripInputSchema = z.object({
  destination: z.string().min(1).max(160),
  origin: z.string().max(160).nullable().optional(),
  tripType: z.enum(tripTypeValues).default("one_way"),
  startDate: z.date().nullable().optional(),
  endDate: z.date().nullable().optional(),
  notes: z.string().nullable().optional(),
  citizenship: z.string().nullable().optional(),
  userId: z.number().int().positive().nullable().optional(),
});

const tripPlanSchema = z.object({
  destination: z.string(),
  days: z.number().int().positive(),
  planDepth: z.enum(["quick", "detailed"]),
  travelStyle: z.enum(["balanced", "food", "culture", "family", "relaxed"]),
  overview: z.string(),
  bestFor: z.array(z.string()),
  neighborhoods: z.array(z.string()),
  transportTips: z.array(z.string()),
  etiquette: z.array(z.string()),
  itinerary: z.array(
    z.object({
      dayNumber: z.number().int().positive(),
      theme: z.string(),
      morning: z.string(),
      afternoon: z.string(),
      evening: z.string(),
      foodNote: z.string().optional(),
    }),
  ),
  dynamicNotes: z.array(z.string()),
});

const bookingImportPreviewSchema = z.object({
  summary: z.string(),
  warnings: z.array(z.string()),
  documents: z.array(
    z.object({
      docType: z.string(),
      label: z.string(),
      referenceNumber: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    }),
  ),
  budgetItems: z.array(
    z.object({
      category: z.string(),
      description: z.string(),
      amount: z.number().int().nonnegative(),
      currency: z.string(),
    }),
  ),
});

const customsEntrySectionSchema = z.object({
  status: z.enum(["verified", "unavailable"]),
  mode: z.enum(["destination", "return"]),
  title: z.string(),
  queryLocation: z.string(),
  matchedCountry: z.string().nullable(),
  officialName: z.string().nullable(),
  officialUrl: z.string().nullable(),
  sourceDomain: z.string().nullable(),
  sourceLabel: z.string().nullable(),
  deadline: z.string().nullable(),
  summary: z.string(),
});

const customsEntrySchema = z.object({
  destination: z.string(),
  origin: z.string().nullable(),
  tripType: z.enum(tripTypeValues),
  disclaimer: z.string(),
  sections: z.array(customsEntrySectionSchema),
});

const couponRedeemSchema = z.object({
  redeemedAt: z.string(),
  expiresAt: z.string(),
  planTier: z.enum(planTierValues),
});

export const api = {
  pro: {
    status: {
      method: "GET" as const,
      path: "/api/pro/status" as const,
      responses: { 200: proStatusSchema, 401: errorSchemas.unauthorized },
    },
  },
  entitlements: {
    me: {
      method: "GET" as const,
      path: "/api/entitlements/me" as const,
      responses: { 200: entitlementsSchema, 401: errorSchemas.unauthorized },
    },
  },
  profile: {
    me: {
      method: "GET" as const,
      path: "/api/profile/me" as const,
      responses: { 200: profileSchema, 401: errorSchemas.unauthorized },
    },
    update: {
      method: "PATCH" as const,
      path: "/api/profile/me" as const,
      input: z.object({
        preferredLanguage: z.enum(supportedLanguageValues).optional(),
        homeCurrency: z.string().min(3).max(3).optional(),
        citizenship: z.string().max(120).nullable().optional(),
      }),
      responses: { 200: profileSchema, 400: errorSchemas.validation, 401: errorSchemas.unauthorized },
    },
  },
  coupons: {
    redeem: {
      method: "POST" as const,
      path: "/api/coupons/redeem" as const,
      input: z.object({ code: z.string().min(6).max(64) }),
      responses: { 200: couponRedeemSchema, 400: errorSchemas.validation, 401: errorSchemas.unauthorized },
    },
  },
  modules: {
    list: {
      method: "GET" as const,
      path: "/api/modules" as const,
      responses: { 200: z.object({ modules: z.array(moduleSchema) }) },
    },
  },
  subscription: {
    me: {
      method: "GET" as const,
      path: "/api/subscription/me" as const,
      responses: { 200: z.object({ subscription: subscriptionRecordSchema.nullable(), entitlements: entitlementsSchema }), 401: errorSchemas.unauthorized },
    },
    purchaseContext: {
      method: "GET" as const,
      path: "/api/subscription/purchase-context" as const,
      responses: {
        200: z.object({
          productId: z.string(),
          apple: z.object({
            appAccountToken: z.string(),
            productId: z.string(),
          }),
          google: z.object({
            obfuscatedExternalAccountId: z.string(),
            obfuscatedExternalProfileId: z.string(),
            productId: z.string(),
          }),
        }),
        401: errorSchemas.unauthorized,
      },
    },
  },
  trips: {
    list: { method: 'GET' as const, path: '/api/trips' as const, responses: { 200: z.array(tripSchema) } },
    get: { method: 'GET' as const, path: '/api/trips/:id' as const, responses: { 200: tripSchema, 404: errorSchemas.notFound } },
    create: { method: 'POST' as const, path: '/api/trips' as const, input: tripInputSchema, responses: { 201: tripSchema, 400: errorSchemas.validation } },
    update: { method: 'PUT' as const, path: '/api/trips/:id' as const, input: tripInputSchema.partial(), responses: { 200: tripSchema, 400: errorSchemas.validation, 404: errorSchemas.notFound } },
    delete: { method: 'DELETE' as const, path: '/api/trips/:id' as const, responses: { 204: z.void(), 404: errorSchemas.notFound } },
  },
  packingLists: {
    listByTrip: { method: 'GET' as const, path: '/api/trips/:tripId/packing-lists' as const, responses: { 200: z.array(z.custom<typeof packingLists.$inferSelect>()) } },
    create: { method: 'POST' as const, path: '/api/trips/:tripId/packing-lists' as const, input: insertPackingListSchema.omit({ tripId: true }), responses: { 201: z.custom<typeof packingLists.$inferSelect>(), 400: errorSchemas.validation } },
    update: { method: 'PUT' as const, path: '/api/packing-lists/:id' as const, input: insertPackingListSchema.partial(), responses: { 200: z.custom<typeof packingLists.$inferSelect>(), 400: errorSchemas.validation, 404: errorSchemas.notFound } },
    delete: { method: 'DELETE' as const, path: '/api/packing-lists/:id' as const, responses: { 204: z.void(), 404: errorSchemas.notFound } },
  },
  budgetItems: {
    listByTrip: { method: 'GET' as const, path: '/api/trips/:tripId/budget-items' as const, responses: { 200: z.array(z.custom<typeof budgetItems.$inferSelect>()) } },
    create: { method: 'POST' as const, path: '/api/trips/:tripId/budget-items' as const, input: insertBudgetItemSchema.omit({ tripId: true }), responses: { 201: z.custom<typeof budgetItems.$inferSelect>(), 400: errorSchemas.validation } },
    update: { method: 'PUT' as const, path: '/api/budget-items/:id' as const, input: insertBudgetItemSchema.partial(), responses: { 200: z.custom<typeof budgetItems.$inferSelect>(), 400: errorSchemas.validation } },
    delete: { method: 'DELETE' as const, path: '/api/budget-items/:id' as const, responses: { 204: z.void() } },
  },
  travelDocuments: {
    listByTrip: { method: 'GET' as const, path: '/api/trips/:tripId/documents' as const, responses: { 200: z.array(z.custom<typeof travelDocuments.$inferSelect>()) } },
    create: { method: 'POST' as const, path: '/api/trips/:tripId/documents' as const, input: insertTravelDocumentSchema.omit({ tripId: true }), responses: { 201: z.custom<typeof travelDocuments.$inferSelect>(), 400: errorSchemas.validation } },
    update: { method: 'PUT' as const, path: '/api/documents/:id' as const, input: insertTravelDocumentSchema.partial(), responses: { 200: z.custom<typeof travelDocuments.$inferSelect>(), 400: errorSchemas.validation } },
    delete: { method: 'DELETE' as const, path: '/api/documents/:id' as const, responses: { 204: z.void() } },
  },
  itineraryItems: {
    listByTrip: { method: 'GET' as const, path: '/api/trips/:tripId/itinerary' as const, responses: { 200: z.array(z.custom<typeof itineraryItems.$inferSelect>()) } },
    create: { method: 'POST' as const, path: '/api/trips/:tripId/itinerary' as const, input: insertItineraryItemSchema.omit({ tripId: true }), responses: { 201: z.custom<typeof itineraryItems.$inferSelect>(), 400: errorSchemas.validation } },
    update: { method: 'PUT' as const, path: '/api/itinerary/:id' as const, input: insertItineraryItemSchema.partial(), responses: { 200: z.custom<typeof itineraryItems.$inferSelect>(), 400: errorSchemas.validation } },
    delete: { method: 'DELETE' as const, path: '/api/itinerary/:id' as const, responses: { 204: z.void() } },
  },
  ai: {
    generatePackingList: {
      method: 'POST' as const, path: '/api/ai/packing-list' as const,
      input: z.object({ destination: z.string(), days: z.number().optional() }),
      responses: { 200: z.object({ items: z.array(z.string()) }), 403: errorSchemas.upgradeRequired },
    },
    tripPlan: {
      method: 'POST' as const, path: '/api/ai/trip-plan' as const,
      input: z.object({
        destination: z.string(),
        days: z.number().int().positive().max(21).default(5),
        planDepth: z.enum(["quick", "detailed"]).default("quick"),
        travelStyle: z.enum(["balanced", "food", "culture", "family", "relaxed"]).default("balanced"),
      }),
      responses: { 200: tripPlanSchema, 403: errorSchemas.upgradeRequired },
    },
    culturalTips: {
      method: 'POST' as const, path: '/api/ai/cultural-tips' as const,
      input: z.object({ destination: z.string() }),
      responses: { 200: z.object({ tips: z.string() }), 403: errorSchemas.upgradeRequired },
    },
    safetyAdvice: {
      method: 'POST' as const, path: '/api/ai/safety-advice' as const,
      input: z.object({ destination: z.string(), citizenship: z.string().optional() }),
      responses: { 200: z.object({ advice: z.string() }), 403: errorSchemas.upgradeRequired },
    },
    safetyMap: {
      method: 'POST' as const, path: '/api/ai/safety-map' as const,
      input: z.object({ destination: z.string() }),
      responses: { 200: z.object({ center: z.object({ lat: z.number(), lng: z.number() }), zones: z.array(z.object({ name: z.string(), lat: z.number(), lng: z.number(), radius: z.number(), level: z.enum(["safe", "caution", "avoid"]), description: z.string() })) }), 403: errorSchemas.upgradeRequired },
    },
    phrases: {
      method: 'POST' as const, path: '/api/ai/phrases' as const,
      input: z.object({ destination: z.string() }),
      responses: { 200: z.object({ phrases: z.string() }), 403: errorSchemas.upgradeRequired },
    },
    weather: {
      method: 'POST' as const, path: '/api/ai/weather' as const,
      input: z.object({ destination: z.string(), startDate: z.string().optional(), endDate: z.string().optional() }),
      responses: { 200: z.object({ forecast: z.string() }), 403: errorSchemas.upgradeRequired },
    },
    customsEntry: {
      method: "POST" as const,
      path: "/api/ai/customs-entry" as const,
      input: z.object({ tripId: z.number().int().positive() }),
      responses: { 200: customsEntrySchema, 403: errorSchemas.upgradeRequired },
    },
    assistant: {
      method: "POST" as const,
      path: "/api/ai/assistant" as const,
      input: z.object({
        tripId: z.number().int().positive(),
        question: z.string().min(1).max(1200),
      }),
      responses: { 200: z.object({ answer: z.string() }), 403: errorSchemas.upgradeRequired, 404: errorSchemas.notFound },
    },
  },
  bookingImport: {
    preview: {
      method: "POST" as const,
      path: "/api/trips/:tripId/booking-import/preview" as const,
      input: z.object({
        rawText: z.string().min(20),
      }),
      responses: { 200: bookingImportPreviewSchema, 400: errorSchemas.validation, 403: errorSchemas.upgradeRequired, 404: errorSchemas.notFound },
    },
    apply: {
      method: "POST" as const,
      path: "/api/trips/:tripId/booking-import/apply" as const,
      input: bookingImportPreviewSchema,
      responses: {
        200: z.object({
          createdDocuments: z.number().int().nonnegative(),
          createdBudgetItems: z.number().int().nonnegative(),
        }),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
        404: errorSchemas.notFound,
      },
    },
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
