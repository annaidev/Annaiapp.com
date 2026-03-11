import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useUser } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import AccountPage from "@/pages/AccountPage";
import Home from "@/pages/Home";
import AuthPage from "@/pages/AuthPage";
import TravelAuthPage from "@/pages/TravelAuth";
import TripDashboard from "@/pages/TripDashboard";
import PackingList from "@/pages/PackingList";
import BudgetTracker from "@/pages/BudgetTracker";
import DocumentVault from "@/pages/DocumentVault";
import ItineraryBuilder from "@/pages/ItineraryBuilder";
import PricingPage from "@/pages/PricingPage";
import { useLocation } from "wouter";
import { I18nProvider } from "@/lib/i18n";

function Router() {
  const [location] = useLocation();
  const { data: user, isLoading } = useUser();

  if (location === "/auth/camping") {
    return <TravelAuthPage />;
  }

  // Avoid blocking the whole app on slow backend wake-ups.
  if (!user || isLoading) {
    return <AuthPage />;
  }

  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/account" component={AccountPage} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/travel" component={Home} />
      <Route path="/trips/:id" component={TripDashboard} />
      <Route path="/trips/:id/packing-list" component={PackingList} />
      <Route path="/trips/:id/budget" component={BudgetTracker} />
      <Route path="/trips/:id/documents" component={DocumentVault} />
      <Route path="/trips/:id/itinerary" component={ItineraryBuilder} />
      <Route component={NotFound} />
    </Switch>
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
