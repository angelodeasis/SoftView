import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'spikes'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Application + adapter code runs in the browser.
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
  },

  // React components.
  {
    files: ['src/**/*.tsx'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // THE BOUNDARY: the analysis engines in src/core are pure. No React, no DOM,
  // no network, no storage. Enforced here and by tsconfig.core.json (no DOM lib).
  {
    files: ['src/core/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {},
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react',
              message: 'src/core is pure analysis logic and must not depend on React.',
            },
            {
              name: 'react-dom',
              message: 'src/core is pure analysis logic and must not depend on React.',
            },
          ],
          patterns: [
            {
              group: ['react-dom/*', '**/ui/**', '**/adapters/**', '**/runtime/**', '**/state/**'],
              message: 'src/core must not import from React, ui/, adapters/, runtime/, or state/.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'src/core must not touch the DOM.' },
        { name: 'document', message: 'src/core must not touch the DOM.' },
        { name: 'navigator', message: 'src/core must not touch the DOM.' },
        { name: 'localStorage', message: 'src/core must not use browser storage.' },
        { name: 'sessionStorage', message: 'src/core must not use browser storage.' },
        { name: 'fetch', message: 'src/core must not perform network I/O.' },
        { name: 'XMLHttpRequest', message: 'src/core must not perform network I/O.' },
      ],
    },
  },

  // Web Worker entry points run in a worker global scope, not the DOM.
  {
    files: ['src/**/*.worker.ts'],
    languageOptions: { globals: globals.worker },
  },

  // Adapters are browser glue between the app and the pure core. They may depend on
  // core, but not on the UI or app state.
  {
    files: ['src/adapters/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/ui/**', '**/state/**', '**/runtime/**'],
              message: 'src/adapters must not import from ui/, state/, or runtime/.',
            },
          ],
        },
      ],
    },
  },

  // Test + tooling files.
  {
    files: ['src/**/*.test.{ts,tsx}', 'src/test/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['*.{js,ts}'],
    languageOptions: { globals: globals.node },
  },

  prettier,
);
