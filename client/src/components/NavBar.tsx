import { Link } from "wouter";
import { LogOut, User } from "lucide-react";
import { useUser, useLogout } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

function AnnaiLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 190 56"
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

      <g transform="translate(22, 28)">
        <polygon points="0,-25 -14,19 0,10 14,19" fill="url(#annai-arrow-g)" />

        <text
          x="0"
          y="-4"
          textAnchor="middle"
          fontFamily="'Outfit', 'Plus Jakarta Sans', system-ui, sans-serif"
          fontSize="14"
          fontWeight="800"
          fill="#FFFFFF"
        >
          A
        </text>
      </g>

      <text
        x="44"
        y="38"
        fontFamily="'Outfit', 'Plus Jakarta Sans', system-ui, sans-serif"
        fontSize="32"
        fontWeight="700"
        fill="#2D3748"
        letterSpacing="-0.5"
      >
        nnai
      </text>
    </svg>
  );
}

export function NavBar() {
  const { data: user } = useUser();
  const logoutMutation = useLogout();

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
            <span className="text-sm text-muted-foreground flex items-center gap-1.5" data-testid="text-username">
              <User className="h-4 w-4" />
              {user.username}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => logoutMutation.mutate()}
              className="text-muted-foreground rounded-xl"
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4 mr-1.5" />
              Sign Out
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
