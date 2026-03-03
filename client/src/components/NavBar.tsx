import { Link } from "wouter";
import brandLogo from "@assets/Anna_logo_number_1_1772500442949.png";

export function NavBar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b glass">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link 
          href="/" 
          className="flex items-center hover:opacity-80 transition-opacity"
        >
          <img src={brandLogo} alt="Annai" className="h-10 w-10 object-contain" />
          <span className="text-2xl font-bold font-display tracking-tight text-primary">Annai</span>
        </Link>
      </div>
    </header>
  );
}
