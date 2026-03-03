import { Link } from "wouter";

function AnnaiLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 60"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Annai"
    >
      <defs>
        <clipPath id="mountain-clip">
          <path d="M5 52 L30 5 L55 52 Z" />
        </clipPath>
      </defs>

      <g clipPath="url(#mountain-clip)">
        <rect x="5" y="5" width="50" height="25" fill="#4A90B8" />
        <path
          d="M5 30 Q15 22 25 30 Q35 38 45 28 Q50 24 55 27 L55 52 L5 52 Z"
          fill="#3B8C5E"
        />
      </g>

      <path
        d="M5 52 L30 5 L55 52"
        fill="none"
        stroke="#1E4D5E"
        strokeWidth="3"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      <line x1="15" y1="38" x2="45" y2="38" stroke="#1E4D5E" strokeWidth="3" strokeLinecap="round" />

      <text
        x="58"
        y="50"
        fontFamily="'Outfit', 'Plus Jakarta Sans', sans-serif"
        fontSize="42"
        fontWeight="700"
        fill="#1E4D5E"
        letterSpacing="-0.5"
      >
        nnai
      </text>
    </svg>
  );
}

export function NavBar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b glass">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center hover:opacity-80 transition-opacity"
        >
          <AnnaiLogo className="h-12 w-auto" />
        </Link>
      </div>
    </header>
  );
}
