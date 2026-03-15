import { useEffect, useState } from "react";
import { Globe2, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NavBar } from "@/components/NavBar";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateProfilePackingItem,
  useDeleteProfilePackingItem,
  useProfile,
  useProfilePackingItems,
  useUpdateProfile,
} from "@/hooks/use-profile";
import { useUser } from "@/hooks/use-auth";

export default function ProfilePage() {
  const { data: user } = useUser();
  const { data: profile } = useProfile(Boolean(user));
  const { data: profilePackingItems } = useProfilePackingItems(Boolean(user));
  const updateProfile = useUpdateProfile();
  const createProfilePackingItem = useCreateProfilePackingItem();
  const deleteProfilePackingItem = useDeleteProfilePackingItem();
  const { t, languageOptions, language, setLanguage } = useI18n();
  const { toast } = useToast();

  const [homeCurrency, setHomeCurrency] = useState("USD");
  const [citizenship, setCitizenship] = useState("");
  const [travelWithKids, setTravelWithKids] = useState(false);
  const [travelWithPets, setTravelWithPets] = useState(false);
  const [travelForWork, setTravelForWork] = useState(false);
  const [needsAccessibility, setNeedsAccessibility] = useState(false);
  const [newPersonalPackingItem, setNewPersonalPackingItem] = useState("");

  useEffect(() => {
    if (profile?.homeCurrency) {
      setHomeCurrency(profile.homeCurrency);
    }
    setCitizenship(profile?.citizenship ?? "");
    setTravelWithKids(profile?.travelWithKids ?? false);
    setTravelWithPets(profile?.travelWithPets ?? false);
    setTravelForWork(profile?.travelForWork ?? false);
    setNeedsAccessibility(profile?.needsAccessibility ?? false);
  }, [
    profile?.citizenship,
    profile?.homeCurrency,
    profile?.travelWithKids,
    profile?.travelWithPets,
    profile?.travelForWork,
    profile?.needsAccessibility,
  ]);

  const saveProfile = () => {
    updateProfile.mutate(
      {
        preferredLanguage: language,
        homeCurrency: homeCurrency.toUpperCase(),
        citizenship: citizenship.trim() || null,
        travelWithKids,
        travelWithPets,
        travelForWork,
        needsAccessibility,
      },
      {
        onSuccess: () => {
          toast({ title: "Profile updated", description: "Your traveler profile has been saved." });
        },
        onError: (error) => {
          toast({
            title: "Unable to update profile",
            description: error instanceof Error ? error.message : "Profile update failed.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <NavBar />

      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground">Profile</h1>
          <p className="mt-2 text-muted-foreground">Manage traveler profile and packing defaults.</p>
        </div>

        <div className="space-y-6">
          <Card className="rounded-[2rem] border p-8 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                <Globe2 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground">{t("account.profile")}</h2>
                <p className="text-sm text-muted-foreground">Keep the app and AI output aligned to your traveler preferences.</p>
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted-foreground">{t("account.language")}</label>
                <Select value={language} onValueChange={(value) => setLanguage(value as typeof language)}>
                  <SelectTrigger className="rounded-2xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {languageOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted-foreground">{t("account.currency")}</label>
                <Input
                  value={homeCurrency}
                  onChange={(event) => setHomeCurrency(event.target.value.toUpperCase().slice(0, 3))}
                  className="rounded-2xl"
                  placeholder="USD"
                  maxLength={3}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Citizenship</label>
                <Input
                  value={citizenship}
                  onChange={(event) => setCitizenship(event.target.value)}
                  className="rounded-2xl"
                  placeholder="United States"
                  maxLength={120}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">Travel preferences</label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant={travelWithKids ? "default" : "outline"}
                    className="justify-start rounded-2xl"
                    onClick={() => setTravelWithKids((current) => !current)}
                  >
                    Traveling with kids
                  </Button>
                  <Button
                    type="button"
                    variant={travelWithPets ? "default" : "outline"}
                    className="justify-start rounded-2xl"
                    onClick={() => setTravelWithPets((current) => !current)}
                  >
                    Traveling with pets
                  </Button>
                  <Button
                    type="button"
                    variant={travelForWork ? "default" : "outline"}
                    className="justify-start rounded-2xl"
                    onClick={() => setTravelForWork((current) => !current)}
                  >
                    Work trip
                  </Button>
                  <Button
                    type="button"
                    variant={needsAccessibility ? "default" : "outline"}
                    className="justify-start rounded-2xl"
                    onClick={() => setNeedsAccessibility((current) => !current)}
                  >
                    Accessibility needs
                  </Button>
                </div>
              </div>

              <Button
                className="w-full rounded-2xl"
                onClick={saveProfile}
                disabled={updateProfile.isPending}
                data-testid="button-save-profile"
              >
                {updateProfile.isPending ? "Saving..." : t("account.saveProfile")}
              </Button>
            </div>
          </Card>

          <Card className="rounded-[2rem] border p-8 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                <Plus className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground">Personal Packing Defaults</h2>
                <p className="text-sm text-muted-foreground">
                  These items auto-populate on every new trip. AI suggestions skip duplicates.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={newPersonalPackingItem}
                  onChange={(event) => setNewPersonalPackingItem(event.target.value)}
                  className="rounded-2xl"
                  placeholder="Add a default item (e.g. Passport)"
                  maxLength={120}
                  data-testid="input-personal-packing-item"
                />
                <Button
                  className="rounded-2xl"
                  disabled={createProfilePackingItem.isPending || !newPersonalPackingItem.trim()}
                  onClick={() => {
                    createProfilePackingItem.mutate(newPersonalPackingItem.trim(), {
                      onSuccess: () => {
                        setNewPersonalPackingItem("");
                        toast({ title: "Added", description: "Default packing item saved." });
                      },
                      onError: (error) => {
                        toast({
                          title: "Unable to add item",
                          description:
                            error instanceof Error
                              ? error.message.split(":").slice(1).join(":").trim() || error.message
                              : "Failed to save item.",
                          variant: "destructive",
                        });
                      },
                    });
                  }}
                  data-testid="button-add-personal-packing-item"
                >
                  Add
                </Button>
              </div>

              <div className="space-y-2">
                {(profilePackingItems ?? []).length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                    No personal defaults yet.
                  </div>
                ) : (
                  (profilePackingItems ?? []).map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
                      <span className="text-sm text-foreground">{item.item}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          deleteProfilePackingItem.mutate(item.id, {
                            onError: (error) => {
                              toast({
                                title: "Unable to remove item",
                                description:
                                  error instanceof Error
                                    ? error.message.split(":").slice(1).join(":").trim() || error.message
                                    : "Failed to remove item.",
                                variant: "destructive",
                              });
                            },
                          });
                        }}
                        className="rounded-xl text-muted-foreground hover:text-destructive"
                        data-testid={`button-delete-personal-packing-item-${item.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
