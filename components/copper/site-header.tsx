import Link from "next/link";
import { Logo } from "@/components/copper/logo";
import { ModeToggle } from "@/components/copper/mode-toggle";
import { cn } from "@/lib/utils";

// The same header on every page. Section links start with "/" so they also
// work from the Support page. They don't all fit beside the logo on a phone,
// so only Support and Ask Copper show there.
const LINKS = [
  { href: "/#products", label: "Products", phone: false },
  { href: "/#plus", label: "Copper Plus", phone: false },
  { href: "/#privacy", label: "Privacy", phone: false },
  { href: "/#refunds", label: "Refunds", phone: false },
  { href: "/support", label: "Support" },
  { href: "/#ask", label: "Ask Copper" },
];

export function SiteHeader() {
  return (
    <header
      data-testid="site-header"
      className="bg-background/90 sticky top-0 z-50 h-(--header-h) border-b backdrop-blur"
    >
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-2 px-4 sm:gap-4">
        <Link href="/" aria-label="Copper State Labs home" className="shrink-0">
          <Logo className="w-28 sm:w-40" />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-4">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "text-foreground/80 hover:text-primary rounded-md px-1 py-1 text-sm font-medium whitespace-nowrap transition-colors sm:px-2",
                link.phone === false && "hidden sm:inline",
              )}
            >
              {link.label}
            </Link>
          ))}
          <ModeToggle />
        </nav>
      </div>
    </header>
  );
}
