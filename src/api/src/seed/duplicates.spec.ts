import { detectDuplicates, normaliseRepo, normaliseTitle } from './duplicates.js';

const base = { team: 'tm_01', title: 'A', repoUrl: '', submittedAt: '2026-03-01T00:00:00Z' };

describe('detectDuplicates', () => {
  it('flags the fixture case (Dry Harbour): same team, keeps the later copy', () => {
    const pairs = detectDuplicates([
      {
        id: 'prj_07',
        team: 'tm_07',
        title: 'Dry Harbour',
        repoUrl: 'https://example.org/r',
        submittedAt: '2026-03-01T04:29:00Z',
      },
      {
        id: 'prj_41',
        team: 'tm_07',
        title: 'Dry Harbour',
        repoUrl: 'https://example.org/r',
        submittedAt: '2026-03-01T17:57:00Z',
      },
    ]);
    expect(pairs).toEqual([{ keptId: 'prj_41', supersededId: 'prj_07', reason: 'SAME_TEAM' }]);
  });

  it('keeps the later submission regardless of file order', () => {
    const pairs = detectDuplicates([
      { ...base, id: 'late', submittedAt: '2026-03-02T00:00:00Z' },
      { ...base, id: 'early', submittedAt: '2026-03-01T00:00:00Z' },
    ]);
    expect(pairs[0]).toMatchObject({ keptId: 'late', supersededId: 'early' });
  });

  it('flags the same repository across teams', () => {
    const pairs = detectDuplicates([
      { ...base, id: 'a', team: 't1', title: 'One', repoUrl: 'https://github.com/x/y' },
      { ...base, id: 'b', team: 't2', title: 'Two', repoUrl: 'http://www.github.com/x/y.git/' },
    ]);
    expect(pairs[0]?.reason).toBe('SAME_REPO');
  });

  it('flags a shared title across teams only as SAME_TITLE', () => {
    const pairs = detectDuplicates([
      { ...base, id: 'a', team: 't1', title: 'Quiet  Hours' },
      { ...base, id: 'b', team: 't2', title: 'quiet hours' },
    ]);
    expect(pairs[0]?.reason).toBe('SAME_TITLE');
  });

  it('returns nothing for distinct projects', () => {
    expect(
      detectDuplicates([
        { ...base, id: 'a', team: 't1', title: 'One', repoUrl: 'https://x/1' },
        { ...base, id: 'b', team: 't2', title: 'Two', repoUrl: 'https://x/2' },
      ]),
    ).toEqual([]);
  });
});

describe('normalisers', () => {
  it('normalise titles and repository URLs', () => {
    expect(normaliseTitle('  Dry\tHarbour ')).toBe('dry harbour');
    expect(normaliseRepo('https://www.GitHub.com/a/b.git/')).toBe('github.com/a/b');
  });
});
