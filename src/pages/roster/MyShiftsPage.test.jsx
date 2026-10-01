// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { mockSupabase, makeQuery, renderWithRouter } from '@/test/helpers'

// My shifts, the page every employee lands on. Invented people.

const ME = { id: 'e1', restaurant_id: 'r1', full_name: 'Ana', position_id: null }
const MY_DAY_OFF = {
    id: 'a1', employee_id: 'e1', restaurant_id: 'r1', kind: 'day_off',
    starts_on: '2026-10-12', ends_on: '2026-10-12', status: 'requested',
}

let db
let answer
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'employee' } }) }))
vi.mock('@/context/confirm', () => ({ useConfirm: () => () => Promise.resolve(true) }))

const { default: MyShiftsPage } = await import('./MyShiftsPage')

function tables(extra = {}) {
    answer = {
        employees: { data: ME, error: null },
        restaurants: { data: { opening_hours: null }, error: null },
        absences: { data: [MY_DAY_OFF], error: null },
        ...extra,
    }
    db = mockSupabase(answer)
    db.from = vi.fn(table => makeQuery(answer[table] || { data: [], error: null }))
}

beforeEach(() => tables())

// Taking a request back is a delete the database only allows while it is
// still waiting. Once a manager had answered it, the delete matched nothing
// and the page carried on as if it had worked.
describe('cancelling a request for time off', () => {
    it('says so when a manager has already answered it', async () => {
        const plain = db.from
        db.from = vi.fn(table => {
            const query = plain(table)
            if (table === 'absences') query.delete = vi.fn(() => makeQuery({ data: [], error: null }))
            return query
        })

        renderWithRouter(<MyShiftsPage />)
        fireEvent.click(await screen.findByRole('button', { name: 'Cancel this request' }))

        expect(await screen.findByText('This request has already been answered, so it cannot be cancelled.'))
            .toBeInTheDocument()
    })
})
