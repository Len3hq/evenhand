'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * A header link that shows, and tells screen readers (aria-current), which section you are in:
 * it is current on its own path and on any page below it.
 */
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const path = usePathname();
  const current = path === href || path.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      className={`whitespace-nowrap rounded-full px-2.5 py-1 text-sm transition-colors ${
        current ? 'bg-accent-soft font-medium text-fg' : 'text-muted hover:text-fg'
      }`}
    >
      {children}
    </Link>
  );
}
