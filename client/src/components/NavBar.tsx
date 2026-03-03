import { Link } from "wouter";

function AnnaiLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 220 60"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Annai"
    >
      <g transform="translate(2, 2) scale(0.9)">
        <defs>
          <clipPath id="a-outer">
            <path d="M28 2 L2 55 Q10 42 22 38 Q30 35 35 40 Q40 45 48 52 L52 58 L52 55 L28 2 Z" />
          </clipPath>
        </defs>

        <path
          d="M28 2 Q26 8 20 20 Q14 32 6 48 Q4 52 2 55 Q10 42 22 38 Q30 35 35 40 Q40 45 48 52 L52 58 L52 55 L28 2 Z"
          fill="#2D5A6B"
          strokeLinejoin="round"
        />

        <path
          d="M28 6 L22 20 Q20 24 18 26 Q24 22 30 26 Q34 28 36 32 L28 6 Z"
          fill="#89C4E1"
        />

        <path
          d="M18 26 Q14 32 8 46 Q6 50 5 53 Q12 42 22 39 Q30 36 35 40 Q40 44 46 50 L36 32 Q34 28 30 26 Q24 22 18 26 Z"
          fill="#5EA55B"
        />
      </g>

      <text
        x="55"
        y="50"
        fontFamily="'Outfit', 'Plus Jakarta Sans', sans-serif"
        fontSize="42"
        fontWeight="700"
        fill="#2D5A6B"
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
