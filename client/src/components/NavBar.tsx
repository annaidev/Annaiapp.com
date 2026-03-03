import { Link } from "wouter";

export function NavBar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b glass">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link 
          href="/" 
          className="flex items-center gap-2 text-primary hover:opacity-80 transition-opacity"
        >
          <span className="text-2xl font-bold font-display tracking-tight text-primary">Annai</span>
        </Link>
      </div>
    </header>
  );
}
