import { Link } from "wouter";
import { LogOut, User } from "lucide-react";
import { useUser, useLogout } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

function AnnaiLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 160 48"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Annai"
    >
      <defs>
        <linearGradient id="annai-globe-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#E05555" />
          <stop offset="50%" stopColor="#F0A830" />
          <stop offset="100%" stopColor="#5EC6C6" />
        </linearGradient>
        <linearGradient id="annai-arc-g" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#E05555" />
          <stop offset="100%" stopColor="#F0A830" />
        </linearGradient>
        <clipPath id="globe-clip">
          <circle cx="24" cy="24" r="17" />
        </clipPath>
      </defs>

      <circle cx="24" cy="24" r="17" fill="none" stroke="url(#annai-globe-g)" strokeWidth="2.2" />

      <g clipPath="url(#globe-clip)" stroke="#2D3748" strokeWidth="1.2" fill="none" opacity="0.35">
        <ellipse cx="24" cy="24" rx="8" ry="17" />
        <ellipse cx="24" cy="24" rx="14" ry="17" />
        <line x1="7" y1="16" x2="41" y2="16" />
        <line x1="7" y1="24" x2="41" y2="24" />
        <line x1="7" y1="32" x2="41" y2="32" />
      </g>

      <path
        d="M 8,32 Q 16,8 32,12 Q 44,15 40,30"
        fill="none"
        stroke="url(#annai-arc-g)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeDasharray="2,3"
      />

      <g transform="translate(38,12) rotate(45)" fill="#E05555">
        <path d="M 0,0 L -2.5,-1 L -6,0 L -2.5,1 Z" />
        <path d="M -3,-3.5 L -3.5,0 L -3,0 Z" opacity="0.7" />
        <path d="M -3,3.5 L -3.5,0 L -3,0 Z" opacity="0.7" />
      </g>

      <text
        x="52"
        y="31"
        fontFamily="'Outfit', 'Plus Jakarta Sans', system-ui, sans-serif"
        fontSize="24"
        fontWeight="700"
        letterSpacing="-0.5"
        fill="#2D3748"
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
