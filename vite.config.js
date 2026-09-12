import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    // @ is src. Every import in the app is written from the root now rather
    // than by counting how many folders up it is.
    //
    // There were 644 relative imports, 418 of them starting ../../, which is
    // what makes moving a file expensive: the file's own imports change, and so
    // does every import pointing at it. Modal alone has 34 of those. With this,
    // moving a file changes the file's line in the tree and nothing else.
    //
    // jsconfig.json says the same thing again for the editor, which does not
    // read this.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // Only the unit tests. The database tests live in tests/rls and run on
    // their own with npm run test:rls, because they need real accounts and a
    // network, so they are slow and they fail when the wifi does.
    //
    // .jsx as well as .js. It was .js only, so a component test would have been
    // collected by nothing and would have passed by not existing.
    include: ['src/**/*.test.{js,jsx}'],

    // Node by default, because most of the tests are plain functions and a
    // jsdom window for each of those is time spent for nothing. A component
    // test asks for jsdom itself with a docblock at the top of the file:
    //
    //     // @vitest-environment jsdom
    //
    setupFiles: ['./src/test/setup.js'],

    // Placeholders, on purpose, and they are not a secret.
    //
    // lib/supabase builds its client the moment it is imported, and
    // createClient throws if there is no url. Anything importing a page or a
    // component reaches that eventually, so with no .env present the whole
    // suite fails at import: which is exactly what happened on CI, where there
    // is no .env and never should be.
    //
    // Fixing it here rather than in the workflow does the more useful thing as
    // well. These win over whatever is in .env, so a unit test cannot reach the
    // real project even by accident, and nothing goes out anyway because
    // src/test/setup.js refuses fetch outright.
    //
    // The database tests are a separate config and are unaffected. They sign in
    // as real accounts and need the real values, which is why they are a
    // separate command.
    env: {
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: 'not-a-real-key-and-never-used',
    },
  },
})
