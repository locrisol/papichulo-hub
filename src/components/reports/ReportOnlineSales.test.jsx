// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ReportOnlineSales from './ReportOnlineSales'

// His, 7 October: a platform with nothing to add says so, or the report waits.

vi.mock('@/components/reports/useRemoveCard', () => ({ useRemoveCard: () => vi.fn() }))

const deliveroo = { id: 'p1', name: 'Deliveroo' }

function draw(items = [], canEdit = true) {
    const handlers = {
        onSaveRating: vi.fn(), onSaveNothing: vi.fn(), onAddReview: vi.fn(), onAddRefund: vi.fn(),
        onSaveItem: vi.fn(), onRemoveItem: vi.fn(),
    }
    render(<ReportOnlineSales section={{ items }} platforms={[deliveroo]} taken={{ p1: 500 }} canEdit={canEdit} handlers={handlers} />)
    return handlers
}

describe('no reviews and no refunds', () => {
    it('offers both while there are none, and saves the press for that platform', () => {
        const handlers = draw()
        fireEvent.click(screen.getByRole('switch', { name: /No reviews this week/ }))
        expect(handlers.onSaveNothing).toHaveBeenCalledWith(deliveroo, 'reviews', true)
        fireEvent.click(screen.getByRole('switch', { name: /No refunds this week/ }))
        expect(handlers.onSaveNothing).toHaveBeenCalledWith(deliveroo, 'refunds', true)
    })

    it('shows a press as made, and takes it back', () => {
        const handlers = draw([{ id: 'r', kind: 'rating', key: 'p1', amount: 4.6, meta: { none: { reviews: true } } }])
        const pressed = screen.getByRole('switch', { name: /No reviews this week/ })
        expect(pressed).toHaveAttribute('aria-checked', 'true')
        fireEvent.click(pressed)
        expect(handlers.onSaveNothing).toHaveBeenCalledWith(deliveroo, 'reviews', false)
    })

    it('is not offered once one is entered', () => {
        draw([{ id: 'v', kind: 'review', key: 'p1', meta: { stars: 5, count: 1 } }])
        expect(screen.queryByRole('switch', { name: /No reviews this week/ })).not.toBeInTheDocument()
    })
})
