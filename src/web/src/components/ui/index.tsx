/**
 * Design-system primitives (owner: C). Pages use these instead of styling raw elements, so
 * the whole portal looks like one product. Extend here; do not fork per page.
 *
 * The look: pill buttons, quiet cards on a faint grid, and the mono font for small technical
 * text (badges, labels, figures). Colours only from the tokens in app/globals.css.
 */
import Link from 'next/link';
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react';

const cx = (...classes: (string | false | null | undefined)[]): string =>
  classes.filter(Boolean).join(' ');

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
const BUTTON_VARIANT = {
  primary: 'bg-accent text-accent-fg hover:opacity-90',
  secondary: 'border border-border bg-surface text-fg hover:border-accent',
} as const;

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }) {
  return (
    <button
      className={cx(
        BUTTON_BASE,
        'disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON_VARIANT[variant],
        className,
      )}
      {...props}
    />
  );
}

/**
 * A link that looks like a button: for navigation that is the main action on a page ("Browse
 * the gallery", "Continue judging"). Use Button for actions that change something.
 */
export function ButtonLink({
  href,
  variant = 'primary',
  className,
  children,
}: {
  href: string;
  variant?: keyof typeof BUTTON_VARIANT;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={cx(BUTTON_BASE, BUTTON_VARIANT[variant], className)}>
      {children}
    </Link>
  );
}

// ComponentProps includes `ref`, which React 19 passes like any other prop (the gallery search).
export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cx(
        'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg',
        'placeholder:text-muted transition-colors hover:border-muted',
        'focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent',
        className,
      )}
      {...props}
    />
  );
}

export function Label({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium">
      {children}
    </label>
  );
}

/**
 * A small section label in the mono face, e.g. `[ Judging ]`. The brackets are decoration, so
 * screen readers hear only the words. Use sparingly: one per page section at most.
 */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-accent">
      <span aria-hidden="true">[ </span>
      {children}
      <span aria-hidden="true"> ]</span>
    </p>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('rounded-xl border border-border bg-surface p-4 shadow-sm', className)}>
      {children}
    </div>
  );
}

const BADGE_TONES = {
  neutral: 'border-border text-muted',
  warning: 'border-warning text-warning',
  success: 'border-success text-success',
  accent: 'border-transparent bg-accent-soft text-fg',
} as const;

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: keyof typeof BADGE_TONES;
}) {
  return (
    <span
      className={cx(
        'inline-block rounded-full border px-2 py-0.5 font-mono text-[11px] leading-4',
        BADGE_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

// Written out in full so Tailwind generates each class.
const TILES = [
  'bg-tile-1',
  'bg-tile-2',
  'bg-tile-3',
  'bg-tile-4',
  'bg-tile-5',
  'bg-tile-6',
] as const;

/**
 * A project's tile: its initials on a colour picked from the title, so the same project always
 * looks the same. Projects have no images yet, and nothing may be fetched from elsewhere.
 */
export function ProjectTile({ title, size = 'md' }: { title: string; size?: 'md' | 'lg' }) {
  let hash = 0;
  for (const ch of title) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const initials =
    title
      .split(/\s+/)
      .filter((w) => /\p{L}|\p{N}/u.test(w))
      .slice(0, 2)
      .map((w) => [...w].find((c) => /\p{L}|\p{N}/u.test(c))!.toUpperCase())
      .join('') || '?';
  return (
    <div
      aria-hidden="true"
      className={cx(
        'flex shrink-0 items-center justify-center rounded-md font-semibold tracking-wide text-tile-fg',
        TILES[hash % TILES.length],
        size === 'lg' ? 'h-16 w-16 text-xl' : 'h-11 w-11 text-sm',
      )}
    >
      {initials}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Card className="text-center">
      <p className="font-medium">{title}</p>
      {children ? <div className="mt-1 text-sm text-muted">{children}</div> : null}
    </Card>
  );
}

export function ErrorState({ title, message }: { title: string; message: string }) {
  return (
    <div role="alert" className="rounded-lg border border-danger p-4 text-danger">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm">{message}</p>
    </div>
  );
}
