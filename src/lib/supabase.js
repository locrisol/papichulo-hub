import { createClient } from '@supabase/supabase-js'
import { isWrite, saved } from '@/lib/saves'

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
//
// And every write that went through says so, for the sidebar's badges. See
// lib/saves.
export async function freshFetch(input, init = {}) {
    const response = await fetch(input, { ...init, cache: 'no-store' })
    const url = typeof input === 'string' ? input : input?.url
    if (response?.ok && isWrite(url, init.method || input?.method)) saved()
    return response
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { fetch: freshFetch },
})

// **Every row, however many there are.**
//
// The database hands back a thousand rows at most (max_rows, the same on live
// as in config.toml), and a read that would have more simply stops there with
// nothing to say so. So anything that can grow past that is read a page at a
// time until a page comes back short.
//
// build makes the query afresh for each page, and it has to end in an order
// that cannot tie, usually .order('id'). Pages are separate requests, so
// without a fixed order a row can land on two pages or on none.
//
//     const { data, error } = await everyRow(() => supabase.from('invoices')
//         .select('id, invoice_number').eq('restaurant_id', id).order('id'))
const PAGE = 1000

export async function everyRow(build) {
    const out = []
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await build().range(from, from + PAGE - 1)
        if (error) return { error }
        out.push(...(data || []))
        if (!data || data.length < PAGE) return { data: out }
    }
}
