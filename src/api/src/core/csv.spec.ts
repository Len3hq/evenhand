import { neutraliseFormula, toCsv } from './csv.js';

describe('CSV export', () => {
  it.each(['=HYPERLINK("http://evil","x")', '+1+1', '-2+3', '@SUM(A1)', '\tx', '\rx'])(
    'neutralises text starting a formula: %j',
    (text) => {
      expect(neutraliseFormula(text)).toBe(`'${text}`);
    },
  );

  it('leaves ordinary text alone', () => {
    expect(neutraliseFormula('Quiet Hours')).toBe('Quiet Hours');
    expect(neutraliseFormula('a=b')).toBe('a=b');
  });

  it('protects text cells but never numbers', () => {
    const csv = toCsv(['title', 'score'], [['=cmd', -1.5]]);
    expect(csv).toBe("title,score\n'=cmd,-1.5\n");
  });
});
