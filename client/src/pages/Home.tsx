import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { Plus, MapPin, Calendar as CalendarIcon, Trash2 } from "lucide-react";
import { useTrips, useDeleteTrip } from "@/hooks/use-trips";
import { TripForm } from "@/components/TripForm";
import { Button } from "@/components/ui/button";
import { NavBar } from "@/components/NavBar";

export default function Home() {
  const { data: trips, isLoading } = useTrips();
  const deleteMutation = useDeleteTrip();
  const [isFormOpen, setIsFormOpen] = useState(false);

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
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
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-3">
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
          >
            <Plus className="mr-2 h-5 w-5" />
            Plan New Trip
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 rounded-3xl bg-muted/50 animate-pulse" />
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
              Ready for a getaway? Start planning your next dream vacation. We'll help you organize everything from packing lists to cultural tips.
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
            {trips.map((trip) => (
              <motion.div key={trip.id} variants={item}>
                <Link 
                  href={`/trips/${trip.id}`}
                  className="group block relative h-full glass-card rounded-3xl p-6 hover-lift"
                >
                  {/* landing page hero scenic mountain landscape */}
                  <div className="absolute inset-0 z-0 opacity-0 group-hover:opacity-30 transition-opacity duration-500 rounded-3xl overflow-hidden pointer-events-none">
                     <img src="https://images.unsplash.com/photo-1488085061387-422e29b40080?w=800&auto=format&fit=crop" alt="" className="w-full h-full object-cover" />
                  </div>
                  
                  <div className="relative z-10 h-full flex flex-col">
                    <div className="flex justify-between items-start mb-4">
                      <div className="p-3 bg-primary/10 text-primary rounded-2xl">
                        <MapPin className="h-6 w-6" />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 -mr-2 -mt-2 z-20"
                        onClick={(e) => {
                          e.preventDefault(); // Prevent navigating to trip
                          if (confirm("Are you sure you want to delete this trip?")) {
                            deleteMutation.mutate(trip.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <h3 className="text-2xl font-bold text-foreground mb-2 line-clamp-1 group-hover:text-primary transition-colors">
                      {trip.destination}
                    </h3>
                    
                    {(trip.startDate || trip.endDate) && (
                      <div className="flex items-center text-muted-foreground mb-4 font-medium">
                        <CalendarIcon className="h-4 w-4 mr-2 opacity-70" />
                        {trip.startDate && format(new Date(trip.startDate), 'MMM d, yyyy')}
                        {trip.startDate && trip.endDate && " - "}
                        {trip.endDate && format(new Date(trip.endDate), 'MMM d, yyyy')}
                      </div>
                    )}
                    
                    <div className="mt-auto pt-6 flex items-center text-sm font-semibold text-primary">
                      View Details
                      <span className="ml-2 transform group-hover:translate-x-1 transition-transform">→</span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}
      </main>

      <TripForm open={isFormOpen} onOpenChange={setIsFormOpen} />
    </div>
  );
}
