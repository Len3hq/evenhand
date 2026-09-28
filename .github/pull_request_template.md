## What and why

<!-- What changed for people, and why, in a few connected sentences. -->

## Definition of done (CONTRIBUTING.md §6)

- [ ] `npm run check` is green
- [ ] Routes, auth, seeding or Docker touched: `npm run acceptance`, `npm run test:ui` and `npm run drill` are green
- [ ] New endpoint: e2e test with an allowed and a refused actor, and rows in `tests/api/isolation.e2e-spec.ts`
- [ ] New maths: unit tests with known inputs and outputs
- [ ] Every mutation writes an audit row, with a readable sentence
- [ ] `npm run gen:api` re-run if the API changed
- [ ] ADR in `docs/decisions/` (and a line in DECISIONS.md) if this is a decision someone could question; docs updated
- [ ] Nothing new reaches the network at runtime
