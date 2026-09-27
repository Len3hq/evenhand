/**
 * Deadlines are UTC instants. A `datetime-local` input has no zone, so the organiser pages
 * label every date field "UTC" and convert explicitly, instead of letting the browser apply
 * its own zone.
 */

/** "2026-12-01T18:00:00.000Z" → "2026-12-01T18:00" for a datetime-local input. */
export function toInput(iso: string | null): string {
  return iso ? iso.slice(0, 16) : '';
}

/** "2026-12-01T18:00" (read as UTC) → "2026-12-01T18:00:00Z"; empty → null. */
export function fromInput(value: string): string | null {
  return value ? `${value}:00Z` : null;
}

/** "2026-12-01 18:00 UTC" for reading. */
export function formatUtc(iso: string | null): string {
  return iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : '—';
}
