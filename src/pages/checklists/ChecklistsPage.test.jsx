// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, within } from '@testing-library/react'
import { mockSupabase, renderWithRouter } from '@/test/helpers'

// The way in to the checklists: a card for each list saying where it is up to,
// with Start or Continue. Invented lists.

const now = new Date()
const iso = daysAgo => new Date(now.getTime() - daysAgo * 86400000).toISOString()

const LISTS = [
    { id: 'L1', restaurant_id: 'r1', name: 'Weekly Deep Clean', repeats: 'weeks', every_weeks: 1, starts_on: '2026-01-01', is_active: true, sort_order: 1 },
    { id: 'L2', restaurant_id: 'r1', name: 'Toilet Checklist', repeats: 'weeks', every_weeks: 1, starts_on: '2026-01-01', is_active: true, sort_order: 2 },
    { id: 'L3', restaurant_id: 'r1', name: 'Old list', repeats: 'monthly', every_weeks: null, starts_on: '2026-01-01', is_active: false, sort_order: 3 },
]
const CATEGORIES = LISTS.map(l => ({ id: `c-${l.id}`, checklist_id: l.id, name: 'Area', sort_order: 1, is_active: true }))
const TASKS = LISTS.flatMap(l => [1, 2, 3].map(n => ({
    id: `${l.id}-t${n}`, checklist_id: l.id, category_id: `c-${l.id}`, parent_id: null, name: `Thing ${n}`, sort_order: n, is_active: true,
})))

let db
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
let role = 'employee'
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1', role } }) }))
vi.mock('@/context/restaurant', () => ({ useRestaurant: () => ({ activeRestaurant: { id: 'r1', name: 'Testville' } }) }))

const { default: ChecklistsPage } = await import('./ChecklistsPage')

beforeEach(() => {
    role = 'employee'
    db = mockSupabase({
        checklists: { data: LISTS, error: null },
        checklist_categories: { data: CATEGORIES, error: null },
        checklist_tasks: { data: TASKS, error: null },
        checklist_rounds: {
            data: [{ id: 'r9', checklist_id: 'L1', started_at: iso(0.2), started_by_name: 'Aoife', ended_at: null }],
            error: null,
        },
        checklist_ticks: { data: [{ round_id: 'r9', task_id: 'L1-t1', done_at: iso(0.1) }], error: null },
    })
})

const cardOf = async name => (await screen.findByRole('heading', { name })).closest('div').parentElement

describe('what staff see', () => {
    it('shows a round in progress with how far it has got, and Continue', async () => {
        renderWithRouter(<ChecklistsPage />)
        const card = await cardOf('Weekly Deep Clean')
        expect(within(card).getByText('In progress')).toBeInTheDocument()
        expect(within(card).getByText(/of/).textContent).toBe('1 of 3 done')
        expect(within(card).getByText(/by Aoife\. Last ticked 2 hours ago\./)).toBeInTheDocument()
        expect(within(card).getByRole('button', { name: 'Continue' })).toBeInTheDocument()
        expect(within(card).queryByRole('button', { name: 'Start' })).toBeNull()
    })

    it('offers Start on a list with nothing open', async () => {
        renderWithRouter(<ChecklistsPage />)
        const card = await cardOf('Toilet Checklist')
        expect(within(card).getByText('Due this week')).toBeInTheDocument()
        expect(within(card).getByRole('button', { name: 'Start' })).toBeInTheDocument()
    })

    it('gives an employee nothing to set up, and hides lists taken off', async () => {
        renderWithRouter(<ChecklistsPage />)
        await screen.findByText('Weekly Deep Clean')
        expect(screen.queryByRole('button', { name: 'New list' })).toBeNull()
        expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
        expect(screen.queryByText('Old list')).toBeNull()
    })
})

describe('what a manager sees as well', () => {
    it('can make a list, open the reports, and edit or print each one', async () => {
        role = 'store_manager'
        renderWithRouter(<ChecklistsPage />)
        const card = await cardOf('Toilet Checklist')
        expect(screen.getByRole('button', { name: 'New list' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Reports' })).toBeInTheDocument()
        expect(within(card).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
        expect(within(card).getByRole('button', { name: 'Print' })).toBeInTheDocument()
    })
})
