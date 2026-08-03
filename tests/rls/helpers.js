import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

// Signs in a real account for each role, so the tests ask the database the same
// questions the app asks. Anything that only tests JavaScript proves nothing
// about row level security, because the rules live in the database.

const URL = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY

export const ROLES = ['employee', 'manager', 'owner', 'superadmin']

// supabase-js builds a realtime client the moment you create a client, and
// realtime needs WebSocket. Browsers have it. Node only got it in version 22
// and this project runs on 20, so it has to be handed one. Nothing in these
// tests uses realtime, but the client will not start without it.
const CLIENT_OPTIONS = {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: ws },
}

// Missing credentials should skip the tests with a clear message, not fail
// them. Anyone cloning the repository has no test accounts.
export function credentialsPresent() {
    if (!URL || !ANON) return false
    return ROLES.every(r =>
        process.env[`TEST_${r.toUpperCase()}_EMAIL`] &&
        process.env[`TEST_${r.toUpperCase()}_PASSWORD`]
    )
}

export async function signInAs(role) {
    const client = createClient(URL, ANON, CLIENT_OPTIONS)
    const { error } = await client.auth.signInWithPassword({
        email: process.env[`TEST_${role.toUpperCase()}_EMAIL`],
        password: process.env[`TEST_${role.toUpperCase()}_PASSWORD`],
    })
    if (error) throw new Error(`Could not sign in as ${role}: ${error.message}`)
    return client
}

// Nobody signed in at all, which is how a customer opens the allergen page.
export function anonClient() {
    return createClient(URL, ANON, CLIENT_OPTIONS)
}

// How many rows a role can see in a table. Row level security filters rather
// than errors, so no access looks like an empty result.
export async function countVisible(client, table) {
    const { data, error } = await client.from(table).select('*')
    if (error) return { error: error.message, count: 0 }
    return { error: null, count: (data || []).length }
}

// Tries a write that should be refused. Returns true if the database said no.
export async function writeRefused(client, table, row) {
    const { error } = await client.from(table).insert(row)
    return Boolean(error)
}