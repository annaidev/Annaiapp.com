import type { Express, Request, Response } from "express";
import type { Server } from "http";
import { createHash, randomBytes, createHmac, randomUUID } from "crypto";
import { storage } from "./storage";
import { requireAuth } from "./auth";
import { createRateLimit } from "./rateLimit";
import { api } from "@shared/routes";
import { z } from "zod";
import OpenAI from "openai";
import {
  buildAiCacheKey,
  buildDestinationOnlyCacheInput,
  buildPackingListCacheInput,
  buildSafetyAdviceCacheInput,
  buildTripPlanCacheInput,
  buildWeatherCacheInput,
  getCachedAiPayload,
  saveCachedAiPayload,
  type AiCacheFeature,
} from "./aiCache";
import { getEntitlements, getModulesConfig, isSubscriptionActive, requireFeature } from "./entitlements";
import {
  decodeGooglePubSubMessageData,
  fetchGooglePlaySubscriptionSnapshot,
  verifyAppleNotificationPayload,
  verifyAppleSignedTransactionInfo,
  verifyGooglePubSubOidcToken,
} from "./subscription-verification";
import { resolveCustomsEntry } from "./customs-registry";

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
const isProduction = process.env.NODE_ENV === "production";

const couponRedeemRateLimit = createRateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  message: "Too many coupon redemption attempts. Please try again later.",
  keyGenerator: (req) => `coupon:${req.ip}:${req.user?.id ?? "anon"}`,
});

const aiRouteRateLimit = createRateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: "Too many AI requests. Please wait a few minutes and try again.",
  keyGenerator: (req) => `ai:${req.ip}:${req.user?.id ?? "anon"}`,
});

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
    citizenship: user!.citizenship ?? null,
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

async function requireOwnerAccess(req: Request, res: Response): Promise<boolean> {
  const configuredOwnerUsername = process.env.OWNER_USERNAME?.trim().toLowerCase();
  if (!configuredOwnerUsername) {
    res.status(503).json({ message: "Owner operations are not configured." });
    return false;
  }

  const actorUsername = req.user?.username?.trim().toLowerCase();
  if (actorUsername !== configuredOwnerUsername) {
    res.status(403).json({ message: "Owner authorization required." });
    return false;
  }

  const configuredOwnerSecret = process.env.OWNER_API_SECRET?.trim();
  if (configuredOwnerSecret) {
    const providedSecret = req.header("x-owner-secret");
    if (!providedSecret || providedSecret !== configuredOwnerSecret) {
      res.status(401).json({ message: "Owner secret required." });
      return false;
    }
  }

  return true;
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
  try {
    if (error instanceof z.ZodError) {
      console.error(fallbackMessage, {
        type: "ZodError",
        issueCount: error.issues.length,
        firstIssue: error.issues[0]?.message ?? "unknown",
      });
    } else if (error instanceof Error) {
      console.error(fallbackMessage, {
        type: error.name,
        message: error.message,
      });
    } else {
      console.error(fallbackMessage, { type: typeof error });
    }
  } catch (logError) {
    console.error(fallbackMessage, String(error), String(logError));
  }
  if (error instanceof AiUnavailableError) {
    return res.status(503).json({ message: "AI features are temporarily unavailable." });
  }
  return res.status(500).json({ message: fallbackMessage });
}

function normalizeCurrencyCode(input?: string | null) {
  return (input ?? "USD").trim().toUpperCase().slice(0, 3) || "USD";
}

function buildStaticCustomsSummary(entry: {
  officialName: string;
  deadline: string;
  officialSummaryFacts: string[];
}): string {
  const prepareItems = entry.officialSummaryFacts
    .map((fact) => fact.trim())
    .filter(Boolean)
    .map((fact) => `- ${fact}`)
    .join("\n");

  return [
    "## What it is",
    `${entry.officialName} is the verified official entry or declaration option Annai found for this trip context.`,
    "",
    "## When to do it",
    entry.deadline,
    "",
    "## What to prepare",
    prepareItems || "- Check the official site for the latest requirements.",
    "",
    "## Important caution",
    "Always confirm the latest eligibility, deadlines, and airport or border instructions on the official government website before departure.",
  ].join("\n");
}

function getTripDayCount(trip: Awaited<ReturnType<typeof storage.getTrip>>) {
  if (!trip?.startDate || !trip?.endDate) return 14;
  const diffMs = trip.endDate.getTime() - trip.startDate.getTime();
  return Math.max(1, Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1);
}

