import type { Express, Request, Response } from "express";
import type { Server } from "http";
import { createHash, randomBytes, createHmac } from "crypto";
import { storage } from "./storage";
import { requireAuth } from "./auth";
import { api } from "@shared/routes";
import { z } from "zod";
import OpenAI from "openai";
import {
  buildAiCacheKey,
  buildDestinationOnlyCacheInput,
  buildPackingListCacheInput,
  buildTripPlanCacheInput,
  getCachedAiPayload,
  saveCachedAiPayload,
  type AiCacheFeature,
} from "./aiCache";
import { getEntitlements, getModulesConfig, isSubscriptionActive, requireFeature } from "./entitlements";
import {
  decodeGooglePubSubMessageData,
  fetchGooglePlaySubscriptionSnapshot,
  verifyAppleNotificationPayload,
  verifyGooglePubSubOidcToken,
} from "./subscription-verification";

const openaiApiKey =
  process.env.OPENAI_API_KEY ?? process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

const AI_MODEL = "gpt-4o-mini";
const ANNAI_PRO_MONTHLY_PRODUCT_ID = "annai.pro.monthly.9_99";
const CAMPING_APP_URL = (
  process.env.ANNAI_CAMPING_URL ??
  (process.env.NODE_ENV === "production" ? "" : "http://127.0.0.1:5001")
).trim();
const SSO_TOKEN_TTL_SECONDS = 60;

if (!openai) {
  console.warn("OPENAI_API_KEY is not set. AI-powered endpoints are disabled.");
}

class AiUnavailableError extends Error {
  constructor() {
    super("AI service unavailable: OPENAI_API_KEY is not configured.");
    this.name = "AiUnavailableError";
  }
}

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  es: "Spanish",
  zh: "Simplified Chinese",
  ja: "Japanese",
  ko: "Korean",
};

function getUserLanguage(user: NonNullable<Express.User> | Awaited<ReturnType<typeof storage.getUser>>) {
  return user?.preferredLanguage ?? "en";
}

function getLanguageName(language: string) {
  return LANGUAGE_LABELS[language] ?? LANGUAGE_LABELS.en;
}

function getAiLanguageInstruction(user: NonNullable<Express.User> | Awaited<ReturnType<typeof storage.getUser>>) {
  const language = getUserLanguage(user);
  return `Respond in ${getLanguageName(language)}.`;
}

function toProfileResponse(user: NonNullable<Express.User> | Awaited<ReturnType<typeof storage.getUser>>) {
  return {
    id: user!.id,
    username: user!.username,
    preferredLanguage: getUserLanguage(user),
    homeCurrency: user!.homeCurrency ?? "USD",
  };
}

async function getOwnedTripOr404(req: Request, res: Response, tripId: number) {
  const trip = await storage.getTrip(tripId);
  if (!trip || trip.userId !== req.user!.id) {
    res.status(404).json({ message: "Trip not found" });
    return null;
  }
  return trip;
}

async function aiChat(messages: { role: string; content: string }[], jsonMode = false): Promise<string> {
  if (!openai) {
    throw new AiUnavailableError();
  }

  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    messages: messages as any,
    max_tokens: 4096,
    ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
  });
  return response.choices[0]?.message?.content || "";
}

function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

function extractJson(text: string): string {
  const cleaned = stripThinkTags(text);
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const braceMatch = cleaned.match(/(\{[\s\S]*\})/);
  if (braceMatch) return braceMatch[1].trim();
  return cleaned;
}

function handleAiError(res: Response, fallbackMessage: string, error: unknown) {
  console.error(fallbackMessage, error);
  if (error instanceof AiUnavailableError) {
    return res.status(503).json({ message: "AI features are temporarily unavailable." });
  }
  return res.status(500).json({ message: fallbackMessage });
}

function normalizeCurrencyCode(input?: string | null) {
  return (input ?? "USD").trim().toUpperCase().slice(0, 3) || "USD";
}


type EcosystemSsoPayload = {
  iss: "annai-travel";
  aud: "annai-camping";
  sub: string;
  username: string;
  iat: number;
  exp: number;
  nonce: string;
  v: 1;
};

function getEcosystemSsoSecret(): string | undefined {
  const explicitSecret = process.env.ANNAI_SSO_SHARED_SECRET?.trim();
  if (explicitSecret) return explicitSecret;
  if (process.env.NODE_ENV !== "production") {
    return "annai-local-sso-secret";
  }
  return undefined;
}

function signEcosystemSsoPayload(encodedPayload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(encodedPayload).digest();
}

async function ensureAnnaiUserId(user: NonNullable<Express.User>): Promise<string> {
  if (user.annaiUserId) {
    return user.annaiUserId;
  }

  const annaiUserId = randomBytes(16).toString("hex");
  const updatedUser = await storage.setUserAnnaiUserId(user.id, annaiUserId);
  if (updatedUser && "annaiUserId" in updatedUser) {
    reqUserAssign(user, updatedUser.annaiUserId ?? annaiUserId);
  }
  return annaiUserId;
}

function reqUserAssign(user: NonNullable<Express.User>, annaiUserId: string) {
  user.annaiUserId = annaiUserId;
}

