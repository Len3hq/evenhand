# Dependency versions and accepted advisories

- Status: accepted
- Date: 2026-09-26 · Owner: A

## Decision

All versions are exact and locked (`package-lock.json`).

| Package                 | Pinned | Why not latest                                                                                      |
| ----------------------- | ------ | --------------------------------------------------------------------------------------------------- |
| typescript              | 6.0.3  | TypeScript 7 (native) is not supported by the Nest CLI, typescript-eslint or openapi-typescript yet |
| prisma / @prisma/client | 7.10.0 | npm's `latest` tag for `prisma` points at 8.0.0-rc (a release candidate)                            |
| eslint                  | 9.39.5 | Marked end-of-life, but Next's plugins (react, import, jsx-a11y) do not support ESLint 10 yet       |
| vitest                  | 4.1.11 | The version Nest 12 generates                                                                       |

Overrides: `openapi-typescript` accepts our TypeScript 6 (it declares a TS 5 peer); `mysql2` is forced to 3.24.4 (patches GHSA-3f6p-5ww8-9rcr and GHSA-rgwj-5xj2-c3m3). `npm ls` reports it as "invalid" because Prisma pins 3.15.3 exactly; that is expected.

Accepted: `deepmerge-ts` < 8 (GHSA-ggr8-5vv4-36mx) inside the Prisma CLI's config loader. It only merges our own static `prisma.config.ts`, never user input, and the fix requires Prisma 6. Revisit when Prisma ships a patch.
