import { useState } from "react";
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
import { useCulturalTips, useSafetyAdvice, usePhrases, useTravelAssistant, useTripPlan, useWeather } from "@/hooks/use-ai";
import { NavBar } from "@/components/NavBar";
import { Button } from "@/components/ui/button";
import { TripForm } from "@/components/TripForm";
import { SafetyMap } from "@/components/SafetyMap";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useEntitlements } from "@/hooks/use-entitlements";
import { api, buildUrl } from "@shared/routes";
import { useI18n } from "@/lib/i18n";

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

const EXTERNAL_LINKS = [
  { name: "Airbnb", icon: <Home className="h-5 w-5" />, color: "bg-[#FF5A5F]/10 text-[#FF5A5F]", getUrl: (dest: string) => `https://www.airbnb.com/s/${encodeURIComponent(dest)}/homes` },
  { name: "Flights", icon: <Plane className="h-5 w-5" />, color: "bg-blue-500/10 text-blue-600", getUrl: (dest: string) => `https://www.google.com/travel/flights?q=${encodeURIComponent(dest)}` },
  { name: "Hotels", icon: <Building2 className="h-5 w-5" />, color: "bg-indigo-500/10 text-indigo-600", getUrl: (dest: string) => `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(dest)}` },
  { name: "Uber", icon: <Car className="h-5 w-5" />, color: "bg-black/10 text-black dark:bg-white/10 dark:text-white", getUrl: () => `https://m.uber.com/looking` },
  { name: "Metro", icon: <Route className="h-5 w-5" />, color: "bg-emerald-500/10 text-emerald-600", getUrl: (dest: string) => `https://www.google.com/search?q=${encodeURIComponent(`${dest} metro map`)}` },
  { name: "Rental Car", icon: <Car className="h-5 w-5" />, color: "bg-orange-500/10 text-orange-600", getUrl: (dest: string) => `https://www.kayak.com/cars/${encodeURIComponent(dest)}` },
  { name: "Turo", icon: <Car className="h-5 w-5" />, color: "bg-sky-500/10 text-sky-600", getUrl: (dest: string) => `https://turo.com/us/en/search?searchTerm=${encodeURIComponent(dest)}` },
];

