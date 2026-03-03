import { useState } from "react";
import { useRoute, Link } from "wouter";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, MapPin, Calendar, Edit3, Briefcase, 
  Sparkles, ShieldAlert, Globe, ChevronRight, CheckCircle2,
  AlertTriangle, Shield, Plus, Home, Plane, Building2, Car
} from "lucide-react";
import { useTrip } from "@/hooks/use-trips";
import { useCulturalTips, useSafetyAdvice } from "@/hooks/use-ai";
import { NavBar } from "@/components/NavBar";
import { Button } from "@/components/ui/button";
import { TripForm } from "@/components/TripForm";
import { SafetyMap } from "@/components/SafetyMap";

const EXTERNAL_LINKS = [
  { name: "Airbnb", icon: <Home className="h-5 w-5" />, color: "bg-[#FF5A5F]/10 text-[#FF5A5F]", getUrl: (dest: string) => `https://www.airbnb.com/s/${encodeURIComponent(dest)}/homes` },
  { name: "Flights", icon: <Plane className="h-5 w-5" />, color: "bg-blue-500/10 text-blue-600", getUrl: (dest: string) => `https://www.google.com/travel/flights?q=${encodeURIComponent(dest)}` },
  { name: "Hotels", icon: <Building2 className="h-5 w-5" />, color: "bg-indigo-500/10 text-indigo-600", getUrl: (dest: string) => `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(dest)}` },
  { name: "Uber", icon: <Car className="h-5 w-5" />, color: "bg-black/10 text-black dark:bg-white/10 dark:text-white", getUrl: () => `https://m.uber.com/looking` },
];

