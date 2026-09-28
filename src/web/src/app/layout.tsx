import type { Metadata } from 'next';
import Link from 'next/link';
import { UserNav } from '@/components/nav/user-nav';
import { currentUser } from '@/lib/session';
// Bundled fonts (SIL OFL 1.1): installed with npm and served from the portal's own origin, never
// fetched from a font service. Each stylesheet declares its files by character set, so a browser
// downloads only the ones a page needs.
import '@fontsource-variable/inter';
import '@fontsource-variable/manrope';
import '@fontsource-variable/jetbrains-mono';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Evenhand', template: '%s · Evenhand' },
  description: 'Self-hostable hackathon submissions and judging, with rankings you can check.',
};

/** The mark: a balance, drawn inline (no image request, nothing fetched). */
function Logo() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-6 w-6 text-accent"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v18M7 21h10M4 7h16" />
      <path d="M4 7l-2.5 6a3 3 0 0 0 5 0L4 7zM20 7l-2.5 6a3 3 0 0 0 5 0L20 7z" />
    </svg>
  );
}

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const me = await currentUser();
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:p-2">
          Skip to content
        </a>
        <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
          <nav
            aria-label="Main"
            className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3"
          >
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <Logo />
              Evenhand
            </Link>
            <Link href="/projects" className="text-sm text-muted hover:text-fg">
              Gallery
            </Link>
            {/* A plain link: /api/docs is served by the API, not a Next.js page. */}
            <a href="/api/docs" className="text-sm text-muted hover:text-fg">
              API
            </a>
            <UserNav me={me} />
          </nav>
        </header>
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
          {children}
        </main>
        <footer className="border-t border-border py-4 text-center text-xs text-muted">
          Evenhand · MIT licensed · runs entirely on your own machine
        </footer>
      </body>
    </html>
  );
}
