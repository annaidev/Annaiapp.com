import { useState } from "react";
import { useRoute, Link } from "wouter";
import { format, differenceInDays, isBefore, isAfter } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, MapPin, Calendar, Edit3, Briefcase, 
  Sparkles, ShieldAlert, Globe, ChevronRight, 
  Home, Plane, Building2, Car, Languages, CloudSun,
  DollarSign, FileText, CalendarDays, CheckCircle2, Clock
} from "lucide-react";
import { useTrip } from "@/hooks/use-trips";
import { useCulturalTips, useSafetyAdvice, usePhrases, useWeather } from "@/hooks/use-ai";
import { NavBar } from "@/components/NavBar";
import { Button } from "@/components/ui/button";
import { TripForm } from "@/components/TripForm";
import { SafetyMap } from "@/components/SafetyMap";
import { useQuery } from "@tanstack/react-query";

const EXTERNAL_LINKS = [
  { name: "Airbnb", icon: <Home className="h-5 w-5" />, color: "bg-[#FF5A5F]/10 text-[#FF5A5F]", getUrl: (dest: string) => `https://www.airbnb.com/s/${encodeURIComponent(dest)}/homes` },
  { name: "Flights", icon: <Plane className="h-5 w-5" />, color: "bg-blue-500/10 text-blue-600", getUrl: (dest: string) => `https://www.google.com/travel/flights?q=${encodeURIComponent(dest)}` },
  { name: "Hotels", icon: <Building2 className="h-5 w-5" />, color: "bg-indigo-500/10 text-indigo-600", getUrl: (dest: string) => `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(dest)}` },
  { name: "Uber", icon: <Car className="h-5 w-5" />, color: "bg-black/10 text-black dark:bg-white/10 dark:text-white", getUrl: () => `https://m.uber.com/looking` },
];

function getHeroImage(destination: string) {
  const city = destination.split(",")[0].trim();
  return `https://loremflickr.com/1200/400/${encodeURIComponent(city)},travel,landmark`;
}

