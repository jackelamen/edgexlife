// Deliberately minimal: this project has no ESLint history, so a full
// react-hooks/recommended ruleset would surface hundreds of pre-existing
// warnings unrelated to what this file exists to prevent. The one rule
// below is the one with a real, verified, recurring bug behind it — see
// lib/dates.js's `dateKey` doc comment and the xLife review (Aug 2026,
// project memory `project_xlife_review.md`).
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    // Registered (not enabled) so the many pre-existing
    // `// eslint-disable-line react-hooks/exhaustive-deps` comments in the
    // codebase resolve to a real rule instead of erroring as "unknown
    // rule". Turning the rule itself on is a separate, larger change this
    // pass deliberately doesn't make.
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          // Matches `<anything>.toISOString().slice(...)`, e.g.
          // `new Date().toISOString().slice(0, 10)`. That pattern reads a
          // UTC calendar date, which silently disagrees with every other
          // "what day is it" computation in the app (all local-time) for
          // part of every day in any timezone east of Greenwich. Use
          // `dateKey()` / `iso()` from lib/dates.js instead — both are
          // local-time by construction, no arithmetic required to get there.
          selector:
            "CallExpression[callee.property.name='slice']" +
            "[callee.object.type='CallExpression']" +
            "[callee.object.callee.property.name='toISOString']",
          message:
            'Do not build a date key from toISOString().slice(...) — it reads UTC, ' +
            'not local time, and returns the wrong calendar day for part of every day ' +
            'outside UTC+0. Use dateKey(d) or iso(d) from lib/dates.js instead.',
        },
      ],
    },
  },
]
