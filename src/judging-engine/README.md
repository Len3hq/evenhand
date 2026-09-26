# @evenhand/judging-engine

The judging maths, as pure and deterministic functions: no Nest, no Prisma, no I/O, no clock, no `Math.random()`. The API maps database rows into these types, calls a function and stores the result.

| Export                                   | What                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| `weightedScore(criteria, values)`        | `Σ w·x / Σ w` on the criterion scale; throws `RubricError` on a missing or out-of-range value |
| `weightReviews(criteria, reviews)`       | The same, for a list of reviews                                                               |
| `createRng(seed)`, `shuffle(items, rng)` | Seeded randomness (mulberry32) for assignment tie-breaks, queue shuffles and synthetic tests  |

Next (owner B): Cholesky solve, the ridge bias model with λ by leave-one-out, posterior SD, tie groups, connectivity, z-score comparator, and the synthetic recovery test. See [JUDGING.md](../../JUDGING.md).

```sh
npm test -w @evenhand/judging-engine
```
