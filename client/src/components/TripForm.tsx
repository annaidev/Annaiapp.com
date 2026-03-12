import { useId, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useCreateTrip, useUpdateTrip } from "@/hooks/use-trips";
import { useTrips } from "@/hooks/use-trips";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trip } from "@shared/schema";
import { buildLocationOptions, filterLocationOptions } from "@/lib/location-suggestions";

interface TripFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trip?: Trip; // If provided, it's an edit form
}

export function TripForm({ open, onOpenChange, trip }: TripFormProps) {
  const isEdit = !!trip;
  const createMutation = useCreateTrip();
  const updateMutation = useUpdateTrip();
  const { data: trips } = useTrips();
  const [, setLocation] = useLocation();
  const originListId = useId();
  const destinationListId = useId();

  const [formData, setFormData] = useState({
    origin: trip?.origin || "",
    destination: trip?.destination || "",
    tripType: trip?.tripType || "one_way",
    startDate: trip?.startDate ? new Date(trip.startDate).toISOString().split("T")[0] : "",
    endDate: trip?.endDate ? new Date(trip.endDate).toISOString().split("T")[0] : "",
    notes: trip?.notes || "",
  });

  const locationOptions = useMemo(
    () =>
      buildLocationOptions(
        (trips ?? []).flatMap((existingTrip) => [existingTrip.origin, existingTrip.destination]),
      ),
    [trips],
  );
  const originOptions = useMemo(
    () => filterLocationOptions(locationOptions, formData.origin),
    [locationOptions, formData.origin],
  );
  const destinationOptions = useMemo(
    () => filterLocationOptions(locationOptions, formData.destination),
    [locationOptions, formData.destination],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const payload = {
      origin: formData.origin.trim() || null,
      destination: formData.destination.trim(),
      tripType: formData.tripType as "one_way" | "round_trip",
      startDate: formData.startDate ? new Date(formData.startDate) : undefined,
      endDate: formData.endDate ? new Date(formData.endDate) : undefined,
      notes: formData.notes,
    };

    if (isEdit && trip) {
      updateMutation.mutate(
        { id: trip.id, ...payload },
        { onSuccess: () => onOpenChange(false) }
      );
    } else {
      createMutation.mutate(payload, {
        onSuccess: (createdTrip) => {
          onOpenChange(false);
          setLocation(`/trips/${createdTrip.id}`);
        },
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] p-6 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">{isEdit ? "Edit Trip" : "Plan a New Trip"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update your travel details." : "Enter where you are starting from, where you are going, and what kind of trip this is."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          <div className="space-y-2">
            <Label htmlFor="origin" className="text-foreground">Starting Location</Label>
            <Input
              id="origin"
              required
              list={originListId}
              spellCheck
              autoComplete="on"
              placeholder="e.g. Dallas, TX, United States"
              value={formData.origin}
              onChange={(e) => setFormData({ ...formData, origin: e.target.value })}
              className="rounded-xl h-12 bg-muted/50 border-transparent focus:border-primary focus:bg-background transition-colors"
            />
            <datalist id={originListId}>
              {originOptions.map((option) => (
                <option key={`origin-${option}`} value={option} />
              ))}
            </datalist>
          </div>

          <div className="space-y-2">
            <Label htmlFor="destination" className="text-foreground">Destination</Label>
            <Input
              id="destination"
              required
              list={destinationListId}
              spellCheck
              autoComplete="on"
              placeholder="e.g. Kyoto, Japan"
              value={formData.destination}
              onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
              className="rounded-xl h-12 bg-muted/50 border-transparent focus:border-primary focus:bg-background transition-colors"
            />
            <datalist id={destinationListId}>
              {destinationOptions.map((option) => (
                <option key={`destination-${option}`} value={option} />
              ))}
            </datalist>
          </div>

          <div className="space-y-2">
            <Label className="text-foreground">Trip Type</Label>
            <Select value={formData.tripType} onValueChange={(value) => setFormData({ ...formData, tripType: value })}>
              <SelectTrigger className="rounded-xl h-12 bg-muted/50 border-transparent focus:bg-background transition-colors">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="one_way">One Way</SelectItem>
                <SelectItem value="round_trip">Round Trip</SelectItem>
              </SelectContent>
            </Select>
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

          {isEdit && (
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
          )}

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
              disabled={isPending || !formData.destination.trim() || !formData.origin.trim()}
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
