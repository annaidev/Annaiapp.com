import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { format, differenceInDays, isAfter, isBefore } from "date-fns";
import { Plus, MapPin, Calendar as CalendarIcon, Trash2, Clock } from "lucide-react";
import { useTrips, useDeleteTrip } from "@/hooks/use-trips";
import { TripForm } from "@/components/TripForm";
import { Button } from "@/components/ui/button";
import { NavBar } from "@/components/NavBar";

function getCountdown(startDate: string | null, endDate: string | null) {
  const now = new Date();
  if (!startDate) return null;
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : null;

  if (end && isAfter(now, end)) return { label: "Trip completed", color: "text-muted-foreground bg-muted" };
  if (isBefore(now, start)) {
    const days = differenceInDays(start, now);
    if (days === 0) return { label: "Starts today!", color: "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/30" };
    if (days === 1) return { label: "Starts tomorrow!", color: "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/30" };
    return { label: `${days} days to go`, color: "text-secondary bg-secondary/10" };
  }
  return { label: "Happening now!", color: "text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/30" };
}

function getHeroImage(destination: string) {
  const city = destination.split(",")[0].trim();
  return `https://source.unsplash.com/800x400/?${encodeURIComponent(city)}+travel+landmark`;
}

export default function Home() {
  const { data: trips, isLoading } = useTrips();
  const deleteMutation = useDeleteTrip();
  const [isFormOpen, setIsFormOpen] = useState(false);

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };
  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-3" data-testid="text-page-title">
              Your Upcoming Adventures
            </h1>
            <p className="text-lg text-muted-foreground">
              Plan, organize, and experience the world with Annai.
            </p>
          </div>
          <Button 
            onClick={() => setIsFormOpen(true)}
            size="lg"
            className="rounded-2xl h-14 px-8 text-lg bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all"
            data-testid="button-new-trip"
          >
            <Plus className="mr-2 h-5 w-5" />
            Plan New Trip
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-72 rounded-3xl bg-muted/50 animate-pulse" />
            ))}
          </div>
        ) : !trips?.length ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-24 px-6 bg-card rounded-3xl border border-dashed border-border shadow-sm"
          >
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <MapPin className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-3">No trips planned yet</h2>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              Ready for a getaway? Start planning your next dream vacation.
            </p>
            <Button 
              onClick={() => setIsFormOpen(true)}
              variant="outline"
              className="rounded-xl border-primary text-primary hover:bg-primary/5"
            >
              <Plus className="mr-2 h-4 w-4" /> Create First Trip
            </Button>
          </motion.div>
        ) : (
          <motion.div 
            variants={container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {trips.map((trip) => {
              const countdown = getCountdown(trip.startDate, trip.endDate);
              return (
                <motion.div key={trip.id} variants={item}>
                  <Link 
                    href={`/trips/${trip.id}`}
                    className="group block relative h-full rounded-3xl overflow-hidden hover-lift"
                    data-testid={`card-trip-${trip.id}`}
                  >
                    <div className="absolute inset-0 z-0">
                      <img 
                        src={getHeroImage(trip.destination)} 
                        alt=""
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />
                    </div>
                    
                    <div className="relative z-10 h-full flex flex-col p-6 min-h-[240px]">
                      <div className="flex justify-between items-start mb-4">
                        {countdown && (
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${countdown.color}`} data-testid={`badge-countdown-${trip.id}`}>
                            <Clock className="h-3 w-3" />
                            {countdown.label}
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-white/70 hover:text-red-400 hover:bg-red-500/20 -mr-2 -mt-2 z-20"
                          data-testid={`button-delete-trip-${trip.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            if (confirm("Are you sure you want to delete this trip?")) {
                              deleteMutation.mutate(trip.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      <div className="mt-auto">
                        {(trip.startDate || trip.endDate) && (
                          <div className="flex items-center text-white/80 mb-3 font-medium text-sm">
                            <CalendarIcon className="h-4 w-4 mr-2 opacity-70" />
                            {trip.startDate && format(new Date(trip.startDate), 'MMM d, yyyy')}
                            {trip.startDate && trip.endDate && " - "}
                            {trip.endDate && format(new Date(trip.endDate), 'MMM d, yyyy')}
                          </div>
                        )}
                        
                        <div className="flex items-center text-sm font-semibold text-white/90">
                          View Details
                          <span className="ml-2 transform group-hover:translate-x-1 transition-transform">→</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </main>

      <TripForm open={isFormOpen} onOpenChange={setIsFormOpen} />
    </div>
  );
}
