// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithRouter, tableOf } from '@/test/helpers'
import { reportFigures } from '@/lib/weeklyReport'

// The week of 13 September at Point Campus, on the dashboard and in the weekly
// report. Invented figures.

const SALES = [
    { sale_date: '2026-09-14', net_sales: 600, gross_sales: 650, tender_sales: {}, is_closed: false },
    { sale_date: '2026-09-15', net_sales: 400, gross_sales: 430, tender_sales: {}, is_closed: false },
]
const SPEND = [
    { cost_date: '2026-09-14', category: 'food', amount: 300 },
    { cost_date: '2026-09-15', category: 'packaging', amount: 25 },
]
const LABOUR = [{ labour_cost: 150 }, { labour_cost: 100 }]
// Food that was bought, and so is already in the 300, then thrown out.
const WASTE = [{ waste_value: 40 }]

// A temporary 25% food target from August to the end of September, then a
// permanent 28% set later from 6 September. The newer one is in force.
const OVERRIDES = [
    { id: 't1', target_type: 'food', override_value: 25, effective_from: '2026-08-02', effective_until: '2026-09-27', created_at: '2026-08-01T10:00:00Z' },
    { id: 't2', target_type: 'food', override_value: 28, effective_from: '2026-09-06', effective_until: null, created_at: '2026-09-05T10:00:00Z' },
]

// Every row is Point Campus's, since the page asks for its restaurant's.
const ours = rows => rows.map(r => ({ restaurant_id: 'r1', ...r }))
const tables = {
    sales_records: ours(SALES),
    sales_tenders: [],
    invoice_cost_by_category: ours(SPEND),
    labour_by_day: ours(LABOUR),
    waste_logs: ours(WASTE),
    cost_target_overrides: ours(OVERRIDES),
}
const db = { from: vi.fn(table => tableOf(tables[table] || [])) }

vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'store_manager' } }) }))
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({
        activeRestaurant: {
            id: 'r1', name: 'Point Campus',
            food_cost_target: 30, packaging_cost_target: 2.5, labour_cost_target: 25,
        },
    }),
}))

const { default: CostDashboardPage } = await import('./CostDashboardPage')

// Only the date is fixed, so the page opens on that week; every timer runs as
// normal.
beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-16T12:00:00'))
})
afterAll(() => vi.useRealTimers())

describe('gross profit on the dashboard', () => {
    it('is the same figure the weekly report works out', async () => {
        renderWithRouter(<CostDashboardPage />)
        const label = await screen.findByText('Gross profit')

        const report = reportFigures({ days: SALES, spend: SPEND, labour: LABOUR })
        expect(report.grossProfit).toBe(425)
        expect(label.nextElementSibling.textContent).toContain('€425.00')
    })

    // Waste is valued at what the food cost, and that food is already in the
    // food purchases above it. Taking it off again counted it twice.
    it('shows waste as its own line rather than taking it off a second time', async () => {
        renderWithRouter(<CostDashboardPage />)
        const label = await screen.findByText('Gross profit')

        expect(label.nextElementSibling.textContent).not.toContain('€385.00')
        expect(screen.getByText('Already counted in food purchases')).toBeInTheDocument()
    })
})

describe('the temporary target label', () => {
    // The 28% on the card is the permanent one. Saying it is temporary and
    // ends on the 27th was describing the other target.
    it('belongs to the target whose figure is on the card', async () => {
        renderWithRouter(<CostDashboardPage />)
        await screen.findByText('Gross profit')

        expect(screen.getByText('/ 28% target')).toBeInTheDocument()
        expect(screen.queryByText(/temporary, ends after/)).not.toBeInTheDocument()
    })
})
