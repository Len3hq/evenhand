import Link from 'next/link';
import type { Schemas } from '@/lib/api/types';
import { LogoutButton } from './logout-button';

const link = 'text-sm text-muted hover:text-fg';

/**
 * The right-hand side of the header. What it shows depends on who is logged in; what they
 * can do is still decided by the API on every request.
 */
export function UserNav({ me }: { me: Schemas['MeDto'] | null }) {
  if (!me) {
    return (
      <div className="ml-auto flex items-center gap-4">
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
  return (
    <div className="ml-auto flex items-center gap-4">
      <Link href="/teams" className={link}>
        My teams
      </Link>
      {organises ? (
        <Link href="/organizer" className={link}>
          Organise
        </Link>
      ) : null}
      <span className="text-sm" title={me.email}>
        {me.name}
        {me.isAdmin ? <span className="ml-1 text-xs text-muted">(admin)</span> : null}
      </span>
      <LogoutButton />
    </div>
  );
}
