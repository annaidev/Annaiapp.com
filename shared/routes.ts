import { z } from 'zod';
import { insertTripSchema, insertPackingListSchema, trips, packingLists } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  trips: {
    list: {
      method: 'GET' as const,
      path: '/api/trips' as const,
      responses: {
        200: z.array(z.custom<typeof trips.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/trips/:id' as const,
      responses: {
        200: z.custom<typeof trips.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/trips' as const,
      input: insertTripSchema,
      responses: {
        201: z.custom<typeof trips.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/trips/:id' as const,
      input: insertTripSchema.partial(),
      responses: {
        200: z.custom<typeof trips.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/trips/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  packingLists: {
    listByTrip: {
      method: 'GET' as const,
      path: '/api/trips/:tripId/packing-lists' as const,
      responses: {
        200: z.array(z.custom<typeof packingLists.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/trips/:tripId/packing-lists' as const,
      input: insertPackingListSchema.omit({ tripId: true }),
      responses: {
        201: z.custom<typeof packingLists.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/packing-lists/:id' as const,
      input: insertPackingListSchema.partial(),
      responses: {
        200: z.custom<typeof packingLists.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/packing-lists/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  ai: {
    generatePackingList: {
      method: 'POST' as const,
      path: '/api/ai/packing-list' as const,
      input: z.object({
        destination: z.string(),
        days: z.number().optional(),
      }),
      responses: {
        200: z.object({
          items: z.array(z.string()),
        }),
      },
    },
    culturalTips: {
      method: 'POST' as const,
      path: '/api/ai/cultural-tips' as const,
      input: z.object({
        destination: z.string(),
      }),
      responses: {
        200: z.object({
          tips: z.string(),
        }),
      },
    },
    safetyAdvice: {
      method: 'POST' as const,
      path: '/api/ai/safety-advice' as const,
      input: z.object({
        destination: z.string(),
        citizenship: z.string().optional(),
      }),
      responses: {
        200: z.object({
          advice: z.string(),
        }),
      },
    },
    safetyMap: {
      method: 'POST' as const,
      path: '/api/ai/safety-map' as const,
      input: z.object({
        destination: z.string(),
      }),
      responses: {
        200: z.object({
          center: z.object({ lat: z.number(), lng: z.number() }),
          zones: z.array(z.object({
            name: z.string(),
            lat: z.number(),
            lng: z.number(),
            radius: z.number(),
            level: z.enum(["safe", "caution", "avoid"]),
            description: z.string(),
          })),
        }),
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