async function issueCampingHandoffToken(user: NonNullable<Express.User>): Promise<string> {
  const secret = getEcosystemSsoSecret();
  if (!secret) {
    throw new Error("Annai ecosystem SSO secret is not configured.");
  }

  const annaiUserId = await ensureAnnaiUserId(user);
  const now = Math.floor(Date.now() / 1000);
  const payload: EcosystemSsoPayload = {
    iss: "annai-travel",
    aud: "annai-camping",
    sub: annaiUserId,
    username: user.username,
    iat: now,
    exp: now + SSO_TOKEN_TTL_SECONDS,
    nonce: randomBytes(12).toString("base64url"),
    v: 1,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = signEcosystemSsoPayload(encodedPayload, secret).toString("base64url");
  return `${encodedPayload}.${signature}`;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function requireWebhookSecret(req: Request, res: Response): boolean {
  const configuredSecret = process.env.SUBSCRIPTION_WEBHOOK_SECRET;
  if (!configuredSecret) {
    res.status(503).json({ message: "Webhook secret is not configured" });
    return false;
  }

  const providedSecret = req.header("x-annai-webhook-secret");
  if (!providedSecret || providedSecret !== configuredSecret) {
    res.status(401).json({ message: "Invalid webhook secret" });
    return false;
  }

  return true;
}

function mapAppleNotificationToStatus(notificationType?: string, expiresAt?: Date | null) {
  const type = (notificationType ?? "").toUpperCase();
  if (["SUBSCRIBED", "DID_RENEW", "OFFER_REDEEMED", "RENEWAL_EXTENDED"].includes(type)) return "active";
  if (["DID_FAIL_TO_RENEW", "GRACE_PERIOD_EXPIRED"].includes(type)) return "past_due";
  if (type === "EXPIRED") return "expired";
  if (["REFUND", "REVOKE"].includes(type)) return "canceled";
  return isSubscriptionActive("active", expiresAt ?? null) ? "active" : "inactive";
}

async function resolveUserByBillingIdentifier(identifier?: string) {
  if (!identifier) return undefined;
  const normalized = identifier.trim();
  if (!normalized) return undefined;

  const byAnnaiId = await storage.getUserByAnnaiUserId(normalized);
  if (byAnnaiId) return byAnnaiId;
  return storage.getUserByUsername(normalized);
}

async function applySubscriptionEventUpdate(input: {
  user: NonNullable<Express.User> | Awaited<ReturnType<typeof storage.getUser>>;
  status: "inactive" | "active" | "trialing" | "past_due" | "canceled" | "expired";
  platform: "ios" | "android" | "manual";
  productId: string;
  transactionId: string;
  expiresAt: Date | null;
  isSandbox: boolean;
}) {
  const subscription = await storage.upsertSubscription(input.user!.id, {
    status: input.status,
    platform: input.platform,
    productId: input.productId,
    expiresAt: input.expiresAt,
    originalTransactionId: input.transactionId,
    isSandbox: input.isSandbox,
    lastVerifiedAt: new Date(),
  });

  await storage.updateUser(input.user!.id, {
    subscriptionStatus: isSubscriptionActive(subscription.status, subscription.expiresAt) ? "active" : "free",
  });

  return subscription;
}

async function respondWithCachedAi<T>(
  res: Response,
  feature: AiCacheFeature,
  cachePayload: Record<string, unknown>,
  generator: () => Promise<T>,
): Promise<void> {
  const cacheKey = buildAiCacheKey(feature, cachePayload);
  res.setHeader("X-Annai-Cache-Key", cacheKey);

  const cached = await getCachedAiPayload<T>(feature, cachePayload);
  if (cached) {
    res.setHeader("X-Annai-Cache", "HIT");
    res.json(cached);
    return;
  }

  const fresh = await generator();
  await saveCachedAiPayload(feature, cachePayload, fresh);
  res.setHeader("X-Annai-Cache", "MISS");
  res.json(fresh);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.post("/api/ecosystem/handoff/camping", requireAuth, async (req, res) => {
    if (!CAMPING_APP_URL) {
      return res.status(503).json({ message: "Camping app is not configured for this environment." });
    }

    try {
      const token = await issueCampingHandoffToken(req.user!);
      const nextPath =
        typeof req.body?.nextPath === "string" && req.body.nextPath.startsWith("/")
          ? req.body.nextPath
          : "/";
      const handoffUrl = `${CAMPING_APP_URL.replace(/\/+$/, "")}/auth/annai?next=${encodeURIComponent(nextPath)}#token=${token}`;
      return res.json({ handoffUrl });
    } catch (error) {
      console.error("Failed to create camping handoff token", error);
      return res.status(503).json({ message: "Annai SSO is temporarily unavailable." });
    }
  });

  app.get(api.modules.list.path, (_req, res) => {
    res.json({ modules: getModulesConfig(false) });
  });

  app.get(api.entitlements.me.path, requireAuth, async (req, res) => {
    const entitlements = await getEntitlements(storage, req.user!);
    res.json(entitlements);
  });

  app.get(api.profile.me.path, requireAuth, async (req, res) => {
    res.json(toProfileResponse(req.user!));
  });

  app.patch(api.profile.update.path, requireAuth, async (req, res) => {
    try {
      const input = api.profile.update.input.parse(req.body);
      const updatedUser = await storage.updateUser(req.user!.id, {
        preferredLanguage: input.preferredLanguage ?? req.user!.preferredLanguage ?? "en",
        homeCurrency: normalizeCurrencyCode(input.homeCurrency ?? req.user!.homeCurrency ?? "USD"),
      });

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      req.user!.preferredLanguage = updatedUser.preferredLanguage;
      req.user!.homeCurrency = updatedUser.homeCurrency;
      res.json(toProfileResponse(updatedUser));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      throw err;
    }
  });

  app.post(api.coupons.redeem.path, requireAuth, async (req, res) => {
    try {
      const { code } = api.coupons.redeem.input.parse(req.body);
      const normalizedCode = code.trim().toUpperCase();
      const codeHash = sha256(normalizedCode);
      const coupon = await storage.getCouponCodeByHash(codeHash);

      if (!coupon || coupon.disabledAt || coupon.redeemedAt || (coupon.expiresAt && coupon.expiresAt.getTime() <= Date.now())) {
        return res.status(400).json({ message: "This coupon code is invalid or already used." });
      }

      const entitlements = await getEntitlements(storage, req.user!);
      const activeGift = await storage.getActiveGiftedEntitlement(req.user!.id);
      if (entitlements.hasProAccess || activeGift) {
        return res.status(400).json({ message: "This account already has active Pro access." });
      }

      const redeemedCoupon = await storage.redeemCouponCode(coupon.id, req.user!.id);
      if (!redeemedCoupon) {
        return res.status(400).json({ message: "This coupon code was just redeemed and is no longer available." });
      }

      const startsAt = new Date();
      const expiresAt = new Date(startsAt.getTime() + redeemedCoupon.durationDays * 24 * 60 * 60 * 1000);
      await storage.createGiftedEntitlement({
        userId: req.user!.id,
        grantedByUserId: redeemedCoupon.createdByUserId ?? req.user!.id,
        planTier: "pro",
        reason: redeemedCoupon.label ? `coupon:${redeemedCoupon.label}` : "coupon_redeem",
        startsAt,
        expiresAt,
        revokedAt: null,
      });

      res.json({
        redeemedAt: startsAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        planTier: "pro" as const,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      throw err;
    }
  });

  app.get(api.pro.status.path, requireAuth, async (req, res) => {
    const entitlements = await getEntitlements(storage, req.user!);
    res.json({
      ...entitlements,
      apps: getModulesConfig(entitlements.hasProAccess).map((module) => ({
        ...module,
        url: module.slug === "camping" && module.enabled ? CAMPING_APP_URL || null : null,
      })),
    });
  });

  app.get(api.subscription.me.path, requireAuth, async (req, res) => {
    const [entitlements, subscription] = await Promise.all([
      getEntitlements(storage, req.user!),
      storage.getSubscription(req.user!.id),
    ]);

    res.json({
      subscription: subscription
        ? {
            status: subscription.status,
            platform: subscription.platform ?? null,
            productId: subscription.productId ?? null,
            expiresAt: subscription.expiresAt ? subscription.expiresAt.toISOString() : null,
            isActive: isSubscriptionActive(subscription.status, subscription.expiresAt),
            isSandbox: subscription.isSandbox,
          }
        : null,
      entitlements,
    });
  });

  app.get(api.subscription.purchaseContext.path, requireAuth, async (req, res) => {
    const annaiUserId = await ensureAnnaiUserId(req.user!);
    res.json({
      productId: ANNAI_PRO_MONTHLY_PRODUCT_ID,
      apple: {
        appAccountToken: annaiUserId,
        productId: ANNAI_PRO_MONTHLY_PRODUCT_ID,
      },
      google: {
        obfuscatedExternalAccountId: annaiUserId,
        obfuscatedExternalProfileId: annaiUserId,
        productId: ANNAI_PRO_MONTHLY_PRODUCT_ID,
      },
    });
  });

  app.get(api.trips.list.path, requireAuth, async (req, res) => {
    const trips = await storage.getTrips(req.user!.id);
    res.json(trips);
  });

  app.get(api.trips.get.path, requireAuth, async (req, res) => {
    const trip = await storage.getTrip(Number(req.params.id));
    if (!trip || trip.userId !== req.user!.id) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    res.json(trip);
  });

  app.post(api.trips.create.path, requireAuth, async (req, res) => {
    try {
      const body = { ...req.body };
      if (body.startDate && typeof body.startDate === 'string') body.startDate = new Date(body.startDate);
      if (body.endDate && typeof body.endDate === 'string') body.endDate = new Date(body.endDate);
      const input = api.trips.create.input.parse(body);
      const trip = await storage.createTrip({ ...input, userId: req.user!.id });
      
      const entitlements = await getEntitlements(storage, req.user!);
      if (entitlements.enabledFeatures.includes("ai_packing")) {
        try {
          const prompt = `Generate a concise essential packing list for a trip to ${trip.destination}. 
          Include location-specific essentials like universal adapters (if international/overseas from US/EU), 
          jackets/clothing based on typical weather, and must-have travel documents. 
          Return ONLY a JSON object with a single key 'items' containing an array of strings.`;

          const content = await aiChat([{ role: "user", content: prompt }]);
          if (content) {
            const { items } = JSON.parse(extractJson(content));
            if (Array.isArray(items)) {
              for (const item of items) {
                await storage.createPackingList({
                  tripId: trip.id,
                  item,
                  isPacked: false
                });
              }
            }
          }
        } catch (aiError) {
          if (aiError instanceof AiUnavailableError) {
            console.warn("Skipping AI packing prefill because OPENAI_API_KEY is not configured.");
          } else {
            console.error("Failed to prefill packing list:", aiError);
          }
        }
      }

      res.status(201).json(trip);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.put(api.trips.update.path, requireAuth, async (req, res) => {
    try {
      const trip = await storage.getTrip(Number(req.params.id));
      if (!trip || trip.userId !== req.user!.id) {
        return res.status(404).json({ message: 'Trip not found' });
      }
      const body = { ...req.body };
      if (body.startDate && typeof body.startDate === 'string') body.startDate = new Date(body.startDate);
      if (body.endDate && typeof body.endDate === 'string') body.endDate = new Date(body.endDate);
      const input = api.trips.update.input.parse(body);
      const updated = await storage.updateTrip(Number(req.params.id), input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.trips.delete.path, requireAuth, async (req, res) => {
    const trip = await storage.getTrip(Number(req.params.id));
    if (!trip || trip.userId !== req.user!.id) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    await storage.deleteTrip(Number(req.params.id));
    res.status(204).send();
  });

  app.get(api.packingLists.listByTrip.path, requireAuth, async (req, res) => {
    const items = await storage.getPackingListsByTrip(Number(req.params.tripId));
    res.json(items);
  });

  app.post(api.packingLists.create.path, requireAuth, async (req, res) => {
    try {
      const input = api.packingLists.create.input.parse(req.body);
      const item = await storage.createPackingList({
        ...input,
        tripId: Number(req.params.tripId)
      });
      res.status(201).json(item);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.put(api.packingLists.update.path, requireAuth, async (req, res) => {
    try {
      const input = api.packingLists.update.input.parse(req.body);
      const item = await storage.updatePackingList(Number(req.params.id), input);
      if (!item) {
        return res.status(404).json({ message: 'Packing list item not found' });
      }
      res.json(item);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.packingLists.delete.path, requireAuth, async (req, res) => {
    await storage.deletePackingList(Number(req.params.id));
    res.status(204).send();
  });

  app.post(api.ai.generatePackingList.path, requireAuth, async (req, res) => {
    try {
      const entitlements = await getEntitlements(storage, req.user!);
      if (!requireFeature(res, entitlements, "ai_packing")) return;
      const { destination, days } = api.ai.generatePackingList.input.parse(req.body);
      const cachePayload = buildPackingListCacheInput({ destination, days });

      await respondWithCachedAi(res, "packing-list", cachePayload, async () => {
        const prompt = `Generate a concise packing list for a trip to ${destination}${days ? ` for ${days} days` : ""}. Return ONLY a JSON object with a single key 'items' containing an array of strings. No explanation, no markdown, just the JSON.`;
        const content = await aiChat([{ role: "user", content: prompt }], true);
        if (!content) throw new Error("No response from AI");
        return JSON.parse(content) as { items: string[] };
      });
    } catch (error) {
      return handleAiError(res, "Failed to generate packing list", error);
    }
  });

  app.post(api.ai.tripPlan.path, requireAuth, async (req, res) => {
    try {
      const entitlements = await getEntitlements(storage, req.user!);
      if (!requireFeature(res, entitlements, "ai_itinerary")) return;
      const { destination, days, planDepth, travelStyle } = api.ai.tripPlan.input.parse(req.body);
      const cachePayload = buildTripPlanCacheInput({ destination, days, planDepth, travelStyle });

      await respondWithCachedAi(res, "trip-plan", cachePayload, async () => {
        const prompt = [
          "Create a reusable travel product plan, not a chatty response.",
          getAiLanguageInstruction(req.user!),
          `Destination: ${destination}`,
          `Trip length: ${days} days`,
          `Plan depth: ${planDepth}`,
          `Travel style: ${travelStyle}`,
          'Return ONLY valid JSON with keys: destination, days, planDepth, travelStyle, overview, bestFor, neighborhoods, transportTips, etiquette, itinerary, dynamicNotes.',
          "bestFor: array of short traveler-fit labels.",
          "neighborhoods: array of 3-6 neighborhoods or areas worth understanding.",
          "transportTips: array of concise transport basics.",
          "etiquette: array of concise cultural or etiquette reminders.",
          "itinerary: one object per day with keys dayNumber, theme, morning, afternoon, evening, optional foodNote.",
          "dynamicNotes: array of short reminders about things the traveler should verify separately, such as weather, seasonal closures, live events, pricing, or reservation availability.",
          "Keep recommendations practical and evergreen where possible.",
        ].join("\n");

        const content = await aiChat([{ role: "user", content: prompt }], true);
        if (!content) throw new Error("No response from AI");
        return api.ai.tripPlan.responses[200].parse(JSON.parse(content));
      });
    } catch (error) {
      return handleAiError(res, "Failed to generate trip plan", error);
    }
  });

  app.post(api.ai.culturalTips.path, requireAuth, async (req, res) => {
    try {
      const entitlements = await getEntitlements(storage, req.user!);
      if (!requireFeature(res, entitlements, "ai_safety")) return;
      const { destination } = api.ai.culturalTips.input.parse(req.body);
      const cachePayload = buildDestinationOnlyCacheInput({ destination });

      await respondWithCachedAi(res, "cultural-tips", cachePayload, async () => {
        const raw = await aiChat([
          { role: "system", content: `You are a travel expert providing concise, actionable cultural customs and etiquette tips. Format with markdown. ${getAiLanguageInstruction(req.user!)}` },
          { role: "user", content: `Give me 3-5 important cultural customs, tips, and etiquette advice for visiting ${destination}.` }
        ]);
        const tips = stripThinkTags(raw || "No tips available.");
        return { tips };
      });
    } catch (error) {
      return handleAiError(res, "Failed to fetch cultural tips", error);
    }
  });

  app.post(api.ai.safetyAdvice.path, requireAuth, async (req, res) => {
    try {
      const entitlements = await getEntitlements(storage, req.user!);
      if (!requireFeature(res, entitlements, "ai_safety")) return;
      const { destination, citizenship } = api.ai.safetyAdvice.input.parse(req.body);
      
      const raw = await aiChat([
        { role: "system", content: `You are a travel safety and diplomatic expert. Provide concise advice on areas to avoid, common scams, and general safety. ALSO, if provided with a citizenship, find and include the location and contact information for the nearest embassy or consulate of that country in the destination. Format with clear markdown headings. ${getAiLanguageInstruction(req.user!)}` },
        { role: "user", content: `What are the safety concerns and embassy information for a ${citizenship || "traveler"} visiting ${destination}?` }
      ]);
      const advice = stripThinkTags(raw || "No safety advice available.");
      res.json({ advice });
    } catch (error) {
      return handleAiError(res, "Failed to fetch safety advice", error);
    }
  });

  app.post(api.ai.safetyMap.path, requireAuth, async (req, res) => {
    try {
      const entitlements = await getEntitlements(storage, req.user!);
      if (!requireFeature(res, entitlements, "google_maps")) return;
      const { destination } = api.ai.safetyMap.input.parse(req.body);

      const content = await aiChat([
        {
          role: "system",
          content: `You are a travel safety data analyst. Return a JSON object with:
1. "center": {"lat": number, "lng": number} — city center coordinates.
2. "zones": array of 6 areas, each with: "name" (string), "lat" (number), "lng" (number), "radius" (number, 300-1500 meters), "level" ("safe"|"caution"|"avoid"), "description" (one short sentence).
Include a mix of safe, caution, and avoid areas. Use real neighborhood names and accurate coordinates. Use ${getLanguageName(getUserLanguage(req.user!))} for any text fields. Return ONLY valid JSON.`
        },
        { role: "user", content: `Safety zone data for ${destination}.` }
      ], true);
      if (!content) throw new Error("No response from AI");

      res.json(JSON.parse(content));
    } catch (error) {
      return handleAiError(res, "Failed to generate safety map data", error);
    }
  });

  app.get(api.budgetItems.listByTrip.path, requireAuth, async (req, res) => {
    const items = await storage.getBudgetItemsByTrip(Number(req.params.tripId));
    res.json(items);
  });
  app.post(api.budgetItems.create.path, requireAuth, async (req, res) => {
    try {
      const input = api.budgetItems.create.input.parse(req.body);
      const item = await storage.createBudgetItem({ ...input, tripId: Number(req.params.tripId) });
      res.status(201).json(item);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      throw err;
    }
  });
  app.put(api.budgetItems.update.path, requireAuth, async (req, res) => {
    try {
      const input = api.budgetItems.update.input.parse(req.body);
      const item = await storage.updateBudgetItem(Number(req.params.id), input);
      res.json(item);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });
  app.delete(api.budgetItems.delete.path, requireAuth, async (req, res) => {
    await storage.deleteBudgetItem(Number(req.params.id));
    res.status(204).send();
  });

  app.get(api.travelDocuments.listByTrip.path, requireAuth, async (req, res) => {
    const docs = await storage.getTravelDocumentsByTrip(Number(req.params.tripId));
    res.json(docs);
  });
  app.post(api.travelDocuments.create.path, requireAuth, async (req, res) => {
    try {
      const input = api.travelDocuments.create.input.parse(req.body);
      const doc = await storage.createTravelDocument({ ...input, tripId: Number(req.params.tripId) });
      res.status(201).json(doc);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      throw err;
    }
  });
  app.put(api.travelDocuments.update.path, requireAuth, async (req, res) => {
    try {
      const input = api.travelDocuments.update.input.parse(req.body);
      const doc = await storage.updateTravelDocument(Number(req.params.id), input);
      res.json(doc);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });
  app.delete(api.travelDocuments.delete.path, requireAuth, async (req, res) => {
    await storage.deleteTravelDocument(Number(req.params.id));
    res.status(204).send();
  });

  app.get(api.itineraryItems.listByTrip.path, requireAuth, async (req, res) => {
    const items = await storage.getItineraryItemsByTrip(Number(req.params.tripId));
    res.json(items);
  });
  app.post(api.itineraryItems.create.path, requireAuth, async (req, res) => {
    try {
      const input = api.itineraryItems.create.input.parse(req.body);
      const item = await storage.createItineraryItem({ ...input, tripId: Number(req.params.tripId) });
      res.status(201).json(item);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      throw err;
    }
  });
  app.put(api.itineraryItems.update.path, requireAuth, async (req, res) => {
    try {
      const input = api.itineraryItems.update.input.parse(req.body);
      const item = await storage.updateItineraryItem(Number(req.params.id), input);
      res.json(item);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });
  app.delete(api.itineraryItems.delete.path, requireAuth, async (req, res) => {
    await storage.deleteItineraryItem(Number(req.params.id));
    res.status(204).send();
  });

  app.post(api.ai.phrases.path, requireAuth, async (req, res) => {
    try {
      const entitlements = await getEntitlements(storage, req.user!);
      if (!requireFeature(res, entitlements, "ai_phrases")) return;
      const { destination } = api.ai.phrases.input.parse(req.body);
      const cachePayload = buildDestinationOnlyCacheInput({ destination });

      await respondWithCachedAi(res, "phrases", cachePayload, async () => {
        const raw = await aiChat([
          { role: "system", content: `You are a language guide for travelers. Provide 10-15 essential phrases travelers need at the destination. For each phrase, include the meaning translated into ${getLanguageName(getUserLanguage(req.user!))}, the local language translation, and a phonetic pronunciation guide. Format clearly with markdown.` },
          { role: "user", content: `Give me essential travel phrases for visiting ${destination}. Include greetings, ordering food, asking for directions, emergencies, and common polite expressions.` }
        ]);
        const phrases = stripThinkTags(raw || "No phrases available.");
        return { phrases };
      });
    } catch (error) {
      return handleAiError(res, "Failed to generate phrases", error);
    }
  });

  app.post(api.ai.weather.path, requireAuth, async (req, res) => {
    try {
      const entitlements = await getEntitlements(storage, req.user!);
      if (!requireFeature(res, entitlements, "ai_weather")) return;
      const { destination, startDate, endDate } = api.ai.weather.input.parse(req.body);
      const dateRange = startDate && endDate ? `from ${startDate} to ${endDate}` : "for an upcoming trip";
      const raw = await aiChat([
        { role: "system", content: `You are a travel weather advisor. Provide a helpful weather forecast summary for the destination and time period. Include expected temperatures, rainfall, what to wear, and any weather-related travel tips. Format with markdown. ${getAiLanguageInstruction(req.user!)}` },
        { role: "user", content: `What weather should a traveler expect in ${destination} ${dateRange}? Include temperature ranges, precipitation, clothing recommendations, and any weather warnings.` }
      ]);
      const forecast = stripThinkTags(raw || "No forecast available.");
      res.json({ forecast });
    } catch (error) {
      return handleAiError(res, "Failed to generate weather forecast", error);
    }
  });

  app.post(api.ai.assistant.path, requireAuth, async (req, res) => {
    try {
      const entitlements = await getEntitlements(storage, req.user!);
      if (!requireFeature(res, entitlements, "ai_itinerary")) return;

      const { tripId, question } = api.ai.assistant.input.parse(req.body);
      const trip = await getOwnedTripOr404(req, res, tripId);
      if (!trip) return;

      const answer = stripThinkTags(
        await aiChat([
          {
            role: "system",
            content: [
              "You are Annai Travel Assistant.",
              "Answer immediate travel-planning questions with concise, practical guidance.",
              "Use the active trip context when it matters.",
              "If information can change in real life, say the traveler should verify it before booking or departure.",
              getAiLanguageInstruction(req.user!),
            ].join(" "),
          },
          {
            role: "user",
            content: [
              `Trip destination: ${trip.destination}`,
              `Trip dates: ${trip.startDate ? trip.startDate.toISOString().slice(0, 10) : "unknown"} to ${trip.endDate ? trip.endDate.toISOString().slice(0, 10) : "unknown"}`,
              `Traveler citizenship: ${trip.citizenship ?? "not provided"}`,
              `Trip notes: ${trip.notes ?? "none"}`,
              `Question: ${question}`,
            ].join("\n"),
          },
        ]),
      );

      res.json({ answer: answer || "No answer available." });
    } catch (error) {
      return handleAiError(res, "Failed to generate assistant response", error);
    }
  });

  app.post(api.bookingImport.preview.path, requireAuth, async (req, res) => {
    try {
      const entitlements = await getEntitlements(storage, req.user!);
      if (!requireFeature(res, entitlements, "ai_itinerary")) return;

      const tripId = Number(req.params.tripId);
      const trip = await getOwnedTripOr404(req, res, tripId);
      if (!trip) return;

      const { rawText } = api.bookingImport.preview.input.parse(req.body);
      const prompt = [
        "Extract travel booking details from the provided confirmation text.",
        "Return ONLY valid JSON with keys: summary, warnings, documents, budgetItems.",
        "warnings must be an array of strings.",
        "documents must be an array of objects with keys docType, label, optional referenceNumber, optional notes.",
        'Allowed docType values: "flight", "hotel", "insurance", "transport", "rental_car", "other".',
        "budgetItems must be an array of objects with keys category, description, amount, currency.",
        'Allowed category values: "food", "transport", "metro", "rental_car", "rideshare", "lodging", "activities", "shopping", "other".',
        "amount must be an integer in cents. If no price is present, omit the budget item.",
        `Use ${getLanguageName(getUserLanguage(req.user!))} for summary and warnings.`,
        `Trip destination: ${trip.destination}.`,
        `Trip dates: ${trip.startDate ? trip.startDate.toISOString().slice(0, 10) : "unknown"} to ${trip.endDate ? trip.endDate.toISOString().slice(0, 10) : "unknown"}.`,
        `Traveler home currency: ${req.user!.homeCurrency ?? "USD"}.`,
        "If details are uncertain, include a warning instead of inventing them.",
        `Confirmation text:\n${rawText}`,
      ].join("\n");

      const content = await aiChat([{ role: "user", content: prompt }], true);
      if (!content) {
        throw new Error("No response from AI");
      }

      const parsed = api.bookingImport.preview.responses[200].parse(JSON.parse(content));
      res.json({
        ...parsed,
        budgetItems: parsed.budgetItems.map((item) => ({
          ...item,
          currency: normalizeCurrencyCode(item.currency),
        })),
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      return handleAiError(res, "Failed to preview booking import", err);
    }
  });

  app.post(api.bookingImport.apply.path, requireAuth, async (req, res) => {
    try {
      const tripId = Number(req.params.tripId);
      const trip = await getOwnedTripOr404(req, res, tripId);
      if (!trip) return;

      const payload = api.bookingImport.apply.input.parse(req.body);
      let createdDocuments = 0;
      let createdBudgetItems = 0;

      for (const doc of payload.documents) {
        await storage.createTravelDocument({
          tripId,
          docType: doc.docType,
          label: doc.label,
          referenceNumber: doc.referenceNumber ?? null,
          notes: doc.notes ?? null,
        });
        createdDocuments += 1;
      }

      for (const item of payload.budgetItems) {
        await storage.createBudgetItem({
          tripId,
          category: item.category,
          description: item.description,
          amount: item.amount,
          currency: normalizeCurrencyCode(item.currency),
        });
        createdBudgetItems += 1;
      }

      res.json({ createdDocuments, createdBudgetItems });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      throw err;
    }
  });

  app.post("/api/subscription/mock-update", requireAuth, async (req, res) => {
    const actorEntitlements = await getEntitlements(storage, req.user!);
    if (!actorEntitlements.hasProAccess && !req.user!.proAccess) {
      return res.status(403).json({ message: "Manual subscription updates are reserved for paid/admin testing accounts." });
    }

    const payload = z.object({
      username: z.string().min(1),
      status: z.enum(["inactive", "active", "trialing", "past_due", "canceled", "expired"]),
      platform: z.enum(["ios", "android", "manual"]).optional(),
      productId: z.string().optional(),
      expiresAt: z.string().datetime().nullable().optional(),
      originalTransactionId: z.string().optional(),
      isSandbox: z.boolean().optional(),
    }).parse(req.body);

    const target = await storage.getUserByUsername(payload.username.trim());
    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }

    const subscription = await applySubscriptionEventUpdate({
      user: target,
      status: payload.status,
      platform: payload.platform ?? "manual",
      productId: payload.productId ?? ANNAI_PRO_MONTHLY_PRODUCT_ID,
      transactionId: payload.originalTransactionId ?? `manual:${target.id}:${Date.now()}`,
      expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
      isSandbox: payload.isSandbox ?? true,
    });
    const entitlements = await getEntitlements(storage, target);
    res.json({ subscription, entitlements });
  });

  app.post("/api/subscription/webhooks/apple", async (req, res) => {
    if (!requireWebhookSecret(req, res)) return;

    const payload = z.object({ signedPayload: z.string().min(1), username: z.string().optional() }).parse(req.body);
    let webhookEventId: number | null = null;

    try {
      const { notification, transaction } = await verifyAppleNotificationPayload(payload.signedPayload);
      const notificationType = typeof notification.notificationType === "string" ? notification.notificationType : undefined;
      const notificationUuid =
        typeof notification.notificationUUID === "string" ? notification.notificationUUID : undefined;
      const transactionId =
        typeof transaction?.transactionId === "string"
          ? transaction.transactionId
          : typeof transaction?.originalTransactionId === "string"
            ? transaction.originalTransactionId
            : `apple:${Date.now()}`;
      const originalTransactionId =
        typeof transaction?.originalTransactionId === "string" ? transaction.originalTransactionId : transactionId;
      const productId =
        typeof transaction?.productId === "string" ? transaction.productId : ANNAI_PRO_MONTHLY_PRODUCT_ID;
      const appAccountToken =
        typeof transaction?.appAccountToken === "string" ? transaction.appAccountToken : undefined;
      const expiresAtRaw =
        typeof transaction?.expiresDate === "string" ? transaction.expiresDate : undefined;
      const expiresAt = expiresAtRaw && !Number.isNaN(Date.parse(expiresAtRaw)) ? new Date(expiresAtRaw) : null;
      const status = mapAppleNotificationToStatus(notificationType, expiresAt) as "inactive" | "active" | "trialing" | "past_due" | "canceled" | "expired";
      const eventKey = notificationUuid ? `apple:${notificationUuid}` : `apple:${transactionId}:${notificationType ?? "unknown"}`;

      const reservation = await storage.reserveSubscriptionWebhookEvent({
        platform: "ios",
        eventKey,
        eventType: notificationType ?? null,
        payloadHash: sha256(payload.signedPayload),
      });
      webhookEventId = reservation.event.id;
      if (reservation.isDuplicate) {
        return res.status(202).json({ ok: true, duplicate: true, platform: "ios", eventKey });
      }

      let targetUser = await resolveUserByBillingIdentifier(appAccountToken);
      if (!targetUser && originalTransactionId) {
        const existing = await storage.getSubscriptionByOriginalTransactionId(originalTransactionId);
        if (existing) {
          targetUser = await storage.getUser(existing.userId);
        }
      }
      if (!targetUser && payload.username) {
        targetUser = await storage.getUserByUsername(payload.username);
      }
      if (!targetUser) {
        await storage.completeSubscriptionWebhookEvent(reservation.event.id, "failed", "Could not map Apple notification to a user");
        return res.status(404).json({ message: "Could not map Apple notification to a user" });
      }

      const subscription = await applySubscriptionEventUpdate({
        user: targetUser,
        status,
        platform: "ios",
        productId,
        transactionId: originalTransactionId,
        expiresAt,
        isSandbox: String(notification.environment || "").toLowerCase() === "sandbox",
      });
      await storage.completeSubscriptionWebhookEvent(reservation.event.id, "processed");
      return res.status(202).json({ ok: true, platform: "ios", subscriptionId: subscription.id });
    } catch (error) {
      if (webhookEventId) {
        await storage.completeSubscriptionWebhookEvent(webhookEventId, "failed", String(error));
      }
      return res.status(400).json({ message: `Apple webhook verification failed: ${String(error)}` });
    }
  });

  app.post("/api/subscription/webhooks/google", async (req, res) => {
    if (!requireWebhookSecret(req, res)) return;

    const payload = z.object({
      message: z.object({
        data: z.string().min(1),
        messageId: z.string().optional(),
        publishTime: z.string().optional(),
      }),
      subscription: z.string().optional(),
      username: z.string().optional(),
    }).parse(req.body);

    let webhookEventId: number | null = null;

    try {
      const authHeader = req.header("authorization");
      const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : undefined;
      if (!bearerToken) {
        return res.status(401).json({ message: "Missing Bearer token for Google webhook" });
      }

      await verifyGooglePubSubOidcToken(
        bearerToken,
        process.env.GOOGLE_PUBSUB_AUDIENCE,
        process.env.GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL,
      );

      const decoded = decodeGooglePubSubMessageData(payload.message.data);
      const notification = z.object({
        packageName: z.string().min(1),
        subscriptionNotification: z.object({
          subscriptionId: z.string().min(1),
          purchaseToken: z.string().min(1),
          notificationType: z.number().optional(),
        }).optional(),
        testNotification: z.record(z.unknown()).optional(),
      }).parse(decoded);

      const eventKey = payload.message.messageId
        ? `google:${payload.message.messageId}`
        : `google:${sha256(payload.message.data)}`;
      const reservation = await storage.reserveSubscriptionWebhookEvent({
        platform: "android",
        eventKey,
        eventType: notification.subscriptionNotification ? "subscription_notification" : "other_notification",
        payloadHash: sha256(payload.message.data),
      });
      webhookEventId = reservation.event.id;
      if (reservation.isDuplicate) {
        return res.status(202).json({ ok: true, duplicate: true, platform: "android", eventKey });
      }

      if (notification.testNotification || !notification.subscriptionNotification) {
        await storage.completeSubscriptionWebhookEvent(reservation.event.id, "processed");
        return res.status(202).json({ ok: true, platform: "android", type: "non_subscription_event" });
      }

      const snapshot = await fetchGooglePlaySubscriptionSnapshot({
        packageName: process.env.GOOGLE_PLAY_PACKAGE_NAME || notification.packageName,
        purchaseToken: notification.subscriptionNotification.purchaseToken,
        subscriptionId: notification.subscriptionNotification.subscriptionId,
      });

      let targetUser = await resolveUserByBillingIdentifier(snapshot.accountIdentifier ?? undefined);
      if (!targetUser) {
        const existing = await storage.getSubscriptionByOriginalTransactionId(snapshot.originalTransactionId);
        if (existing) {
          targetUser = await storage.getUser(existing.userId);
        }
      }
      if (!targetUser && payload.username) {
        targetUser = await storage.getUserByUsername(payload.username);
      }
      if (!targetUser) {
        await storage.completeSubscriptionWebhookEvent(reservation.event.id, "failed", "Could not map Google notification to a user");
        return res.status(404).json({ message: "Could not map Google notification to a user" });
      }

      const subscription = await applySubscriptionEventUpdate({
        user: targetUser,
        status: snapshot.mappedStatus,
        platform: "android",
        productId: snapshot.productId,
        transactionId: snapshot.originalTransactionId,
        expiresAt: snapshot.expiresAt ? new Date(snapshot.expiresAt) : null,
        isSandbox: snapshot.isSandbox,
      });
      await storage.completeSubscriptionWebhookEvent(reservation.event.id, "processed");
      return res.status(202).json({ ok: true, platform: "android", subscriptionId: subscription.id });
    } catch (error) {
      if (webhookEventId) {
        await storage.completeSubscriptionWebhookEvent(webhookEventId, "failed", String(error));
      }
      return res.status(400).json({ message: `Google webhook verification failed: ${String(error)}` });
    }
  });

  return httpServer;
}
