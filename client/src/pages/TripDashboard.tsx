import { useEffect, useRef, useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { format, differenceInDays, isBefore, isAfter } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, MapPin, Calendar, Edit3, Briefcase, 
  Sparkles, ShieldAlert, Globe, ChevronRight, 
  Home, Plane, Building2, Car, Languages, CloudSun,
  DollarSign, FileText, CalendarDays, CheckCircle2, Clock, Route,
} from "lucide-react";
import { useTrip } from "@/hooks/use-trips";
import { useCulturalTips, useCustomsEntry, useSafetyAdvice, usePhrases, useTravelAssistant, useTripPlan, useWeather } from "@/hooks/use-ai";
import { NavBar } from "@/components/NavBar";
import { AiMarkdownCards } from "@/components/AiMarkdownCards";
import { Button } from "@/components/ui/button";
import { TripForm } from "@/components/TripForm";
import { SafetyMap } from "@/components/SafetyMap";
import { TripPackingPanel } from "@/components/TripPackingPanel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useEntitlements } from "@/hooks/use-entitlements";
import { api, buildUrl } from "@shared/routes";
import type { ItineraryItem } from "@shared/schema";
import { getDestinationFallbackArt, getDestinationImageUrl } from "@/lib/destination-art";
import { useI18n } from "@/lib/i18n";
import { apiRequest } from "@/lib/queryClient";

type TripPlanResult = {
  destination: string;
  days: number;
  planDepth: "quick" | "detailed";
  travelStyle: "balanced" | "food" | "culture" | "family" | "relaxed";
  overview: string;
  bestFor: string[];
  neighborhoods: string[];
  transportTips: string[];
  etiquette: string[];
  itinerary: Array<{
    dayNumber: number;
    theme: string;
    morning: string;
    afternoon: string;
    evening: string;
    foodNote?: string;
  }>;
  dynamicNotes: string[];
  _cacheStatus: "hit" | "miss" | null;
  _seedFingerprint: string | null;
};

type CustomsEntryResult = {
  destination: string;
  origin: string | null;
  tripType: "one_way" | "round_trip";
  disclaimer: string;
  sections: Array<{
    status: "verified" | "unavailable";
    mode: "destination" | "return";
    title: string;
    queryLocation: string;
    matchedCountry: string | null;
    officialName: string | null;
    officialUrl: string | null;
    sourceDomain: string | null;
    sourceLabel: string | null;
    deadline: string | null;
    summary: string;
  }>;
};

type AssistantSuggestion = {
  title: string;
  summary: string;
  category: "activity" | "meal" | "transport" | "sightseeing";
  googleSearchUrl?: string | null;
  googleMapsUrl?: string | null;
};

type AssistantMessage = {
  role: "user" | "assistant";
  content: string;
  suggestions?: AssistantSuggestion[];
  createdItineraryItem?: Pick<ItineraryItem, "id" | "title" | "dayNumber" | "timeSlot"> | null;
};

type QuickBookingContext = {
  origin: string | null;
  destination: string;
  startDate: Date | string | null;
  endDate: Date | string | null;
  tripType: "one_way" | "round_trip";
};

function toYmd(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function buildFlightsUrl(context: QuickBookingContext): string {
  const origin = context.origin?.trim();
  const destination = context.destination.trim();
  const departDate = toYmd(context.startDate);
  const returnDate = context.tripType === "round_trip" ? toYmd(context.endDate) : null;
  const query = [
    origin && destination ? `Flights from ${origin} to ${destination}` : `Flights to ${destination}`,
    departDate ? `depart ${departDate}` : null,
    returnDate ? `return ${returnDate}` : context.tripType === "round_trip" ? "round trip" : "one way",
  ]
    .filter(Boolean)
    .join(" ");
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(query)}`;
}

function buildUberUrl(context: QuickBookingContext): string {
  const url = new URL("https://m.uber.com/ul/");
  url.searchParams.set("action", "setPickup");
  url.searchParams.set("pickup", "my_location");
  url.searchParams.set("dropoff[formatted_address]", context.destination.trim());
  return url.toString();
}

function buildAirbnbUrl(context: QuickBookingContext): string {
  const url = new URL("https://www.airbnb.com/s/homes");
  url.searchParams.set("query", context.destination.trim());
  const checkIn = toYmd(context.startDate);
  const checkOut = toYmd(context.endDate);
  if (checkIn) url.searchParams.set("checkin", checkIn);
  if (checkOut && context.tripType === "round_trip") url.searchParams.set("checkout", checkOut);
  return url.toString();
}

function buildHotelsUrl(context: QuickBookingContext): string {
  const url = new URL("https://www.booking.com/searchresults.html");
  url.searchParams.set("ss", context.destination.trim());
  const checkIn = toYmd(context.startDate);
  const checkOut = toYmd(context.endDate);
  if (checkIn) url.searchParams.set("checkin", checkIn);
  if (checkOut && context.tripType === "round_trip") url.searchParams.set("checkout", checkOut);
  return url.toString();
}

function buildRentalCarUrl(context: QuickBookingContext): string {
  const destination = context.destination.trim();
  const start = toYmd(context.startDate);
  const end = toYmd(context.endDate);
  if (start && end && context.tripType === "round_trip") {
    return `https://www.kayak.com/cars/${encodeURIComponent(destination)}/${start}/${end}`;
  }
  return `https://www.kayak.com/cars/${encodeURIComponent(destination)}`;
}

function buildTuroUrl(context: QuickBookingContext): string {
  const url = new URL("https://turo.com/us/en/search");
  url.searchParams.set("searchTerm", context.destination.trim());
  const start = toYmd(context.startDate);
  const end = toYmd(context.endDate);
  if (start) url.searchParams.set("startDate", start);
  if (end && context.tripType === "round_trip") url.searchParams.set("endDate", end);
  return url.toString();
}

const EXTERNAL_LINKS = [
  { name: "Airbnb", icon: <Home className="h-5 w-5" />, color: "bg-[#FF5A5F]/10 text-[#FF5A5F]", getUrl: (context: QuickBookingContext) => buildAirbnbUrl(context) },
  { name: "Flights", icon: <Plane className="h-5 w-5" />, color: "bg-blue-500/10 text-blue-600", getUrl: (context: QuickBookingContext) => buildFlightsUrl(context) },
  { name: "Hotels", icon: <Building2 className="h-5 w-5" />, color: "bg-indigo-500/10 text-indigo-600", getUrl: (context: QuickBookingContext) => buildHotelsUrl(context) },
  { name: "Uber", icon: <Car className="h-5 w-5" />, color: "bg-black/10 text-black dark:bg-white/10 dark:text-white", getUrl: (context: QuickBookingContext) => buildUberUrl(context) },
  { name: "Metro", icon: <Route className="h-5 w-5" />, color: "bg-emerald-500/10 text-emerald-600", getUrl: (context: QuickBookingContext) => `https://www.google.com/search?q=${encodeURIComponent(`${context.destination} metro map`)}` },
  { name: "Rental Car", icon: <Car className="h-5 w-5" />, color: "bg-orange-500/10 text-orange-600", getUrl: (context: QuickBookingContext) => buildRentalCarUrl(context) },
  { name: "Turo", icon: <Car className="h-5 w-5" />, color: "bg-sky-500/10 text-sky-600", getUrl: (context: QuickBookingContext) => buildTuroUrl(context) },
];

