import { summarise } from './summarise.js';

describe('audit summaries', () => {
  it('names the actor and the target', () => {
    expect(
      summarise({ action: 'team.joined', before: null, after: {} }, 'Ben', 'Quiet Hours'),
    ).toBe('Ben joined the team "Quiet Hours" with an invite link');
  });

  it('lists what changed, with dates in UTC', () => {
    expect(
      summarise(
        {
          action: 'event.updated',
          before: { submissionsClose: '2026-12-01T18:00:00.000Z' },
          after: { submissionsClose: '2026-12-08T18:00:00.000Z' },
        },
        'Organizer',
        'Winter Jam',
      ),
    ).toBe(
      'Organizer changed the event: submissionsClose: 2026-12-01 18:00 UTC → 2026-12-08 18:00 UTC',
    );
  });

  it('shows cleared values and lists as readable text', () => {
    expect(
      summarise(
        {
          action: 'submission.updated',
          before: { tagline: 'Short', techTags: [] },
          after: { tagline: null, techTags: ['ts', 'go'] },
        },
        'Cara',
        'Smoke Draft',
      ),
    ).toBe(
      'Cara edited the submission "Smoke Draft": tagline: "Short" → (empty); techTags: (none) → "ts", "go"',
    );
  });

  it('cuts long text so one entry stays one line', () => {
    const long = 'word '.repeat(40);
    const text = summarise(
      { action: 'submission.updated', before: { description: null }, after: { description: long } },
      'Cara',
      'X',
    );
    expect(text.length).toBeLessThan(140);
    expect(text).toContain('…');
  });

  it('names the person appointed as an organiser', () => {
    expect(
      summarise({ action: 'organizer.added', before: null, after: {} }, 'Ada', 'ben@x.test'),
    ).toBe('Ada made "ben@x.test" an organiser');
  });

  it('says what changed in the rubric', () => {
    const before = {
      impact: { label: 'Impact', weight: 1, min: 1, max: 5 },
      polish: { label: 'Polish', weight: 1, min: 1, max: 5 },
    };
    const after = {
      impact: { label: 'Impact', weight: 2, min: 1, max: 5 },
      novelty: { label: 'Novelty', weight: 1, min: 0, max: 10 },
    };
    expect(summarise({ action: 'rubric.updated', before, after }, 'Ada', 'Hack')).toBe(
      'Ada changed the rubric: "Impact" weight 1 → 2; added "Novelty" (weight 1, 0–10); removed "Polish"',
    );
  });

  it('says "the system" for the seed and command line', () => {
    expect(
      summarise({ action: 'fixtures.imported', before: null, after: {} }, null, 'Sample'),
    ).toBe('The system imported the event from fixtures.json');
  });

  it('never needs the password or token to describe a row', () => {
    expect(
      summarise(
        { action: 'auth.login_failed', before: null, after: { email: 'a@b.c' } },
        null,
        null,
      ),
    ).toBe('Failed login for a@b.c');
  });

  it('falls back to the raw action for anything it does not know', () => {
    expect(summarise({ action: 'future.thing', before: null, after: null }, 'Ada', null)).toBe(
      'Ada: future.thing',
    );
  });
});
