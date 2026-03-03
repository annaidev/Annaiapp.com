import { useState } from "react";
import { useRoute, Link } from "wouter";
import { ArrowLeft, CheckCircle2, Circle, Plus, Trash2, Briefcase, Sparkles, Loader2 } from "lucide-react";
import { useTrip } from "@/hooks/use-trips";
import { 
  usePackingLists, 
  useCreatePackingListItem, 
  useUpdatePackingListItem, 
  useDeletePackingListItem 
} from "@/hooks/use-packing-lists";
import { useGeneratePackingList } from "@/hooks/use-ai";
import { NavBar } from "@/components/NavBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function PackingList() {
  const [, params] = useRoute("/trips/:id/packing-list");
  const tripId = parseInt(params?.id || "0", 10);
  
  const { data: trip, isLoading: isLoadingTrip } = useTrip(tripId);
  const { data: items, isLoading: isLoadingItems } = usePackingLists(tripId);
  
  const addMutation = useCreatePackingListItem();
  const updateMutation = useUpdatePackingListItem();
  const deleteMutation = useDeletePackingListItem();
  const packMutation = useGeneratePackingList();

  const [newItem, setNewItem] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);

  if (isLoadingTrip || isLoadingItems) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;
  if (!trip) return <div className="min-h-screen flex items-center justify-center">Trip not found</div>;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.trim()) return;
    addMutation.mutate({ tripId, item: newItem.trim() }, {
      onSuccess: () => setNewItem("")
    });
  };

  const handleToggle = (id: number, current: boolean | null) => {
    updateMutation.mutate({ id, tripId, isPacked: !current });
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate({ id, tripId });
  };

  const packedItems = items?.filter(i => i.isPacked) || [];
  const pendingItems = items?.filter(i => !i.isPacked) || [];
  
  const progress = items?.length ? Math.round((packedItems.length / items.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-background">
      <NavBar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href={`/trips/${trip.id}`} className="inline-flex items-center text-muted-foreground hover:text-primary mb-8 transition-colors">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard
        </Link>

        <div className="bg-card rounded-3xl p-8 border border-border/50 shadow-xl mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-primary/10 rounded-2xl text-primary">
                <Briefcase className="h-8 w-8" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-foreground">Packing List</h1>
                <p className="text-muted-foreground font-medium mt-1">for {trip.destination}</p>
              </div>
            </div>
            
            <div className="bg-muted/30 rounded-2xl p-4 min-w-[200px] border border-border/50">
              <div className="flex justify-between text-sm font-semibold mb-2">
                <span className="text-muted-foreground">Progress</span>
                <span className="text-primary">{progress}%</span>
              </div>
              <div className="w-full bg-border rounded-full h-2.5 overflow-hidden">
                <div 
                  className="bg-primary h-2.5 rounded-full transition-all duration-500 ease-out" 
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <Button
              onClick={() => {
                packMutation.mutate({ destination: trip.destination }, {
                  onSuccess: (data) => {
                    const existing = new Set((items || []).map(i => i.item.toLowerCase()));
                    setSuggestions(data.items.filter(i => !existing.has(i.toLowerCase())));
                  }
                });
              }}
              disabled={packMutation.isPending}
              variant="outline"
              className="rounded-xl h-12 border-primary/20 text-primary hover:bg-primary/5"
              data-testid="button-ai-suggestions"
            >
              {packMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" /> Get AI Suggestions</>
              )}
            </Button>
          </div>

          {suggestions.length > 0 && (
            <div className="mb-8 bg-primary/5 rounded-2xl p-6 border border-primary/10" data-testid="ai-suggestions-panel">
              <h3 className="text-sm font-semibold text-primary uppercase tracking-wider mb-4 flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> AI Suggestions
              </h3>
              <div className="grid gap-2">
                {suggestions.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-card border border-border/50 hover:border-primary/30 transition-colors" data-testid={`suggestion-item-${i}`}>
                    <span className="font-medium text-sm">{item}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        addMutation.mutate({ tripId, item });
                        setSuggestions(prev => prev.filter((_, idx) => idx !== i));
                      }}
                      className="text-primary hover:bg-primary/10 rounded-lg h-8"
                      data-testid={`button-add-suggestion-${i}`}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSuggestions([])}
                className="mt-3 text-muted-foreground"
                data-testid="button-dismiss-suggestions"
              >
                Dismiss
              </Button>
            </div>
          )}

          <form onSubmit={handleAdd} className="flex gap-3 mb-10">
            <Input 
              placeholder="Add a new item... (e.g. Passport, Sunscreen)" 
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              className="h-14 rounded-xl text-lg bg-muted/30 border-border focus:bg-background"
            />
            <Button 
              type="submit" 
              disabled={addMutation.isPending || !newItem.trim()}
              className="h-14 px-8 rounded-xl bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
            >
              <Plus className="h-5 w-5 mr-2" /> Add
            </Button>
          </form>

          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-bold text-foreground mb-4 flex items-center">
                To Pack <span className="ml-2 bg-muted text-muted-foreground text-xs py-1 px-2 rounded-full">{pendingItems.length}</span>
              </h3>
              {pendingItems.length === 0 ? (
                <div className="p-6 text-center border-2 border-dashed border-border rounded-2xl text-muted-foreground">
                  No items left to pack!
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingItems.map((item) => (
                    <div key={item.id} className="group flex items-center justify-between p-4 bg-background border border-border rounded-xl hover:border-primary/50 hover:shadow-md transition-all">
                      <button 
                        onClick={() => handleToggle(item.id, item.isPacked)}
                        className="flex items-center gap-4 flex-1 text-left"
                      >
                        <Circle className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                        <span className="text-lg font-medium">{item.item}</span>
                      </button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => handleDelete(item.id)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                      >
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {packedItems.length > 0 && (
              <div>
                <h3 className="text-lg font-bold text-muted-foreground mb-4 flex items-center">
                  Packed <span className="ml-2 bg-muted text-muted-foreground text-xs py-1 px-2 rounded-full">{packedItems.length}</span>
                </h3>
                <div className="space-y-3 opacity-60">
                  {packedItems.map((item) => (
                    <div key={item.id} className="group flex items-center justify-between p-4 bg-muted/20 border border-transparent rounded-xl transition-all">
                      <button 
                        onClick={() => handleToggle(item.id, item.isPacked)}
                        className="flex items-center gap-4 flex-1 text-left line-through"
                      >
                        <CheckCircle2 className="h-6 w-6 text-primary" />
                        <span className="text-lg font-medium">{item.item}</span>
                      </button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => handleDelete(item.id)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                      >
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
