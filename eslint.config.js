import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    // .mjs is in here because scripts/local-db.mjs is one, and without it that
    // file matched only the Node globals block below. A config object with no
    // rules in it still counts as a match, so eslint reported nothing and the
    // script looked checked. It was being parsed and no more.
    files: ['**/*.{js,jsx,mjs}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // Tests, config files and build scripts run in Node, not in a browser, so
    // they use things like process.env. Without this they are checked against
    // browser globals only and every process reference is reported as undefined.
    files: ['tests/**/*.js', '*.config.js', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // Inside src, every import is written from the root: @/lib/dates, never
    // ../../lib/dates.
    //
    // There are 644 of them and until now every one was that way because it was
    // typed that way. A relative path costs nothing until the file moves, and
    // then it is wrong somewhere nobody is looking, which is the whole reason
    // the alias exists.
    files: ['src/**/*.{js,jsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          regex: '^\\.\\./',
          message: 'Write it from the root instead: @/lib/dates, not ../../lib/dates.',
        }],
      }],
    },
  },
  {
    // The three that have to reach out, and the only three.
    //
    // Each edge function deploys on its own, folder and all, so its code cannot
    // live in src and @/ cannot address it. These tests import the deployed file
    // directly and assert it still agrees with the app's copy of the same sums.
    files: [
      'src/lib/ics.test.js',
      'src/lib/reportEmail.test.js',
      'src/lib/timeOffEmail.test.js',
    ],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
])
