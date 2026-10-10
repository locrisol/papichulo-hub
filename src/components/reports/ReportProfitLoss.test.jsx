// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ReportProfitLoss from '@/components/reports/ReportProfitLoss'

// Each delivery platform's line on the report page. His words, 27 September:
// under the percentage, say what it was worked out against and that it runs
// Monday to Sunday, "as that's the way the cost reports comes". Invented
// figures.

vi.mock('@/context/confirm', () => ({ useConfirm: () => async () => true }))

const row = {
    platform: { id: 'p1', name: 'Deliveroo' },
    statement: 300, statementTaken: 1200, weekTaken: 1100, rate: 25, cost: 275, typed: true,
}

function draw(props = {}) {
    render(
        <ReportProfitLoss
            section={{ items: [] }}
            figures={{ net: 10000, deliveryTotal: 275, overhead: 0, overheadPct: 0 }}
            rows={[row]}
            statement="Monday 21 to Sunday 27 September"
            waiting={false}
            canEdit={false}
            {...props}
        />,
    )
}

describe('a delivery platform on the report page', () => {
    it('says what its percentage was taken against, and over which days', () => {
        draw()
        expect(screen.getByText(
            '25.00% is what it kept of the €1,200.00 it took Monday 21 to Sunday 27 September, the days its statement covers. '
            + 'The same share of the €1,100.00 it took this week, Sunday to Saturday, is €275.00.',
        )).toBeInTheDocument()
    })

    it('says so far while the Sunday is still to come', () => {
        draw({ waiting: true })
        expect(screen.getByText(/it took Monday 21 to Sunday 27 September so far, the days its statement covers/)).toBeInTheDocument()
    })

    it('says what the total\'s share is of', () => {
        draw()
        expect(screen.getByText('The share beside it is of this week\'s net sales.')).toBeInTheDocument()
    })
})

// His, 7 October: like the mail, only what moved, the rest folded.
describe('the fixed overheads on the report page', () => {
    const item = (id, label, amount, carried) => ({ id, kind: 'overhead', label, amount, carried_from: carried })
    const items = [
        item('o1', 'Rent', 1300, 1200),
        item('o2', 'Rates', 200, 200),
        item('o3', 'Insurance', 50, 50),
        item('o4', 'Alarm', 20, null),
    ]
    const show = () => draw({
        section: { items },
        figures: { net: 10000, deliveryTotal: 275, standing: 1570, overhead: 1845, overheadPct: 18.45 },
    })

    it('shows a line that changed or is new, and folds the rest', () => {
        show()
        expect(screen.getByText('Changed this week, was €1,200.00. The report will say so.')).toBeInTheDocument()
        expect(screen.getByText('New this week. The report will say so.')).toBeInTheDocument()
        expect(screen.getByText('2 lines the same as last week')).toBeInTheDocument()
    })

    // It had the delivery costs in it, so it did not add up to its lines.
    it('totals the overheads only, and takes delivery off on its own line', () => {
        show()
        const row = label => screen.getByText(label).closest('[class*="border-b"]')
        expect(row('Total fixed overhead')).toHaveTextContent('€1,570.00')
        expect(row('Less fixed overhead')).toHaveTextContent('€1,570.00')
        expect(row('Less third party delivery')).toHaveTextContent('€275.00')
    })

    it('says so when nothing moved', () => {
        draw({
            section: { items: [item('o2', 'Rates', 200, 200)] },
            figures: { net: 10000, deliveryTotal: 0, standing: 200, overhead: 200, overheadPct: 2 },
        })
        expect(screen.getByText('No change from last week')).toBeInTheDocument()
        expect(screen.getByText('1 line the same as last week')).toBeInTheDocument()
    })
})
