// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { breakdownParts } from '@/lib/stockTakeSummary'
import CountedAs from './CountedAs'

const PITTAS = { id: 'p1', name: 'Pittas', unit: 'Bag' }

describe('CountedAs', () => {
    it('shows each pack that was typed in, biggest first and loose last', () => {
        const line = {
            unit_breakdown: {
                loose: { qty: 3, factor: 1 },
                Box: { qty: 6, factor: 12 },
                Case: { qty: 1, factor: 48 },
            },
        }
        render(<CountedAs parts={breakdownParts(line, PITTAS)} />)
        expect(screen.getAllByText(/^\d/).map(chip => chip.textContent)).toEqual(['1 Case', '6 Box', '3 Bag'])
    })

    // A line saved before packs could be counted has no breakdown at all.
    it('draws nothing for a line with no breakdown', () => {
        const { container } = render(<CountedAs parts={breakdownParts({ unit_breakdown: null }, PITTAS)} />)
        expect(container).toBeEmptyDOMElement()
    })

    it('draws nothing for an empty list', () => {
        const { container } = render(<CountedAs parts={[]} />)
        expect(container).toBeEmptyDOMElement()
    })

    // "15 Bag" broken over two lines on a phone reads as two counts.
    it('keeps each pack on one line', () => {
        render(<CountedAs parts={[{ key: 'Bag', text: '15 Bag' }]} />)
        expect(screen.getByText('15 Bag').className).toContain('whitespace-nowrap')
    })
})
