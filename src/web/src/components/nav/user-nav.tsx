import Link from 'next/link';
import type { Schemas } from '@/lib/api/types';
import { LogoutButton } from './logout-button';
import { NavLink } from './nav-link';

// On a phone the header wraps: this group moves to its own line instead of overflowing.
const group = 'ml-auto flex flex-wrap items-center gap-x-1 gap-y-1';

/**
 * The right-hand side of the header: the sections this person can use, then who they are.
 * What it shows depends on who is logged in; what they can do is still decided by the API on
 * every request.
 */
export function UserNav({ me }: { me: Schemas['MeDto'] | null }) {
  if (!me) {
    return (
      <div className={group}>
        <NavLink href="/login">Log in</NavLink>
        <Link
          href="/register"
          className="ml-1 whitespace-nowrap rounded-full border border-border px-3 py-1 text-sm font-medium hover:border-accent"
        >
          Register
        </Link>
      </div>
    );
  }
  const organises = me.isAdmin || me.roles.some((r) => r.role === 'ORGANIZER');
  const judges = me.roles.some((r) => r.role === 'JUDGE');
  return (
    <div className={group}>
      <NavLink href="/teams">My teams</NavLink>
      {judges ? <NavLink href="/judging">Judging</NavLink> : null}
      {organises ? <NavLink href="/organizer">Organise</NavLink> : null}
      {/* Shown to admins only; the API refuses everyone else anyway. */}
      {me.isAdmin ? <NavLink href="/admin/audit">Admin</NavLink> : null}
      <span className="flex items-center gap-2 sm:ml-2 sm:border-l sm:border-border sm:pl-3">
        <span className="max-w-[12rem] truncate whitespace-nowrap text-sm" title={me.email}>
          {me.name}
          {me.isAdmin ? <span className="ml-1 font-mono text-[11px] text-muted">admin</span> : null}
        </span>
        <LogoutButton />
      </span>
    </div>
  );
}
