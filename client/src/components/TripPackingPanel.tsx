import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRightLeft,
  Briefcase,
  Check,
  Plus,
  ShoppingBag,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import {
  useCreateTripPackingItem,
  useDeleteTripPackingItem,
  useTripPackingItems,
  useUpdateTripPackingItem,
  type PackingCategory,
} from "@/hooks/use-trip-packing";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type TripPackingPanelProps = {
  tripId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const TAB_CONFIG: Array<{
  key: PackingCategory;
  label: string;
  icon: LucideIcon;
  emptyTitle: string;
  emptyBody: string;
}> = [
  {
    key: "home",
    label: "Pack From Home",
    icon: Briefcase,
    emptyTitle: "Nothing added yet",
    emptyBody: "Add essentials you'll pack before leaving home.",
  },
  {
    key: "arrival",
    label: "Get On Arrival",
    icon: ShoppingBag,
    emptyTitle: "No arrival items yet",
    emptyBody: "Add items you'll buy or pick up after arrival.",
  },
];

function getTabStorageKey(tripId: number) {
  return `annai:packing-tab:${tripId}`;
}

export function TripPackingPanel({ tripId, open, onOpenChange }: TripPackingPanelProps) {
  const { data: items, isLoading } = useTripPackingItems(tripId);
  const createItem = useCreateTripPackingItem();
  const updateItem = useUpdateTripPackingItem();
  const deleteItem = useDeleteTripPackingItem();

  const [selectedTab, setSelectedTab] = useState<PackingCategory>("home");
  const [newItemName, setNewItemName] = useState("");
  const [draggedItemId, setDraggedItemId] = useState<number | null>(null);
  const [dragOverTab, setDragOverTab] = useState<PackingCategory | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(new Set());
  const [isBulkActing, setIsBulkActing] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(getTabStorageKey(tripId));
    if (saved === "arrival" || saved === "home") {
      setSelectedTab(saved);
      return;
    }
    setSelectedTab("home");
  }, [tripId]);

  useEffect(() => {
    localStorage.setItem(getTabStorageKey(tripId), selectedTab);
  }, [selectedTab, tripId]);

  useEffect(() => {
    setSelectedItemIds(new Set());
  }, [selectedTab]);

  const visibleItems = useMemo(() => {
    const source = (items ?? []).filter((item) => item.category === selectedTab);
    return [...source].sort((a, b) => {
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [items, selectedTab]);
  const selectedVisibleIds = useMemo(
    () => visibleItems.filter((item) => selectedItemIds.has(item.id)).map((item) => item.id),
    [visibleItems, selectedItemIds],
  );
  const bulkMoveTarget: PackingCategory = selectedTab === "home" ? "arrival" : "home";

  const activeTabConfig = TAB_CONFIG.find((tab) => tab.key === selectedTab) ?? TAB_CONFIG[0];

  const addItem = () => {
    const trimmed = newItemName.trim();
    if (!trimmed) return;
    createItem.mutate(
      { tripId, name: trimmed, category: selectedTab },
      {
        onSuccess: () => setNewItemName(""),
      },
    );
  };

  const moveItemToCategory = (itemId: number, targetCategory: PackingCategory) => {
    const item = (items ?? []).find((entry) => entry.id === itemId);
    if (!item || item.category === targetCategory) return;

    updateItem.mutate({
      id: itemId,
      tripId,
      updates: { category: targetCategory },
    });
    setSelectedTab(targetCategory);
  };

  const setItemSelected = (itemId: number, shouldSelect: boolean) => {
    setSelectedItemIds((previous) => {
      const next = new Set(previous);
      if (shouldSelect) {
        next.add(itemId);
      } else {
        next.delete(itemId);
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedItemIds(new Set());
  };

  const bulkMoveSelected = async () => {
    if (selectedVisibleIds.length === 0) return;
    setIsBulkActing(true);
    try {
      await Promise.all(
        selectedVisibleIds.map((id) =>
          updateItem.mutateAsync({
            id,
            tripId,
            updates: { category: bulkMoveTarget },
          }),
        ),
      );
      clearSelection();
      setSelectedTab(bulkMoveTarget);
    } finally {
      setIsBulkActing(false);
    }
  };

  const bulkDeleteSelected = async () => {
    if (selectedVisibleIds.length === 0) return;
    setIsBulkActing(true);
    try {
      await Promise.all(selectedVisibleIds.map((id) => deleteItem.mutateAsync({ id, tripId })));
      clearSelection();
    } finally {
      setIsBulkActing(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-hidden border-l border-border/60 p-0 sm:max-w-xl">
        <div className="flex h-full flex-col bg-background">
          <SheetHeader className="border-b border-border/60 px-5 py-4">
            <SheetTitle className="flex items-center gap-2 text-2xl font-bold">
              <Briefcase className="h-5 w-5" />
              Packing
            </SheetTitle>
            <SheetDescription>
              Keep one list for home and one list for arrival purchases.
            </SheetDescription>
          </SheetHeader>

          <div className="px-5 pt-4">
            <div className="relative grid grid-cols-2 rounded-full border border-border/70 bg-muted/40 p-1">
              <motion.div
                className="absolute bottom-1 top-1 w-[calc(50%-4px)] rounded-full bg-card shadow-sm"
                initial={false}
                animate={{ x: selectedTab === "home" ? "0%" : "100%" }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
              {TAB_CONFIG.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setSelectedTab(tab.key)}
                  onDragOver={(event) => {
                    if (draggedItemId == null) return;
                    event.preventDefault();
                    setDragOverTab(tab.key);
                  }}
                  onDragEnter={(event) => {
                    if (draggedItemId == null) return;
                    event.preventDefault();
                    setDragOverTab(tab.key);
                  }}
                  onDragLeave={() => {
                    if (dragOverTab === tab.key) {
                      setDragOverTab(null);
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (draggedItemId == null) return;
                    moveItemToCategory(draggedItemId, tab.key);
                    setDraggedItemId(null);
                    setDragOverTab(null);
                  }}
                  className={`relative z-10 rounded-full px-3 py-2 text-sm font-semibold transition-colors ${
                    selectedTab === tab.key ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  } ${dragOverTab === tab.key ? "ring-2 ring-primary/40" : ""}`}
                  data-testid={`button-packing-tab-${tab.key}`}
                >
                  <tab.icon className="mr-1.5 inline h-4 w-4 align-[-2px]" />
                  {tab.label}
                </button>
              ))}
            </div>
            {selectedVisibleIds.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-card px-3 py-2">
                <span className="text-sm font-medium text-foreground">
                  {selectedVisibleIds.length} selected
                </span>
                <Button
                  type="button"
                  size="sm"
                  onClick={bulkMoveSelected}
                  disabled={isBulkActing}
                  className="h-8 rounded-xl px-3"
                  data-testid="button-packing-bulk-move"
                >
                  <ArrowRightLeft className="mr-1 h-3.5 w-3.5" />
                  Move to {bulkMoveTarget === "home" ? "Pack From Home" : "Get On Arrival"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={bulkDeleteSelected}
                  disabled={isBulkActing}
                  className="h-8 rounded-xl border-destructive/40 text-destructive hover:bg-destructive/10"
                  data-testid="button-packing-bulk-delete"
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Delete selected
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearSelection}
                  disabled={isBulkActing}
                  className="h-8 rounded-xl px-2 text-xs text-muted-foreground"
                  data-testid="button-packing-bulk-clear"
                >
                  Clear
                </Button>
              </div>
            ) : null}
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-4 pt-4">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={selectedTab}
                initial={{ opacity: 0, x: selectedTab === "home" ? -10 : 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: selectedTab === "home" ? 10 : -10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="space-y-3"
              >
                {isLoading ? (
                  <div className="rounded-3xl border border-border/60 bg-card p-6 text-sm text-muted-foreground">
                    Loading packing items...
                  </div>
                ) : visibleItems.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-border/70 bg-card px-5 py-8 text-center">
                    <p className="text-base font-semibold text-foreground">{activeTabConfig.emptyTitle}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{activeTabConfig.emptyBody}</p>
                  </div>
                ) : (
                  visibleItems.map((item) => (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={() => setDraggedItemId(item.id)}
                      onDragEnd={() => {
                        setDraggedItemId(null);
                        setDragOverTab(null);
                      }}
                      className={`flex cursor-grab items-center gap-2 rounded-2xl border border-border/60 bg-card px-3 py-3 shadow-sm transition-opacity ${
                        item.completed ? "opacity-55" : "opacity-100"
                      } ${selectedItemIds.has(item.id) ? "ring-2 ring-primary/30" : ""}`}
                    >
                      <Checkbox
                        checked={selectedItemIds.has(item.id)}
                        onCheckedChange={(checked) => {
                          setItemSelected(item.id, Boolean(checked));
                        }}
                        data-testid={`checkbox-packing-item-${item.id}`}
                      />
                      <span className={`flex-1 text-sm ${item.completed ? "line-through" : ""}`}>{item.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          updateItem.mutate({
                            id: item.id,
                            tripId,
                            updates: { completed: !item.completed },
                          })
                        }
                        className="h-8 rounded-xl px-2 text-xs text-muted-foreground hover:text-foreground"
                        data-testid={`button-toggle-complete-packing-item-${item.id}`}
                      >
                        <Check className="mr-1 h-3.5 w-3.5" />
                        {item.completed ? "Undo" : "Done"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          moveItemToCategory(item.id, selectedTab === "home" ? "arrival" : "home")
                        }
                        className="h-8 rounded-xl px-2 text-xs text-muted-foreground hover:text-foreground"
                        data-testid={`button-move-packing-item-${item.id}`}
                      >
                        <ArrowRightLeft className="mr-1 h-3.5 w-3.5" />
                        Move
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteItem.mutate({ id: item.id, tripId })}
                        className="h-8 w-8 rounded-xl text-muted-foreground hover:text-destructive"
                        data-testid={`button-delete-packing-item-${item.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="border-t border-border/60 bg-card/80 px-5 pb-5 pt-4 backdrop-blur">
            <div className="flex items-center gap-2">
              <Input
                value={newItemName}
                onChange={(event) => setNewItemName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addItem();
                  }
                }}
                placeholder={
                  selectedTab === "home"
                    ? "Add an item to pack from home"
                    : "Add an item to get on arrival"
                }
                className="h-11 rounded-xl"
                data-testid="input-trip-packing-item"
              />
              <Button
                onClick={addItem}
                disabled={createItem.isPending || !newItemName.trim()}
                className="h-11 rounded-xl px-4"
                data-testid="button-trip-packing-add"
              >
                {selectedTab === "home" ? <Briefcase className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4" />}
                <Plus className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