export default function TripDashboard() {
  const [, params] = useRoute("/trips/:id");
  const tripId = parseInt(params?.id || "0", 10);
  const { data: trip, isLoading } = useTrip(tripId);
  const [isEditOpen, setIsEditOpen] = useState(false);

  // AI Tools state
  const [activeTab, setActiveTab] = useState<"overview" | "ai">("overview");
  
  const tipsMutation = useCulturalTips();
  const safetyMutation = useSafetyAdvice();

  const [aiContent, setAiContent] = useState<{type: string, content: string} | null>(null);

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;
  if (!trip) return <div className="min-h-screen flex items-center justify-center">Trip not found</div>;

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

  return (
    <div className="min-h-screen bg-background">
      <NavBar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/" className="inline-flex items-center text-muted-foreground hover:text-primary mb-8 transition-colors">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Trips
        </Link>

        {/* Header Hero Card */}
        <div className="relative glass-card rounded-3xl p-8 md:p-12 mb-8 overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-primary/10 rounded-xl text-primary">
                  <MapPin className="h-6 w-6" />
                </div>
                <span className="text-primary font-medium tracking-wide uppercase">Destination</span>
              </div>
              <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-4">
                {trip.destination}
              </h1>
              {(trip.startDate || trip.endDate) && (
                <div className="flex items-center text-xl text-muted-foreground font-medium">
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
              className="rounded-xl glass border-border hover:bg-muted h-12 px-6 shadow-sm"
              data-testid="button-edit-trip"
            >
              <Edit3 className="h-4 w-4 mr-2" /> Edit Trip
            </Button>
          </div>
        </div>

        {/* Tab Navigation */}
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
            className={`pb-4 px-4 text-lg font-medium transition-colors border-b-2 flex items-center gap-2 ${activeTab === "ai" ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            data-testid="tab-ai"
          >
            <Sparkles className="h-5 w-5" /> AI Tools
          </button>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === "overview" ? (
            <motion.div 
              key="overview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            >
              <div className="lg:col-span-2 space-y-8">
                {trip.notes && (
                  <div className="bg-card rounded-3xl p-8 shadow-sm border border-border/50">
                    <h2 className="text-2xl font-bold mb-4">Travel Notes</h2>
                    <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">{trip.notes}</p>
                  </div>
                )}

                <div className="bg-gradient-to-br from-primary/5 to-transparent rounded-3xl p-8 border border-primary/10">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-primary/20 text-primary rounded-2xl">
                        <Briefcase className="h-6 w-6" />
                      </div>
                      <h2 className="text-2xl font-bold">Packing List</h2>
                    </div>
                    <Link href={`/trips/${trip.id}/packing-list`} className="text-primary hover:underline font-medium inline-flex items-center">
                      Manage <ChevronRight className="h-4 w-4 ml-1" />
                    </Link>
                  </div>
                  <p className="text-muted-foreground mb-6">Keep track of everything you need for the trip.</p>
                  <Link href={`/trips/${trip.id}/packing-list`} className="w-full">
                    <Button className="w-full sm:w-auto rounded-xl bg-primary hover:bg-primary/90" data-testid="button-open-checklist">
                      Open Checklist
                    </Button>
                  </Link>
                </div>

                {/* Cultural Insights in Overview */}
                <div className="bg-gradient-to-br from-accent/5 to-transparent rounded-3xl p-8 border border-accent/10">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-accent/10 text-accent rounded-2xl">
                      <Globe className="h-6 w-6" />
                    </div>
                    <h2 className="text-2xl font-bold">Cultural Insights</h2>
                  </div>
                  <p className="text-muted-foreground mb-6">Learn about local customs, etiquette, and essential tips for your destination.</p>
                  <Button 
                    onClick={() => {
                      setActiveTab("ai");
                      handleGetTips();
                    }}
                    variant="outline"
                    className="rounded-xl border-accent/20 text-accent hover:bg-accent/5"
                  >
                    Get Cultural Tips
                  </Button>
                </div>

                {/* Safety Section */}
                <div className="bg-gradient-to-br from-destructive/5 to-transparent rounded-3xl p-8 border border-destructive/10">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-destructive/10 text-destructive rounded-2xl">
                      <ShieldAlert className="h-6 w-6" />
                    </div>
                    <h2 className="text-2xl font-bold">Safety & Crime Data</h2>
                  </div>
                  <p className="text-muted-foreground mb-6">Get real-time AI insights on areas to avoid and common scams based on local safety data.</p>
                  <Button 
                    onClick={() => {
                      setActiveTab("ai");
                      handleGetSafety();
                    }}
                    variant="outline"
                    className="rounded-xl border-destructive/20 text-destructive hover:bg-destructive/5"
                  >
                    View Safety Report
                  </Button>
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-xl font-bold text-foreground mb-4">Quick Bookings</h3>
                {EXTERNAL_LINKS.map((link) => (
                  <a
                    key={link.name}
                    href={link.getUrl(trip.destination)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-4 bg-card hover:bg-muted/50 transition-colors rounded-2xl border border-border/50 hover:shadow-md group"
                    data-testid={`link-${link.name.toLowerCase()}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${link.color}`}>
                        {link.icon}
                      </div>
                      <span className="font-semibold text-lg">{link.name}</span>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all" />
                  </a>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="ai"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-8"
            >
              <div className="md:col-span-1 space-y-4">
                <Button 
                  onClick={handleGetSafety} 
                  disabled={safetyMutation.isPending}
                  className={`w-full justify-start h-16 px-6 rounded-2xl text-lg ${aiContent?.type === 'safety' ? 'bg-destructive text-white shadow-lg' : 'bg-card text-foreground hover:bg-muted'}`}
                  data-testid="button-safety-advice"
                >
                  <ShieldAlert className="h-5 w-5 mr-3" /> 
                  {safetyMutation.isPending ? "Analyzing..." : "Safety & Embassy Info"}
                </Button>
                <Button 
                  onClick={handleGetTips} 
                  disabled={tipsMutation.isPending}
                  className={`w-full justify-start h-16 px-6 rounded-2xl text-lg ${aiContent?.type === 'tips' ? 'bg-accent text-white shadow-lg' : 'bg-card text-foreground hover:bg-muted'}`}
                  data-testid="button-cultural-tips"
                >
                  <Globe className="h-5 w-5 mr-3" /> 
                  {tipsMutation.isPending ? "Gathering..." : "Cultural Etiquette"}
                </Button>
              </div>
              
              <div className="md:col-span-2 space-y-8">
                {!aiContent && !tipsMutation.isPending && !safetyMutation.isPending ? (
                  <div className="h-full min-h-[300px] border-2 border-dashed border-border rounded-3xl flex flex-col items-center justify-center p-8 text-center bg-card/50">
                    <Sparkles className="h-16 w-16 text-muted-foreground/30 mb-4" />
                    <h3 className="text-xl font-semibold text-muted-foreground">Select an AI tool</h3>
                    <p className="text-sm text-muted-foreground/70 mt-2 max-w-md">Get safety reports, embassy info, and cultural etiquette for your destination.</p>
                  </div>
                ) : (
                  <div className="bg-card rounded-3xl p-8 border border-border/50 shadow-xl min-h-[300px]">
                    {tipsMutation.isPending || safetyMutation.isPending ? (
                      <div className="flex flex-col items-center justify-center h-full space-y-4 py-20 text-muted-foreground">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
                        <p className="animate-pulse">AI is working its magic...</p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <h2 className="text-2xl font-bold flex items-center gap-2">
                          {aiContent?.type === 'tips' ? <Globe className="text-accent" /> : <ShieldAlert className="text-destructive" />}
                          {aiContent?.type === 'tips' ? 'Cultural Insights' : 'Safety Advice'}
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

                <SafetyMap destination={trip.destination} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <TripForm open={isEditOpen} onOpenChange={setIsEditOpen} trip={trip} />
    </div>
  );
}
