import { assertSubmissionsOpen, submissionsOpen } from './deadline.js';
import { DomainError } from './errors.js';

const close = new Date('2026-03-01T18:00:00.000Z');
const event = { submissionsClose: close };

describe('assertSubmissionsOpen', () => {
  it('accepts a write one millisecond before the deadline', () => {
    expect(() => assertSubmissionsOpen(event, new Date(close.getTime() - 1))).not.toThrow();
  });

  it('refuses a write at the exact deadline instant (now < close, strictly)', () => {
    expect(() => assertSubmissionsOpen(event, close)).toThrow(DomainError);
  });

  it('refuses with 403 submissions_closed after the deadline', () => {
    try {
      assertSubmissionsOpen(event, new Date(close.getTime() + 1));
      expect.unreachable();
    } catch (e) {
      expect((e as DomainError).getStatus()).toBe(403);
      expect((e as DomainError).getResponse()).toMatchObject({ error: 'submissions_closed' });
    }
  });
});

describe('opens_at', () => {
  const opens = new Date('2026-02-01T09:00:00.000Z');
  const windowed = { opensAt: opens, submissionsClose: close };

  it('refuses a write before the event opens with 403 submissions_not_open', () => {
    try {
      assertSubmissionsOpen(windowed, new Date(opens.getTime() - 1));
      expect.unreachable();
    } catch (e) {
      expect((e as DomainError).getStatus()).toBe(403);
      expect((e as DomainError).getResponse()).toMatchObject({ error: 'submissions_not_open' });
    }
  });

  it('accepts a write at the exact opening instant', () => {
    expect(() => assertSubmissionsOpen(windowed, opens)).not.toThrow();
  });

  it('reports the same window it enforces', () => {
    for (const t of [opens.getTime() - 1, opens.getTime(), close.getTime() - 1, close.getTime()]) {
      const now = new Date(t);
      let enforced = true;
      try {
        assertSubmissionsOpen(windowed, now);
      } catch {
        enforced = false;
      }
      expect(submissionsOpen(windowed, now)).toBe(enforced);
    }
  });
});
