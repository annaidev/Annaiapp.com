import { useState } from "react";
import { Link } from "wouter";
import { Crown, Gift, LogOut, ShieldAlert, ShieldCheck, User } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { NavBar } from "@/components/NavBar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDeleteAccount, useLogout, useUser } from "@/hooks/use-auth";
import { useSubscriptionState } from "@/hooks/use-entitlements";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { api } from "@shared/routes";
import { getManageSubscriptionUrl } from "@/services/mobileBillingService";

function formatFeatureKey(featureKey: string) {
  return featureKey
    .split("_")
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === "ai") return "AI";
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

export default function AccountPage() {
  const { data: user } = useUser();
  const { data } = useSubscriptionState(Boolean(user));
  const entitlements = data?.entitlements;
  const { t } = useI18n();
  const { toast } = useToast();
  const [couponCode, setCouponCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [changePasswordDialogOpen, setChangePasswordDialogOpen] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const deleteAccountMutation = useDeleteAccount();
  const logoutMutation = useLogout();
  const formattedEnabledFeatures = (entitlements?.enabledFeatures ?? []).map((feature) =>
    formatFeatureKey(feature),
  );
  const manageSubscriptionUrl = getManageSubscriptionUrl(data?.subscription ?? null);

  const redeemCouponMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(api.coupons.redeem.method, api.coupons.redeem.path, { code: couponCode });
      return res.json() as Promise<{ expiresAt: string }>;
    },
    onSuccess: async (redeemResult) => {
      setCouponCode("");
      await queryClient.invalidateQueries({ queryKey: ["/api/entitlements/me"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/subscription/me"] });
      toast({
        title: "Gift code redeemed",
        description: `Annai Pro is active until ${new Date(redeemResult.expiresAt).toLocaleDateString()}.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Unable to redeem code",
        description:
          error instanceof Error
            ? error.message.split(":").slice(1).join(":").trim() || error.message
            : "Coupon redemption failed.",
        variant: "destructive",
      });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(api.account.changePassword.method, api.account.changePassword.path, {
        newPassword,
      });
      return api.account.changePassword.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      setNewPassword("");
      setConfirmNewPassword("");
      setChangePasswordDialogOpen(false);
      toast({
        title: "Password updated",
        description: "Your account password has been changed.",
      });
    },
    onError: (error) => {
      toast({
        title: "Unable to change password",
        description:
          error instanceof Error
            ? error.message.split(":").slice(1).join(":").trim() || error.message
            : "Password update failed.",
        variant: "destructive",
      });
    },
  });

  const canDeleteAccount = deletePhrase.trim() === "DELETE";
  const isPasswordFormValid = newPassword.length >= 10 && confirmNewPassword === newPassword;

  return (
    <div className="min-h-screen bg-background">
      <NavBar />

      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground">{t("account.title")}</h1>
          <p className="mt-2 text-muted-foreground">{t("account.subtitle")}</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="rounded-[2rem] border p-8 shadow-sm">
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <Badge variant="outline" className="rounded-full px-3 py-1">
                <User className="mr-1.5 h-3.5 w-3.5" />
                {user?.username ?? "Annai user"}
              </Badge>
              <Badge
                variant={entitlements?.hasProAccess ? "default" : "secondary"}
                className="rounded-full px-3 py-1"
              >
                <Crown className="mr-1.5 h-3.5 w-3.5" />
                {entitlements?.hasProAccess ? t("plan.pro") : t("plan.free")}
              </Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1">
                <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                Store-ready entitlements
              </Badge>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-muted/40 p-4">
                <p className="text-sm text-muted-foreground">{t("account.plan")}</p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {entitlements?.plan === "pro" ? t("plan.pro") : t("plan.free")}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{entitlements?.summary.detail}</p>
              </div>

              <div className="rounded-2xl bg-muted/40 p-4">
                <p className="text-sm text-muted-foreground">{t("account.subscription")}</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{data?.subscription?.status ?? "inactive"}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {data?.subscription?.productId ?? "No product linked yet"}
                  {data?.subscription?.expiresAt
                    ? ` • ${new Date(data.subscription.expiresAt).toLocaleDateString()}`
                    : ""}
                </p>
              </div>

              <div className="rounded-2xl bg-muted/40 p-4 md:col-span-2">
                <p className="text-sm text-muted-foreground">{t("account.features")}</p>
                <p className="mt-2 text-sm text-foreground">
                  {formattedEnabledFeatures.join(", ") || "No feature state loaded"}
                </p>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild className="rounded-2xl" data-testid="button-account-home">
                <Link href="/">{t("account.openPlanner")}</Link>
              </Button>
              {!entitlements?.hasProAccess && (
                <Button asChild variant="outline" className="rounded-2xl" data-testid="button-account-pricing">
                  <Link href="/pricing">{t("account.upgrade")}</Link>
                </Button>
              )}
              {manageSubscriptionUrl && (
                <Button asChild variant="outline" className="rounded-2xl" data-testid="button-account-manage-subscription">
                  <a href={manageSubscriptionUrl} target="_blank" rel="noreferrer">
                    Manage Subscription / Unsubscribe
                  </a>
                </Button>
              )}
              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={() => logoutMutation.mutate()}
                disabled={logoutMutation.isPending}
                data-testid="button-account-signout"
              >
                <LogOut className="mr-2 h-4 w-4" />
                {logoutMutation.isPending ? "Signing out..." : "Sign Out"}
              </Button>
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="rounded-[2rem] border p-8 shadow-sm">
              <div className="mb-6 flex items-center gap-3">
                <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <Gift className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-foreground">Redeem Gift Code</h2>
                  <p className="text-sm text-muted-foreground">
                    Use a one-time family or tester code to unlock 30 days of Annai Pro.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <Input
                  value={couponCode}
                  onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
                  className="rounded-2xl"
                  placeholder="Enter coupon code"
                  autoComplete="off"
                  name="coupon-code"
                  autoCorrect="off"
                  spellCheck={false}
                  data-testid="input-coupon-code"
                />
                <Button
                  className="w-full rounded-2xl"
                  disabled={redeemCouponMutation.isPending || !couponCode.trim()}
                  onClick={() => redeemCouponMutation.mutate()}
                  data-testid="button-redeem-coupon"
                >
                  {redeemCouponMutation.isPending ? "Redeeming..." : "Redeem Code"}
                </Button>
              </div>
            </Card>

            <Card className="rounded-[2rem] border p-8 shadow-sm">
              <div className="mb-6 flex items-center gap-3">
                <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-foreground">Change Password</h2>
                  <p className="text-sm text-muted-foreground">Update your password to keep your account secure.</p>
                </div>
              </div>

              <Button
                className="w-full rounded-2xl"
                onClick={() => setChangePasswordDialogOpen(true)}
                data-testid="button-open-change-password"
              >
                Change Password
              </Button>
            </Card>

            <Card className="rounded-[2rem] border border-destructive/30 p-8 shadow-sm">
              <div className="mb-6 flex items-center gap-3">
                <div className="rounded-2xl bg-destructive/10 p-3 text-destructive">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-foreground">Delete Account</h2>
                  <p className="text-sm text-muted-foreground">
                    Permanently delete your Annai account and associated trip data.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  This permanently removes your account, trips, itinerary items, packing lists, budget items, saved
                  documents, and active session access.
                </p>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                    Type <span className="font-semibold text-foreground">DELETE</span> to confirm
                  </label>
                  <Input
                    value={deletePhrase}
                    onChange={(event) => setDeletePhrase(event.target.value)}
                    className="rounded-2xl"
                    placeholder="DELETE"
                    data-testid="input-delete-account-confirmation"
                  />
                </div>
                <Button
                  variant="destructive"
                  className="w-full rounded-2xl"
                  disabled={!canDeleteAccount}
                  onClick={() => setDeleteDialogOpen(true)}
                  data-testid="button-open-delete-account"
                >
                  Delete Account
                </Button>
              </div>
            </Card>
          </div>
        </div>

        <div className="mt-8 text-center text-sm text-muted-foreground">
          <a href="/terms-of-service/index.html" className="font-medium text-primary underline underline-offset-4">
            Terms of Service
          </a>
          {" | "}
          <a href="/privacy-policy/index.html" className="font-medium text-primary underline underline-offset-4">
            Privacy Policy
          </a>
          {" | "}
          <a href="/support/index.html" className="font-medium text-primary underline underline-offset-4">
            Support
          </a>
          {" | "}
          <a href="/account-deletion/index.html" className="font-medium text-primary underline underline-offset-4">
            Account Deletion
          </a>
        </div>
      </main>

      <AlertDialog open={changePasswordDialogOpen} onOpenChange={setChangePasswordDialogOpen}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Change password</AlertDialogTitle>
            <AlertDialogDescription>Enter a new password for your account.</AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">New password</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="rounded-2xl"
                placeholder="At least 10 characters"
                autoComplete="new-password"
                data-testid="input-new-password-account"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Confirm new password</label>
              <Input
                type="password"
                value={confirmNewPassword}
                onChange={(event) => setConfirmNewPassword(event.target.value)}
                className="rounded-2xl"
                placeholder="Re-enter new password"
                autoComplete="new-password"
                data-testid="input-confirm-password-account"
              />
            </div>

            {confirmNewPassword.length > 0 && confirmNewPassword !== newPassword && (
              <p className="text-sm text-destructive">New password and confirmation do not match.</p>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel
              className="rounded-2xl"
              onClick={() => {
                setNewPassword("");
                setConfirmNewPassword("");
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-2xl"
              disabled={changePasswordMutation.isPending || !isPasswordFormValid}
              onClick={(event) => {
                event.preventDefault();
                changePasswordMutation.mutate();
              }}
            >
              {changePasswordMutation.isPending ? "Updating..." : "Update Password"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete account?</AlertDialogTitle>
            <AlertDialogDescription>
              This action is permanent. Your Annai account and associated trip data will be deleted and cannot be
              recovered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-2xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteAccountMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                deleteAccountMutation.mutate(undefined, {
                  onSuccess: () => {
                    setDeleteDialogOpen(false);
                  },
                  onError: (error) => {
                    toast({
                      title: "Unable to delete account",
                      description:
                        error instanceof Error
                          ? error.message.split(":").slice(1).join(":").trim() || error.message
                          : "Account deletion failed.",
                      variant: "destructive",
                    });
                  },
                });
              }}
            >
              {deleteAccountMutation.isPending ? "Deleting..." : "Delete Permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
