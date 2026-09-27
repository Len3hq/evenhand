import type { Metadata } from 'next';
import Link from 'next/link';
import { UserNav } from '@/components/nav/user-nav';
import { currentUser } from '@/lib/session';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Evenhand', template: '%s · Evenhand' },
  description: 'Self-hostable hackathon submissions and judging, with rankings you can check.',
};

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const me = await currentUser();
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:p-2">
          Skip to content
        </a>
        <header className="border-b border-border bg-surface">
          <nav aria-label="Main" className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
            <Link href="/" className="font-semibold">
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
