import { Link } from "wouter";
import { LogOut, User } from "lucide-react";
import { useUser, useLogout } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

function AnnaiLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 60"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Annai"
    >
      <defs>
        <linearGradient id="globe-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5EC6C6" />
          <stop offset="100%" stopColor="#3BA8A8" />
        </linearGradient>
        <linearGradient id="path-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#F0A830" />
          <stop offset="100%" stopColor="#E05555" />
        </linearGradient>
      </defs>

      <g transform="translate(30, 30)">
        <circle cx="0" cy="0" r="22" fill="url(#globe-grad)" />

        <ellipse cx="0" cy="0" rx="9" ry="21" fill="none" stroke="white" strokeWidth="1.2" opacity="0.5" />
        <ellipse cx="0" cy="0" rx="16" ry="21" fill="none" stroke="white" strokeWidth="1" opacity="0.35" />
        <line x1="-21" y1="0" x2="21" y2="0" stroke="white" strokeWidth="1" opacity="0.45" />
        <line x1="-19" y1="-8" x2="19" y2="-8" stroke="white" strokeWidth="0.8" opacity="0.3" />
        <line x1="-19" y1="8" x2="19" y2="8" stroke="white" strokeWidth="0.8" opacity="0.3" />

        <path
          d="M -18 12 Q -8 -18 12 -20 Q 24 -20 26 -8"
          fill="none"
          stroke="url(#path-grad)"
          strokeWidth="2.2"
          strokeLinecap="round"
        />

        <polygon
          points="26,-8 28,-14 22,-11"
          fill="#E05555"
        />

        <circle cx="-18" cy="12" r="2.5" fill="#F0A830" />
      </g>

      <text
        x="62"
        y="43"
        fontFamily="'Outfit', 'Plus Jakarta Sans', system-ui, sans-serif"
        fontSize="36"
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
