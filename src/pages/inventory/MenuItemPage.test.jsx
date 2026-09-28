// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ComponentTable } from './MenuItemPage'

// The sauces off a real dish. Habanero Cheese Mayo is the dearest, so it is the
// one the cost counts.
const SAUCES = [
    { id: 'c1', product_id: 'p1', quantity: '0.02', choice_group: 'Sauces' },
    { id: 'c2', product_id: 'p2', quantity: '0.02', choice_group: 'Sauces' },
    { id: 'c3', product_id: 'p3', quantity: '0.02', choice_group: 'Sauces' },
]
const PRODUCTS = {
    p1: { id: 'p1', name: 'Chipotle Sauce', unit: 'KG', is_mix: true },
    p2: { id: 'p2', name: 'Habanero Cheese Mayo', unit: 'KG' },
    p3: { id: 'p3', name: 'Mango Habanero', unit: 'KG', is_mix: true },
}
const COST = { c1: 0.16, c2: 0.22, c3: 0.07 }

function show({ choiceGroup = true, counting = new Set(['c2']), rows = SAUCES } = {}) {
    return render(
        <ComponentTable
            rows={rows}
            choiceGroup={choiceGroup}
            counting={counting}
            getProduct={id => PRODUCTS[id]}
            getIngredientUnitCost={p => ({ p1: 7.9532, p2: 10.8557, p3: 3.6782 })[p?.id] ?? null}
            getLineCost={c => COST[c.id] ?? null}
            editingComponent={null}
            onEdit={vi.fn()}
            onCancelEdit={vi.fn()}
            onRemove={vi.fn()}
        />,
    )
}

describe('a choice group', () => {
    // The row used to carry this on every option the customer did not take.
    // It is longer than the price it explains and could not wrap, so the right
    // hand column was as wide as the sentence and the price ran off a phone.
    it('does not say "not the most expensive" anywhere any more', () => {
        show()
        expect(screen.queryByText(/not the most expensive/i)).not.toBeInTheDocument()
    })

    // The heading already says only the dearest is counted. Saying it again on
    // four rows out of five repeated the rule; marking the one answers it.
    it('marks the one that is counted, once', () => {
        show()
        expect(screen.getAllByText('Counted')).toHaveLength(2) // the card and the table
    })

    it('puts the mark on the dearest option and nowhere else', () => {
        show()
        for (const mark of screen.getAllByText('Counted')) {
            expect(mark.closest('tr, div').textContent).toContain('Habanero Cheese Mayo')
        }
    })

    // A blank here would read as a line that costs nothing, which is worse than
    // showing a figure the dish is not paying.
    it('still shows what the options that do not count come to', () => {
        show()
        expect(screen.getAllByText('€0.16').length).toBeGreaterThan(0)
        expect(screen.getAllByText('€0.07').length).toBeGreaterThan(0)
    })

    it('shows a dash for a line with no cost worked out', () => {
        show({ counting: new Set(), rows: [{ id: 'c9', product_id: 'p1', quantity: '0.02' }] })
        expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    })
})

describe('ingredients and packaging, where every line is in the cost', () => {
    // A mark on every row says nothing, so it only appears where one option
    // beats the others.
    it('carries no Counted mark at all', () => {
        show({ choiceGroup: false, counting: new Set(['c1', 'c2', 'c3']) })
        expect(screen.queryByText('Counted')).not.toBeInTheDocument()
    })

    it('still shows every line cost', () => {
        show({ choiceGroup: false, counting: new Set(['c1', 'c2', 'c3']) })
        expect(screen.getAllByText('€0.22').length).toBeGreaterThan(0)
    })
})