function buildGoogleSearchUrl(query: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function buildGoogleMapsUrl(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function normalizeAssistantCategory(input?: string | null): "activity" | "meal" | "transport" | "sightseeing" {
  const normalized = (input ?? "").trim().toLowerCase();

  if (
    normalized.includes("meal") ||
    normalized.includes("food") ||
    normalized.includes("restaurant") ||
    normalized.includes("cafe") ||
    normalized.includes("caf\u00e9") ||
    normalized.includes("bar") ||
    normalized.includes("brunch") ||
    normalized.includes("lunch") ||
    normalized.includes("dinner")
  ) {
    return "meal";
  }

  if (
    normalized.includes("transport") ||
    normalized.includes("train") ||
    normalized.includes("metro") ||
    normalized.includes("bus") ||
    normalized.includes("airport") ||
    normalized.includes("station") ||
    normalized.includes("taxi") ||
    normalized.includes("rideshare")
  ) {
    return "transport";
  }

  if (
    normalized.includes("sight") ||
    normalized.includes("museum") ||
    normalized.includes("landmark") ||
    normalized.includes("viewpoint") ||
    normalized.includes("monument") ||
    normalized.includes("tour")
  ) {
    return "sightseeing";
  }

  return "activity";
}

function normalizeAssistantUrl(input?: string | null): string | null {
  const value = input?.trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function normalizeAssistantDayNumber(input: unknown, totalDays: number): number | null {
  if (typeof input === "number" && Number.isFinite(input)) {
    const value = Math.trunc(input);
    return value >= 1 && value <= totalDays ? value : null;
  }
  if (typeof input === "string") {
    const trimmed = input.trim().toLowerCase();
    const numeric = trimmed.match(/\d+/);
    if (numeric) {
      const value = Number.parseInt(numeric[0], 10);
      return Number.isFinite(value) && value >= 1 && value <= totalDays ? value : null;
    }
    const wordMap: Record<string, number> = {
      first: 1,
      second: 2,
      third: 3,
      fourth: 4,
      fifth: 5,
      sixth: 6,
      seventh: 7,
      eighth: 8,
      ninth: 9,
      tenth: 10,
    };
    const found = Object.entries(wordMap).find(([key]) => trimmed.includes(key))?.[1] ?? null;
    return found && found <= totalDays ? found : null;
  }
  return null;
}

function normalizeAssistantTimeSlot(input?: string | null): string | null {
  const raw = (input ?? "").trim().toLowerCase();
  if (!raw) return null;
  const normalized = raw.replace(/[.,]/g, " ");

  const labelMap: Record<string, string> = {
    breakfast: "09:00",
    brunch: "10:30",
    lunch: "12:00",
    noon: "12:00",
    afternoon: "15:00",
    dinner: "19:00",
    evening: "20:00",
    night: "20:00",
  };
  for (const [label, value] of Object.entries(labelMap)) {
    if (normalized.includes(label)) {
      return value;
    }
  }

  const isoLike = normalized.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (isoLike) {
    const hour = Number.parseInt(isoLike[1], 10);
    const minute = Number.parseInt(isoLike[2], 10);
    return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
  }

  const ampm = normalized.match(/\b(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/);
  if (ampm) {
    let hour = Number.parseInt(ampm[1], 10);
    const minute = Number.parseInt(ampm[2] ?? "0", 10);
    const meridiem = ampm[3];
    if (hour >= 1 && hour <= 12 && minute >= 0 && minute <= 59) {
      if (meridiem === "pm" && hour !== 12) hour += 12;
      if (meridiem === "am" && hour === 12) hour = 0;
      return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
    }
  }

  const compact = normalized.match(/\b(\d{3,4})\b/);
  if (compact) {
    const value = compact[1];
    const hour = Number.parseInt(value.length === 3 ? value.slice(0, 1) : value.slice(0, 2), 10);
    const minute = Number.parseInt(value.slice(-2), 10);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
    }
  }

  return null;
}

function pickAssistantIntro(answer: string, destination: string): string {
  const blocks = answer
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  for (const block of blocks) {
    const lowered = block.toLowerCase();
    if (lowered.includes("would you like me to add")) continue;
    if (/(googlesearchurl|googlemapsurl)/i.test(block)) continue;
    if (/^\d+\.\s/.test(block)) continue;
    return block;
  }

  return `Here are some recommended spots in ${destination}:`;
}

function buildAssistantSuggestionsAnswer(
  destination: string,
  baseAnswer: string,
  suggestions: Array<{
    title: string;
    summary: string;
    googleSearchUrl: string;
    googleMapsUrl: string;
  }>,
): string {
  const intro = pickAssistantIntro(baseAnswer, destination);
  const lines: string[] = [intro, ""];

  suggestions.forEach((suggestion, index) => {
    lines.push(`${index + 1}. **${suggestion.title}**`);
    if (suggestion.summary.trim()) {
      lines.push(`   ${suggestion.summary.trim()}`);
    }
    lines.push(
      `   [Google Search](${suggestion.googleSearchUrl}) | [Google Maps](${suggestion.googleMapsUrl})`,
    );
    lines.push("");
  });

  lines.push("Would you like me to add any of these to your itinerary?");
  return lines.join("\n").trim();
}

function isItineraryAddRequest(question: string): boolean {
  const normalized = question.toLowerCase();
  return (
    /(add|include|put|save)\b/.test(normalized) &&
    /\bitinerary\b/.test(normalized)
  );
}

function answerClaimsItineraryAdd(answer: string): boolean {
  const normalized = answer.toLowerCase();
  return (
    /\bi('| a)m\b.*\badd(ed|ing)\b/.test(normalized) ||
    /\bi have\b.*\badd(ed|ing)\b/.test(normalized) ||
    /\badded\b.*\bto your itinerary\b/.test(normalized)
  );
}

function summarizeItineraryContext(
  items: Array<{ dayNumber: number; timeSlot: string | null; title: string }>,
): string {
  if (!items.length) return "none";
  return items
    .slice(0, 20)
    .map((item) => `Day ${item.dayNumber} ${item.timeSlot ?? "--:--"} - ${item.title}`)
    .join(" | ");
}

function isDayTimeFollowUp(question: string): boolean {
  const normalized = question.toLowerCase();
  return (
    /\bday\s*\d+\b/.test(normalized) ||
    /\b\d{1,2}(:\d{2})?\s*(am|pm)\b/.test(normalized) ||
    /\b([01]?\d|2[0-3]):[0-5]\d\b/.test(normalized) ||
    /\bat\s*\d{3,4}\b/.test(normalized) ||
    /\b(breakfast|brunch|lunch|dinner|noon|evening|afternoon)\b/.test(normalized)
  );
}

function shouldTreatAsAddRequest(
  question: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): boolean {
  if (isItineraryAddRequest(question)) return true;
  const normalized = question.toLowerCase();
  const recentAssistantAskedToAdd = messages
    .slice(-6)
    .some(
      (message) =>
        message.role === "assistant" &&
        /would you like me to add any of these to your itinerary/i.test(message.content),
    );
  if (recentAssistantAskedToAdd && /(add|yes|please|that|number|option|spot|place|#\d+)/.test(normalized)) {
    return true;
  }
  if (!isDayTimeFollowUp(question)) return false;
  return messages
    .slice(-8)
    .some(
      (message) =>
        message.role === "assistant" &&
        /need a specific day and time/i.test(message.content),
    );
}

function inferSuggestionFromConversation(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  suggestions: Array<{ title: string; summary: string; category: "activity" | "meal" | "transport" | "sightseeing"; googleSearchUrl?: string | null; googleMapsUrl?: string | null }>,
) {
  const recentUserMessages = messages
    .slice()
    .reverse()
    .filter((message) => message.role === "user")
    .map((message) => message.content.toLowerCase());

  for (const userText of recentUserMessages) {
    const indexFromPhrase = userText.match(/\b(?:number|option|spot|place|item)\s*#?\s*(\d{1,2})\b/);
    if (indexFromPhrase) {
      const index = Number.parseInt(indexFromPhrase[1], 10);
      if (Number.isFinite(index) && index >= 1 && index <= suggestions.length) {
        return suggestions[index - 1];
      }
    }

    const indexFromHash = userText.match(/#\s*(\d{1,2})\b/);
    if (indexFromHash) {
      const index = Number.parseInt(indexFromHash[1], 10);
      if (Number.isFinite(index) && index >= 1 && index <= suggestions.length) {
        return suggestions[index - 1];
      }
    }

    const ordinalMap: Record<string, number> = {
      first: 1,
      second: 2,
      third: 3,
      fourth: 4,
      fifth: 5,
      sixth: 6,
      seventh: 7,
      eighth: 8,
      ninth: 9,
      tenth: 10,
    };
    for (const [word, index] of Object.entries(ordinalMap)) {
      if (userText.includes(word) && /(option|spot|place|item|one)/.test(userText) && index <= suggestions.length) {
        return suggestions[index - 1];
      }
    }

    const matched = suggestions.find((suggestion) =>
      userText.includes(suggestion.title.toLowerCase()),
    );
    if (matched) return matched;
  }

  return null;
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

async function ensureAppleAppAccountToken(user: NonNullable<Express.User>): Promise<string> {
  if (user.appleAppAccountToken) {
    return user.appleAppAccountToken;
  }

  const appleAppAccountToken = randomUUID();
  const updatedUser = await storage.updateUser(user.id, { appleAppAccountToken });
  if (updatedUser?.appleAppAccountToken) {
    user.appleAppAccountToken = updatedUser.appleAppAccountToken;
  } else {
    user.appleAppAccountToken = appleAppAccountToken;
  }
  return user.appleAppAccountToken;
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

  const byAppleToken = await storage.getUserByAppleAppAccountToken(normalized);
  if (byAppleToken) return byAppleToken;
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

function toSubscriptionResponse(subscription: Awaited<ReturnType<typeof storage.getSubscription>>) {
  if (!subscription) return null;
  return {
    status: subscription.status,
    platform: subscription.platform ?? null,
    productId: subscription.productId ?? null,
    expiresAt: subscription.expiresAt ? subscription.expiresAt.toISOString() : null,
    isActive: isSubscriptionActive(subscription.status, subscription.expiresAt),
    isSandbox: subscription.isSandbox,
  };
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
        citizenship: input.citizenship === undefined ? req.user!.citizenship ?? null : input.citizenship?.trim() || null,
      });

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      req.user!.preferredLanguage = updatedUser.preferredLanguage;
      req.user!.homeCurrency = updatedUser.homeCurrency;
      req.user!.citizenship = updatedUser.citizenship;
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

  app.post(api.coupons.redeem.path, requireAuth, couponRedeemRateLimit, async (req, res) => {
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
      subscription: toSubscriptionResponse(subscription),
      entitlements,
    });
  });

  app.get(api.subscription.purchaseContext.path, requireAuth, async (req, res) => {
    const annaiUserId = await ensureAnnaiUserId(req.user!);
    const appleAppAccountToken = await ensureAppleAppAccountToken(req.user!);
    res.json({
      productId: ANNAI_PRO_MONTHLY_PRODUCT_ID,
      apple: {
        appAccountToken: appleAppAccountToken,
        productId: ANNAI_PRO_MONTHLY_PRODUCT_ID,
      },
      google: {
        obfuscatedExternalAccountId: annaiUserId,
        obfuscatedExternalProfileId: annaiUserId,
        productId: ANNAI_PRO_MONTHLY_PRODUCT_ID,
      },
    });
  });

  app.post(api.subscription.syncApple.path, requireAuth, async (req, res) => {
    try {
      const { signedTransactionInfo } = api.subscription.syncApple.input.parse(req.body);
      const transaction = await verifyAppleSignedTransactionInfo(signedTransactionInfo);
      const expectedToken = await ensureAppleAppAccountToken(req.user!);
      const appAccountToken =
        typeof transaction.appAccountToken === "string" ? transaction.appAccountToken : undefined;

      if (appAccountToken && appAccountToken !== expectedToken) {
        return res.status(403).json({ message: "This Apple purchase does not belong to the current user." });
      }

      const productId =
        typeof transaction.productId === "string" ? transaction.productId : ANNAI_PRO_MONTHLY_PRODUCT_ID;
      const originalTransactionId =
        typeof transaction.originalTransactionId === "string"
          ? transaction.originalTransactionId
          : typeof transaction.transactionId === "string"
            ? transaction.transactionId
            : `apple:${req.user!.id}:${Date.now()}`;
      const expiresAtRaw =
        typeof transaction.expiresDate === "string"
          ? transaction.expiresDate
          : typeof transaction.expiresDate === "number"
            ? new Date(transaction.expiresDate).toISOString()
            : null;
      const expiresAt = expiresAtRaw && !Number.isNaN(Date.parse(expiresAtRaw)) ? new Date(expiresAtRaw) : null;
      const environment = typeof transaction.environment === "string" ? transaction.environment.toLowerCase() : "production";
      const status = expiresAt && expiresAt.getTime() <= Date.now() ? "expired" : "active";

      const subscription = await applySubscriptionEventUpdate({
        user: req.user!,
        status,
        platform: "ios",
        productId,
        transactionId: originalTransactionId,
        expiresAt,
        isSandbox: environment === "sandbox",
      });
      const entitlements = await getEntitlements(storage, req.user!);
      return res.json({
        subscription: toSubscriptionResponse(subscription),
        entitlements,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      return res.status(400).json({ message: `Unable to verify Apple purchase: ${String(err)}` });
    }
  });

  app.post(api.subscription.syncGoogle.path, requireAuth, async (req, res) => {
    try {
      const { purchaseToken, productId } = api.subscription.syncGoogle.input.parse(req.body);
      const annaiUserId = await ensureAnnaiUserId(req.user!);
      const snapshot = await fetchGooglePlaySubscriptionSnapshot({
        packageName: process.env.GOOGLE_PLAY_PACKAGE_NAME || "com.annai.travelplanner",
        purchaseToken,
        subscriptionId: productId,
      });

      if (snapshot.accountIdentifier && snapshot.accountIdentifier !== annaiUserId) {
        return res.status(403).json({ message: "This Google Play purchase does not belong to the current user." });
      }

      const subscription = await applySubscriptionEventUpdate({
        user: req.user!,
        status: snapshot.mappedStatus,
        platform: "android",
        productId: snapshot.productId,
        transactionId: snapshot.originalTransactionId,
        expiresAt: snapshot.expiresAt ? new Date(snapshot.expiresAt) : null,
        isSandbox: snapshot.isSandbox,
      });
      const entitlements = await getEntitlements(storage, req.user!);
      return res.json({
        subscription: toSubscriptionResponse(subscription),
        entitlements,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      return res.status(400).json({ message: `Unable to verify Google Play purchase: ${String(err)}` });
    }
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

  app.patch(api.trips.updateBudgetTarget.path, requireAuth, async (req, res) => {
    try {
      const trip = await storage.getTrip(Number(req.params.id));
      if (!trip || trip.userId !== req.user!.id) {
        return res.status(404).json({ message: "Trip not found" });
      }

      const input = api.trips.updateBudgetTarget.input.parse(req.body);
      const updated = await storage.updateTrip(Number(req.params.id), {
        budgetTargetCents: input.budgetTargetCents,
      });
      res.json(updated);
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

  app.delete(api.trips.delete.path, requireAuth, async (req, res) => {
    const trip = await storage.getTrip(Number(req.params.id));
    if (!trip || trip.userId !== req.user!.id) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    await storage.deleteTrip(Number(req.params.id));
    res.status(204).send();
  });

  app.get(api.packingLists.listByTrip.path, requireAuth, async (req, res) => {
    const trip = await getOwnedTripOr404(req, res, Number(req.params.tripId));
    if (!trip) return;
    const items = await storage.getPackingListsByTrip(Number(req.params.tripId));
    res.json(items);
  });

  app.post(api.packingLists.create.path, requireAuth, async (req, res) => {
    try {
      const trip = await getOwnedTripOr404(req, res, Number(req.params.tripId));
      if (!trip) return;
      const input = api.packingLists.create.input.parse(req.body);
      const item = await storage.createPackingList({
        ...input,
        tripId: trip.id,
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
      const existingItem = await storage.getPackingList(Number(req.params.id));
      if (!existingItem) {
        return res.status(404).json({ message: "Packing list item not found" });
      }
      const trip = await getOwnedTripOr404(req, res, existingItem.tripId);
      if (!trip) return;

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
    const existingItem = await storage.getPackingList(Number(req.params.id));
    if (!existingItem) {
      return res.status(404).json({ message: "Packing list item not found" });
    }
    const trip = await getOwnedTripOr404(req, res, existingItem.tripId);
    if (!trip) return;
    await storage.deletePackingList(Number(req.params.id));
    res.status(204).send();
  });

  app.post(api.ai.generatePackingList.path, requireAuth, aiRouteRateLimit, async (req, res) => {
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

  app.post(api.ai.tripPlan.path, requireAuth, aiRouteRateLimit, async (req, res) => {
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

  app.post(api.ai.culturalTips.path, requireAuth, aiRouteRateLimit, async (req, res) => {
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

  app.post(api.ai.safetyAdvice.path, requireAuth, aiRouteRateLimit, async (req, res) => {
    try {
      const entitlements = await getEntitlements(storage, req.user!);
      if (!requireFeature(res, entitlements, "ai_safety")) return;
      const { destination, citizenship } = api.ai.safetyAdvice.input.parse(req.body);
      const effectiveCitizenship = citizenship?.trim() || req.user!.citizenship || undefined;
      const cachePayload = buildSafetyAdviceCacheInput({
        destination,
        citizenship: effectiveCitizenship,
      });

      await respondWithCachedAi(res, "safety-advice", cachePayload, async () => {
        const raw = await aiChat([
          { role: "system", content: `You are a travel safety and diplomatic expert. Provide concise advice on areas to avoid, common scams, and general safety. ALSO, if provided with a citizenship, find and include the location and contact information for the nearest embassy or consulate of that country in the destination. Format with clear markdown headings. ${getAiLanguageInstruction(req.user!)}` },
          { role: "user", content: `What are the safety concerns and embassy information for a ${effectiveCitizenship || "traveler"} visiting ${destination}?` }
        ]);
        const advice = stripThinkTags(raw || "No safety advice available.");
        return { advice };
      });
    } catch (error) {
      return handleAiError(res, "Failed to fetch safety advice", error);
    }
  });

  app.post(api.ai.safetyMap.path, requireAuth, aiRouteRateLimit, async (req, res) => {
    try {
      const entitlements = await getEntitlements(storage, req.user!);
      if (!requireFeature(res, entitlements, "google_maps")) return;
      const { destination } = api.ai.safetyMap.input.parse(req.body);

      const content = await aiChat([
        {
          role: "system",
          content: `You are a travel safety data analyst. Return ONLY valid JSON with this exact shape:
{
  "center": { "lat": number, "lng": number },
  "summary": string,
  "zones": [
    {
      "name": string,
      "lat": number,
      "lng": number,
      "radius": number,
      "level": "safe" | "caution" | "avoid",
      "description": string,
      "commonIncidents": string[],
      "travelerNote": string,
      "timingNote": string
    }
  ]
}

Rules:
- Return 6 zones total.
- Include a realistic mix of safe, caution, and avoid areas.
- Use real neighborhood or district names when possible.
- Use accurate coordinates near the named area.
- radius must be between 250 and 1500 meters.
- description must be one concise sentence explaining the safety context.
- commonIncidents must contain 1 to 3 short plain-language items, such as pickpocketing, nightlife disturbances, car break-ins, aggressive scams, or low concern.
- travelerNote must be a specific practical note for visitors.
- timingNote must say when the concern is usually highest or lowest, such as "Late night weekends" or "Generally calm during the day".
- If a place is broadly safe, say that clearly instead of inventing crime.
- Use ${getLanguageName(getUserLanguage(req.user!))} for all text fields.`
        },
        { role: "user", content: `Safety zone data for ${destination}.` }
      ], true);
      if (!content) throw new Error("No response from AI");

      res.json(api.ai.safetyMap.responses[200].parse(JSON.parse(content)));
    } catch (error) {
      return handleAiError(res, "Failed to generate safety map data", error);
    }
  });

  app.get(api.budgetItems.listByTrip.path, requireAuth, async (req, res) => {
    const trip = await getOwnedTripOr404(req, res, Number(req.params.tripId));
    if (!trip) return;
    const items = await storage.getBudgetItemsByTrip(Number(req.params.tripId));
    res.json(items);
  });
  app.post(api.budgetItems.create.path, requireAuth, async (req, res) => {
    try {
      const trip = await getOwnedTripOr404(req, res, Number(req.params.tripId));
      if (!trip) return;
      const input = api.budgetItems.create.input.parse(req.body);
      const item = await storage.createBudgetItem({ ...input, tripId: trip.id });
      res.status(201).json(item);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      throw err;
    }
  });
  app.put(api.budgetItems.update.path, requireAuth, async (req, res) => {
    try {
      const existingItem = await storage.getBudgetItem(Number(req.params.id));
      if (!existingItem) {
        return res.status(404).json({ message: "Budget item not found" });
      }
      const trip = await getOwnedTripOr404(req, res, existingItem.tripId);
      if (!trip) return;

      const input = api.budgetItems.update.input.parse(req.body);
      const item = await storage.updateBudgetItem(Number(req.params.id), input);
      res.json(item);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });
  app.delete(api.budgetItems.delete.path, requireAuth, async (req, res) => {
    const existingItem = await storage.getBudgetItem(Number(req.params.id));
    if (!existingItem) {
      return res.status(404).json({ message: "Budget item not found" });
    }
    const trip = await getOwnedTripOr404(req, res, existingItem.tripId);
    if (!trip) return;
    await storage.deleteBudgetItem(Number(req.params.id));
    res.status(204).send();
  });

  app.get(api.travelDocuments.listByTrip.path, requireAuth, async (req, res) => {
    const trip = await getOwnedTripOr404(req, res, Number(req.params.tripId));
    if (!trip) return;
    const docs = await storage.getTravelDocumentsByTrip(Number(req.params.tripId));
    res.json(docs);
  });
  app.post(api.travelDocuments.create.path, requireAuth, async (req, res) => {
    try {
      const trip = await getOwnedTripOr404(req, res, Number(req.params.tripId));
      if (!trip) return;
      const input = api.travelDocuments.create.input.parse(req.body);
      const doc = await storage.createTravelDocument({ ...input, tripId: trip.id });
      res.status(201).json(doc);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      throw err;
    }
  });
  app.put(api.travelDocuments.update.path, requireAuth, async (req, res) => {
    try {
      const existingDoc = await storage.getTravelDocument(Number(req.params.id));
      if (!existingDoc) {
        return res.status(404).json({ message: "Travel document not found" });
      }
      const trip = await getOwnedTripOr404(req, res, existingDoc.tripId);
      if (!trip) return;

      const input = api.travelDocuments.update.input.parse(req.body);
      const doc = await storage.updateTravelDocument(Number(req.params.id), input);
      res.json(doc);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });
  app.delete(api.travelDocuments.delete.path, requireAuth, async (req, res) => {
    const existingDoc = await storage.getTravelDocument(Number(req.params.id));
    if (!existingDoc) {
      return res.status(404).json({ message: "Travel document not found" });
    }
    const trip = await getOwnedTripOr404(req, res, existingDoc.tripId);
    if (!trip) return;
    await storage.deleteTravelDocument(Number(req.params.id));
    res.status(204).send();
  });

  app.get(api.itineraryItems.listByTrip.path, requireAuth, async (req, res) => {
    const trip = await getOwnedTripOr404(req, res, Number(req.params.tripId));
    if (!trip) return;
    const items = await storage.getItineraryItemsByTrip(Number(req.params.tripId));
    res.json(items);
  });
  app.post(api.itineraryItems.create.path, requireAuth, async (req, res) => {
    try {
      const trip = await getOwnedTripOr404(req, res, Number(req.params.tripId));
      if (!trip) return;
      const input = api.itineraryItems.create.input.parse(req.body);
      const item = await storage.createItineraryItem({ ...input, tripId: trip.id });
      res.status(201).json(item);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      throw err;
    }
  });
  app.put(api.itineraryItems.update.path, requireAuth, async (req, res) => {
    try {
      const existingItem = await storage.getItineraryItem(Number(req.params.id));
      if (!existingItem) {
        return res.status(404).json({ message: "Itinerary item not found" });
      }
      const trip = await getOwnedTripOr404(req, res, existingItem.tripId);
      if (!trip) return;

      const input = api.itineraryItems.update.input.parse(req.body);
      const item = await storage.updateItineraryItem(Number(req.params.id), input);
      res.json(item);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });
  app.delete(api.itineraryItems.delete.path, requireAuth, async (req, res) => {
    const existingItem = await storage.getItineraryItem(Number(req.params.id));
    if (!existingItem) {
      return res.status(404).json({ message: "Itinerary item not found" });
    }
    const trip = await getOwnedTripOr404(req, res, existingItem.tripId);
    if (!trip) return;
    await storage.deleteItineraryItem(Number(req.params.id));
    res.status(204).send();
  });

  app.post(api.ai.phrases.path, requireAuth, aiRouteRateLimit, async (req, res) => {
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

  app.post(api.ai.weather.path, requireAuth, aiRouteRateLimit, async (req, res) => {
    try {
      const entitlements = await getEntitlements(storage, req.user!);
      if (!requireFeature(res, entitlements, "ai_weather")) return;
      const { destination, startDate, endDate } = api.ai.weather.input.parse(req.body);
      const dateRange = startDate && endDate ? `from ${startDate} to ${endDate}` : "for an upcoming trip";
      const cachePayload = buildWeatherCacheInput({ destination, startDate, endDate });

      await respondWithCachedAi(res, "weather", cachePayload, async () => {
        const raw = await aiChat([
          { role: "system", content: `You are a travel weather advisor. Provide a helpful weather forecast summary for the destination and time period. Include expected temperatures, rainfall, what to wear, and any weather-related travel tips. Format with markdown. ${getAiLanguageInstruction(req.user!)}` },
          { role: "user", content: `What weather should a traveler expect in ${destination} ${dateRange}? Include temperature ranges, precipitation, clothing recommendations, and any weather warnings.` }
        ]);
        const forecast = stripThinkTags(raw || "No forecast available.");
        return { forecast };
      });
    } catch (error) {
      return handleAiError(res, "Failed to generate weather forecast", error);
    }
  });

  app.post(api.ai.customsEntry.path, requireAuth, aiRouteRateLimit, async (req, res) => {
    try {
      const entitlements = await getEntitlements(storage, req.user!);
      if (!requireFeature(res, entitlements, "ai_safety")) return;

      const { tripId } = api.ai.customsEntry.input.parse(req.body);
      const trip = await getOwnedTripOr404(req, res, tripId);
      if (!trip) return;

      const disclaimer =
        "Always confirm entry requirements with the official government source before travel. Annai only shows verified official links and may not support every destination yet.";
      const cachePayload = {
        destination: trip.destination,
        origin: trip.origin ?? "",
        tripType: trip.tripType ?? "one_way",
      };

      await respondWithCachedAi(res, "customs-entry", cachePayload, async () => {
        const buildSection = async (
          mode: "destination" | "return",
          title: string,
          queryLocation: string | null | undefined,
        ) => {
          const normalizedLocation = queryLocation?.trim();
          if (!normalizedLocation) {
            return {
              status: "unavailable" as const,
              mode,
              title,
              queryLocation: "",
              matchedCountry: null,
              officialName: null,
              officialUrl: null,
              sourceDomain: null,
              sourceLabel: null,
              deadline: null,
              summary:
                mode === "return"
                  ? "Add a starting location to this trip so Annai can look up verified return-entry guidance."
                  : "Add the country name to your destination so Annai can look up verified official customs guidance.",
            };
          }

          const registryEntry = resolveCustomsEntry(normalizedLocation);
          if (!registryEntry) {
            return {
              status: "unavailable" as const,
              mode,
              title,
              queryLocation: normalizedLocation,
              matchedCountry: null,
              officialName: null,
              officialUrl: null,
              sourceDomain: null,
              sourceLabel: null,
              deadline: null,
              summary:
                mode === "return"
                  ? "Annai does not have a verified official return-entry form for this origin yet. Verify re-entry steps on the official government arrival or customs website for your origin country."
                  : "Annai does not have a verified official online customs or arrival form for this destination yet. Verify entry steps on the official government immigration or customs website.",
            };
          }

          let summary = buildStaticCustomsSummary(registryEntry);
          if (openai) {
            try {
              const raw = await aiChat([
                {
                  role: "system",
                  content: [
                    "You help travelers understand official customs and arrival form steps.",
                    "Use only the official facts provided by the user.",
                    "Do not invent a website, deadline, exemption, or requirement.",
                    "Do not mention unofficial or third-party services.",
                    "Write a short markdown summary with these sections: What it is, When to do it, What to prepare, and Important caution.",
                    getAiLanguageInstruction(req.user!),
                  ].join(" "),
                },
                {
                  role: "user",
                  content: [
                    `Trip destination: ${trip.destination}`,
                    `Trip origin: ${trip.origin ?? "not provided"}`,
                    `Section title: ${title}`,
                    `Lookup location: ${normalizedLocation}`,
                    `Matched country: ${registryEntry.countryName}`,
                    `Official form name: ${registryEntry.officialName}`,
                    `Official form URL: ${registryEntry.officialUrl}`,
                    `Official source: ${registryEntry.sourceLabel} (${registryEntry.sourceDomain})`,
                    `Official timing note: ${registryEntry.deadline}`,
                    `Verified facts:`,
                    ...registryEntry.officialSummaryFacts.map((fact) => `- ${fact}`),
                    "Summarize the official steps for a traveler in a clean mobile-friendly format.",
                  ].join("\n"),
                },
              ]);
              summary = stripThinkTags(raw || summary) || summary;
            } catch (error) {
              console.warn("Customs summary AI fallback used", error);
            }
          }

          return {
            status: "verified" as const,
            mode,
            title,
            queryLocation: normalizedLocation,
            matchedCountry: registryEntry.countryName,
            officialName: registryEntry.officialName,
            officialUrl: registryEntry.officialUrl,
            sourceDomain: registryEntry.sourceDomain,
            sourceLabel: registryEntry.sourceLabel,
            deadline: registryEntry.deadline,
            summary,
          };
        };

        const sections = await Promise.all([
          buildSection("destination", "Entry to Destination", trip.destination),
          ...(trip.tripType === "round_trip" ? [buildSection("return", "Return Entry", trip.origin)] : []),
        ]);

        return {
          destination: trip.destination,
          origin: trip.origin ?? null,
          tripType: trip.tripType as "one_way" | "round_trip",
          disclaimer,
          sections,
        };
      });
    } catch (error) {
      return handleAiError(res, "Failed to fetch customs and entry guidance", error);
    }
  });

  app.post(api.ai.assistant.path, requireAuth, aiRouteRateLimit, async (req, res) => {
    try {
      const entitlements = await getEntitlements(storage, req.user!);
      if (!requireFeature(res, entitlements, "ai_itinerary")) return;

      const { tripId, question, messages = [], activeSuggestions = [] } = api.ai.assistant.input.parse(req.body);
      const trip = await getOwnedTripOr404(req, res, tripId);
      if (!trip) return;
      const itineraryItems = await storage.getItineraryItemsByTrip(trip.id);
      const itineraryContext = summarizeItineraryContext(itineraryItems);
      const totalDays = getTripDayCount(trip);
      const tripDayLabels = Array.from({ length: totalDays }, (_, index) => {
        const dayNumber = index + 1;
        if (!trip.startDate) return `Day ${dayNumber}`;
        const date = new Date(trip.startDate.getTime() + index * 24 * 60 * 60 * 1000);
        return `Day ${dayNumber}: ${date.toISOString().slice(0, 10)}`;
      }).join(" | ");

      const assistantSchema = z.object({
        answer: z.string().optional(),
        suggestions: z.array(z.object({
          title: z.string().optional(),
          summary: z.string().optional(),
          category: z.string().optional(),
          googleSearchUrl: z.string().nullable().optional(),
          googleMapsUrl: z.string().nullable().optional(),
        })).default([]),
        shouldOfferItineraryAdd: z.boolean().optional(),
        pendingAction: z.object({
          type: z.string().optional(),
          title: z.string().optional(),
          description: z.string().nullable().optional(),
          category: z.string().optional(),
          dayNumber: z.union([z.number(), z.string()]).optional(),
          timeSlot: z.string().optional(),
          googlePlaceUrl: z.string().nullable().optional(),
        }).nullable().optional(),
      });

      const raw = await aiChat([
        {
          role: "system",
          content: [
            "You are Annai Travel Assistant.",
            "Return ONLY valid JSON.",
            "Keys: answer, suggestions, shouldOfferItineraryAdd, pendingAction.",
            "answer must be concise markdown for the traveler.",
            "suggestions must be an array of recommendation objects when the user asks for places or options.",
            "Each suggestion object must include title, summary, category, optional googleSearchUrl, optional googleMapsUrl.",
            "If suggestions are returned, set shouldOfferItineraryAdd to true and end the answer with a short follow-up like 'Would you like me to add any of these to your itinerary?'",
            "pendingAction must be null unless the user explicitly asks to add something to the itinerary and the request is clear enough to execute safely.",
            "If the user asks to add a place, use the current activeSuggestions list when resolving phrases like 'number 2', 'that place', or a named place from the previous recommendations.",
            "When creating pendingAction, set type to add_to_itinerary.",
            "pendingAction.dayNumber must be a trip-relative day number from 1 to the trip length.",
            "pendingAction.timeSlot must be 24-hour HH:MM.",
            "Map broad meal times to sensible defaults: breakfast 09:00, brunch 10:30, lunch 12:00, afternoon 15:00, dinner 19:00, evening 20:00.",
            "Do not claim an item was added unless you provide a valid pendingAction for this turn.",
            "If the request is ambiguous, do not create pendingAction; instead ask one short follow-up question in answer.",
            "Use the trip context. If something can change in real life, tell the traveler to verify before booking or departure.",
            getAiLanguageInstruction(req.user!),
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `Trip destination: ${trip.destination}`,
            `Trip dates: ${trip.startDate ? trip.startDate.toISOString().slice(0, 10) : "unknown"} to ${trip.endDate ? trip.endDate.toISOString().slice(0, 10) : "unknown"}`,
            `Trip day labels: ${tripDayLabels}`,
            `Trip length: ${totalDays} days`,
            `Traveler citizenship: ${req.user!.citizenship ?? trip.citizenship ?? "not provided"}`,
            `Trip notes: ${trip.notes ?? "none"}`,
            `Current itinerary items: ${itineraryContext}`,
            `Recent conversation: ${JSON.stringify(messages.slice(-8))}`,
            `Active suggestions: ${JSON.stringify(activeSuggestions.slice(-8))}`,
            `Latest user question: ${question}`,
          ].join("\n"),
        },
      ], true);
      if (!raw) throw new Error("No response from AI");

      let parsed: z.infer<typeof assistantSchema>;
      try {
        parsed = assistantSchema.parse(JSON.parse(extractJson(raw)));
      } catch (parseError) {
        const fallbackAnswer = stripThinkTags(raw || "").trim();
        console.warn("Assistant structured parse fallback", parseError);
        return res.json({
          answer: fallbackAnswer || "I can help with that. Try asking again with a little more detail.",
          suggestions: [],
          shouldOfferItineraryAdd: false,
          createdItineraryItem: null,
          pendingAction: null,
        });
      }
      const suggestions = parsed.suggestions
        .filter((suggestion) => Boolean(suggestion.title?.trim()) && Boolean(suggestion.summary?.trim()))
        .map((suggestion) => {
        const title = suggestion.title!.trim();
        const summary = suggestion.summary!.trim();
        const fallbackQuery = `${title} ${trip.destination}`;
        return {
          title,
          summary,
          category: normalizeAssistantCategory(suggestion.category),
          // Always use canonical Google URLs so short/dynamic links never break in UI.
          googleSearchUrl: buildGoogleSearchUrl(fallbackQuery),
          googleMapsUrl: buildGoogleMapsUrl(fallbackQuery),
        };
      });

      let createdItineraryItem: Awaited<ReturnType<typeof storage.createItineraryItem>> | null = null;
      const addRequested = shouldTreatAsAddRequest(question, messages);
      let pendingAction =
        parsed.pendingAction &&
        parsed.pendingAction.type === "add_to_itinerary" &&
        parsed.pendingAction.title?.trim()
          ? {
              type: "add_to_itinerary" as const,
              title: parsed.pendingAction.title.trim(),
              description: parsed.pendingAction.description?.trim() || null,
              category: normalizeAssistantCategory(parsed.pendingAction.category),
              dayNumber: normalizeAssistantDayNumber(parsed.pendingAction.dayNumber, totalDays),
              timeSlot: normalizeAssistantTimeSlot(parsed.pendingAction.timeSlot),
              googlePlaceUrl: normalizeAssistantUrl(parsed.pendingAction.googlePlaceUrl),
            }
          : null;
      if (!pendingAction && addRequested) {
        const inferredSuggestion = inferSuggestionFromConversation(messages, suggestions) ??
          inferSuggestionFromConversation(messages, activeSuggestions);
        const inferredDay = normalizeAssistantDayNumber(question, totalDays);
        const inferredTime = normalizeAssistantTimeSlot(question);
        if (inferredSuggestion && inferredDay && inferredTime) {
          pendingAction = {
            type: "add_to_itinerary",
            title: inferredSuggestion.title,
            description: inferredSuggestion.summary,
            category: inferredSuggestion.category,
            dayNumber: inferredDay,
            timeSlot: inferredTime,
            googlePlaceUrl: normalizeAssistantUrl(inferredSuggestion.googleMapsUrl) ??
              normalizeAssistantUrl(inferredSuggestion.googleSearchUrl),
          };
        }
      }
      let answer = stripThinkTags(parsed.answer || "No answer available.");
      if (suggestions.length > 0) {
        answer = buildAssistantSuggestionsAnswer(trip.destination, answer, suggestions);
      }

      if (
        pendingAction &&
        typeof pendingAction.dayNumber === "number" &&
        typeof pendingAction.timeSlot === "string"
      ) {
        const action = pendingAction;
        const dayNumber = action.dayNumber as number;
        const timeSlot = action.timeSlot;
        const matchedSuggestion = suggestions.find(
          (suggestion) => suggestion.title.trim().toLowerCase() === action.title.trim().toLowerCase(),
        ) ?? activeSuggestions.find(
          (suggestion) => suggestion.title.trim().toLowerCase() === action.title.trim().toLowerCase(),
        );

        createdItineraryItem = await storage.createItineraryItem({
          tripId: trip.id,
          dayNumber,
          timeSlot,
          title: action.title,
          description: action.description?.trim() || matchedSuggestion?.summary || null,
          category: action.category,
          googlePlaceUrl:
            normalizeAssistantUrl(action.googlePlaceUrl) ??
            matchedSuggestion?.googleMapsUrl ??
            matchedSuggestion?.googleSearchUrl ??
            buildGoogleMapsUrl(`${action.title} ${trip.destination}`),
          sourceFingerprint: null,
        });
        pendingAction = null;
        answer = `${answer}\n\nAdded **${createdItineraryItem.title}** to Day ${createdItineraryItem.dayNumber} at ${createdItineraryItem.timeSlot}.`;
      } else if (pendingAction && (!pendingAction.dayNumber || !pendingAction.timeSlot)) {
        pendingAction = null;
      }

      if (!createdItineraryItem && addRequested) {
        answer = "I can add that, but I need a specific day and time. Example: `Add Prater Garten to Day 2 at 12:00`.";
      } else if (!createdItineraryItem && answerClaimsItineraryAdd(answer)) {
        answer = "I have not added anything yet. Tell me the place, day, and time, and I will add it to your itinerary.";
      }

      const response = {
        answer,
        suggestions,
        shouldOfferItineraryAdd: Boolean(parsed.shouldOfferItineraryAdd) || suggestions.length > 0,
        createdItineraryItem,
        pendingAction,
      };

      res.json(response);
    } catch (error) {
      return handleAiError(res, "Failed to generate assistant response", error);
    }
  });

  app.post(api.bookingImport.preview.path, requireAuth, aiRouteRateLimit, async (req, res) => {
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
    const mockUpdatesAllowed =
      !isProduction || process.env.ALLOW_MOCK_SUBSCRIPTION_UPDATES === "true";
    if (!mockUpdatesAllowed) {
      return res.status(404).json({ message: "Not found" });
    }
    const hasOwnerAccess = await requireOwnerAccess(req, res);
    if (!hasOwnerAccess) return;

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
