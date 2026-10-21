// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeQuery, renderWithRouter, tableOf } from '@/test/helpers'

// The Recommended list at Point Campus, his decisions of 18 and 19 October
// 2026. The codes and prices are the real ones from October; the rest is
// trimmed to what each test needs.

const PEPPERS = { id: 'p1', name: 'Green Peppers', section: 'Cold Room', unit: 'KG', category: 'ingredient', is_mix: false, is_active: true, recommends: 'versions' }
const FRIES = { id: 'p2', name: 'Fries', section: 'Freezer', unit: 'KG', category: 'ingredient', is_mix: false, is_active: true, recommends: 'versions' }
const SALSA = { id: 'p3', name: 'House Salsa', section: 'Cold Room', unit: 'KG', category: 'ingredient', is_mix: true, is_active: true, recommends: 'versions' }
const SPONGE = { id: 'p4', name: 'Sponge Scourer', section: 'Cleaning', unit: 'Units', category: 'ingredient', is_mix: false, is_active: true, recommends: 'any' }

const version = (id, product, code, name, extra = {}) => ({
    id, product_id: product, supplier_id: 's1', supplier_code: code, name,
    is_recommended: false, is_active: true, fallback_rank: null, notes: null, description: null, ...extra,
})
const BIG = version('a', 'p1', '483508', 'Green Peppers 1x5 Kg', { is_recommended: true })
const OTHER_BIG = version('b', 'p1', '5018758', 'Green Peppers 1x5 Kg', { is_recommended: true, notes: 'Order by 2pm for the next day.' })
const SMALL = version('c', 'p1', '5016517', 'Green Peppers 1x1 Kg')
const LOOSE = version('d', 'p1', null, null, { supplier_id: 's2', fallback_rank: 1 })
const CHIPS = version('f', 'p2', '5013690', 'Mccain Thin Chips 10mm', { is_recommended: true })

const price = (id, versionId, perCase, units, perUnit, extra = {}) => ({
    id, product_id: 'p1', restaurant_id: 'r1', version_id: versionId, purchase_type: 'case', price_per_case: perCase,
    units_per_case: units, price_per_unit: perUnit, is_preferred: false, priced_at: '2026-10-01T09:00:00Z', ...extra,
})

let tables
let lines
let written
let rpcs
let asked
let preview
let ask
let refused
let removed
const db = {
    from: vi.fn(table => {
        // The deliveries are filtered through the invoice they are on, which
        // tableOf cannot follow, so they come back as they are.
        const q = table === 'invoice_lines' ? makeQuery({ data: lines, error: null }) : tableOf(tables[table] || [])
        q.update = vi.fn(patch => {
            const step = makeQuery()
            step.eq = vi.fn((column, value) => { written.push({ table, patch, [column]: value }); return step })
            return step
        })
        q.insert = vi.fn(row => {
            written.push({ table, inserted: row })
            return makeQuery({ data: null, error: refused === table ? { message: 'new row violates row-level security policy' } : null })
        })
        return q
    }),
    // What a change to the list would cost is asked first, and is not one of
    // the changes, so it is kept apart (asked).
    rpc: vi.fn((name, args) => {
        if (name === 'recommended_cost_preview') { asked.push(args); return Promise.resolve({ data: preview, error: null }) }
        rpcs.push({ name, args })
        return Promise.resolve({ data: null, error: null })
    }),
    storage: {
        from: vi.fn(() => ({
            createSignedUrls: vi.fn(() => Promise.resolve({ data: [] })),
            upload: vi.fn(() => Promise.resolve({ data: {}, error: null })),
            remove: vi.fn(paths => { removed.push(...paths); return Promise.resolve({ data: [], error: null }) }),
        })),
    },
}
vi.mock('@/lib/supabase', async importOriginal => ({
    everyRow: (await importOriginal()).everyRow,
    supabase: new Proxy({}, { get: (_, k) => db[k] }),
}))
let me
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: me }) }))
vi.mock('@/context/restaurant', () => {
    const point = { id: 'r1', name: 'Point Campus' }
    return { useRestaurant: () => ({ activeRestaurant: point }) }
})
vi.mock('@/context/confirm', () => ({ useConfirm: () => options => ask(options) }))
// jsdom has no canvas, so the shrinking is taken as done.
vi.mock('@/lib/photo', async importOriginal => ({
    ...(await importOriginal()),
    shrinkPhoto: () => Promise.resolve(new Blob(['x'], { type: 'image/jpeg' })),
}))

const { default: RecommendedPage } = await import('./RecommendedPage')

