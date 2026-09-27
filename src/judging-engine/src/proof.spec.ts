import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { type ProofFixtures, renderProof } from './proof.js';

const repo = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));

describe('the Normalization Proof', () => {
  it('in docs/proof/normalization.md is what the code computes today', () => {
    const fixtures = JSON.parse(readFileSync(repo('data/fixtures.json'), 'utf8')) as ProofFixtures;
    const committed = readFileSync(repo('docs/proof/normalization.md'), 'utf8');
    // If this fails, run `npm run proof -w @evenhand/judging-engine` and commit the result.
    expect(committed).toBe(renderProof(fixtures));
  });
});
