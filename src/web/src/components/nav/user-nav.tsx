import Link from 'next/link';
import type { Schemas } from '@/lib/api/types';
import { LogoutButton } from './logout-button';

const link = 'whitespace-nowrap text-sm text-muted hover:text-fg';
// On a phone the header wraps: this group moves to its own line instead of overflowing.
const group = 'ml-auto flex flex-wrap items-center gap-x-4 gap-y-1';

/**
 * The right-hand side of the header. What it shows depends on who is logged in; what they
 * can do is still decided by the API on every request.
 */
export function UserNav({ me }: { me: Schemas['MeDto'] | null }) {
  if (!me) {
    return (
      <div className={group}>
        <Link href="/login" className={link}>
          Log in
        </Link>
        <Link href="/register" className={link}>
          Register
        </Link>
      </div>
    );
  }
  const organises = me.isAdmin || me.roles.some((r) => r.role === 'ORGANIZER');
  const judges = me.roles.some((r) => r.role === 'JUDGE');
  return (
    <div className={group}>
      <Link href="/teams" className={link}>
        My teams
      </Link>
      {judges ? (
        <Link href="/judging" className={link}>
          Judging
        </Link>
      ) : null}
      {organises ? (
        <Link href="/organizer" className={link}>
          Organise
        </Link>
      ) : null}
      {/* Shown to admins only; the API refuses everyone else anyway. */}
      {me.isAdmin ? (
        <Link href="/admin/audit" className={link}>
          Admin
        </Link>
      ) : null}
      <span className="max-w-[12rem] truncate whitespace-nowrap text-sm" title={me.email}>
        {me.name}
        {me.isAdmin ? <span className="ml-1 text-xs text-muted">(admin)</span> : null}
      </span>
      <LogoutButton />
    </div>
  );
}