function getHeroImage(destination: string) {
  const city = destination.split(",")[0].trim();
  return `https://loremflickr.com/1200/400/${encodeURIComponent(city)},travel,landmark`;
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
  const [activeAiTool, setActiveAiTool] = useState<"assistant" | "trip-plan" | "tips" | "safety" | "phrases" | "weather" | null>(null);
  
  const tipsMutation = useCulturalTips();
  const safetyMutation = useSafetyAdvice();
  const phrasesMutation = usePhrases();
  const weatherMutation = useWeather();
  const tripPlanMutation = useTripPlan();
  const assistantMutation = useTravelAssistant();
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantMessages, setAssistantMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [tripPlanSettings, setTripPlanSettings] = useState<{
    days: number;
    planDepth: "quick" | "detailed";
    travelStyle: "balanced" | "food" | "culture" | "family" | "relaxed";
  }>({
    days: 5,
    planDepth: "quick",
    travelStyle: "balanced",
  });

  const [aiContent, setAiContent] = useState<
    | { type: "tips" | "safety" | "phrases" | "weather"; content: string }
    | { type: "trip-plan"; content: TripPlanResult }
    | null
  >(null);

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
      const buildEntries = () =>
        plan.itinerary.flatMap((day) => {
          const entries: Array<{
            dayNumber: number;
            timeSlot: string;
            title: string;
            description: string;
            category: string;
            sourceFingerprint: string | null;
          }> = [
            {
              dayNumber: day.dayNumber,
              timeSlot: "09:00",
              title: `Morning - ${day.theme}`,
              description: day.morning,
              category: "sightseeing",
              sourceFingerprint: plan._seedFingerprint,
            },
            {
              dayNumber: day.dayNumber,
              timeSlot: "13:00",
              title: `Afternoon - ${day.theme}`,
              description: day.afternoon,
              category: "activity",
              sourceFingerprint: plan._seedFingerprint,
            },
            {
              dayNumber: day.dayNumber,
              timeSlot: "18:00",
              title: `Evening - ${day.theme}`,
              description: day.evening,
              category: "activity",
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
              sourceFingerprint: plan._seedFingerprint,
            });
          }

          return entries;
        });

      const entries = buildEntries();
      await Promise.all(
        entries.map(async (entry) => {
          const url = buildUrl(api.itineraryItems.create.path, { tripId });
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(entry),
            credentials: "include",
          });
          if (!res.ok) {
            throw new Error("Failed to seed itinerary");
          }
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
    safetyMutation.mutate({ destination: trip.destination, citizenship: trip.citizenship || undefined }, {
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
  const handleOpenTripPlan = () => {
    setActiveAiTool("trip-plan");
  };
  const handleGetTripPlan = () => {
    setActiveAiTool("trip-plan");
    if (!entitlements?.enabledFeatures.includes("ai_itinerary")) {
      setLocation("/pricing");
      return;
    }
    tripPlanMutation.mutate(
      {
        destination: trip.destination,
        days: tripPlanSettings.days,
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
  const handleAskAssistant = () => {
    const question = assistantQuestion.trim();
    if (!question) return;
    setActiveAiTool("assistant");
    if (!entitlements?.enabledFeatures.includes("ai_itinerary")) {
      setLocation("/pricing");
      return;
    }

    setAssistantMessages((current) => [...current, { role: "user", content: question }]);
    setAssistantQuestion("");
    assistantMutation.mutate(
      { tripId, question },
      {
        onSuccess: (data) => {
          setAssistantMessages((current) => [...current, { role: "assistant", content: data.answer }]);
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
    { key: 'phrases', label: t("trip.phrases"), icon: <Languages className="h-5 w-5 mr-3" />, onClick: handleGetPhrases, pending: phrasesMutation.isPending, activeColor: 'bg-accent text-accent-foreground shadow-lg' },
    { key: 'weather', label: t("trip.weather"), icon: <CloudSun className="h-5 w-5 mr-3" />, onClick: handleGetWeather, pending: weatherMutation.isPending, activeColor: 'bg-blue-500 text-white shadow-lg' },
  ];

  const aiIconMap: Record<string, JSX.Element> = {
    assistant: <Sparkles className="text-primary" />,
    'trip-plan': <Route className="text-primary" />,
    tips: <Globe className="text-secondary" />,
    safety: <ShieldAlert className="text-destructive" />,
    phrases: <Languages className="text-accent" />,
    weather: <CloudSun className="text-blue-500" />,
  };
  const aiTitleMap: Record<string, string> = {
    assistant: t("trip.askAnnai"),
    'trip-plan': t("trip.tripPlan"),
    tips: t("trip.culture"),
    safety: t("trip.safety"),
    phrases: t("trip.phrases"),
    weather: t("trip.weather"),
  };
  const isAiLoading =
    tipsMutation.isPending ||
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
            <img src={getHeroImage(trip.destination)} alt={trip.destination} className="w-full h-full object-cover" />
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
                  <Link href={`/trips/${trip.id}/packing-list`} className="block">
                    <div className="bg-gradient-to-br from-primary/5 to-transparent rounded-3xl p-6 border border-primary/10 hover:border-primary/30 transition-colors h-full" data-testid="card-packing">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-3 bg-primary/20 text-primary rounded-2xl"><Briefcase className="h-5 w-5" /></div>
                        <h3 className="text-lg font-bold">{t("trip.packing")}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{packedCount}/{totalPacking} items packed</p>
                      <span className="text-primary text-sm font-medium inline-flex items-center">{t("trip.manage")} <ChevronRight className="h-4 w-4 ml-1" /></span>
                    </div>
                  </Link>

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
                  <a key={link.name} href={link.getUrl(trip.destination)} target="_blank" rel="noopener noreferrer"
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
              
              <div className="md:col-span-2 space-y-8">
                {!activeAiTool ? (
                  <div className="h-full min-h-[300px] border-2 border-dashed border-border rounded-3xl flex flex-col items-center justify-center p-8 text-center bg-card/50">
                    <Sparkles className="h-16 w-16 text-muted-foreground/30 mb-4" />
                    <h3 className="text-xl font-semibold text-muted-foreground">{t("trip.selectTool")}</h3>
                    <p className="text-sm text-muted-foreground/70 mt-2 max-w-md">{t("trip.selectToolBody")}</p>
                  </div>
                ) : activeAiTool === "assistant" ? (
                  <div className="bg-card rounded-3xl p-8 border border-border/50 shadow-xl min-h-[300px] space-y-6">
                    <div>
                      <h2 className="text-2xl font-bold flex items-center gap-2">
                        {aiIconMap.assistant}
                        {aiTitleMap.assistant}
                      </h2>
                      <p className="mt-2 text-sm text-muted-foreground">{t("trip.assistantBody")}</p>
                    </div>
                    <Textarea
                      value={assistantQuestion}
                      onChange={(event) => setAssistantQuestion(event.target.value)}
                      className="min-h-[120px] rounded-2xl"
                      placeholder={t("trip.assistantPlaceholder")}
                      data-testid="textarea-travel-assistant"
                    />
                    <Button
                      onClick={handleAskAssistant}
                      disabled={assistantMutation.isPending || !assistantQuestion.trim()}
                      className="rounded-2xl"
                      data-testid="button-travel-assistant"
                    >
                      {assistantMutation.isPending ? "Loading..." : t("trip.assistantSend")}
                    </Button>
                    <div className="space-y-3 rounded-2xl bg-muted/40 p-4">
                      {assistantMessages.length === 0 && !assistantMutation.isPending ? (
                        <p className="text-sm text-muted-foreground">{t("trip.assistantEmpty")}</p>
                      ) : (
                        assistantMessages.map((message, index) => (
                          <div
                            key={`${message.role}-${index}`}
                            className={`rounded-2xl px-4 py-3 text-sm ${
                              message.role === "user"
                                ? "ml-auto max-w-[85%] bg-primary text-primary-foreground"
                                : "max-w-[90%] bg-background text-muted-foreground"
                            }`}
                          >
                            {message.content}
                          </div>
                        ))
                      )}
                    </div>
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
                            type="number"
                            min={1}
                            max={21}
                            value={tripPlanSettings.days}
                            onChange={(event) =>
                              setTripPlanSettings((current) => ({
                                ...current,
                                days: Math.max(1, Math.min(21, Number(event.target.value) || 1)),
                              }))
                            }
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
                          <div className="prose dark:prose-invert max-w-none text-muted-foreground">
                            {typeof aiContent.content === 'string' && aiContent.content.split('\n').map((para, i) => (
                              <p key={i} className="mb-4 leading-relaxed text-lg">{para}</p>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-2xl bg-muted/40 p-6 text-sm text-muted-foreground">
                            Select the tool again to generate fresh content for this panel.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <TripForm open={isEditOpen} onOpenChange={setIsEditOpen} trip={trip} />
    </div>
  );
}
