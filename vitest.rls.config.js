import { defineConfig, loadEnv } from 'vite'

// The database tests, run on their own with npm run test:rls.
//
// They sign in as a real account for each role and check what the database
// lets that role see and do. That is the only way to test row level security:
// the rules live in the database, so nothing you can do in JavaScript proves
// they work.
export default defineConfig(({ mode }) => {
    // Loads every variable from .env, not just the VITE_ ones. The test
    // passwords must not be VITE_ prefixed, or Vite would bake them into the
    // built site.
    const env = loadEnv(mode, process.cwd(), '')

    return {
        test: {
            include: ['tests/rls/**/*.test.js'],
            env,
            // These go over the network, so the default 5 seconds is tight.
            testTimeout: 20000,
            hookTimeout: 30000,
            // One at a time. Several files signing in and out at once trips
            // over itself.
            fileParallelism: false,
        },
    }
})