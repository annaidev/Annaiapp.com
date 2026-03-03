import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Plus, Trash2, Utensils, Car, Building2,
  ShoppingBag, Ticket, MoreHorizontal, DollarSign, TrendingUp
} from "lucide-react";
import { useTrip } from "@/hooks/use-trips";
import { NavBar } from "@/components/NavBar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient as qc } from "@/lib/queryClient";
import { insertBudgetItemSchema } from "@shared/schema";
import type { BudgetItem } from "@shared/schema";

const CATEGORIES = [
  { value: "food", label: "Food & Dining", icon: Utensils, color: "hsl(4, 80%, 64%)" },
  { value: "transport", label: "Transport", icon: Car, color: "hsl(174, 60%, 42%)" },
  { value: "lodging", label: "Lodging", icon: Building2, color: "hsl(38, 95%, 60%)" },
  { value: "activities", label: "Activities", icon: Ticket, color: "hsl(262, 60%, 58%)" },
  { value: "shopping", label: "Shopping", icon: ShoppingBag, color: "hsl(330, 65%, 55%)" },
  { value: "other", label: "Other", icon: MoreHorizontal, color: "hsl(220, 10%, 45%)" },
];

function getCategoryInfo(value: string) {
  return CATEGORIES.find(c => c.value === value) || CATEGORIES[CATEGORIES.length - 1];
}

