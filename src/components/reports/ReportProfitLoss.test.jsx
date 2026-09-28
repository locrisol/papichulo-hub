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
            '25.0% is what it kept of the €1,200.00 it took Monday 21 to Sunday 27 September, the days its statement covers. '
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
