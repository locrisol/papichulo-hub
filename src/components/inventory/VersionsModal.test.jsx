// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { makeQuery } from '@/test/helpers'

// The versions of the flour tortillas, from the design of 4 October. The codes
// are real, everything else is invented. Since the Recommended list of 19
// October what the brand recommends is only said here; where a version is
// kept is still written here, until it moves to each restaurant.

let written
let otherCodes
const db = {
    from: vi.fn(table => {
        const q = makeQuery(table === 'version_codes' ? { data: otherCodes, error: null } : undefined)
        q.update = vi.fn(patch => {
            const step = makeQuery()
            step.eq = vi.fn((column, value) => { written.push({ table, patch, [column]: value }); return step })
            return step
        })
        return q
    }),
}
vi.mock('@/lib/supabase', async () => ({
    ...(await vi.importActual('@/lib/supabase')),
    supabase: new Proxy({}, { get: (_, k) => db[k] }),
}))

const { default: VersionsModal } = await import('./VersionsModal')

const TORTILLA = { id: 'p1', name: 'Flour Tortilla (Burritos)', section: 'Dry', also_in: [], recommends: 'versions' }
const SANTA = {
    id: 'v1', product_id: 'p1', supplier_id: 's1', supplier_code: '497870', name: 'Santa Maria flour tortilla wrap 12"',
    is_recommended: true, is_active: true, fallback_rank: null, section: null, also_in: null,
}
const PLAIN = {
    id: 'v2', product_id: 'p1', supplier_id: 's1', supplier_code: '5013972', name: 'Flour plain wraps 12"',
    is_recommended: false, is_active: true, fallback_rank: 2, section: null, also_in: null,
}
const OLD = {
    id: 'v3', product_id: 'p1', supplier_id: 's2', supplier_code: null, name: 'Tortillas from the shop',
    is_recommended: false, is_active: false, fallback_rank: null, section: null, also_in: null,
}
const SUPPLIERS = [
    { id: 's1', name: 'Sysco Ireland', is_active: true },
    { id: 's2', name: 'Local', is_active: true, works_without_codes: true },
]

function open({ keepsTheList = true, product = TORTILLA, onChanged = vi.fn(), onAddPrice = vi.fn() } = {}) {
    render(
        <MemoryRouter>
            <VersionsModal
                product={product}
                versions={[OLD, PLAIN, SANTA, { ...SANTA, id: 'elsewhere', product_id: 'p9' }]}
                suppliers={SUPPLIERS}
                boughtHere={new Set(['v2'])}
                keepsTheList={keepsTheList}
                onClose={() => {}}
                onChanged={onChanged}
                onAddPrice={onAddPrice}
            />
        </MemoryRouter>,
    )
    return onChanged
}

const row = name => within(screen.getByText(name, { exact: false }).closest('li'))

beforeEach(() => {
    written = []
    otherCodes = []
})

describe('the versions of a product', () => {
    it('lists its own versions, the recommended first, then the fallbacks, then the rest', () => {
        open()
        const names = screen.getAllByRole('listitem').map(li => li.querySelector('p').textContent)
        expect(names).toEqual(['Santa Maria flour tortilla wrap 12"', 'Flour plain wraps 12"', 'Tortillas from the shop'])
        expect(row('Santa Maria').getByText('Recommended')).toBeInTheDocument()
        expect(row('Flour plain wraps').getByText('Fallback 1')).toBeInTheDocument()
        expect(row('Flour plain wraps').getByText('Bought here')).toBeInTheDocument()
        expect(row('from the shop').getByText('Switched off')).toBeInTheDocument()
    })

    it('shows the supplier as a badge, and every code a version goes by', async () => {
        otherCodes = [{ version_id: 'v1', code: '497871' }]
        open()
        expect(row('Santa Maria').getByText('Sysco Ireland')).toBeInTheDocument()
        expect(await row('Santa Maria').findByText('code 497870, 497871')).toBeInTheDocument()
    })

    it('changes nothing about what is recommended, and sends an owner to the Recommended list', () => {
        open()
        expect(screen.queryByRole('radio')).toBeNull()
        expect(screen.queryByRole('button', { name: /Recommend/ })).toBeNull()
        expect(screen.queryByLabelText('Name')).toBeNull()
        expect(screen.getByRole('link', { name: 'Change on the Recommended list' }))
            .toHaveAttribute('href', '/catalogue/recommended?product=p1')
    })

    it('sends a store manager to read the list', () => {
        open({ keepsTheList: false })
        expect(screen.getByRole('link', { name: 'See the Recommended list' })).toHaveAttribute('href', '/catalogue/recommended')
    })

    it('says so when any version is fine, and stars nothing', () => {
        open({ product: { ...TORTILLA, recommends: 'any' } })
        expect(screen.getByText('The brand recommends any version of this product.')).toBeInTheDocument()
        expect(screen.queryByText('Recommended')).toBeNull()
        expect(screen.queryByText(/Fallback/)).toBeNull()
    })

    // A store manager still says where things are kept.
    it('lets a store manager say where a version is kept', async () => {
        const changed = open({ keepsTheList: false })
        await userEvent.selectOptions(row('Flour plain wraps').getByLabelText('Kept in'), 'Freezer')
        expect(written).toEqual([{ table: 'product_versions', patch: { section: 'Freezer', also_in: [] }, id: 'v2' }])
        await waitFor(() => expect(changed).toHaveBeenCalled())
    })

    it('keeps a version where the product is until it says otherwise, and adds other places', async () => {
        open({ keepsTheList: false })
        expect(row('Flour plain wraps').getByLabelText('Kept in')).toHaveValue('Dry')
        await userEvent.click(row('Flour plain wraps').getByRole('button', { name: 'Cold Room' }))
        expect(written).toEqual([{ table: 'product_versions', patch: { section: 'Dry', also_in: ['Cold Room'] }, id: 'v2' }])
    })
})

// His ask of 4 October: a store manager could add a price and saw no way to
// add a version. A price is how a version starts, and the dialog says so.
describe('adding a version', () => {
    it('says a version starts with a price, and goes to the prices for everybody', async () => {
        const onAddPrice = vi.fn()
        open({ keepsTheList: false, onAddPrice })
        expect(screen.getByText(/A version is added when a price is saved/)).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Add a price' }))
        expect(onAddPrice).toHaveBeenCalled()
        expect(screen.queryByRole('button', { name: 'Add a version' })).toBeNull()
    })
})
