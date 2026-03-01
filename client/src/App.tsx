import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import TripDashboard from "@/pages/TripDashboard";
import PackingList from "@/pages/PackingList";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/trips/:id" component={TripDashboard} />
      <Route path="/trips/:id/packing-list" component={PackingList} />
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
