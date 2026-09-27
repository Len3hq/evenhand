import { describe, expect, it } from 'vitest';
import { cholesky, choleskyInverse, choleskySolve } from './linalg.js';

// Worked by hand: A = [[4, 2], [2, 3]] = L·Lᵀ with L = [[2, 0], [1, √2]].
const A = [
  [4, 2],
  [2, 3],
];

describe('cholesky', () => {
  it('factors a small system as worked by hand', () => {
    const l = cholesky(A);
    expect(l[0]).toEqual([2, 0]);
    expect(l[1]![0]).toBe(1);
    expect(l[1]![1]).toBeCloseTo(Math.SQRT2, 14);
  });

  it('solves A·x = b: [[4,2],[2,3]]·x = [10, 8] gives x = [1.75, 1.5]', () => {
    const x = choleskySolve(cholesky(A), [10, 8]);
    expect(x[0]).toBeCloseTo(1.75, 14);
    expect(x[1]).toBeCloseTo(1.5, 14);
  });

  it('inverts: A⁻¹ = [[3, −2], [−2, 4]] / 8', () => {
    const inv = choleskyInverse(cholesky(A));
    expect(inv[0]![0]).toBeCloseTo(3 / 8, 14);
    expect(inv[0]![1]).toBeCloseTo(-2 / 8, 14);
    expect(inv[1]![1]).toBeCloseTo(4 / 8, 14);
  });

  it('refuses a matrix that is not positive definite', () => {
    expect(() =>
      cholesky([
        [1, 2],
        [2, 1],
      ]),
    ).toThrow(RangeError);
  });

  it('solves a larger random SPD system to machine precision', () => {
    const n = 30;
    // B·Bᵀ + n·I is symmetric positive definite.
    const b = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => Math.sin(i * 7 + j * 3)),
    );
    const a = b.map((row, i) =>
      row.map((_, j) => b[i]!.reduce((s, v, k) => s + v * b[j]![k]!, 0) + (i === j ? n : 0)),
    );
    const truth = Array.from({ length: n }, (_, i) => i - n / 2);
    const rhs = a.map((row) => row.reduce((s, v, k) => s + v * truth[k]!, 0));
    const x = choleskySolve(cholesky(a), rhs);
    x.forEach((v, i) => expect(v).toBeCloseTo(truth[i]!, 9));
  });
});