beforeEach(() => {
    me = { id: 'u1', role: 'owner', restaurant_id: 'r1' }
    written = []
    rpcs = []
    asked = []
    preview = null
    refused = null
    removed = []
    ask = vi.fn(async () => true)
    tables = {
        products: [PEPPERS, FRIES, SALSA, SPONGE],
        product_versions: [BIG, OTHER_BIG, SMALL, LOOSE, CHIPS],
        suppliers: [{ id: 's1', name: 'Sysco Ireland', is_active: true }, { id: 's2', name: 'Local', is_active: true, works_without_codes: true }],
        version_pictures: [],
        version_codes: [],
        version_allergens: [{ version_id: 'a' }, { version_id: 'c' }, { version_id: 'd' }, { version_id: 'f' }],
        product_supplier_prices: [
            price('x1', 'a', 13.35, 5, 2.67),
            price('x2', 'b', 12.97, 5, 2.5944),
            price('x3', 'c', 3.33, 1, 3.326),
        ],
    }
    lines = [
        { price_id: 'x1', invoice_id: 'i1', invoices: { invoice_date: '2026-10-11' } },
        { price_id: 'x3', invoice_id: 'i2', invoices: { invoice_date: '2026-09-18' } },
    ]
})

const productRow = name => within(screen.getByRole('heading', { name }).closest('li'))
const sectionBar = name => screen.getByRole('button', { name: new RegExp(`^${name}`) })
// The page with every section opened, which they are not to start with.
const open = async () => {
    renderWithRouter(<RecommendedPage />)
    await screen.findByRole('button', { name: /^Cold Room/ })
    for (const name of ['Freezer', 'Cold Room', 'Cleaning']) await userEvent.click(sectionBar(name))
    await screen.findByRole('heading', { name: 'Green Peppers' })
}

describe('the Recommended list', () => {
    it('lists what is bought by section, leaving out what is made here', async () => {
        await open()
        expect(sectionBar('Freezer')).toHaveTextContent('1 product')
        expect(sectionBar('Cold Room')).toHaveTextContent('1 product')
        expect(sectionBar('Cleaning')).toHaveTextContent('1 product')
        expect(screen.queryByText('House Salsa')).toBeNull()
    })

    // His ask of 18 October 2026: folded until a section is opened.
    it('starts with every section folded, and opens one on a tap', async () => {
        renderWithRouter(<RecommendedPage />)
        await screen.findByRole('button', { name: /^Cold Room/ })
        expect(sectionBar('Cold Room')).toHaveAttribute('aria-expanded', 'false')
        expect(screen.queryByRole('heading', { name: 'Green Peppers' })).toBeNull()
        await userEvent.click(sectionBar('Cold Room'))
        expect(sectionBar('Cold Room')).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByRole('heading', { name: 'Green Peppers' })).toBeInTheDocument()
        expect(screen.queryByRole('heading', { name: 'Fries' })).toBeNull()
        await userEvent.click(sectionBar('Cold Room'))
        expect(screen.queryByRole('heading', { name: 'Green Peppers' })).toBeNull()
    })

    it('opens every section a search finds something in', async () => {
        renderWithRouter(<RecommendedPage />)
        await screen.findByRole('button', { name: /^Cold Room/ })
        await userEvent.type(screen.getByRole('searchbox'), 'peppers')
        expect(screen.getByRole('heading', { name: 'Green Peppers' })).toBeInTheDocument()
    })

    it('shows the versions that are all fine, the fallbacks, and what else is bought here', async () => {
        await open()
        const peppers = productRow('Green Peppers')
        expect(peppers.getByText('Any of these')).toBeInTheDocument()
        expect(peppers.getByText('All equally fine, bought depending on stock.')).toBeInTheDocument()
        expect(peppers.getByText('If those are out')).toBeInTheDocument()
        expect(peppers.getByText('Fallback 1')).toBeInTheDocument()
        expect(peppers.getByText('Also bought, not on the list: Green Peppers 1x1 Kg (5016517)')).toBeInTheDocument()
        expect(peppers.getByText('Order by 2pm for the next day.')).toBeInTheDocument()
        expect(productRow('Fries').getByText('Recommended')).toBeInTheDocument()
    })

    it('says what each costs here and when it was last delivered, or that it is not bought here', async () => {
        await open()
        const peppers = productRow('Green Peppers')
        expect(peppers.getByText(/€13\.35 a case of 5 kg · €2\.67 a kg/)).toBeInTheDocument()
        expect(peppers.getByText(/last on an invoice 11 Oct/)).toBeInTheDocument()
        expect(peppers.getByText('Not bought here yet.')).toBeInTheDocument()
        expect(peppers.getAllByText('Sysco Ireland').length).toBeGreaterThan(0)
    })

    it('marks a version on the list whose allergens nobody has entered', async () => {
        await open()
        const links = productRow('Green Peppers').getAllByRole('link', { name: 'Allergens not entered' })
        expect(links).toHaveLength(1)
        expect(links[0]).toHaveAttribute('href', '/catalogue/products/p1/allergens')
    })

    it('says when any version is fine', async () => {
        await open()
        expect(productRow('Sponge Scourer').getByText('No recommendation. Any version is fine.')).toBeInTheDocument()
    })

    it('finds a product by a code', async () => {
        await open()
        await userEvent.type(screen.getByRole('searchbox'), '5013690')
        expect(screen.queryByRole('heading', { name: 'Green Peppers' })).toBeNull()
        expect(screen.getByRole('heading', { name: 'Fries' })).toBeInTheDocument()
    })

    // His ask of 18 October 2026: the empty box takes a picture straight
    // away, without opening Edit.
    it('lets an owner add a picture from the empty box', async () => {
        await open()
        const box = productRow('Fries').getByRole('button', { name: 'Add a picture of Mccain Thin Chips 10mm' })
        await userEvent.upload(box.parentElement.querySelector('input[type=file]'), new File(['x'], 'chips.webp', { type: 'image/webp' }))
        await waitFor(() => expect(written).toHaveLength(1))
        expect(written[0]).toMatchObject({ table: 'version_pictures', inserted: { version_id: 'f', sort_order: 0, added_by: 'u1' } })
        expect(written[0].inserted.path).toMatch(/^f\/.+\.jpg$/)
    })

    it('takes the file back out and says why when the picture cannot be saved', async () => {
        refused = 'version_pictures'
        await open()
        const box = productRow('Fries').getByRole('button', { name: 'Add a picture of Mccain Thin Chips 10mm' })
        await userEvent.upload(box.parentElement.querySelector('input[type=file]'), new File(['x'], 'chips.jpg', { type: 'image/jpeg' }))
        expect(await productRow('Fries').findByRole('alert')).toHaveTextContent(/.+/)
        expect(removed).toEqual([written[0].inserted.path])
    })

    it('tells a store manager only the owners change it, and offers no Edit', async () => {
        me = { id: 'u2', role: 'store_manager', restaurant_id: 'r1' }
        await open()
        expect(screen.getByText(/Only the owners change this list/)).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /^Edit/ })).toBeNull()
        expect(screen.queryByRole('button', { name: /^Add a picture/ })).toBeNull()
        expect(productRow('Fries').getByText('No picture yet')).toBeInTheDocument()
    })
})

