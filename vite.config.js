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
  },
})
