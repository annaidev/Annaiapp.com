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
    <header className="sticky top-0 z-50 w-full border-b glass">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center hover:opacity-80 transition-opacity"
        >
          <AnnaiLogo className="h-8 w-auto" />
        </Link>

        {user && (
          <div className="flex items-center gap-3">
            {!proStatus?.hasProAccess && (
              <Button asChild variant="outline" size="sm" className="rounded-xl" data-testid="button-upgrade-nav">
                <Link href="/pricing">{t("nav.upgrade")}</Link>
              </Button>
            )}
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground rounded-xl" data-testid="button-account">
              <Link href="/account">{t("nav.account")}</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground rounded-xl" data-testid="button-profile">
              <Link href="/profile">Profile</Link>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
