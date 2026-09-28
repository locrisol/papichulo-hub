// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import CategoryBadges from './CategoryBadges'

// What an invoice was spent on, on the History page and the Invoices list.
//
// Asked for after the first real import, when every invoice read off a document
// said food on the History page, the mops and the foil included.

describe('what an invoice was spent on', () => {
    it('is one label for an invoice typed in off a total, as it always was', () => {
        render(<CategoryBadges invoice={{ category: 'packaging', total_amount: 44.23, invoice_lines: [] }} />)
        expect(screen.getByText('Packaging')).toBeInTheDocument()
    })

    it('is a label each, with the money, for a delivery that went on two things', () => {
        render(<CategoryBadges invoice={{
            category: 'food',
            total_amount: 146.8,
            invoice_lines: [
                { category: 'cleaning', line_total: 107.51, vat_amount: 23.08, deposit_amount: 0 },
                { category: 'packaging', line_total: 13.18, vat_amount: 3.03, deposit_amount: 0 },
            ],
        }} />)
        expect(screen.getByText(/Cleaning/)).toHaveTextContent('130.59')
        expect(screen.getByText(/Packaging/)).toHaveTextContent('16.21')
        expect(screen.queryByText(/Food/)).toBeNull()
    })
})
