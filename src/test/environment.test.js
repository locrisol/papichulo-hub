import { describe, it, expect } from 'vitest'

// The unit tests are sealed off from the real project, and this is what says so.
//
// lib/supabase builds its client the moment it is imported, so anything that
// imports a page or a component ends up holding one. If that client were
// pointed at the live database, a test with a mock that did not quite cover
// everything could reach it, and a write that got through would be a real row
// in a real business's records.
//
// vite.config.js pins placeholder values for the test run, and they win over
// whatever is in .env. Between that and the fetch refusal in setup.js, a unit
// test cannot reach anything at all.
//
// The database tests are the deliberate exception. They sign in as real
// accounts and are a separate config and a separate command, npm run test:rls.
describe('the test environment', () => {
    it('never points at the real project', () => {
        expect(import.meta.env.VITE_SUPABASE_URL).toBe('http://127.0.0.1:54321')
    })

    it('has no real key in it', () => {
        expect(import.meta.env.VITE_SUPABASE_ANON_KEY).not.toMatch(/^eyJ/)
    })

    it('refuses to reach the network', async () => {
        await expect(fetch('http://example.test')).rejects.toThrow(/Mock @\/lib\/supabase/)
    })
})
