import { useState } from "react";
import { useCreateTrip, useUpdateTrip } from "@/hooks/use-trips";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Trip } from "@shared/schema";

interface TripFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trip?: Trip; // If provided, it's an edit form
}

export function TripForm({ open, onOpenChange, trip }: TripFormProps) {
  const isEdit = !!trip;
  const createMutation = useCreateTrip();
  const updateMutation = useUpdateTrip();

  const [formData, setFormData] = useState({
    destination: trip?.destination || "",
    startDate: trip?.startDate ? new Date(trip.startDate).toISOString().split("T")[0] : "",
    endDate: trip?.endDate ? new Date(trip.endDate).toISOString().split("T")[0] : "",
    notes: trip?.notes || "",
    citizenship: trip?.citizenship || "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const payload = {
      destination: formData.destination,
      startDate: formData.startDate ? new Date(formData.startDate) : undefined,
      endDate: formData.endDate ? new Date(formData.endDate) : undefined,
      notes: formData.notes,
      citizenship: formData.citizenship,
    };

    if (isEdit && trip) {
      updateMutation.mutate(
        { id: trip.id, ...payload },
        { onSuccess: () => onOpenChange(false) }
      );
    } else {
      createMutation.mutate(payload, { onSuccess: () => onOpenChange(false) });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] p-6 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">{isEdit ? "Edit Trip" : "Plan a New Trip"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update your travel details." : "Enter the destination and dates for your next adventure."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          <div className="space-y-2">
            <Label htmlFor="destination" className="text-foreground">Destination</Label>
            <Input
              id="destination"
              required
              placeholder="e.g. Kyoto, Japan"
              value={formData.destination}
              onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
              className="rounded-xl h-12 bg-muted/50 border-transparent focus:border-primary focus:bg-background transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate" className="text-foreground">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className="rounded-xl h-12 bg-muted/50 border-transparent focus:border-primary focus:bg-background transition-colors"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate" className="text-foreground">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                className="rounded-xl h-12 bg-muted/50 border-transparent focus:border-primary focus:bg-background transition-colors"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="citizenship" className="text-foreground">Citizenship (for Embassy info)</Label>
            <Input
              id="citizenship"
              placeholder="e.g. United States, United Kingdom"
              value={formData.citizenship}
              onChange={(e) => setFormData({ ...formData, citizenship: e.target.value })}
              className="rounded-xl h-12 bg-muted/50 border-transparent focus:border-primary focus:bg-background transition-colors"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes" className="text-foreground">Travel Notes (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="Flight details, confirmation numbers, etc."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="rounded-xl min-h-[100px] bg-muted/50 border-transparent focus:border-primary focus:bg-background transition-colors resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-xl px-6 h-12"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || !formData.destination}
              className="rounded-xl px-8 h-12 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 transition-all"
            >
              {isPending ? "Saving..." : isEdit ? "Save Changes" : "Create Trip"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