function getCountdownText(startDate: string | null, endDate: string | null) {
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
  const [, params] = useRoute("/trips/:id");
  const tripId = parseInt(params?.id || "0", 10);
  const { data: trip, isLoading } = useTrip(tripId);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "ai">("overview");
  
  const tipsMutation = useCulturalTips();
  const safetyMutation = useSafetyAdvice();
  const phrasesMutation = usePhrases();
  const weatherMutation = useWeather();

  const [aiContent, setAiContent] = useState<{type: string, content: string} | null>(null);

  const { data: packingItems, isLoading: packingLoading } = useQuery({ queryKey: ['/api/trips', tripId, 'packing-lists'], queryFn: () => fetch(`/api/trips/${tripId}/packing-lists`).then(r => r.json()), enabled: !!trip });
  const { data: budgetData, isLoading: budgetLoading } = useQuery({ queryKey: ['/api/trips', tripId, 'budget-items'], queryFn: () => fetch(`/api/trips/${tripId}/budget-items`).then(r => r.json()), enabled: !!trip });
  const { data: docsData, isLoading: docsLoading } = useQuery({ queryKey: ['/api/trips', tripId, 'documents'], queryFn: () => fetch(`/api/trips/${tripId}/documents`).then(r => r.json()), enabled: !!trip });
  const { data: itineraryData, isLoading: itineraryLoading } = useQuery({ queryKey: ['/api/trips', tripId, 'itinerary'], queryFn: () => fetch(`/api/trips/${tripId}/itinerary`).then(r => r.json()), enabled: !!trip });

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
    tipsMutation.mutate(trip.destination, {
      onSuccess: (data) => setAiContent({ type: 'tips', content: data.tips })
    });
  };
  const handleGetSafety = () => {
    safetyMutation.mutate({ destination: trip.destination, citizenship: trip.citizenship || undefined }, {
      onSuccess: (data) => setAiContent({ type: 'safety', content: data.advice })
    });
  };
  const handleGetPhrases = () => {
    phrasesMutation.mutate(trip.destination, {
      onSuccess: (data) => setAiContent({ type: 'phrases', content: data.phrases })
    });
  };
  const handleGetWeather = () => {
    weatherMutation.mutate({
      destination: trip.destination,
      startDate: trip.startDate ? format(new Date(trip.startDate), 'yyyy-MM-dd') : undefined,
      endDate: trip.endDate ? format(new Date(trip.endDate), 'yyyy-MM-dd') : undefined,
    }, {
      onSuccess: (data) => setAiContent({ type: 'weather', content: data.forecast })
    });
  };

  const aiButtons = [
    { key: 'safety', label: 'Safety & Embassy', icon: <ShieldAlert className="h-5 w-5 mr-3" />, onClick: handleGetSafety, pending: safetyMutation.isPending, activeColor: 'bg-destructive text-white shadow-lg' },
    { key: 'tips', label: 'Cultural Etiquette', icon: <Globe className="h-5 w-5 mr-3" />, onClick: handleGetTips, pending: tipsMutation.isPending, activeColor: 'bg-secondary text-white shadow-lg' },
    { key: 'phrases', label: 'Local Phrases', icon: <Languages className="h-5 w-5 mr-3" />, onClick: handleGetPhrases, pending: phrasesMutation.isPending, activeColor: 'bg-accent text-accent-foreground shadow-lg' },
    { key: 'weather', label: 'Weather Forecast', icon: <CloudSun className="h-5 w-5 mr-3" />, onClick: handleGetWeather, pending: weatherMutation.isPending, activeColor: 'bg-blue-500 text-white shadow-lg' },
  ];

  const aiIconMap: Record<string, JSX.Element> = {
    tips: <Globe className="text-secondary" />,
    safety: <ShieldAlert className="text-destructive" />,
    phrases: <Languages className="text-accent" />,
    weather: <CloudSun className="text-blue-500" />,
  };
  const aiTitleMap: Record<string, string> = {
    tips: 'Cultural Insights',
    safety: 'Safety Advice',
    phrases: 'Essential Phrases',
    weather: 'Weather Forecast',
  };

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/" className="inline-flex items-center text-muted-foreground hover:text-primary mb-8 transition-colors">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Trips
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
                  <span className="text-white/80 font-medium tracking-wide uppercase text-sm">Destination</span>
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
                <Edit3 className="h-4 w-4 mr-2" /> Edit Trip
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
            Overview & Planning
          </button>
          <button 
            onClick={() => setActiveTab("ai")}
            className={`pb-4 px-4 text-lg font-medium transition-colors border-b-2 flex items-center gap-2 ${activeTab === "ai" ? "border-secondary text-secondary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            data-testid="tab-ai"
          >
            <Sparkles className="h-5 w-5" /> Destination Info
          </button>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === "overview" ? (
            <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                {/* Trip Readiness */}
                <div className="bg-card rounded-3xl p-8 shadow-sm border border-border/50">
                  <h2 className="text-2xl font-bold mb-6 flex items-center gap-2" data-testid="text-readiness-title">
                    <CheckCircle2 className="h-6 w-6 text-secondary" /> Trip Readiness
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-muted/50 rounded-2xl p-4 text-center">
                      {packingLoading ? <div className="h-9 w-16 mx-auto bg-muted animate-pulse rounded" /> : (
                        <div className="text-3xl font-bold text-primary" data-testid="text-packing-pct">{packingPct}%</div>
                      )}
                      <div className="text-sm text-muted-foreground mt-1">Packed</div>
                      <div className="w-full bg-muted rounded-full h-2 mt-2">
                        <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${packingPct}%` }} />
                      </div>
                    </div>
                    <div className="bg-muted/50 rounded-2xl p-4 text-center">
                      {docsLoading ? <div className="h-9 w-10 mx-auto bg-muted animate-pulse rounded" /> : (
                        <div className="text-3xl font-bold text-secondary" data-testid="text-docs-count">{docsData?.length || 0}</div>
                      )}
                      <div className="text-sm text-muted-foreground mt-1">Documents</div>
                    </div>
                    <div className="bg-muted/50 rounded-2xl p-4 text-center">
                      {budgetLoading ? <div className="h-9 w-10 mx-auto bg-muted animate-pulse rounded" /> : (
                        <div className="text-3xl font-bold text-accent" data-testid="text-budget-count">{budgetData?.length || 0}</div>
                      )}
                      <div className="text-sm text-muted-foreground mt-1">Expenses</div>
                    </div>
                    <div className="bg-muted/50 rounded-2xl p-4 text-center">
                      {itineraryLoading ? <div className="h-9 w-16 mx-auto bg-muted animate-pulse rounded" /> : (
                        <div className="text-3xl font-bold text-blue-500" data-testid="text-itinerary-progress">{totalDays > 0 ? `${daysPlanned}/${totalDays}` : '—'}</div>
                      )}
                      <div className="text-sm text-muted-foreground mt-1">Days Planned</div>
                    </div>
                  </div>
                </div>

                {trip.notes && (
                  <div className="bg-card rounded-3xl p-8 shadow-sm border border-border/50">
                    <h2 className="text-2xl font-bold mb-4">Travel Notes</h2>
                    <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">{trip.notes}</p>
                  </div>
                )}

                {/* Feature Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Link href={`/trips/${trip.id}/packing-list`} className="block">
                    <div className="bg-gradient-to-br from-primary/5 to-transparent rounded-3xl p-6 border border-primary/10 hover:border-primary/30 transition-colors h-full" data-testid="card-packing">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-3 bg-primary/20 text-primary rounded-2xl"><Briefcase className="h-5 w-5" /></div>
                        <h3 className="text-lg font-bold">Packing List</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{packedCount}/{totalPacking} items packed</p>
                      <span className="text-primary text-sm font-medium inline-flex items-center">Manage <ChevronRight className="h-4 w-4 ml-1" /></span>
                    </div>
                  </Link>

                  <Link href={`/trips/${trip.id}/budget`} className="block">
                    <div className="bg-gradient-to-br from-accent/5 to-transparent rounded-3xl p-6 border border-accent/10 hover:border-accent/30 transition-colors h-full" data-testid="card-budget">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-3 bg-accent/20 text-accent rounded-2xl"><DollarSign className="h-5 w-5" /></div>
                        <h3 className="text-lg font-bold">Budget Tracker</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{budgetData?.length || 0} expenses tracked</p>
                      <span className="text-accent text-sm font-medium inline-flex items-center">Manage <ChevronRight className="h-4 w-4 ml-1" /></span>
                    </div>
                  </Link>

                  <Link href={`/trips/${trip.id}/documents`} className="block">
                    <div className="bg-gradient-to-br from-secondary/5 to-transparent rounded-3xl p-6 border border-secondary/10 hover:border-secondary/30 transition-colors h-full" data-testid="card-documents">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-3 bg-secondary/20 text-secondary rounded-2xl"><FileText className="h-5 w-5" /></div>
                        <h3 className="text-lg font-bold">Document Vault</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{docsData?.length || 0} documents stored</p>
                      <span className="text-secondary text-sm font-medium inline-flex items-center">Manage <ChevronRight className="h-4 w-4 ml-1" /></span>
                    </div>
                  </Link>

                  <Link href={`/trips/${trip.id}/itinerary`} className="block">
                    <div className="bg-gradient-to-br from-blue-500/5 to-transparent rounded-3xl p-6 border border-blue-500/10 hover:border-blue-500/30 transition-colors h-full" data-testid="card-itinerary">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-3 bg-blue-500/20 text-blue-500 rounded-2xl"><CalendarDays className="h-5 w-5" /></div>
                        <h3 className="text-lg font-bold">Itinerary</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{daysPlanned} of {totalDays || '—'} days planned</p>
                      <span className="text-blue-500 text-sm font-medium inline-flex items-center">Plan <ChevronRight className="h-4 w-4 ml-1" /></span>
                    </div>
                  </Link>
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-xl font-bold text-foreground mb-4">Quick Bookings</h3>
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
                {aiButtons.map(btn => (
                  <Button key={btn.key} onClick={btn.onClick} disabled={btn.pending}
                    className={`w-full justify-start h-14 px-5 rounded-2xl text-base ${aiContent?.type === btn.key ? btn.activeColor : 'bg-card text-foreground hover:bg-muted'}`}
                    data-testid={`button-ai-${btn.key}`}>
                    {btn.icon}
                    {btn.pending ? "Loading..." : btn.label}
                  </Button>
                ))}
              </div>
              
              <div className="md:col-span-2 space-y-8">
                {!aiContent && !tipsMutation.isPending && !safetyMutation.isPending && !phrasesMutation.isPending && !weatherMutation.isPending ? (
                  <div className="h-full min-h-[300px] border-2 border-dashed border-border rounded-3xl flex flex-col items-center justify-center p-8 text-center bg-card/50">
                    <Sparkles className="h-16 w-16 text-muted-foreground/30 mb-4" />
                    <h3 className="text-xl font-semibold text-muted-foreground">Select an AI tool</h3>
                    <p className="text-sm text-muted-foreground/70 mt-2 max-w-md">Get safety reports, cultural tips, local phrases, and weather forecasts.</p>
                  </div>
                ) : (
                  <div className="bg-card rounded-3xl p-8 border border-border/50 shadow-xl min-h-[300px]">
                    {tipsMutation.isPending || safetyMutation.isPending || phrasesMutation.isPending || weatherMutation.isPending ? (
                      <div className="flex flex-col items-center justify-center h-full space-y-4 py-20 text-muted-foreground">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
                        <p className="animate-pulse">AI is working its magic...</p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <h2 className="text-2xl font-bold flex items-center gap-2">
                          {aiContent?.type && aiIconMap[aiContent.type]}
                          {aiContent?.type && aiTitleMap[aiContent.type]}
                        </h2>
                        <div className="prose dark:prose-invert max-w-none text-muted-foreground">
                          {typeof aiContent?.content === 'string' && aiContent.content.split('\n').map((para, i) => (
                            <p key={i} className="mb-4 leading-relaxed text-lg">{para}</p>
                          ))}
                        </div>
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
