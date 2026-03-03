import { Link } from "wouter";
import brandLogo from "@assets/Screenshot_2025-06-19_153050_1772501372325.png";

export function NavBar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b glass">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link 
          href="/" 
          className="flex items-center hover:opacity-80 transition-opacity"
        >
          <img src={brandLogo} alt="Annai" className="h-12 object-contain mix-blend-multiply dark:mix-blend-screen" />
        </Link>
      </div>
    </header>
  );
}
