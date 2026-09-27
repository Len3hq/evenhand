import { stringify } from 'csv-stringify/sync';
import type { Response } from 'express';

export type CsvCell = string | number | boolean | null | undefined;

/**
 * A spreadsheet treats a cell starting with one of these as a formula, so participant text
 * like `=HYPERLINK(...)` in a title would run when an organiser opens the export (OWASP
 * "CSV injection"). Such text gets a leading apostrophe. Numbers are cells of their own type
 * and are never touched, so negative numbers stay numbers.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function neutraliseFormula(text: string): string {
  return FORMULA_START.test(text) ? `'${text}` : text;
}

/**
 * CSV rules for every export (BUILD-PLAN decision 32): UTF-8 without a BOM, a multi-column
 * header row first, RFC 4180 quoting, `\n` line endings, and a stable row order chosen by
 * the caller. Empty values are empty cells, never the text "null". Text cells are protected
 * against formula injection.
 */
export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  return stringify([header as string[], ...(rows as CsvCell[][])], {
    record_delimiter: '\n',
    cast: { boolean: (v) => (v ? 'true' : 'false'), string: neutraliseFormula },
  });
}

export function sendCsv(res: Response, filename: string, csv: string): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}
