import Link from "next/link";

interface HeaderProps {
  corpusCount?: number;
  /** Current pathname for active-state styling (server-computed). */
  active?: "discover" | "brands";
}

function navLink(href: string, label: string, isActive: boolean) {
  return (
    <Link
      href={href}
      className={`text-xs font-sans tracking-wide pb-1 transition-colors ${
        isActive
          ? "text-[#f3f4f6] font-medium border-b-2 border-[#d46b38]"
          : "text-[#8e95a2] hover:text-[#f3f4f6]"
      }`}
      aria-current={isActive ? "page" : undefined}
    >
      {label}
    </Link>
  );
}

export function Header({ corpusCount, active = "discover" }: HeaderProps) {
  return (
    <header className="w-full border-b border-[#16181f] bg-[#07080a]/90 backdrop-blur-md sticky top-0 z-40">
      <div className="adlabs-canvas h-14 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link
            href="/discover"
            className="flex items-center gap-2 group text-decoration-none"
          >
            <span className="font-sans text-[15px] font-semibold tracking-tight text-[#f3f4f6] group-hover:text-[#e07945] transition-colors">
              AdLabs
            </span>
          </Link>

          <nav className="flex items-center gap-6" aria-label="Main Navigation">
            {navLink("/discover", "Discover", active === "discover")}
            {navLink("/brands", "Brands", active === "brands")}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {corpusCount !== undefined && (
            <div className="text-xs font-mono text-[#8e95a2] tabular-nums">
              <span className="text-[#f3f4f6] font-medium">{corpusCount}</span>{" "}
              <span>{corpusCount === 1 ? "creative" : "creatives"} observed</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
