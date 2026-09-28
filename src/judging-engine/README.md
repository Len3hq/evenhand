# @evenhand/judging-engine

The judging maths, as pure and deterministic functions: no Nest, no Prisma, no I/O, no clock, no `Math.random()`. The API maps database rows into these types, calls a function and stores the result, so the part that decides who wins can be read, tested and reused on its own. The method is explained and defended in [JUDGING.md](../../JUDGING.md).

| Export                                             | What                                                                                                                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `weightedScore(criteria, values)`, `weightReviews` | `Σ w·x / Σ w` on the criterion scale; throws `RubricError` on a missing or out-of-range value (never a silent zero)                                  |
| `createRng(seed)`, `shuffle(items, rng)`           | Seeded randomness (mulberry32) for assignment tie-breaks, queue order and synthetic tests                                                            |
| `assign(input)`, `components`                      | Least-loaded, track-matched, conflict-free assignment that only tops up; connected judge–project groups                                              |
| `normalize(reviews, options)`                      | The joint ridge model `s = μ + q + b + ε`: λ chosen by exact leave-one-out over `DEFAULT_GRID`, normalized scores with posterior SD, judges' offsets |
| `tieGroups(ranked)`                                | Groups of projects the data cannot tell apart, without chaining                                                                                      |
| `cholesky`, `choleskySolve`, `choleskyInverse`     | The linear algebra, hand-written                                                                                                                     |
| `isFlat`, `mean`, `spread`                         | "Same marks for every project" (the progress dashboard's flag) and small statistics                                                                  |
| `rawMeans`, `zScores`, `spearman`                  | The baselines the model is compared with                                                                                                             |
| `syntheticEvent(options)`                          | Events with a known truth, for the recovery tests                                                                                                    |
| `renderProof(fixtures)`                            | Writes [docs/proof/normalization.md](../../docs/proof/normalization.md) from the fixtures                                                            |

```sh
npm test -w @evenhand/judging-engine    # unit tests, including recovery on 20 synthetic events and the proof check
npm run proof -w @evenhand/judging-engine  # regenerate the Normalization Proof
```
