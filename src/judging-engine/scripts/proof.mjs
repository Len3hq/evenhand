/* global console, process, URL -- Node script */
// Writes docs/proof/normalization.md from data/fixtures.json:
//   npm run proof -w @evenhand/judging-engine
// The rendering is src/proof.ts (pure); this file only reads and writes.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderProof } from '../dist/index.js';

const root = new URL('../../../', import.meta.url);
const fixtures = JSON.parse(readFileSync(new URL('data/fixtures.json', root), 'utf8'));
const out = new URL('docs/proof/normalization.md', root);
mkdirSync(new URL('docs/proof/', root), { recursive: true });
writeFileSync(out, renderProof(fixtures));
console.log(`wrote ${fileURLToPath(out)}`);
process.exitCode = 0;
