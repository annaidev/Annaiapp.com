import { Link } from "wouter";
import { LogOut, User } from "lucide-react";
import { useUser, useLogout } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

function AnnaiLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 56"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Annai"
    >
      <defs>
        <linearGradient id="annai-globe-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5EC6C6" />
          <stop offset="100%" stopColor="#E05555" />
        </linearGradient>
        <linearGradient id="annai-plane-g" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#F0A830" />
          <stop offset="100%" stopColor="#E05555" />
        </linearGradient>
      </defs>

      <g transform="translate(26, 28)">
        <circle cx="0" cy="0" r="19" fill="none" stroke="url(#annai-globe-g)" strokeWidth="2.2" />
        <ellipse cx="0" cy="0" rx="9.5" ry="19" fill="none" stroke="url(#annai-globe-g)" strokeWidth="1.4" />
        <line x1="-18" y1="0" x2="18" y2="0" stroke="url(#annai-globe-g)" strokeWidth="1.3" />
        <path d="M -16 -8.5 Q 0 -5.5, 16 -8.5" fill="none" stroke="url(#annai-globe-g)" strokeWidth="1.1" />
        <path d="M -16 8.5 Q 0 11.5, 16 8.5" fill="none" stroke="url(#annai-globe-g)" strokeWidth="1.1" />

        <path
          d="M 11,-20 Q 24,-9 21,7 Q 17,18 5,21"
          fill="none"
          stroke="url(#annai-plane-g)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeDasharray="2,3"
        />
        <g transform="translate(11,-20) rotate(30)">
          <polygon points="0,-4 -1.8,1.8 0,0.5 1.8,1.8" fill="#F0A830" />
          <line x1="-3.2" y1="0" x2="3.2" y2="0" stroke="#F0A830" strokeWidth="1.1" strokeLinecap="round" />
        </g>
      </g>

      <text
        x="52"
        y="37"
        fontFamily="'Outfit', 'Plus Jakarta Sans', system-ui, sans-serif"
        fontSize="30"
        fontWeight="700"
        fill="#2D3748"
        letterSpacing="-0.5"
      >
        Annai
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
