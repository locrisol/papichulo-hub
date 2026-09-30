// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { mockSupabase, renderWithRouter } from '@/test/helpers'
import { todayISO } from '@/lib/dates'

// The checklist reports, read over up to six months of ticks.
//
// The audit of 28 September: the ticks were read in one go, which stops at a
// thousand, and the days, the times of day, the total and an open round's
// progress were all worked out from whichever thousand came back, with
// nothing on screen to say so.

const TICKS = Array.from({ length: 1003 }, (_, i) => ({
    id: `k${i}`, round_id: 'r1', task_id: `t${i}`, done_at: `${todayISO()}T10:00:00`,
}))

const db = mockSupabase({
    checklists: { data: [], error: null },
    checklist_rounds: { data: [], error: null },
    checklist_ticks: { data: TICKS, error: null },
})
// The real everyRow, paging through the mock the way it pages through the API.
vi.mock('@/lib/supabase', async importOriginal => ({
    everyRow: (await importOriginal()).everyRow,
    supabase: new Proxy({}, { get: (_, k) => db[k] }),
}))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'store_manager' } }) }))
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({ activeRestaurant: { id: 'r1', name: 'Testville' } }),
}))

const { default: ChecklistsReportPage } = await import('./ChecklistsReportPage')

describe('the checklist reports', () => {
    it('counts every tick, not just the first thousand', async () => {
        renderWithRouter(<ChecklistsReportPage />)
        expect(await screen.findByText(/1003 things ticked in all\./)).toBeInTheDocument()
    })
})
