import Link from "next/link";

interface HeaderProps {
  corpusCount?: number;
}

export function Header({ corpusCount }: HeaderProps) {
  return (
    <header className="w-full border-b border-[#1c1f24] bg-[#0c0e12]/90 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link
            href="/discover"
            className="flex items-center gap-2 group text-decoration-none"
          >
            <span className="font-sans text-sm font-semibold tracking-tight text-[#ededed] group-hover:text-amber-400 transition-colors">
              AdLabs
            </span>
          </Link>

          <nav className="flex items-center gap-6" aria-label="Main Navigation">
            <Link
              href="/discover"
              className="text-xs font-sans tracking-wide text-[#ededed] font-medium border-b border-amber-400 pb-0.5"
            >
              Discover
            </Link>
            <span
              className="text-xs font-sans tracking-wide text-zinc-500 cursor-not-allowed"
              title="Coming in later milestone"
            >
              Brands
            </span>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {corpusCount !== undefined && (
            <div className="text-xs font-sans text-zinc-400">
              <span className="text-zinc-200 font-medium">{corpusCount}</span>{" "}
              <span>{corpusCount === 1 ? "creative" : "creatives"} observed</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