describe('changing a product on the list', () => {
    const editPeppers = async () => {
        await open()
        await userEvent.click(screen.getByRole('button', { name: 'Edit Green Peppers' }))
        return within(screen.getByRole('dialog'))
    }
    const card = (dialog, name) => within(dialog.getByDisplayValue(name).closest('li'))

    it('makes a recommended version the last fallback', async () => {
        const dialog = await editPeppers()
        await userEvent.click(card(dialog, 'Order by 2pm for the next day.').getByRole('button', { name: 'Make it a fallback' }))
        expect(rpcs).toEqual([{ name: 'set_fallbacks', args: { product: 'p1', versions: ['d', 'b'] } }])
    })

    it('takes a version off the list', async () => {
        const dialog = await editPeppers()
        await userEvent.click(card(dialog, 'Order by 2pm for the next day.').getByRole('button', { name: 'Take off the list' }))
        expect(written).toEqual([{ table: 'product_versions', patch: { is_recommended: false }, id: 'b' }])
    })

    it('puts another version on the list, makes it a fallback, or switches it off', async () => {
        const dialog = await editPeppers()
        const small = within(dialog.getByText('Green Peppers 1x1 Kg').closest('li'))
        expect(small.getByText(/bought once, last 18 Sept?/)).toBeInTheDocument()
        await userEvent.click(small.getByRole('button', { name: 'Add as a fallback' }))
        expect(rpcs).toEqual([{ name: 'set_fallbacks', args: { product: 'p1', versions: ['d', 'c'] } }])
        await userEvent.click(small.getByRole('button', { name: 'Switch off' }))
        expect(written).toEqual([{ table: 'product_versions', patch: { is_active: false }, id: 'c' }])
    })

    it('asks before any version, saying what comes off the list', async () => {
        const dialog = await editPeppers()
        ask = vi.fn(async () => false)
        await userEvent.click(dialog.getByRole('radio', { name: 'Any version' }))
        expect(ask).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Any version?',
            message: expect.stringContaining('Its 2 recommended versions and 1 fallback come off the list'),
        }))
        expect(rpcs).toEqual([])
        ask = vi.fn(async () => true)
        await userEvent.click(dialog.getByRole('radio', { name: 'Any version' }))
        await waitFor(() => expect(rpcs).toEqual([{ name: 'set_recommends', args: { product: 'p1', mode: 'any' } }]))
    })

    // Before a change to the set is saved, what it would cost (21 October
    // 2026): the green peppers costed from the 2.67 box, the dearer of the two.
    describe('what a change to the set would cost', () => {
        const atPoint = after => [{
            restaurant_id: 'r1', restaurant_name: 'Point Campus', cost_now: 2.67, borrowed_now: false,
            cost_after: after, borrowed_after: false,
        }]

        it('asks about the set it would leave, and saves straight away when nothing costs more or less', async () => {
            preview = atPoint(2.67)
            const dialog = await editPeppers()
            await userEvent.click(card(dialog, 'Order by 2pm for the next day.').getByRole('button', { name: 'Take off the list' }))
            expect(asked).toEqual([{ product: 'p1', versions: ['a'] }])
            expect(ask).not.toHaveBeenCalled()
            expect(written).toEqual([{ table: 'product_versions', patch: { is_recommended: false }, id: 'b' }])
        })

        it('says the cost before and after, and the dishes, and saves nothing on No', async () => {
            preview = atPoint(2.5944)
            tables.cost_prices = [{ restaurant_id: 'r1', product_id: 'p1', price_per_unit: 2.67 }]
            tables.menu_items = [{ id: 'm1', name: 'Bowl', category_id: 'c1', is_active: true }]
            tables.menu_categories = [{ id: 'c1', is_active: true }]
            tables.menu_item_components = [{ id: 'k1', menu_item_id: 'm1', product_id: 'p1', quantity: 1 }]
            ask = vi.fn(async () => false)
            const dialog = await editPeppers()
            await userEvent.click(card(dialog, 'Order by 2pm for the next day.').getByRole('button', { name: 'Take off the list' }))
            await waitFor(() => expect(ask).toHaveBeenCalled())
            expect(ask).toHaveBeenCalledWith(expect.objectContaining({
                title: 'Take it off the list?',
                confirmLabel: 'Take off the list',
                message: 'This changes what recipes cost Green Peppers at Point Campus.',
                details: [{ label: 'Point Campus', value: '€2.67 to €2.59 a kg, 2.8% less' }],
                groups: [{ title: 'Dishes at Point Campus', details: [{ label: 'Bowl', value: '€0.08 less' }] }],
            }))
            expect(written).toEqual([])
        })

        it('puts it with what comes off the list when any version is chosen', async () => {
            preview = atPoint(2.5944)
            ask = vi.fn(async () => false)
            const dialog = await editPeppers()
            await userEvent.click(dialog.getByRole('radio', { name: 'Any version' }))
            await waitFor(() => expect(ask).toHaveBeenCalled())
            expect(asked).toEqual([{ product: 'p1', versions: [] }])
            expect(ask.mock.calls[0][0].message).toMatch(/come off the list[\s\S]*This changes what recipes cost Green Peppers at/)
            expect(rpcs).toEqual([])
        })
    })

    it('saves the buying notes on leaving the box', async () => {
        const dialog = await editPeppers()
        const notes = dialog.getByDisplayValue('Order by 2pm for the next day.')
        await userEvent.clear(notes)
        await userEvent.type(notes, 'Order in the app.')
        await userEvent.tab()
        expect(written).toEqual([{ table: 'product_versions', patch: { notes: 'Order in the app.' }, id: 'b' }])
    })

    // Escape closes the dialog without the box losing the cursor first, so
    // what was typed is saved on the way out instead.
    it('saves what is typed when the dialog is closed from inside the box', async () => {
        const dialog = await editPeppers()
        const notes = dialog.getByDisplayValue('Order by 2pm for the next day.')
        await userEvent.clear(notes)
        await userEvent.type(notes, 'Order in the app.')
        await userEvent.keyboard('{Escape}')
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
        expect(written).toEqual([{ table: 'product_versions', patch: { notes: 'Order in the app.' }, id: 'b' }])
    })

    it('opens straight on a product sent from its versions', async () => {
        renderWithRouter(<RecommendedPage />, { route: '/catalogue/recommended?product=p1' })
        expect(await screen.findByRole('dialog')).toHaveTextContent('Green Peppers')
    })

    it('opens nothing for a store manager sent the same way', async () => {
        me = { id: 'u2', role: 'store_manager', restaurant_id: 'r1' }
        renderWithRouter(<RecommendedPage />, { route: '/catalogue/recommended?product=p1' })
        await screen.findByRole('button', { name: /^Cold Room/ })
        expect(screen.queryByRole('dialog')).toBeNull()
    })
})
