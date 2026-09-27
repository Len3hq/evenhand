/**
 * Dense linear algebra for symmetric positive definite systems, just enough for the
 * normalisation model (about 70 unknowns on the fixtures). Pure, no dependencies.
 */

export type Matrix = number[][];

/**
 * Cholesky factor L (lower triangular) with A = L·Lᵀ. Throws if A is not symmetric positive
 * definite, which for the ridge model means a bug: every penalty is positive.
 */
export function cholesky(a: Matrix): Matrix {
  const n = a.length;
  const l: Matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = a[i]![j]!;
      for (let k = 0; k < j; k++) sum -= l[i]![k]! * l[j]![k]!;
      if (i === j) {
        if (!(sum > 0))
          throw new RangeError(`matrix is not positive definite (pivot ${i}: ${sum})`);
        l[i]![i] = Math.sqrt(sum);
      } else {
        l[i]![j] = sum / l[j]![j]!;
      }
    }
  }
  return l;
}

/** Solves A·x = b given A's Cholesky factor L (forward then back substitution). */
export function choleskySolve(l: Matrix, b: readonly number[]): number[] {
  const n = l.length;
  const y = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = b[i]!;
    for (let k = 0; k < i; k++) sum -= l[i]![k]! * y[k]!;
    y[i] = sum / l[i]![i]!;
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = y[i]!;
    for (let k = i + 1; k < n; k++) sum -= l[k]![i]! * x[k]!;
    x[i] = sum / l[i]![i]!;
  }
  return x;
}

/** A⁻¹ from A's Cholesky factor, one column at a time. */
export function choleskyInverse(l: Matrix): Matrix {
  const n = l.length;
  const cols = Array.from({ length: n }, (_, j) =>
    choleskySolve(
      l,
      Array.from({ length: n }, (_, i) => (i === j ? 1 : 0)),
    ),
  );
  return Array.from({ length: n }, (_, i) => cols.map((c) => c[i]!));
}
