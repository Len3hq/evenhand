/**
 * The only source of "now" in the API. Services inject Clock instead of calling
 * `new Date()`, so deadline tests can freeze time, including the exact boundary instant.
 * (ESLint bans `new Date()` / `Date.now()` everywhere except this file and tests.)
 */
export abstract class Clock {
  abstract now(): Date;
}

export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}

/** For tests: a clock that only moves when told to. */
export class FixedClock extends Clock {
  constructor(private current: Date) {
    super();
  }

  now(): Date {
    return new Date(this.current.getTime());
  }

  set(at: Date): void {
    this.current = new Date(at.getTime());
  }
}
