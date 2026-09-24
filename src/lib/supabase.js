import { createClient } from '@supabase/supabase-js'

// One client for the whole app. Everything that talks to the database imports
// this, so the session is shared and there is only one place to configure.
//
// The anon key is meant to be in the browser and is safe there, but only because
// row level security is set up on every table. It is the database that decides
// what this key can actually see, not the key itself.
//
// The service_role key must never appear anywhere in here. It goes past every
// policy, and anything shipped to the browser can be read by anyone.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// **Nothing the Hub reads ever comes out of the browser's cache.**
//
// The API sends no caching instructions at all, and that is fine for an
// ordinary answer: the browser keeps nothing it has not been told it may keep.
// It is not fine for one particular error. When a query is ambiguous the answer
// comes back as HTTP 300, and a browser treats a 300 with no instructions as
// good forever. So after the database was fixed, the claims page went on showing
// the old error for the rest of the day, because it asks for exactly the same
// address all day and the browser never asked the server again.
//
// Every figure in here can change between one look and the next, so there is
// nothing a cache could save that is worth the risk of showing a stale one.
export function freshFetch(input, init = {}) {
    return fetch(input, { ...init, cache: 'no-store' })
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { fetch: freshFetch },
})
