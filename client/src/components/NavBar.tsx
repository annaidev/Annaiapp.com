import { Link } from "wouter";
import { Crown, LogOut, User } from "lucide-react";
import { useUser, useLogout } from "@/hooks/use-auth";
import { useProStatus } from "@/hooks/use-pro-status";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";

function AnnaiLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 44 68"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Annai"
    >
      <defs>
        <linearGradient id="annai-arrow-g" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#E05555" />
          <stop offset="100%" stopColor="#F0A830" />
        </linearGradient>
      </defs>

      <text
        x="22"
        y="14"
        textAnchor="middle"
        fontFamily="'Outfit', 'Plus Jakarta Sans', system-ui, sans-serif"
        fontSize="18"
        fontWeight="800"
        fill="#2D3748"
      >
        A
      </text>

      <line x1="22" y1="17" x2="22" y2="26" stroke="#2D3748" strokeWidth="2.2" strokeLinecap="round" />

      <polygon points="22,26 4,66 22,54" fill="#2D3748" />
      <polygon points="22,26 40,66 22,54" fill="none" stroke="url(#annai-arrow-g)" strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

export function NavBar() {
  const { data: user } = useUser();
  const logoutMutation = useLogout();
  const { data: proStatus } = useProStatus(Boolean(user));
  const { t } = useI18n();

  return (
    <header className="sticky top-0 z-50 w-full border-b glass">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center hover:opacity-80 transition-opacity"
        >
          <AnnaiLogo className="h-12 w-auto" />
        </Link>

        {user && (
          <div className="flex items-center gap-3">
            {proStatus && (
              <Badge
                variant={proStatus.hasProAccess ? "default" : "secondary"}
                className="rounded-full px-3 py-1 text-xs font-semibold"
              >
                <Crown className="mr-1 h-3.5 w-3.5" />
                {proStatus.hasProAccess ? t("plan.pro") : t("plan.free")}
              </Badge>
            )}
            {!proStatus?.hasProAccess && (
              <Button asChild variant="outline" size="sm" className="rounded-xl" data-testid="button-upgrade-nav">
                <Link href="/pricing">{t("nav.upgrade")}</Link>
              </Button>
            )}
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground rounded-xl" data-testid="button-account">
              <Link href="/account">
                <User className="h-4 w-4 mr-1.5" />
                {t("nav.account")}
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => logoutMutation.mutate()}
              className="text-muted-foreground rounded-xl"
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4 mr-1.5" />
              {t("nav.signOut")}
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
