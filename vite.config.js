import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  test: {
    // Only the unit tests. The database tests live in tests/rls and run on
    // their own with npm run test:rls, because they need real accounts and a
    // network, so they are slow and they fail when the wifi does.
    include: ['src/**/*.test.js'],
  },
})
