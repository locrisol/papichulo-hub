// What a component test needs before it can render anything.
//
// Two jobs: stand a component up inside the providers the app always gives it,
// and answer for the database without touching it.

import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

// ── The database ─────────────────────────────────────────────────────────────

// supabase-js is a chain that only does something when it is awaited:
//
//     supabase.from('x').select('*').eq('id', 1).order('name')
//
// so the mock has to return itself from every step and behave like a promise at
// the end of it. Anything the app calls that is not listed here should fail
// loudly rather than return undefined and produce a confusing error three
// frames later.
export function makeQuery(result = { data: [], error: null }) {
    const chain = {}
    const steps = [
        'select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'gt',
        'gte', 'lt', 'lte', 'in', 'is', 'or', 'not', 'like', 'ilike', 'order',
        'limit', 'range', 'filter', 'contains', 'overlaps',
    ]
    for (const step of steps) chain[step] = vi.fn(() => chain)

    chain.single = vi.fn(() => Promise.resolve(result))
    chain.maybeSingle = vi.fn(() => Promise.resolve(result))
    chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
    chain.result = result
    return chain
}

// tables: { products: { data: [...] }, ... }. Anything not named comes back
// empty rather than undefined, because an unlisted table is usually a query the
// test does not care about and should not have to spell out.
export function mockSupabase(tables = {}) {
    const calls = []
    return {
        calls,
        from: vi.fn(table => {
            calls.push(table)
            return makeQuery(tables[table] || { data: [], error: null })
        }),
        rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
        auth: {
            getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
            getUser: vi.fn(() => Promise.resolve({ data: { user: null } })),
            onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
            signInWithPassword: vi.fn(() => Promise.resolve({ data: {}, error: null })),
            signOut: vi.fn(() => Promise.resolve({ error: null })),
        },
        storage: {
            from: vi.fn(() => ({
                upload: vi.fn(() => Promise.resolve({ data: {}, error: null })),
                getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'http://example.test/x.png' } })),
                list: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
        },
        functions: { invoke: vi.fn(() => Promise.resolve({ data: {}, error: null })) },
    }
}

// ── Rendering ────────────────────────────────────────────────────────────────

// Anything with a Link or a useParams in it needs a router, and a component
// that does not is unharmed by having one.
export function renderWithRouter(ui, { route = '/', ...options } = {}) {
    return render(
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>,
        options,
    )
}

export const A_RESTAURANT = {
    id: 'r1',
    name: 'Point Campus',
    slug: 'point-campus',
    opening_hours: [
        { open: '09:00', close: '21:00' }, { open: '09:00', close: '21:00' },
        { open: '09:00', close: '21:00' }, { open: '09:00', close: '21:00' },
        { open: '09:00', close: '21:00' }, { open: '09:00', close: '21:00' },
        { open: '10:00', close: '21:00' },
    ],
    break_rules: [
        { hours: 8, operator: 'gte', minutes: 60 },
        { hours: 6, operator: 'gte', minutes: 30 },
        { hours: 4.5, operator: 'gt', minutes: 15 },
    ],
}

export const A_MANAGER = { id: 'u1', full_name: 'A Manager', role: 'store_manager', restaurant_id: 'r1' }
export const AN_EMPLOYEE = { id: 'u2', full_name: 'An Employee', role: 'employee', restaurant_id: 'r1' }
