import Link from "next/link";
import { Logo } from "@/components/copper/logo";
import { ModeToggle } from "@/components/copper/mode-toggle";
import { cn } from "@/lib/utils";

// The same header on every page. Section links start with "/" so they also
// work from the Support page. They don't all fit beside the logo on a phone,
// so only Support and Ask Copper show there. On the Support page the chat is
// already on the page, so "Ask Copper" points at it ("#ask") instead of
// going back to the home page and opening a second one.
const LINKS = [
  { href: "/#products", label: "Products", phone: false },
  { href: "/#plus", label: "Copper Plus", phone: false },
  { href: "/#privacy", label: "Privacy", phone: false },
  { href: "/#refunds", label: "Refunds", phone: false },
  { href: "/support", label: "Support" },
  { href: "/#ask", label: "Ask Copper" },
];

export function SiteHeader({ current }: { current?: "support" } = {}) {
  const links = LINKS.map((link) =>
    current === "support" && link.label === "Ask Copper"
      ? { ...link, href: "#ask" }
      : link,
  );
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
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={
                current === "support" && link.href === "/support"
                  ? "page"
                  : undefined
              }
              className={cn(
                "text-foreground/80 hover:text-primary rounded-md px-1 py-1 text-sm font-medium whitespace-nowrap transition-colors sm:px-2",
                link.phone === false && "hidden sm:inline",
                "aria-[current=page]:text-primary",
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
