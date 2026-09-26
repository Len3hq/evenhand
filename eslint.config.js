// Root ESLint config for the API, the judging engine and the tests.
// The web app has its own config (src/web/eslint.config.mjs, Next.js rules) and is linted
// by `npm run lint -w @evenhand/web`, which the root `lint` script also runs.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Time and randomness must be injectable (CONTRIBUTING.md §3.2 rule 5). */
const noAmbientTimeOrRandom = {
  'no-restricted-syntax': [
    'error',
    {
      selector: "NewExpression[callee.name='Date'][arguments.length=0]",
      message: 'Inject Clock and call clock.now() instead of new Date().',
    },
    {
      selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
      message: 'Inject Clock and call clock.now() instead of Date.now().',
    },
    {
      selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
      message:
        'Use a seeded Rng (createRng from @evenhand/judging-engine) instead of Math.random().',
    },
  ],
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      'src/web/**',
      'src/api/src/generated/**',
      'docs/**',
      '.cache/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      ...noAmbientTimeOrRandom,
    },
  },
  {
    // Nest resolves constructor dependencies from their *runtime* types (emitDecoratorMetadata),
    // so injected classes must be value imports even when only used as types.
    files: ['src/api/src/**/*.ts'],
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },
  {
    // The only places allowed to read the real clock or randomness.
    files: [
      'src/api/src/core/clock.ts',
      'src/judging-engine/src/rng.ts',
      '**/*.spec.ts',
      'tests/**',
    ],
    rules: { 'no-restricted-syntax': 'off' },
  },
);
