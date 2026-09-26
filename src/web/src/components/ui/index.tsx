/**
 * Design-system primitives (owner: C). Pages use these instead of styling raw elements, so
 * the whole portal looks like one product. Extend here; do not fork per page.
 */
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

const cx = (...classes: (string | false | null | undefined)[]): string =>
  classes.filter(Boolean).join(' ');

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        'disabled:cursor-not-allowed disabled:opacity-60',
        variant === 'primary'
          ? 'bg-accent text-accent-fg hover:opacity-90'
          : 'border border-border bg-surface hover:bg-bg',
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm',
        'focus-visible:outline-2 focus-visible:outline-accent',
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

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('rounded-lg border border-border bg-surface p-4', className)}>
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'warning';
}) {
  return (
    <span
      className={cx(
        'inline-block rounded-full border px-2 py-0.5 text-xs',
        tone === 'warning' ? 'border-warning text-warning' : 'border-border text-muted',
      )}
    >
      {children}
    </span>
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
