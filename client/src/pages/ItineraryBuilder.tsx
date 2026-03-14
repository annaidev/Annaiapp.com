import { useState, useMemo } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { addDays, differenceInDays, format } from "date-fns";
import {
  ArrowLeft, CalendarDays, Plus, Trash2, Clock,
  MapPin, Utensils, Car, Camera, Loader2, Pencil, Save, X
} from "lucide-react";
import { useTrip } from "@/hooks/use-trips";
import { useToast } from "@/hooks/use-toast";
import { NavBar } from "@/components/NavBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, buildUrl } from "@shared/routes";
import type { ItineraryItem } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

const CATEGORIES = [
  { value: "activity", label: "Activity", icon: MapPin, color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  { value: "meal", label: "Meal", icon: Utensils, color: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20" },
  { value: "transport", label: "Transport", icon: Car, color: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20" },
  { value: "sightseeing", label: "Sightseeing", icon: Camera, color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
];

function getCategoryStyle(category: string) {
  return CATEGORIES.find(c => c.value === category) || CATEGORIES[0];
}

function getCategoryIcon(category: string) {
  const cat = getCategoryStyle(category);
  const Icon = cat.icon;
  return <Icon className="h-4 w-4" />;
}

export default function ItineraryBuilder() {
  const [, params] = useRoute("/trips/:id/itinerary");
  const tripId = parseInt(params?.id || "0", 10);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: trip, isLoading: isLoadingTrip } = useTrip(tripId);
  const { data: items, isLoading: isLoadingItems } = useQuery<ItineraryItem[]>({
    queryKey: [api.itineraryItems.listByTrip.path, tripId],
    queryFn: async () => {
      const url = buildUrl(api.itineraryItems.listByTrip.path, { tripId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch itinerary");
      return res.json();
    },
    enabled: !!tripId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { dayNumber: number; timeSlot: string; title: string; description: string; category: string }) => {
      const url = buildUrl(api.itineraryItems.create.path, { tripId });
      const res = await apiRequest(api.itineraryItems.create.method, url, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.itineraryItems.listByTrip.path, tripId] });
      toast({ title: "Added", description: "Itinerary item added." });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.itineraryItems.delete.path, { id });
      await apiRequest(api.itineraryItems.delete.method, url);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.itineraryItems.listByTrip.path, tripId] });
      toast({ title: "Deleted", description: "Itinerary item removed." });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: {
      id: number;
      dayNumber: number;
      timeSlot: string;
      title: string;
      description: string;
      category: string;
      }) => {
      const url = buildUrl(api.itineraryItems.update.path, { id: data.id });
      const res = await apiRequest(api.itineraryItems.update.method, url, {
          dayNumber: data.dayNumber,
          timeSlot: data.timeSlot,
          title: data.title,
          description: data.description,
          category: data.category,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.itineraryItems.listByTrip.path, tripId] });
      toast({ title: "Updated", description: "Itinerary item saved." });
      setEditingItemId(null);
    },
  });

  const [showForm, setShowForm] = useState(false);
  const [formDay, setFormDay] = useState(1);
  const [formTime, setFormTime] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formCategory, setFormCategory] = useState("activity");
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editDay, setEditDay] = useState(1);
  const [editTime, setEditTime] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editCategory, setEditCategory] = useState("activity");

  const totalDays = useMemo(() => {
    if (!trip?.startDate || !trip?.endDate) return 3;
    return Math.max(1, differenceInDays(new Date(trip.endDate), new Date(trip.startDate)) + 1);
  }, [trip]);

  const dayDates = useMemo(() => {
    if (!trip?.startDate) return [];
    return Array.from({ length: totalDays }, (_, i) =>
      addDays(new Date(trip.startDate!), i)
    );
  }, [trip, totalDays]);

  const itemsByDay = useMemo(() => {
    const map: Record<number, ItineraryItem[]> = {};
    for (let d = 1; d <= totalDays; d++) map[d] = [];
    (items || []).forEach(item => {
      if (!map[item.dayNumber]) map[item.dayNumber] = [];
      map[item.dayNumber].push(item);
    });
    Object.values(map).forEach(arr =>
      arr.sort((a, b) => (a.timeSlot || "").localeCompare(b.timeSlot || ""))
    );
    return map;
  }, [items, totalDays]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;
    createMutation.mutate({
      dayNumber: formDay,
      timeSlot: formTime,
      title: formTitle.trim(),
      description: formDesc.trim(),
      category: formCategory,
    }, {
      onSuccess: () => {
        setFormTitle("");
        setFormDesc("");
        setFormTime("");
        setShowForm(false);
      },
    });
  };

  const startEditing = (item: ItineraryItem) => {
    setEditingItemId(item.id);
    setEditDay(item.dayNumber);
    setEditTime(item.timeSlot || "");
    setEditTitle(item.title);
    setEditDesc(item.description || "");
    setEditCategory(item.category);
  };

  const cancelEditing = () => {
    setEditingItemId(null);
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItemId || !editTitle.trim()) return;
    updateMutation.mutate({
      id: editingItemId,
      dayNumber: editDay,
      timeSlot: editTime,
      title: editTitle.trim(),
      description: editDesc.trim(),
      category: editCategory,
    });
  };

  if (isLoadingTrip || isLoadingItems) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }
  if (!trip) return <div className="min-h-screen flex items-center justify-center">Trip not found</div>;

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href={`/trips/${trip.id}`}
          className="inline-flex items-center text-muted-foreground hover:text-primary mb-8 transition-colors"
          data-testid="link-back-dashboard"
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard
        </Link>

        <div className="bg-card rounded-3xl p-8 border border-border/50 shadow-xl mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-secondary/10 rounded-2xl text-secondary">
                <CalendarDays className="h-8 w-8" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-foreground" data-testid="text-itinerary-title">Itinerary</h1>
                <p className="text-muted-foreground font-medium mt-1">for {trip.destination}</p>
              </div>
            </div>

            <Button
              onClick={() => setShowForm(!showForm)}
              className="rounded-xl bg-secondary hover:bg-secondary/90 shadow-lg shadow-secondary/20"
              data-testid="button-toggle-add-form"
            >
              <Plus className="h-5 w-5 mr-2" /> Add Activity
            </Button>
          </div>

          {showForm && (
            <form
              onSubmit={handleSubmit}
              className="mb-8 bg-muted/30 rounded-2xl p-6 border border-border/50 space-y-4"
              data-testid="form-add-itinerary"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">Day</label>
                  <Select value={String(formDay)} onValueChange={(v) => setFormDay(Number(v))}>
                    <SelectTrigger data-testid="select-day">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: totalDays }, (_, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>
                          Day {i + 1}{dayDates[i] ? ` - ${format(dayDates[i], "MMM d")}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">Time</label>
                  <Input
                    type="time"
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="bg-background"
                    data-testid="input-time"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">Category</label>
                  <Select value={formCategory} onValueChange={setFormCategory}>
                    <SelectTrigger data-testid="select-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">Title</label>
                <Input
                  placeholder="e.g. Visit the Eiffel Tower"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="bg-background"
                  data-testid="input-title"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">Description (optional)</label>
                <Textarea
                  placeholder="Any notes or details..."
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  className="bg-background resize-none"
                  rows={2}
                  data-testid="input-description"
                />
              </div>
              <div className="flex gap-3 flex-wrap">
                <Button
                  type="submit"
                  disabled={createMutation.isPending || !formTitle.trim()}
                  className="rounded-xl bg-secondary hover:bg-secondary/90"
                  data-testid="button-submit-itinerary"
                >
                  {createMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Adding...</>
                  ) : (
                    <><Plus className="h-4 w-4 mr-2" /> Add Item</>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowForm(false)}
                  data-testid="button-cancel-form"
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}

          <div className="space-y-8">
            {Array.from({ length: totalDays }, (_, i) => i + 1).map(day => {
              const dayItems = itemsByDay[day] || [];
              const dateLabel = dayDates[day - 1]
                ? format(dayDates[day - 1], "EEEE, MMMM d")
                : "";
              return (
                <div key={day} data-testid={`day-section-${day}`}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-secondary/10 text-secondary font-bold text-lg">
                      {day}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-foreground">Day {day}</h2>
                      {dateLabel && (
                        <p className="text-sm text-muted-foreground">{dateLabel}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setFormDay(day); setShowForm(true); }}
                      className="ml-auto text-muted-foreground"
                      data-testid={`button-add-day-${day}`}
                    >
                      <Plus className="h-4 w-4 mr-1" /> Add
                    </Button>
                  </div>

                  {dayItems.length === 0 ? (
                    <div className="p-6 text-center border-2 border-dashed border-border rounded-2xl text-muted-foreground text-sm">
                      No activities planned yet
                    </div>
                  ) : (
                    <div className="space-y-3 relative ml-5 pl-6 border-l-2 border-border">
                      {dayItems.map((item) => {
                        const catStyle = getCategoryStyle(item.category);
                        return (
                          <div
                            key={item.id}
                            className={`group relative p-4 rounded-2xl border ${catStyle.color} transition-all`}
                            data-testid={`itinerary-item-${item.id}`}
                          >
                            <div className="absolute -left-[2.15rem] top-5 w-3 h-3 rounded-full bg-secondary border-2 border-background" />
                            {editingItemId === item.id ? (
                              <form onSubmit={handleUpdate} className="space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                  <div>
                                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Day</label>
                                    <Select value={String(editDay)} onValueChange={(v) => setEditDay(Number(v))}>
                                      <SelectTrigger data-testid={`select-edit-day-${item.id}`}>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {Array.from({ length: totalDays }, (_, i) => (
                                          <SelectItem key={i + 1} value={String(i + 1)}>
                                            Day {i + 1}{dayDates[i] ? ` - ${format(dayDates[i], "MMM d")}` : ""}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div>
                                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Time</label>
                                    <Input
                                      type="time"
                                      value={editTime}
                                      onChange={(e) => setEditTime(e.target.value)}
                                      className="bg-background"
                                      data-testid={`input-edit-time-${item.id}`}
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Category</label>
                                    <Select value={editCategory} onValueChange={setEditCategory}>
                                      <SelectTrigger data-testid={`select-edit-category-${item.id}`}>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {CATEGORIES.map((category) => (
                                          <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Title</label>
                                  <Input
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    className="bg-background"
                                    data-testid={`input-edit-title-${item.id}`}
                                  />
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
                                  <Textarea
                                    value={editDesc}
                                    onChange={(e) => setEditDesc(e.target.value)}
                                    className="bg-background resize-none"
                                    rows={2}
                                    data-testid={`input-edit-description-${item.id}`}
                                  />
                                </div>
                                <div className="flex gap-2 flex-wrap">
                                  <Button
                                    type="submit"
                                    size="sm"
                                    className="rounded-xl"
                                    disabled={updateMutation.isPending || !editTitle.trim()}
                                    data-testid={`button-save-item-${item.id}`}
                                  >
                                    {updateMutation.isPending ? (
                                      <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving...</>
                                    ) : (
                                      <><Save className="h-4 w-4 mr-1" /> Save</>
                                    )}
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={cancelEditing}
                                    data-testid={`button-cancel-edit-${item.id}`}
                                  >
                                    <X className="h-4 w-4 mr-1" /> Cancel
                                  </Button>
                                </div>
                              </form>
                            ) : (
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    {item.timeSlot && (
                                      <span className="inline-flex items-center gap-1 text-xs font-medium opacity-70">
                                        <Clock className="h-3 w-3" /> {item.timeSlot}
                                      </span>
                                    )}
                                    <span className="inline-flex items-center gap-1 text-xs font-medium">
                                      {getCategoryIcon(item.category)} {catStyle.label}
                                    </span>
                                  </div>
                                  <h3 className="font-semibold text-foreground" data-testid={`text-item-title-${item.id}`}>
                                    {item.googlePlaceUrl ? (
                                      <a
                                        href={item.googlePlaceUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="underline decoration-primary/30 underline-offset-4 transition-colors hover:text-primary"
                                      >
                                        {item.title}
                                      </a>
                                    ) : (
                                      item.title
                                    )}
                                  </h3>
                                  {item.description && (
                                    <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => startEditing(item)}
                                    className="invisible group-hover:visible text-muted-foreground"
                                    data-testid={`button-edit-item-${item.id}`}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => deleteMutation.mutate(item.id)}
                                    className="invisible group-hover:visible text-muted-foreground hover:text-destructive"
                                    data-testid={`button-delete-item-${item.id}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
