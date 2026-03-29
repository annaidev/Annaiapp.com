import { lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useUser } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import AnnaiHub from "@/pages/AnnaiHub";
import AuthPage from "@/pages/AuthPage";
import { useLocation } from "wouter";
import { I18nProvider } from "@/lib/i18n";

const AccountPage = lazy(() => import("@/pages/AccountPage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const TravelAuthPage = lazy(() => import("@/pages/TravelAuth"));
const TripDashboard = lazy(() => import("@/pages/TripDashboard"));
const BudgetTracker = lazy(() => import("@/pages/BudgetTracker"));
const DocumentVault = lazy(() => import("@/pages/DocumentVault"));
const ItineraryBuilder = lazy(() => import("@/pages/ItineraryBuilder"));
const PricingPage = lazy(() => import("@/pages/PricingPage"));

function PageLoader() {
  return (
    <div className="min-h-screen bg-background px-6 py-12">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-full bg-muted/60" />
        <div className="h-28 animate-pulse rounded-[2rem] bg-muted/50" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-40 animate-pulse rounded-[2rem] bg-muted/40" />
          <div className="h-40 animate-pulse rounded-[2rem] bg-muted/40" />
        </div>
      </div>
    </div>
  );
}

function Router() {
  const [location] = useLocation();
  const { data: user, isLoading } = useUser();

  if (location === "/auth/camping") {
    return (
      <Suspense fallback={<PageLoader />}>
        <TravelAuthPage />
      </Suspense>
    );
  }

  if (isLoading) {
    return <PageLoader />;
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={AnnaiHub} />
        <Route path="/home" component={AnnaiHub} />
        <Route path="/account" component={AccountPage} />
        <Route path="/profile" component={ProfilePage} />
        <Route path="/pricing" component={PricingPage} />
        <Route path="/travel" component={Home} />
        <Route path="/trips/:id" component={TripDashboard} />
        <Route path="/trips/:id/budget" component={BudgetTracker} />
        <Route path="/trips/:id/documents" component={DocumentVault} />
        <Route path="/trips/:id/itinerary" component={ItineraryBuilder} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

export default App;
