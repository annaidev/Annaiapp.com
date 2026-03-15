import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { format, differenceInDays, isAfter, isBefore } from "date-fns";
import { Plus, MapPin, Calendar as CalendarIcon, Trash2, Clock, BookOpen, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { useTrips, useDeleteTrip } from "@/hooks/use-trips";
import { useUser } from "@/hooks/use-auth";
import { TripForm } from "@/components/TripForm";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { NavBar } from "@/components/NavBar";
import { getDestinationFallbackArt, getDestinationImageUrl } from "@/lib/destination-art";
import { useI18n } from "@/lib/i18n";

const HOME_TUTORIAL_VERSION = "v1";

function getHomeTutorialStorageKey(username?: string | null) {
  return `annai:tutorial:home:${HOME_TUTORIAL_VERSION}:${(username ?? "guest").toLowerCase()}`;
}

function getCountdown(startDate: Date | string | null, endDate: Date | string | null) {
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

export default function Home() {
  const { data: user } = useUser();
  const { data: trips, isLoading } = useTrips();
  const deleteMutation = useDeleteTrip();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [tripPendingDelete, setTripPendingDelete] = useState<number | null>(null);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [tutorialStepIndex, setTutorialStepIndex] = useState(0);
  const { t } = useI18n();

  const tutorialSteps = useMemo(
    () => [
      {
        title: t("home.tutorial.step1Title"),
        description: t("home.tutorial.step1Body"),
      },
      {
        title: t("home.tutorial.step2Title"),
        description: t("home.tutorial.step2Body"),
      },
      {
        title: t("home.tutorial.step3Title"),
        description: t("home.tutorial.step3Body"),
      },
      {
        title: t("home.tutorial.step4Title"),
        description: t("home.tutorial.step4Body"),
      },
      {
        title: t("home.tutorial.step5Title"),
        description: t("home.tutorial.step5Body"),
      },
    ],
    [t],
  );

  const tutorialProgress = ((tutorialStepIndex + 1) / tutorialSteps.length) * 100;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const tutorialState = window.localStorage.getItem(getHomeTutorialStorageKey(user?.username));
    if (tutorialState !== "done") {
      setIsTutorialOpen(true);
      setTutorialStepIndex(0);
    }
  }, [user?.username]);

  const markTutorialAsSeen = () => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(getHomeTutorialStorageKey(user?.username), "done");
  };

  const closeTutorial = () => {
    markTutorialAsSeen();
    setIsTutorialOpen(false);
  };

  const openTutorial = () => {
    setTutorialStepIndex(0);
    setIsTutorialOpen(true);
  };

  const goToNextTutorialStep = () => {
    if (tutorialStepIndex >= tutorialSteps.length - 1) {
      closeTutorial();
      return;
    }
    setTutorialStepIndex((current) => current + 1);
  };

  const goToPreviousTutorialStep = () => {
    setTutorialStepIndex((current) => Math.max(0, current - 1));
  };

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
              {t("home.title")}
            </h1>
            <p className="text-lg text-muted-foreground">
              {t("home.subtitle")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={openTutorial}
              size="lg"
              variant="outline"
              className="rounded-2xl h-14 px-6 text-base"
              data-testid="button-open-home-tutorial"
            >
              <BookOpen className="mr-2 h-5 w-5" />
              {t("home.tutorial.open")}
            </Button>
            <Button 
              onClick={() => setIsFormOpen(true)}
              size="lg"
              className="rounded-2xl h-14 px-8 text-lg bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all"
              data-testid="button-new-trip"
            >
              <Plus className="mr-2 h-5 w-5" />
              {t("home.newTrip")}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-72 rounded-3xl bg-muted/50 animate-pulse" />
            ))}
          </div>
        ) : !trips?.length ? (
          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-24 px-6 bg-card rounded-3xl border border-dashed border-border shadow-sm"
            >
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <MapPin className="h-10 w-10 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-3">{t("home.emptyTitle")}</h2>
              <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                {t("home.emptyBody")}
              </p>
              <Button
                onClick={() => setIsFormOpen(true)}
                variant="outline"
                className="rounded-xl border-primary text-primary hover:bg-primary/5"
              >
                <Plus className="mr-2 h-4 w-4" /> {t("home.createFirst")}
              </Button>
            </motion.div>
          </div>
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
                  <div
                    className="group relative h-full rounded-3xl overflow-hidden hover-lift"
                    data-testid={`card-trip-${trip.id}`}
                  >
                    <Link
                      href={`/trips/${trip.id}`}
                      className="absolute inset-0 z-10 rounded-3xl"
                      aria-label={`Open trip ${trip.destination}`}
                    />
                    <div className="absolute inset-0 z-0">
                      <img 
                        src={getDestinationImageUrl(trip.destination, 800, 400)}
                        alt=""
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        onError={(event) => {
                          event.currentTarget.onerror = null;
                          event.currentTarget.src = getDestinationFallbackArt(trip.destination, 800, 400);
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />
                    </div>
                    
                    <div className="relative z-20 h-full flex flex-col p-6 min-h-[240px] pointer-events-none">
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
                          className="pointer-events-auto text-white/70 hover:text-red-400 hover:bg-red-500/20 -mr-2 -mt-2 z-20"
                          data-testid={`button-delete-trip-${trip.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setTripPendingDelete(trip.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      <div className="mt-auto">
                        <h3 className="text-2xl font-bold text-white mb-2 line-clamp-1 drop-shadow-md" data-testid={`text-destination-${trip.id}`}>
                          {trip.destination}
                        </h3>
                        {trip.origin && (
                          <div className="flex items-center text-white/80 mb-2 text-sm">
                            <MapPin className="h-4 w-4 mr-2 opacity-70" />
                            {trip.origin} {trip.tripType === "round_trip" ? "• Round trip" : "• One way"}
                          </div>
                        )}
                        {(trip.startDate || trip.endDate) && (
                          <div className="flex items-center text-white/80 mb-3 font-medium text-sm">
                            <CalendarIcon className="h-4 w-4 mr-2 opacity-70" />
                            {trip.startDate && format(new Date(trip.startDate), 'MMM d, yyyy')}
                            {trip.startDate && trip.endDate && " - "}
                            {trip.endDate && format(new Date(trip.endDate), 'MMM d, yyyy')}
                          </div>
                        )}
                        
                        <div className="flex items-center text-sm font-semibold text-white/90">
                          {t("home.viewDetails")}
                          <span className="ml-2 transform group-hover:translate-x-1 transition-transform">→</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </main>

      <Dialog
        open={isTutorialOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeTutorial();
            return;
          }
          setIsTutorialOpen(true);
        }}
      >
        <DialogContent className="max-w-xl rounded-3xl p-0 overflow-hidden">
          <div className="p-6 sm:p-8">
            <DialogHeader className="text-left">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary w-fit">
                <Sparkles className="h-4 w-4" />
                {t("home.tutorial.badge")}
              </div>
              <DialogTitle className="mt-3 text-2xl font-bold">
                {tutorialSteps[tutorialStepIndex]?.title}
              </DialogTitle>
              <DialogDescription className="mt-2 text-base leading-relaxed text-muted-foreground">
                {tutorialSteps[tutorialStepIndex]?.description}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {t("home.tutorial.stepLabel", {
                    current: tutorialStepIndex + 1,
                    total: tutorialSteps.length,
                  })}
                </span>
                <span>{Math.round(tutorialProgress)}%</span>
              </div>
              <Progress value={tutorialProgress} className="h-2" />
            </div>

            <DialogFooter className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between sm:space-x-0">
              <Button variant="ghost" className="rounded-2xl" onClick={closeTutorial} data-testid="button-home-tutorial-skip">
                {t("home.tutorial.skip")}
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="rounded-2xl"
                  onClick={goToPreviousTutorialStep}
                  disabled={tutorialStepIndex === 0}
                  data-testid="button-home-tutorial-previous"
                >
                  <ChevronLeft className="h-4 w-4" />
                  {t("home.tutorial.previous")}
                </Button>
                <Button className="rounded-2xl" onClick={goToNextTutorialStep} data-testid="button-home-tutorial-next">
                  {tutorialStepIndex >= tutorialSteps.length - 1 ? t("home.tutorial.finish") : t("home.tutorial.next")}
                  {tutorialStepIndex < tutorialSteps.length - 1 && <ChevronRight className="h-4 w-4" />}
                </Button>
              </div>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <TripForm open={isFormOpen} onOpenChange={setIsFormOpen} />

      <AlertDialog open={tripPendingDelete !== null} onOpenChange={(open) => !open && setTripPendingDelete(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete trip?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this trip? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-2xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (tripPendingDelete !== null) {
                  deleteMutation.mutate(tripPendingDelete);
                }
                setTripPendingDelete(null);
              }}
            >
              Delete Trip
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