function formatCurrency(cents: number, currency: string = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

const formSchema = insertBudgetItemSchema.omit({ tripId: true }).extend({
  amount: z.string().min(1, "Amount is required"),
  description: z.string().min(1, "Description is required"),
  category: z.string().min(1, "Category is required"),
  currency: z.string().optional(),
});

export default function BudgetTracker() {
  const [, params] = useRoute("/trips/:id/budget");
  const tripId = parseInt(params?.id || "0", 10);
  const { data: trip, isLoading: tripLoading } = useTrip(tripId);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);

  const { data: budgetItems = [], isLoading: itemsLoading } = useQuery<BudgetItem[]>({
    queryKey: ['/api/trips', tripId, 'budget-items'],
    queryFn: async () => {
      const res = await fetch(`/api/trips/${tripId}/budget-items`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch budget items");
      return res.json();
    },
    enabled: !!tripId,
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { description: "", amount: "", category: "food", currency: "USD" },
  });

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      const amountCents = Math.round(parseFloat(data.amount) * 100);
      const res = await apiRequest("POST", `/api/trips/${tripId}/budget-items`, {
        description: data.description,
        category: data.category,
        amount: amountCents,
        currency: data.currency || "USD",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trips', tripId, 'budget-items'] });
      form.reset({ description: "", amount: "", category: "food", currency: "USD" });
      setShowForm(false);
      toast({ title: "Expense added", description: "Your expense has been recorded." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/budget-items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trips', tripId, 'budget-items'] });
      toast({ title: "Expense deleted" });
    },
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    createMutation.mutate(data);
  };

  if (tripLoading || itemsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (!trip) {
    return <div className="min-h-screen flex items-center justify-center">Trip not found</div>;
  }

  const totalCents = budgetItems.reduce((sum, item) => sum + item.amount, 0);

  const categoryTotals = CATEGORIES.map(cat => {
    const items = budgetItems.filter(b => b.category === cat.value);
    const total = items.reduce((sum, item) => sum + item.amount, 0);
    return { ...cat, total, count: items.length };
  }).filter(c => c.total > 0);

  const maxCategoryTotal = Math.max(...categoryTotals.map(c => c.total), 1);

  return (
    <div className="min-h-screen bg-background">
      <NavBar />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href={`/trips/${trip.id}`} className="inline-flex items-center text-muted-foreground hover:text-primary mb-8 transition-colors" data-testid="link-back-to-trip">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to {trip.destination}
        </Link>

        <div className="flex flex-row items-start justify-between gap-4 flex-wrap mb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2" data-testid="text-budget-title">
              Budget Tracker
            </h1>
            <p className="text-muted-foreground text-lg">{trip.destination}</p>
          </div>
          <Button
            onClick={() => setShowForm(!showForm)}
            className="rounded-xl"
            data-testid="button-add-expense"
          >
            <Plus className="h-4 w-4 mr-2" /> Add Expense
          </Button>
        </div>

        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mb-8"
            >
              <Card className="p-6 rounded-2xl">
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Dinner at local restaurant" {...field} data-testid="input-expense-description" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Amount</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" min="0" placeholder="0.00" {...field} data-testid="input-expense-amount" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-expense-category">
                                <SelectValue placeholder="Select category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {CATEGORIES.map(cat => (
                                <SelectItem key={cat.value} value={cat.value} data-testid={`option-category-${cat.value}`}>
                                  {cat.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <div className="sm:col-span-2 flex justify-end gap-2 flex-wrap">
                      <Button type="button" variant="ghost" onClick={() => setShowForm(false)} data-testid="button-cancel-expense">
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createMutation.isPending} data-testid="button-save-expense">
                        {createMutation.isPending ? "Saving..." : "Save Expense"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <Card className="p-6 rounded-2xl mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary/10 rounded-xl text-primary">
              <DollarSign className="h-5 w-5" />
            </div>
            <span className="text-muted-foreground font-medium">Total Spent</span>
          </div>
          <p className="text-4xl font-bold text-foreground" data-testid="text-total-spent">
            {formatCurrency(totalCents)}
          </p>
          <p className="text-sm text-muted-foreground mt-1">{budgetItems.length} expense{budgetItems.length !== 1 ? "s" : ""} recorded</p>
        </Card>

        {categoryTotals.length > 0 && (
          <Card className="p-6 rounded-2xl mb-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-accent/10 rounded-xl text-accent">
                <TrendingUp className="h-5 w-5" />
              </div>
              <h2 className="text-xl font-bold">Spending by Category</h2>
            </div>

            <div className="space-y-4">
              {categoryTotals.map(cat => {
                const Icon = cat.icon;
                const percentage = totalCents > 0 ? Math.round((cat.total / totalCents) * 100) : 0;
                const barWidth = Math.round((cat.total / maxCategoryTotal) * 100);
                return (
                  <div key={cat.value} data-testid={`category-row-${cat.value}`}>
                    <div className="flex items-center justify-between gap-4 mb-1.5 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" style={{ color: cat.color }} />
                        <span className="font-medium text-sm">{cat.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">{percentage}%</span>
                        <span className="font-semibold text-sm">{formatCurrency(cat.total)}</span>
                      </div>
                    </div>
                    <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${barWidth}%` }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex flex-wrap gap-2 justify-center">
              {categoryTotals.map(cat => {
                const percentage = totalCents > 0 ? Math.round((cat.total / totalCents) * 100) : 0;
                const Icon = cat.icon;
                return (
                  <div
                    key={cat.value}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                    style={{ backgroundColor: `${cat.color}15`, color: cat.color }}
                  >
                    <Icon className="h-3 w-3" />
                    {cat.label} {percentage}%
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        <div className="space-y-3">
          <h2 className="text-xl font-bold mb-4">All Expenses</h2>
          {budgetItems.length === 0 ? (
            <Card className="p-8 rounded-2xl text-center">
              <DollarSign className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium" data-testid="text-no-expenses">No expenses yet</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Add your first expense to start tracking your budget.</p>
            </Card>
          ) : (
            budgetItems.map((item) => {
              const cat = getCategoryInfo(item.category);
              const Icon = cat.icon;
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Card className="p-4 rounded-2xl" data-testid={`expense-item-${item.id}`}>
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="p-2 rounded-xl shrink-0"
                          style={{ backgroundColor: `${cat.color}15`, color: cat.color }}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate" data-testid={`text-expense-desc-${item.id}`}>
                            {item.description}
                          </p>
                          <p className="text-xs text-muted-foreground">{cat.label}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-foreground" data-testid={`text-expense-amount-${item.id}`}>
                          {formatCurrency(item.amount, item.currency || "USD")}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(item.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-expense-${item.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
