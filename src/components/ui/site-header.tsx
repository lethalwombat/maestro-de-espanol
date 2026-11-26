import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";

export const PAGES = [
  { href: "/", label: "Sentence checker" },
  { href: "/exercises", label: "Exercises" },
  { href: "/admin/prompts", label: "Prompt admin" },
] as const;

/** The link to the page being shown: full-strength text, underlined in the accent. */
const CURRENT = "text-fg underline decoration-accent decoration-2";

export type PagePath = (typeof PAGES)[number]["href"];

/** The page heading, the main navigation and the theme control, in that order. */
export function SiteHeader({ heading, current }: { heading: string; current: PagePath }) {
  return (
    <header>
      <h1 className="text-3xl font-bold tracking-tight">{heading}</h1>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <nav aria-label="Main">
          <ul className="flex flex-wrap gap-1">
            {PAGES.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={href === current ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium underline-offset-4 transition-colors duration-(--duration-fast) ease-(--ease-out) hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${href === current ? CURRENT : "text-fg-muted"}`}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <ThemeToggle />
      </div>
    </header>
  );
}