type AiBlock =
  | { type: "heading"; text: string }
  | { type: "list"; ordered: boolean; items: string[]; title?: string }
  | { type: "paragraph"; text: string; title?: string };

function normalizeAiContent(content: string) {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/([^\n])\s+(?=##\s)/g, "$1\n\n")
    .replace(/(##[^\n]+?)\s+(?=\d+\.\s)/g, "$1\n")
    .replace(/([^\n])\s+(?=\d+\.\s+\*\*)/g, "$1\n")
    .replace(/([^\n])\s+(?=[-*•]\s+\*\*)/g, "$1\n")
    .replace(/\s+-\s+(?=\*\*)/g, "\n- ")
    .trim();
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).filter(Boolean);

  return parts.map((part, index) => {
    const boldMatch = part.match(/^\*\*([^*]+)\*\*$/);
    if (boldMatch) {
      return <strong key={`${part}-${index}`} className="font-semibold text-foreground">{boldMatch[1]}</strong>;
    }

    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={`${part}-${index}`}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline underline-offset-4"
        >
          {linkMatch[1]}
        </a>
      );
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function parseAiBlocks(content: string): AiBlock[] {
  const normalized = normalizeAiContent(content);
  if (!normalized) return [];

  return normalized
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .flatMap((block): AiBlock[] => {
      const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
      if (!lines.length) return [];

      if (lines.length === 1) {
        const line = lines[0];
        if (/^#{1,3}\s+/.test(line)) {
          return [{ type: "heading", text: line.replace(/^#{1,3}\s+/, "").trim() }];
        }
      }

      const colonHeadingMatch = lines[0]?.match(/^([A-Za-z][A-Za-z0-9 &/'(),-]{1,80}):$/);
      const title = colonHeadingMatch?.[1]?.trim();
      const bodyLines = title ? lines.slice(1) : lines;

      if (bodyLines.length > 0 && bodyLines.every((line) => /^[-*•]\s+/.test(line))) {
        return [{
          type: "list",
          ordered: false,
          title,
          items: bodyLines.map((line) => line.replace(/^[-*•]\s+/, "").trim()),
        }];
      }

      if (bodyLines.length > 0 && bodyLines.every((line) => /^\d+\.\s+/.test(line))) {
        return [{
          type: "list",
          ordered: true,
          title,
          items: bodyLines.map((line) => line.replace(/^\d+\.\s+/, "").trim()),
        }];
      }

      if (title) {
        return [{
          type: "paragraph",
          title,
          text: bodyLines.join(" "),
        }];
      }

      if (lines.every((line) => /^[-*•]\s+/.test(line))) {
        return [{
          type: "list",
          ordered: false,
          items: lines.map((line) => line.replace(/^[-*•]\s+/, "").trim()),
        }];
      }

      if (lines.every((line) => /^\d+\.\s+/.test(line))) {
        return [{
          type: "list",
          ordered: true,
          items: lines.map((line) => line.replace(/^\d+\.\s+/, "").trim()),
        }];
      }

      return [{
        type: "paragraph",
        text: lines.join(" "),
      }];
    });
}

function AiRichText({ content }: { content: string }) {
  const blocks = parseAiBlocks(content);

  if (!blocks.length) {
    return <p className="text-sm text-muted-foreground">No details yet.</p>;
  }

  return (
    <div className="space-y-4">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return (
            <div key={`heading-${index}`} className="pt-1">
              <h3 className="text-lg font-semibold text-foreground">{block.text}</h3>
            </div>
          );
        }

        if (block.type === "list") {
          const ListTag = block.ordered ? "ol" : "ul";
          return (
            <div key={`list-${index}`} className="rounded-2xl border border-border/60 bg-muted/25 p-4">
              {block.title && <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground/80">{block.title}</h4>}
              <ListTag className={`space-y-2 text-sm leading-6 text-muted-foreground ${block.ordered ? "list-decimal pl-5" : "list-disc pl-5"}`}>
                {block.items.map((item, itemIndex) => (
                  <li key={`item-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
                ))}
              </ListTag>
            </div>
          );
        }

        return (
          <div key={`paragraph-${index}`} className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
            {block.title && <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-foreground/80">{block.title}</h4>}
            <p className="text-sm leading-7 text-muted-foreground">{renderInlineMarkdown(block.text)}</p>
          </div>
        );
      })}
    </div>
  );
}

function getCountdownText(startDate: Date | string | null, endDate: Date | string | null) {
  if (!startDate) return null;
  const now = new Date();
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : null;
  if (end && isAfter(now, end)) return "Trip completed";
  if (isBefore(now, start)) {
    const days = differenceInDays(start, now);
    if (days === 0) return "Starts today!";
    if (days === 1) return "Starts tomorrow!";
    return `${days} days until your trip`;
  }
  return "Happening now!";
}

function clampTripPlanDays(value: number): number {
  return Math.max(1, Math.min(21, value));
}

function parseTripPlanDaysInput(raw: string, fallback: number): number {
  const digitsOnly = raw.replace(/[^\d]/g, "");
  if (!digitsOnly) return clampTripPlanDays(fallback);
  const parsed = Number.parseInt(digitsOnly, 10);
  if (!Number.isFinite(parsed)) return clampTripPlanDays(fallback);
  return clampTripPlanDays(parsed);
}

export default function TripDashboard() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/trips/:id");
  const tripId = parseInt(params?.id || "0", 10);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: trip, isLoading } = useTrip(tripId);
  const { data: entitlements } = useEntitlements(Boolean(tripId));
  const { t } = useI18n();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "ai">("overview");
  const [activeAiTool, setActiveAiTool] = useState<"assistant" | "trip-plan" | "tips" | "safety" | "phrases" | "weather" | "customs" | null>(null);
  const [packingPanelOpen, setPackingPanelOpen] = useState(false);
  
  const tipsMutation = useCulturalTips();
  const customsMutation = useCustomsEntry();
  const safetyMutation = useSafetyAdvice();
  const phrasesMutation = usePhrases();
  const weatherMutation = useWeather();
  const tripPlanMutation = useTripPlan();
  const assistantMutation = useTravelAssistant();
  const sectionAssistantMutation = useTravelAssistant();
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([]);
  const [activeAssistantSuggestions, setActiveAssistantSuggestions] = useState<AssistantSuggestion[]>([]);
  const [sectionQuestion, setSectionQuestion] = useState("");
  const [sectionReply, setSectionReply] = useState("");
  const aiContentRef = useRef<HTMLDivElement | null>(null);
  const assistantThreadRef = useRef<HTMLDivElement | null>(null);
  const [tripPlanSettings, setTripPlanSettings] = useState<{
    days: number;
    planDepth: "quick" | "detailed";
    travelStyle: "balanced" | "food" | "culture" | "family" | "relaxed";
  }>({
    days: 5,
    planDepth: "quick",
    travelStyle: "balanced",
  });
  const [tripPlanDaysInput, setTripPlanDaysInput] = useState("5");

  const [aiContent, setAiContent] = useState<
    | { type: "tips" | "safety" | "phrases" | "weather"; content: string }
    | { type: "customs"; content: CustomsEntryResult }
    | { type: "trip-plan"; content: TripPlanResult }
    | null
  >(null);

  useEffect(() => {
    if (activeTab !== "ai" || !activeAiTool) {
      return;
    }

    const timer = window.setTimeout(() => {
      aiContentRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [activeAiTool, activeTab]);

  useEffect(() => {
    if (activeAiTool !== "assistant") {
      return;
    }

    const timer = window.setTimeout(() => {
      const thread = assistantThreadRef.current;
      if (!thread) return;
      thread.scrollTo({
        top: thread.scrollHeight,
        behavior: "smooth",
      });
    }, 80);

    return () => window.clearTimeout(timer);
  }, [activeAiTool, assistantMessages.length, assistantMutation.isPending]);

  useEffect(() => {
    if (!activeAiTool || activeAiTool === "assistant") return;
    setSectionQuestion("");
    setSectionReply("");
  }, [activeAiTool]);

  const { data: packingItems, isLoading: packingLoading } = useQuery({
    queryKey: [api.packingLists.listByTrip.path, tripId],
    queryFn: async () => {
      const url = buildUrl(api.packingLists.listByTrip.path, { tripId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch packing list");
      return res.json();
    },
    enabled: !!trip,
  });
  const { data: budgetData, isLoading: budgetLoading } = useQuery({
    queryKey: [api.budgetItems.listByTrip.path, tripId],
    queryFn: async () => {
      const url = buildUrl(api.budgetItems.listByTrip.path, { tripId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch budget items");
      return res.json();
    },
    enabled: !!trip,
  });
  const { data: docsData, isLoading: docsLoading } = useQuery({
    queryKey: [api.travelDocuments.listByTrip.path, tripId],
    queryFn: async () => {
      const url = buildUrl(api.travelDocuments.listByTrip.path, { tripId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch documents");
      return res.json();
    },
    enabled: !!trip,
  });
  const { data: itineraryData, isLoading: itineraryLoading } = useQuery({
    queryKey: [api.itineraryItems.listByTrip.path, tripId],
    queryFn: async () => {
      const url = buildUrl(api.itineraryItems.listByTrip.path, { tripId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch itinerary");
      return res.json();
    },
    enabled: !!trip,
  });
  const seedItineraryMutation = useMutation({
    mutationFn: async (plan: TripPlanResult) => {
      const destinationForLinks = trip?.destination ?? plan.destination;
      const buildGoogleMapsSearchUrl = (query: string) =>
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

      const buildItineraryLink = (details: string) =>
        buildGoogleMapsSearchUrl(`${details} ${destinationForLinks}`);

      const buildEntries = () =>
        plan.itinerary.flatMap((day) => {
          const entries: Array<{
            dayNumber: number;
            timeSlot: string;
            title: string;
            description: string;
            category: string;
            googlePlaceUrl: string;
            sourceFingerprint: string | null;
          }> = [
            {
              dayNumber: day.dayNumber,
              timeSlot: "09:00",
              title: `Morning - ${day.theme}`,
              description: day.morning,
              category: "sightseeing",
              googlePlaceUrl: buildItineraryLink(day.morning),
              sourceFingerprint: plan._seedFingerprint,
            },
            {
              dayNumber: day.dayNumber,
              timeSlot: "13:00",
              title: `Afternoon - ${day.theme}`,
              description: day.afternoon,
              category: "activity",
              googlePlaceUrl: buildItineraryLink(day.afternoon),
              sourceFingerprint: plan._seedFingerprint,
            },
            {
              dayNumber: day.dayNumber,
              timeSlot: "18:00",
              title: `Evening - ${day.theme}`,
              description: day.evening,
              category: "activity",
              googlePlaceUrl: buildItineraryLink(day.evening),
              sourceFingerprint: plan._seedFingerprint,
            },
          ];

          if (day.foodNote) {
            entries.push({
              dayNumber: day.dayNumber,
              timeSlot: "20:00",
              title: `Food Note - ${day.theme}`,
              description: day.foodNote,
              category: "meal",
              googlePlaceUrl: buildItineraryLink(day.foodNote),
              sourceFingerprint: plan._seedFingerprint,
            });
          }

          return entries;
        });

      const entries = buildEntries();
      await Promise.all(
        entries.map(async (entry) => {
          const url = buildUrl(api.itineraryItems.create.path, { tripId });
          await apiRequest(api.itineraryItems.create.method, url, entry);
        }),
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [api.itineraryItems.listByTrip.path, tripId] });
      toast({ title: "Itinerary seeded", description: "The trip plan was added to your itinerary builder." });
      setLocation(`/trips/${tripId}/itinerary`);
    },
    onError: (error) => {
      toast({
        title: "Unable to seed itinerary",
        description: error instanceof Error ? error.message : "Failed to save the trip plan into the itinerary.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;
  if (!trip) return <div className="min-h-screen flex items-center justify-center">Trip not found</div>;

  const countdownText = getCountdownText(trip.startDate, trip.endDate);
  const quickBookingContext: QuickBookingContext = {
    origin: trip.origin ?? null,
    destination: trip.destination,
    startDate: trip.startDate ?? null,
    endDate: trip.endDate ?? null,
    tripType: trip.tripType === "round_trip" ? "round_trip" : "one_way",
  };
  const packedCount = packingItems?.filter((i: any) => i.isPacked).length || 0;
  const totalPacking = packingItems?.length || 0;
  const packingPct = totalPacking > 0 ? Math.round((packedCount / totalPacking) * 100) : 0;

  let totalDays = 0;
  if (trip.startDate && trip.endDate) {
    totalDays = differenceInDays(new Date(trip.endDate), new Date(trip.startDate)) + 1;
  }
  const daysPlanned = itineraryData ? new Set(itineraryData.map((i: any) => i.dayNumber)).size : 0;

  const handleGetTips = () => {
    setActiveAiTool("tips");
    if (!entitlements?.enabledFeatures.includes("ai_safety")) {
      setLocation("/pricing");
      return;
    }
    tipsMutation.mutate(trip.destination, {
      onSuccess: (data) => setAiContent({ type: 'tips', content: data.tips })
    });
  };
  const handleGetSafety = () => {
    setActiveAiTool("safety");
    if (!entitlements?.enabledFeatures.includes("ai_safety")) {
      setLocation("/pricing");
      return;
    }
    safetyMutation.mutate({ destination: trip.destination }, {
      onSuccess: (data) => setAiContent({ type: 'safety', content: data.advice })
    });
  };
  const handleGetPhrases = () => {
    setActiveAiTool("phrases");
    if (!entitlements?.enabledFeatures.includes("ai_phrases")) {
      setLocation("/pricing");
      return;
    }
    phrasesMutation.mutate(trip.destination, {
      onSuccess: (data) => setAiContent({ type: 'phrases', content: data.phrases })
    });
  };
  const handleGetWeather = () => {
    setActiveAiTool("weather");
    if (!entitlements?.enabledFeatures.includes("ai_weather")) {
      setLocation("/pricing");
      return;
    }
    weatherMutation.mutate({
      destination: trip.destination,
      startDate: trip.startDate ? format(new Date(trip.startDate), 'yyyy-MM-dd') : undefined,
      endDate: trip.endDate ? format(new Date(trip.endDate), 'yyyy-MM-dd') : undefined,
    }, {
      onSuccess: (data) => setAiContent({ type: 'weather', content: data.forecast })
    });
  };
  const handleGetCustoms = () => {
    setActiveAiTool("customs");
    if (!entitlements?.enabledFeatures.includes("ai_safety")) {
      setLocation("/pricing");
      return;
    }
    customsMutation.mutate(tripId, {
      onSuccess: (data) => setAiContent({ type: "customs", content: data }),
    });
  };
  const handleOpenTripPlan = () => {
    setActiveAiTool("trip-plan");
  };
  const handleGetTripPlan = () => {
    setActiveAiTool("trip-plan");
    if (!entitlements?.enabledFeatures.includes("ai_itinerary")) {
      setLocation("/pricing");
      return;
    }
    const resolvedDays = parseTripPlanDaysInput(tripPlanDaysInput, tripPlanSettings.days);
    setTripPlanSettings((current) => ({ ...current, days: resolvedDays }));
    setTripPlanDaysInput(String(resolvedDays));
    tripPlanMutation.mutate(
      {
        destination: trip.destination,
        days: resolvedDays,
        planDepth: tripPlanSettings.planDepth,
        travelStyle: tripPlanSettings.travelStyle,
      },
      {
        onSuccess: (data) => setAiContent({ type: "trip-plan", content: data as TripPlanResult }),
      },
    );
  };
  const handleOpenAssistant = () => {
    setActiveAiTool("assistant");
  };
  const getAiToolLabel = (tool: typeof activeAiTool) => {
    switch (tool) {
      case "assistant":
        return t("trip.askAnnai");
      case "trip-plan":
        return t("trip.tripPlan");
      case "tips":
        return t("trip.culture");
      case "safety":
        return t("trip.safety");
      case "customs":
        return t("trip.customs");
      case "phrases":
        return t("trip.phrases");
      case "weather":
        return t("trip.weather");
      default:
        return "this section";
    }
  };
  const getSectionContextSummary = () => {
    if (!activeAiTool || !aiContent || aiContent.type !== activeAiTool) return "";

    if (typeof aiContent.content === "string") {
      return aiContent.content.slice(0, 2000);
    }

    if (aiContent.type === "trip-plan") {
      return [
        `Overview: ${aiContent.content.overview}`,
        `Best for: ${aiContent.content.bestFor.join(", ")}`,
        `Neighborhoods: ${aiContent.content.neighborhoods.join(", ")}`,
        `Transport tips: ${aiContent.content.transportTips.join(" | ")}`,
      ]
        .join("\n")
        .slice(0, 2000);
    }

    if (aiContent.type === "customs") {
      return aiContent.content.sections
        .map((section) => `${section.title}: ${section.summary}`)
        .join("\n")
        .slice(0, 2000);
    }

    return "";
  };
  const handleAskSectionAssistant = () => {
    const question = sectionQuestion.trim();
    if (!question || !activeAiTool || activeAiTool === "assistant") return;
    if (!entitlements?.enabledFeatures.includes("ai_itinerary")) {
      setLocation("/pricing");
      return;
    }

    const sectionName = getAiToolLabel(activeAiTool);
    const sectionContext = getSectionContextSummary();
    const structuredQuestion = [
      `Section focus: ${sectionName}`,
      `Trip destination: ${trip.destination}`,
      sectionContext ? `Current section details:\n${sectionContext}` : null,
      `User question: ${question}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    setSectionReply("");
    sectionAssistantMutation.mutate(
      {
        tripId,
        question: structuredQuestion,
      },
      {
        onSuccess: (data) => {
          setSectionReply(data.answer);
          setSectionQuestion("");
        },
      },
    );
  };
  const handleAskAssistant = () => {
    const question = assistantQuestion.trim();
    if (!question) return;
    if (!entitlements?.enabledFeatures.includes("ai_itinerary")) {
      setLocation("/pricing");
      return;
    }

    const nextConversation = [...assistantMessages, { role: "user" as const, content: question }];
    setAssistantMessages(nextConversation);
    setAssistantQuestion("");
    assistantMutation.mutate(
      {
        tripId,
        question,
        messages: nextConversation
          .slice(-12)
          .map((message) => ({ role: message.role, content: message.content })),
        activeSuggestions: activeAssistantSuggestions,
      },
      {
        onSuccess: async (data) => {
          if (data.createdItineraryItem) {
            await queryClient.invalidateQueries({ queryKey: [api.itineraryItems.listByTrip.path, tripId] });
            toast({
              title: "Added to itinerary",
              description: `${data.createdItineraryItem.title} was added to your itinerary.`,
            });
          }
          setActiveAssistantSuggestions((current) =>
            data.suggestions.length > 0 ? data.suggestions : current,
          );
          setAssistantMessages((current) => [
            ...current,
            {
              role: "assistant",
              content: data.answer,
              suggestions: data.suggestions,
              createdItineraryItem: data.createdItineraryItem
                ? {
                    id: data.createdItineraryItem.id,
                    title: data.createdItineraryItem.title,
                    dayNumber: data.createdItineraryItem.dayNumber,
                    timeSlot: data.createdItineraryItem.timeSlot,
                  }
                : null,
            },
          ]);
        },
      },
    );
  };
  const handleSeedItinerary = () => {
    if (aiContent?.type !== "trip-plan") return;
    if (
      aiContent.content._seedFingerprint &&
      Array.isArray(itineraryData) &&
      itineraryData.some((item: any) => item.sourceFingerprint === aiContent.content._seedFingerprint)
    ) {
      toast({
        title: "Plan already seeded",
        description: "This exact cached trip plan is already in the itinerary builder.",
      });
      return;
    }
    if (Array.isArray(itineraryData) && itineraryData.length > 0) {
      const confirmed = window.confirm(
        "Your itinerary already has items. Annai will append this trip plan to the existing itinerary. Continue?",
      );
      if (!confirmed) return;
    }
    seedItineraryMutation.mutate(aiContent.content);
  };

  const aiButtons = [
    { key: 'assistant', label: t("trip.askAnnai"), icon: <Sparkles className="h-5 w-5 mr-3" />, onClick: handleOpenAssistant, pending: false, activeColor: 'bg-primary text-white shadow-lg' },
    { key: 'trip-plan', label: t("trip.tripPlan"), icon: <Route className="h-5 w-5 mr-3" />, onClick: handleOpenTripPlan, pending: tripPlanMutation.isPending, activeColor: 'bg-primary text-white shadow-lg' },
    { key: 'safety', label: t("trip.safety"), icon: <ShieldAlert className="h-5 w-5 mr-3" />, onClick: handleGetSafety, pending: safetyMutation.isPending, activeColor: 'bg-destructive text-white shadow-lg' },
    { key: 'tips', label: t("trip.culture"), icon: <Globe className="h-5 w-5 mr-3" />, onClick: handleGetTips, pending: tipsMutation.isPending, activeColor: 'bg-secondary text-white shadow-lg' },
    { key: 'customs', label: t("trip.customs"), icon: <FileText className="h-5 w-5 mr-3" />, onClick: handleGetCustoms, pending: customsMutation.isPending, activeColor: 'bg-amber-500 text-white shadow-lg' },
    { key: 'phrases', label: t("trip.phrases"), icon: <Languages className="h-5 w-5 mr-3" />, onClick: handleGetPhrases, pending: phrasesMutation.isPending, activeColor: 'bg-accent text-accent-foreground shadow-lg' },
    { key: 'weather', label: t("trip.weather"), icon: <CloudSun className="h-5 w-5 mr-3" />, onClick: handleGetWeather, pending: weatherMutation.isPending, activeColor: 'bg-blue-500 text-white shadow-lg' },
  ];

  const aiIconMap: Record<string, JSX.Element> = {
    assistant: <Sparkles className="text-primary" />,
    'trip-plan': <Route className="text-primary" />,
    tips: <Globe className="text-secondary" />,
    safety: <ShieldAlert className="text-destructive" />,
    customs: <FileText className="text-amber-500" />,
    phrases: <Languages className="text-accent" />,
    weather: <CloudSun className="text-blue-500" />,
  };
  const aiTitleMap: Record<string, string> = {
    assistant: t("trip.askAnnai"),
    'trip-plan': t("trip.tripPlan"),
    tips: t("trip.culture"),
    safety: t("trip.safety"),
    customs: t("trip.customs"),
    phrases: t("trip.phrases"),
    weather: t("trip.weather"),
  };
  const isAiLoading =
    tipsMutation.isPending ||
    customsMutation.isPending ||
    safetyMutation.isPending ||
    phrasesMutation.isPending ||
    weatherMutation.isPending ||
    tripPlanMutation.isPending;

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/" className="inline-flex items-center text-muted-foreground hover:text-primary mb-8 transition-colors">
          <ArrowLeft className="h-4 w-4 mr-2" /> {t("trip.back")}
        </Link>

        <div className="relative rounded-3xl overflow-hidden mb-8">
          <div className="absolute inset-0 z-0">
            <img
              src={getDestinationImageUrl(trip.destination, 1200, 400)}
              alt={trip.destination}
              className="w-full h-full object-cover"
              onError={(event) => {
                event.currentTarget.onerror = null;
                event.currentTarget.src = getDestinationFallbackArt(trip.destination, 1200, 400);
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-black/20" />
          </div>
          <div className="relative z-10 p-8 md:p-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                {countdownText && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/20 text-white backdrop-blur-sm mb-4" data-testid="badge-countdown">
                    <Clock className="h-3 w-3" /> {countdownText}
                  </span>
                )}
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-white/20 rounded-xl text-white backdrop-blur-sm">
                    <MapPin className="h-6 w-6" />
                  </div>
                  <span className="text-white/80 font-medium tracking-wide uppercase text-sm">{t("trip.destination")}</span>
                </div>
                <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 drop-shadow-lg" data-testid="text-destination">
                  {trip.destination}
                </h1>
                {trip.origin && (
                  <div className="mb-4 flex flex-wrap items-center gap-3 text-sm font-medium text-white/85">
                    <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 backdrop-blur-sm">
                      <MapPin className="h-4 w-4" />
                      From {trip.origin}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 backdrop-blur-sm">
                      {trip.tripType === "round_trip" ? "Round trip" : "One way"}
                    </span>
                  </div>
                )}
                {(trip.startDate || trip.endDate) && (
                  <div className="flex items-center text-xl text-white/80 font-medium">
                    <Calendar className="h-6 w-6 mr-3 opacity-50" />
                    {trip.startDate && format(new Date(trip.startDate), 'MMMM d, yyyy')}
                    {trip.startDate && trip.endDate && " — "}
                    {trip.endDate && format(new Date(trip.endDate), 'MMMM d, yyyy')}
                  </div>
                )}
              </div>
              <Button 
                onClick={() => setIsEditOpen(true)}
                variant="outline" 
                className="rounded-xl bg-white/10 border-white/30 text-white hover:bg-white/20 h-12 px-6 backdrop-blur-sm"
                data-testid="button-edit-trip"
              >
                <Edit3 className="h-4 w-4 mr-2" /> {t("trip.edit")}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex space-x-2 mb-8 border-b">
          <button 
            onClick={() => setActiveTab("overview")}
            className={`pb-4 px-4 text-lg font-medium transition-colors border-b-2 ${activeTab === "overview" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            data-testid="tab-overview"
          >
            {t("trip.overviewTab")}
          </button>
          <button 
            onClick={() => setActiveTab("ai")}
            className={`pb-4 px-4 text-lg font-medium transition-colors border-b-2 flex items-center gap-2 ${activeTab === "ai" ? "border-secondary text-secondary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            data-testid="tab-ai"
          >
            <Sparkles className="h-5 w-5" /> {t("trip.aiTab")}
          </button>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === "overview" ? (
            <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                {/* Trip Readiness */}
                <div className="bg-card rounded-3xl p-8 shadow-sm border border-border/50">
                  <h2 className="text-2xl font-bold mb-6 flex items-center gap-2" data-testid="text-readiness-title">
                    <CheckCircle2 className="h-6 w-6 text-secondary" /> {t("trip.readiness")}
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-muted/50 rounded-2xl p-4 text-center">
                      {packingLoading ? <div className="h-9 w-16 mx-auto bg-muted animate-pulse rounded" /> : (
                        <div className="text-3xl font-bold text-primary" data-testid="text-packing-pct">{packingPct}%</div>
                      )}
                      <div className="text-sm text-muted-foreground mt-1">{t("trip.packed")}</div>
                      <div className="w-full bg-muted rounded-full h-2 mt-2">
                        <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${packingPct}%` }} />
                      </div>
                    </div>
                    <div className="bg-muted/50 rounded-2xl p-4 text-center">
                      {docsLoading ? <div className="h-9 w-10 mx-auto bg-muted animate-pulse rounded" /> : (
                        <div className="text-3xl font-bold text-secondary" data-testid="text-docs-count">{docsData?.length || 0}</div>
                      )}
                      <div className="text-sm text-muted-foreground mt-1">{t("trip.documents")}</div>
                    </div>
                    <div className="bg-muted/50 rounded-2xl p-4 text-center">
                      {budgetLoading ? <div className="h-9 w-10 mx-auto bg-muted animate-pulse rounded" /> : (
                        <div className="text-3xl font-bold text-accent" data-testid="text-budget-count">{budgetData?.length || 0}</div>
                      )}
                      <div className="text-sm text-muted-foreground mt-1">{t("trip.expenses")}</div>
                    </div>
                    <div className="bg-muted/50 rounded-2xl p-4 text-center">
                      {itineraryLoading ? <div className="h-9 w-16 mx-auto bg-muted animate-pulse rounded" /> : (
                        <div className="text-3xl font-bold text-blue-500" data-testid="text-itinerary-progress">{totalDays > 0 ? `${daysPlanned}/${totalDays}` : '—'}</div>
                      )}
                      <div className="text-sm text-muted-foreground mt-1">{t("trip.daysPlanned")}</div>
                    </div>
                  </div>
                </div>

                {trip.notes && (
                  <div className="bg-card rounded-3xl p-8 shadow-sm border border-border/50">
                    <h2 className="text-2xl font-bold mb-4">{t("trip.notes")}</h2>
                    <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">{trip.notes}</p>
                  </div>
                )}

                {/* Feature Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setPackingPanelOpen(true)}
                    className="block w-full text-left"
                    data-testid="card-packing"
                  >
                    <div className="bg-gradient-to-br from-primary/5 to-transparent rounded-3xl p-6 border border-primary/10 hover:border-primary/30 transition-colors h-full">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-3 bg-primary/20 text-primary rounded-2xl"><Briefcase className="h-5 w-5" /></div>
                        <h3 className="text-lg font-bold">{t("trip.packing")}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{packedCount}/{totalPacking} items packed</p>
                      <span className="text-primary text-sm font-medium inline-flex items-center">Open Packing <ChevronRight className="h-4 w-4 ml-1" /></span>
                    </div>
                  </button>

                  <Link href={`/trips/${trip.id}/budget`} className="block">
                    <div className="bg-gradient-to-br from-accent/5 to-transparent rounded-3xl p-6 border border-accent/10 hover:border-accent/30 transition-colors h-full" data-testid="card-budget">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-3 bg-accent/20 text-accent rounded-2xl"><DollarSign className="h-5 w-5" /></div>
                        <h3 className="text-lg font-bold">{t("trip.budget")}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{budgetData?.length || 0} expenses tracked</p>
                      <span className="text-accent text-sm font-medium inline-flex items-center">{t("trip.manage")} <ChevronRight className="h-4 w-4 ml-1" /></span>
                    </div>
                  </Link>

                  <Link href={`/trips/${trip.id}/documents`} className="block">
                    <div className="bg-gradient-to-br from-secondary/5 to-transparent rounded-3xl p-6 border border-secondary/10 hover:border-secondary/30 transition-colors h-full" data-testid="card-documents">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-3 bg-secondary/20 text-secondary rounded-2xl"><FileText className="h-5 w-5" /></div>
                        <h3 className="text-lg font-bold">{t("trip.vault")}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{docsData?.length || 0} documents stored</p>
                      <span className="text-secondary text-sm font-medium inline-flex items-center">{t("trip.manage")} <ChevronRight className="h-4 w-4 ml-1" /></span>
                    </div>
                  </Link>

                  <Link href={`/trips/${trip.id}/itinerary`} className="block">
                    <div className="bg-gradient-to-br from-blue-500/5 to-transparent rounded-3xl p-6 border border-blue-500/10 hover:border-blue-500/30 transition-colors h-full" data-testid="card-itinerary">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-3 bg-blue-500/20 text-blue-500 rounded-2xl"><CalendarDays className="h-5 w-5" /></div>
                        <h3 className="text-lg font-bold">{t("trip.itinerary")}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{daysPlanned} of {totalDays || '—'} days planned</p>
                      <span className="text-blue-500 text-sm font-medium inline-flex items-center">{t("trip.plan")} <ChevronRight className="h-4 w-4 ml-1" /></span>
                    </div>
                  </Link>
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-xl font-bold text-foreground mb-4">{t("trip.quickBookings")}</h3>
                {EXTERNAL_LINKS.map((link) => (
                  <a key={link.name} href={link.getUrl(quickBookingContext)} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-between p-4 bg-card hover:bg-muted/50 transition-colors rounded-2xl border border-border/50 hover:shadow-md group"
                    data-testid={`link-${link.name.toLowerCase()}`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${link.color}`}>{link.icon}</div>
                      <span className="font-semibold text-lg">{link.name}</span>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all" />
                  </a>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div key="ai" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="md:col-span-3 mb-2">
                <SafetyMap destination={trip.destination} />
              </div>

              <div className="md:col-span-1 space-y-3">
                {!entitlements?.hasProAccess && (
                  <div className="rounded-3xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
                    {t("trip.upgradeCard")}
                    <Button asChild size="sm" className="mt-3 rounded-xl">
                      <Link href="/pricing">{t("plan.pro")}</Link>
                    </Button>
                  </div>
                )}
                {aiButtons.map(btn => (
                  <Button key={btn.key} onClick={btn.onClick} disabled={btn.pending}
                    className={`w-full justify-start h-14 px-5 rounded-2xl text-base ${activeAiTool === btn.key ? btn.activeColor : 'bg-card text-foreground hover:bg-muted'}`}
                    data-testid={`button-ai-${btn.key}`}>
                    {btn.icon}
                    {btn.pending ? "Loading..." : btn.label}
                  </Button>
                ))}
              </div>
              
              <div ref={aiContentRef} className="md:col-span-2 space-y-8">
                {!activeAiTool ? (
                  <div className="h-full min-h-[300px] border-2 border-dashed border-border rounded-3xl flex flex-col items-center justify-center p-8 text-center bg-card/50">
                    <Sparkles className="h-16 w-16 text-muted-foreground/30 mb-4" />
                    <h3 className="text-xl font-semibold text-muted-foreground">{t("trip.selectTool")}</h3>
                    <p className="text-sm text-muted-foreground/70 mt-2 max-w-md">{t("trip.selectToolBody")}</p>
                  </div>
                ) : activeAiTool === "assistant" ? (
                  <div className="bg-card rounded-3xl p-5 md:p-6 border border-border/50 shadow-xl min-h-[420px] h-[72vh] max-h-[860px] flex flex-col">
                    <div className="mb-4">
                      <h2 className="text-2xl font-bold flex items-center gap-2">
                        {aiIconMap.assistant}
                        {aiTitleMap.assistant}
                      </h2>
                      <p className="mt-2 text-sm text-muted-foreground">{t("trip.assistantBody")}</p>
                    </div>

                    <div ref={assistantThreadRef} className="flex-1 overflow-y-auto rounded-2xl bg-muted/40 p-4">
                      <div className="space-y-3">
                        {assistantMessages.map((message, index) => (
                          <div
                            key={`${message.role}-${index}`}
                            className={`rounded-2xl px-4 py-3 text-sm ${
                              message.role === "user"
                                ? "ml-auto max-w-[90%] bg-primary text-primary-foreground"
                                : "max-w-[95%] border border-border/60 bg-background text-muted-foreground shadow-sm"
                            }`}
                          >
                            {message.role === "assistant" ? (
                              <div className="space-y-4">
                                <AiMarkdownCards
                                  content={message.content}
                                  autoLinkPlaces
                                  destinationContext={trip.destination}
                                />
                                {message.createdItineraryItem && (
                                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700">
                                    Added to itinerary: Day {message.createdItineraryItem.dayNumber}
                                    {message.createdItineraryItem.timeSlot ? ` at ${message.createdItineraryItem.timeSlot}` : ""}
                                  </div>
                                )}
                              </div>
                            ) : (
                              message.content
                            )}
                          </div>
                        ))}
                        {assistantMutation.isPending && (
                          <div className="max-w-[95%] rounded-2xl border border-border/60 bg-background px-4 py-3 text-sm text-muted-foreground shadow-sm">
                            Thinking...
                          </div>
                        )}
                      </div>
                    </div>

                    <form
                      className="mt-4 space-y-3 rounded-2xl border border-border/60 bg-background p-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!assistantMutation.isPending && assistantQuestion.trim()) {
                          handleAskAssistant();
                        }
                      }}
                    >
                      <Textarea
                        value={assistantQuestion}
                        onChange={(event) => setAssistantQuestion(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            if (!assistantMutation.isPending && assistantQuestion.trim()) {
                              handleAskAssistant();
                            }
                          }
                        }}
                        className="min-h-[88px] rounded-xl bg-white border-input"
                        placeholder={t("trip.assistantPlaceholder")}
                        data-testid="textarea-travel-assistant"
                      />
                      <div className="flex justify-end">
                        <Button
                          type="submit"
                          disabled={assistantMutation.isPending || !assistantQuestion.trim()}
                          className="rounded-2xl"
                          data-testid="button-travel-assistant"
                        >
                          {assistantMutation.isPending ? "Loading..." : t("trip.assistantSend")}
                        </Button>
                      </div>
                    </form>
                  </div>
                ) : activeAiTool === "trip-plan" ? (
                  <div className="space-y-6">
                    <div className="rounded-3xl border border-border/50 bg-card p-6 space-y-4">
                      <div>
                        <h3 className="font-semibold text-foreground">{t("trip.settingsTitle")}</h3>
                        <p className="text-xs text-muted-foreground mt-1">{t("trip.settingsBody")}</p>
                      </div>
                      <div className="grid gap-4 md:grid-cols-3">
                        <label className="block text-sm text-muted-foreground">
                          {t("trip.days")}
                          <input
                            type="text"
                            inputMode="numeric"
                            value={tripPlanDaysInput}
                            onChange={(event) => {
                              const nextValue = event.target.value.replace(/[^\d]/g, "").slice(0, 2);
                              setTripPlanDaysInput(nextValue);
                            }}
                            onBlur={() => {
                              const resolvedDays = parseTripPlanDaysInput(tripPlanDaysInput, tripPlanSettings.days);
                              setTripPlanSettings((current) => ({ ...current, days: resolvedDays }));
                              setTripPlanDaysInput(String(resolvedDays));
                            }}
                            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-foreground"
                            data-testid="input-trip-plan-days"
                          />
                        </label>
                        <div>
                          <span className="block text-sm text-muted-foreground mb-1">{t("trip.planDepth")}</span>
                          <Select
                            value={tripPlanSettings.planDepth}
                            onValueChange={(value: "quick" | "detailed") =>
                              setTripPlanSettings((current) => ({ ...current, planDepth: value }))
                            }
                          >
                            <SelectTrigger data-testid="select-trip-plan-depth">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="quick">{t("trip.quick")}</SelectItem>
                              <SelectItem value="detailed">{t("trip.detailed")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <span className="block text-sm text-muted-foreground mb-1">{t("trip.travelStyle")}</span>
                          <Select
                            value={tripPlanSettings.travelStyle}
                            onValueChange={(value: "balanced" | "food" | "culture" | "family" | "relaxed") =>
                              setTripPlanSettings((current) => ({ ...current, travelStyle: value }))
                            }
                          >
                            <SelectTrigger data-testid="select-trip-plan-style">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="balanced">{t("trip.styleBalanced")}</SelectItem>
                              <SelectItem value="food">{t("trip.styleFood")}</SelectItem>
                              <SelectItem value="culture">{t("trip.styleCulture")}</SelectItem>
                              <SelectItem value="family">{t("trip.styleFamily")}</SelectItem>
                              <SelectItem value="relaxed">{t("trip.styleRelaxed")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <Button onClick={handleGetTripPlan} disabled={tripPlanMutation.isPending} className="rounded-2xl" data-testid="button-generate-trip-plan">
                        {tripPlanMutation.isPending ? "Loading..." : t("trip.generatePlan")}
                      </Button>
                    </div>
                    {tripPlanMutation.isPending ? (
                      <div className="bg-card rounded-3xl p-8 border border-border/50 shadow-xl min-h-[300px]">
                        <div className="flex flex-col items-center justify-center h-full space-y-4 py-20 text-muted-foreground">
                          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
                          <p className="animate-pulse">AI is working...</p>
                        </div>
                      </div>
                    ) : !aiContent || aiContent.type !== "trip-plan" ? (
                      <div className="h-full min-h-[260px] border-2 border-dashed border-border rounded-3xl flex flex-col items-center justify-center p-8 text-center bg-card/50">
                        <Route className="h-16 w-16 text-muted-foreground/30 mb-4" />
                        <h3 className="text-xl font-semibold text-muted-foreground">{t("trip.tripPlan")}</h3>
                        <p className="text-sm text-muted-foreground/70 mt-2 max-w-md">{t("trip.selectToolBody")}</p>
                      </div>
                    ) : (
                      <div className="bg-card rounded-3xl p-8 border border-border/50 shadow-xl min-h-[300px]">
                        <div className="space-y-6">
                          <h2 className="text-2xl font-bold flex items-center gap-2">
                            {aiIconMap["trip-plan"]}
                            {aiTitleMap["trip-plan"]}
                          </h2>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                              {aiContent.content._cacheStatus === "hit" ? "Cache hit" : aiContent.content._cacheStatus === "miss" ? "Fresh generation" : "AI result"}
                            </span>
                            <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                              {aiContent.content.days} days
                            </span>
                            <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground capitalize">
                              {aiContent.content.planDepth}
                            </span>
                            <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground capitalize">
                              {aiContent.content.travelStyle}
                            </span>
                            <Button
                              onClick={handleSeedItinerary}
                              disabled={seedItineraryMutation.isPending}
                              className="ml-auto rounded-xl"
                              data-testid="button-seed-itinerary"
                            >
                              {seedItineraryMutation.isPending ? "Saving..." : t("trip.usePlan")}
                            </Button>
                          </div>

                          <div>
                            <h3 className="font-semibold text-foreground mb-2">Overview</h3>
                            <p className="text-muted-foreground leading-relaxed">{aiContent.content.overview}</p>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <h3 className="font-semibold text-foreground mb-2">Best For</h3>
                              <ul className="space-y-2 text-sm text-muted-foreground">
                                {aiContent.content.bestFor.map((item, index) => (
                                  <li key={`${item}-${index}`} className="rounded-xl bg-muted/50 px-3 py-2">{item}</li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <h3 className="font-semibold text-foreground mb-2">Key Areas</h3>
                              <ul className="space-y-2 text-sm text-muted-foreground">
                                {aiContent.content.neighborhoods.map((item, index) => (
                                  <li key={`${item}-${index}`} className="rounded-xl bg-muted/50 px-3 py-2">{item}</li>
                                ))}
                              </ul>
                            </div>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <h3 className="font-semibold text-foreground mb-2">Transport Basics</h3>
                              <ul className="space-y-2 text-sm text-muted-foreground">
                                {aiContent.content.transportTips.map((item, index) => (
                                  <li key={`${item}-${index}`} className="rounded-xl border border-border/50 px-3 py-2">{item}</li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <h3 className="font-semibold text-foreground mb-2">Etiquette</h3>
                              <ul className="space-y-2 text-sm text-muted-foreground">
                                {aiContent.content.etiquette.map((item, index) => (
                                  <li key={`${item}-${index}`} className="rounded-xl border border-border/50 px-3 py-2">{item}</li>
                                ))}
                              </ul>
                            </div>
                          </div>

                          <div>
                            <h3 className="font-semibold text-foreground mb-3">Suggested Itinerary</h3>
                            <div className="space-y-3">
                              {aiContent.content.itinerary.map((day) => (
                                <div key={day.dayNumber} className="rounded-2xl border border-border/50 p-4">
                                  <div className="flex items-center gap-3 mb-3">
                                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                                      {day.dayNumber}
                                    </span>
                                    <div>
                                      <h4 className="font-semibold text-foreground">{day.theme}</h4>
                                    </div>
                                  </div>
                                  <div className="space-y-2 text-sm text-muted-foreground">
                                    <p><span className="font-medium text-foreground">Morning:</span> {day.morning}</p>
                                    <p><span className="font-medium text-foreground">Afternoon:</span> {day.afternoon}</p>
                                    <p><span className="font-medium text-foreground">Evening:</span> {day.evening}</p>
                                    {day.foodNote && <p><span className="font-medium text-foreground">Food note:</span> {day.foodNote}</p>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div>
                            <h3 className="font-semibold text-foreground mb-2">{t("trip.verify")}</h3>
                            <ul className="space-y-2 text-sm text-muted-foreground">
                              {aiContent.content.dynamicNotes.map((item, index) => (
                                <li key={`${item}-${index}`} className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : activeAiTool === "customs" ? (
                  <div className="bg-card rounded-3xl p-8 border border-border/50 shadow-xl min-h-[300px]">
                    {customsMutation.isPending ? (
                      <div className="flex flex-col items-center justify-center h-full space-y-4 py-20 text-muted-foreground">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
                        <p className="animate-pulse">AI is working...</p>
                      </div>
                    ) : aiContent?.type === "customs" ? (
                      <div className="space-y-6">
                        <div>
                          <h2 className="text-2xl font-bold flex items-center gap-2">
                            {aiIconMap.customs}
                            {aiTitleMap.customs}
                          </h2>
                          <p className="mt-2 text-sm text-muted-foreground">{t("trip.customsBody")}</p>
                        </div>

                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100">
                          {aiContent.content.disclaimer}
                        </div>

                        <div className="space-y-6">
                          {aiContent.content.sections.map((section) => (
                            <div key={section.mode} className="space-y-4 rounded-3xl border border-border/50 bg-muted/10 p-5">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-lg font-semibold text-foreground">{section.title}</h3>
                                {section.queryLocation ? (
                                  <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                                    {section.queryLocation}
                                  </span>
                                ) : null}
                              </div>

                              {section.status === "verified" ? (
                                <>
                                  <div className="grid gap-4 md:grid-cols-3">
                                    <div className="rounded-2xl border border-border/60 bg-card p-4">
                                      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("trip.customsOfficial")}</h4>
                                      <p className="mt-2 font-semibold text-foreground">{section.officialName}</p>
                                    </div>
                                    <div className="rounded-2xl border border-border/60 bg-card p-4">
                                      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("trip.customsSource")}</h4>
                                      <p className="mt-2 font-semibold text-foreground">{section.sourceDomain}</p>
                                    </div>
                                    <div className="rounded-2xl border border-border/60 bg-card p-4">
                                      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("trip.customsDeadline")}</h4>
                                      <p className="mt-2 font-semibold text-foreground">{section.deadline}</p>
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap gap-3">
                                    <Button asChild className="rounded-2xl" data-testid={`button-customs-open-form-${section.mode}`}>
                                      <a href={section.officialUrl ?? "#"} target="_blank" rel="noopener noreferrer">
                                        {t("trip.customsOpenForm")}
                                      </a>
                                    </Button>
                                    <a
                                      href={section.officialUrl ?? "#"}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center text-sm font-medium text-primary underline underline-offset-4"
                                    >
                                      {section.sourceLabel}
                                    </a>
                                  </div>
                                </>
                              ) : (
                                <div className="rounded-2xl border border-border/60 bg-card p-4 text-sm text-muted-foreground">
                                  {section.summary || t("trip.customsUnavailable")}
                                </div>
                              )}

                              {section.status === "verified" ? <AiMarkdownCards content={section.summary} /> : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl bg-muted/40 p-6 text-sm text-muted-foreground">
                        Select the tool again to generate fresh content for this panel.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-card rounded-3xl p-8 border border-border/50 shadow-xl min-h-[300px]">
                    {isAiLoading ? (
                      <div className="flex flex-col items-center justify-center h-full space-y-4 py-20 text-muted-foreground">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
                        <p className="animate-pulse">AI is working...</p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <h2 className="text-2xl font-bold flex items-center gap-2">
                          {activeAiTool && aiIconMap[activeAiTool]}
                          {activeAiTool && aiTitleMap[activeAiTool]}
                        </h2>
                        {aiContent && aiContent.type === activeAiTool ? (
                          typeof aiContent.content === "string" ? (
                            <AiMarkdownCards content={aiContent.content} />
                          ) : null
                        ) : (
                          <div className="rounded-2xl bg-muted/40 p-6 text-sm text-muted-foreground">
                            Select the tool again to generate fresh content for this panel.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {activeAiTool && activeAiTool !== "assistant" && (
                  <div className="rounded-3xl border border-border/50 bg-card p-5 shadow-xl">
                    <div className="mb-3 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-semibold text-foreground">
                        Talk to Annai about {getAiToolLabel(activeAiTool)}
                      </h3>
                    </div>

                    {sectionReply && (
                      <div className="mb-3 rounded-2xl border border-border/60 bg-background p-4">
                        <AiMarkdownCards
                          content={sectionReply}
                          autoLinkPlaces
                          destinationContext={trip.destination}
                        />
                      </div>
                    )}

                    <form
                      className="space-y-3 rounded-2xl border border-border/60 bg-background p-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!sectionAssistantMutation.isPending && sectionQuestion.trim()) {
                          handleAskSectionAssistant();
                        }
                      }}
                    >
                      <Textarea
                        value={sectionQuestion}
                        onChange={(event) => setSectionQuestion(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            if (!sectionAssistantMutation.isPending && sectionQuestion.trim()) {
                              handleAskSectionAssistant();
                            }
                          }
                        }}
                        className="min-h-[88px] rounded-xl bg-white border-input"
                        placeholder={`Ask a follow-up about ${getAiToolLabel(activeAiTool)}.`}
                        data-testid="textarea-section-assistant"
                      />
                      <div className="flex justify-end">
                        <Button
                          type="submit"
                          disabled={sectionAssistantMutation.isPending || !sectionQuestion.trim()}
                          className="rounded-2xl"
                          data-testid="button-section-assistant"
                        >
                          {sectionAssistantMutation.isPending ? "Loading..." : "Ask Annai"}
                        </Button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <TripForm open={isEditOpen} onOpenChange={setIsEditOpen} trip={trip} />
      <TripPackingPanel tripId={tripId} open={packingPanelOpen} onOpenChange={setPackingPanelOpen} />
    </div>
  );
}
