import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useUser } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import AuthPage from "@/pages/AuthPage";
import TripDashboard from "@/pages/TripDashboard";
import PackingList from "@/pages/PackingList";
import BudgetTracker from "@/pages/BudgetTracker";
import DocumentVault from "@/pages/DocumentVault";
import ItineraryBuilder from "@/pages/ItineraryBuilder";
import { Loader2 } from "lucide-react";

function Router() {
  const { data: user, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <Switch>
      <Route path="/" component={Home} />
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
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
