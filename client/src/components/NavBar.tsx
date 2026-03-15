import { Link } from "wouter";
import { useUser } from "@/hooks/use-auth";
import { useProStatus } from "@/hooks/use-pro-status";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { AnnaiLogo } from "@/components/AnnaiLogo";

export function NavBar() {
  const { data: user } = useUser();
  const { data: proStatus } = useProStatus(Boolean(user));
  const { t } = useI18n();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/70 bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex items-center transition-opacity hover:opacity-90"
        >
          <AnnaiLogo className="h-12 w-auto md:h-14" />
        </Link>

        {user && (
          <div className="flex items-center gap-2 sm:gap-3">
            {!proStatus?.hasProAccess && (
              <Button
                asChild
                size="lg"
                className="min-h-11 rounded-xl px-5 text-sm font-semibold shadow-sm"
                data-testid="button-upgrade-nav"
              >
                <Link href="/pricing">{t("nav.upgrade")}</Link>
              </Button>
            )}
            <Button
              asChild
              variant="outline"
              size="lg"
              className="min-h-11 rounded-xl border-border/70 bg-card px-5 text-sm font-semibold text-foreground shadow-sm hover:bg-card/80"
              data-testid="button-account"
            >
              <Link href="/account">{t("nav.account")}</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="min-h-11 rounded-xl border-border/70 bg-card px-5 text-sm font-semibold text-foreground shadow-sm hover:bg-card/80"
              data-testid="button-profile"
            >
              <Link href="/profile">Profile</Link>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
