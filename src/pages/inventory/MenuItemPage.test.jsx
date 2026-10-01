// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { renderWithRouter, tableOf } from '@/test/helpers'
import { emptyAllergens } from '@/lib/allergens'

let db
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_, k) => db[k] }) }))
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({ activeRestaurant: { id: 'r1', name: 'Point Campus' } }),
}))
vi.mock('@/context/confirm', () => ({ useConfirm: () => vi.fn(() => Promise.resolve(true)) }))

const { default: MenuItemPage, ComponentTable } = await import('./MenuItemPage')

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

// ---- the whole page, against a database that answers for its filters ----
//
// A burrito with a house sauce in it, and the sauce still made with a cream
// that has since been deactivated. Deactivating says the product stays on
// every recipe that used it, and the cream is still in the sauce.

const answered = (productId, overrides = {}) => ({ product_id: productId, ...emptyAllergens(), ...overrides })

const CATALOGUE = [
    { id: 'tortilla', name: 'Tortilla', section: 'Dry', unit: 'Units', is_mix: false, is_active: true },
    { id: 'sauce', name: 'House Sauce', section: 'Cold Room', unit: 'KG', is_mix: true, is_active: true, batch_yield: 1 },
    { id: 'cream', name: 'Old Cream', section: 'Cold Room', unit: 'KG', is_mix: false, is_active: false },
    { id: 'beans', name: 'Old Beans', section: 'Dry', unit: 'KG', is_mix: false, is_active: false },
    { id: 'rice', name: 'Rice', section: 'Dry', unit: 'KG', is_mix: false, is_active: true },
]

const BURRITO = [
    { id: 'k1', menu_item_id: 'm1', product_id: 'tortilla', quantity: 1, no_quantity: false },
    { id: 'k2', menu_item_id: 'm1', product_id: 'sauce', quantity: 0.05, no_quantity: false },
]

function tablesFor(overrides = {}) {
    return {
        menu_items: [{ id: 'm1', name: 'Chicken Burrito', category_id: 'c1', selling_price: 10, vat_rate: 13.5, is_active: true }],
        menu_categories: [{ id: 'c1', name: 'Burritos', sort_order: 0, is_active: true, on_allergen_sheet: true }],
        products: CATALOGUE,
        menu_item_components: BURRITO,
        mix_recipes: [{ id: 'x1', mix_product_id: 'sauce', ingredient_product_id: 'cream', quantity: 1 }],
        product_allergens: [
            answered('tortilla', { gluten: 'contains' }),
            answered('cream', { milk: 'contains' }),
            answered('beans'),
        ],
        product_supplier_prices: [],
        ...overrides,
    }
}

function useTables(tables) {
    db = { from: vi.fn(table => tableOf(tables[table] || [])) }
}

// jsdom has no scrolling, and the product picker keeps its highlighted row in
// view.
Element.prototype.scrollIntoView ??= () => {}

function showPage() {
    return renderWithRouter(
        <Routes><Route path="/catalogue/menu-items/:id" element={<MenuItemPage />} /></Routes>,
        { route: '/catalogue/menu-items/m1' },
    )
}

// What one allergen's chip says, from the Derived Allergens panel.
async function chip(label) {
    const panel = (await screen.findByText('Derived Allergens')).closest('div')
    return within(panel).getByText(label).parentElement.textContent
}

describe('a deactivated product still in the recipe', () => {
    beforeEach(() => useTables(tablesFor()))

    // The customer sheet reads every product, so the cream's milk is on the
    // burrito's row there. This panel read only active products and dropped
    // it without a word.
    it('still counts in the derived allergens, the same as on the customer sheet', async () => {
        showPage()
        expect(await chip('Milk')).toContain('Contains')
        expect(await chip('Gluten')).toContain('Contains')
    })

    it('is named on the dish and marked inactive, rather than called a missing product', async () => {
        useTables(tablesFor({
            menu_item_components: [
                ...BURRITO,
                { id: 'k3', menu_item_id: 'm1', product_id: 'beans', quantity: 0.1, no_quantity: false },
            ],
        }))
        showPage()
        expect((await screen.findAllByText('Old Beans')).length).toBeGreaterThan(0)
        expect(screen.getAllByText('Inactive').length).toBeGreaterThan(0)
        expect(screen.queryByText('Missing product')).toBeNull()
    })

    // It cannot be picked for anything new, which is what the deactivate
    // dialog promises.
    it('is not offered when adding a component', async () => {
        const me = userEvent.setup()
        showPage()
        await me.click(await screen.findByRole('button', { name: '+ Add Component' }))
        await me.click(screen.getByPlaceholderText('Select a product...'))
        const offered = screen.getAllByRole('option').map(o => o.textContent)
        expect(offered.some(t => t.includes('Rice'))).toBe(true)
        expect(offered.some(t => t.includes('Old Cream'))).toBe(false)
        expect(offered.some(t => t.includes('Old Beans'))).toBe(false)
    })
})

// Its old price is still on it. The menu items list read every product and
// costed the dish from that price while this page could not find it, so the
// same dish had a margin on one screen and none on the other.
describe('the cost of a dish with a deactivated product in it', () => {
    const PRICED = [
        { id: 'pr1', product_id: 'tortilla', restaurant_id: 'r1', is_preferred: true, price_per_unit: '0.30' },
        { id: 'pr2', product_id: 'beans', restaurant_id: 'r1', is_preferred: true, price_per_unit: '2.00' },
        { id: 'pr3', product_id: 'cream', restaurant_id: 'r1', is_preferred: true, price_per_unit: '4.00' },
    ]

    function costLine() {
        return screen.getByText('Cost').parentElement.textContent
    }

    it('is not worked out, and the page says which product to replace', async () => {
        useTables(tablesFor({
            menu_item_components: [
                BURRITO[0],
                { id: 'k3', menu_item_id: 'm1', product_id: 'beans', quantity: 0.1, no_quantity: false },
            ],
            product_supplier_prices: PRICED,
        }))
        showPage()
        expect(await screen.findByText(/Old Beans is deactivated/)).toBeInTheDocument()
        expect(costLine()).not.toContain('€')
    })

    it('names one inside a recipe the dish uses', async () => {
        useTables(tablesFor({ product_supplier_prices: PRICED }))
        showPage()
        expect(await screen.findByText(/Old Cream is deactivated/)).toBeInTheDocument()
    })

    // Rice has no price at all. Replacing the beans would not bring the cost
    // back, so the page must not promise that it would.
    it('says a missing price as well, when there is one', async () => {
        useTables(tablesFor({
            menu_item_components: [
                BURRITO[0],
                { id: 'k3', menu_item_id: 'm1', product_id: 'beans', quantity: 0.1, no_quantity: false },
                { id: 'k4', menu_item_id: 'm1', product_id: 'rice', quantity: 0.2, no_quantity: false },
            ],
            product_supplier_prices: PRICED,
        }))
        showPage()
        const note = await screen.findByText(/Old Beans is deactivated/)
        expect(note.textContent).toMatch(/Some components have no preferred price/)
        expect(note.textContent).not.toMatch(/to see the cost/)
    })

    it('is worked out once the dish has nothing deactivated in it', async () => {
        useTables(tablesFor({ menu_item_components: [BURRITO[0]], product_supplier_prices: PRICED }))
        showPage()
        await screen.findByText('Derived Allergens')
        expect(costLine()).toContain('€0.30')
        expect(screen.queryByText(/is deactivated/)).toBeNull()
    })
})
