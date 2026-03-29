import { Link } from "wouter";
import { useLocation } from "wouter";
import { useUser } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { AnnaiLogo } from "@/components/AnnaiLogo";
import { cn } from "@/lib/utils";

export function NavBar() {
  const { data: user } = useUser();
  const [location] = useLocation();

  const isHomeActive = location === "/" || location === "/home";
  const isAccountActive = location === "/account";

  const navItemClass = (isActive: boolean) =>
    cn(
      "min-h-11 rounded-xl border-border/70 px-5 text-sm font-semibold shadow-sm",
      isActive
        ? "bg-card text-foreground hover:bg-card/90"
        : "bg-background text-foreground hover:bg-card/80",
    );

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
            <Button
              asChild
              variant="outline"
              size="lg"
              className={navItemClass(isHomeActive)}
              data-testid="button-home"
            >
              <Link href="/">Home</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className={navItemClass(isAccountActive)}
              data-testid="button-account"
            >
              <Link href="/account">Account</Link>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
