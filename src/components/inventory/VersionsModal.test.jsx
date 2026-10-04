// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeQuery } from '@/test/helpers'

// The versions of the flour tortillas, from the design of 4 October. The codes
// are real, everything else is invented.

let written
const db = {
    from: vi.fn(table => {
        const q = makeQuery()
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
    is_recommended: true, is_active: true, section: null, also_in: null,
}
const PLAIN = {
    id: 'v2', product_id: 'p1', supplier_id: 's1', supplier_code: '5013972', name: 'Flour plain wraps 12"',
    is_recommended: false, is_active: true, section: null, also_in: null,
}
const SUPPLIERS = [{ id: 's1', name: 'Sysco Ireland' }]

function open({ canRecommend = true, product = TORTILLA, onChanged = vi.fn() } = {}) {
    render(
        <VersionsModal
            product={product}
            versions={[PLAIN, SANTA, { ...SANTA, id: 'elsewhere', product_id: 'p9' }]}
            suppliers={SUPPLIERS}
            boughtHere={new Set(['v2'])}
            canRecommend={canRecommend}
            onClose={() => {}}
            onChanged={onChanged}
        />,
    )
    return onChanged
}

const row = name => within(screen.getByText(name, { exact: false }).closest('li'))

beforeEach(() => { written = [] })

describe('the versions of a product', () => {
    it('lists its own versions, the recommended first, and which one is bought here', () => {
        open()
        const names = screen.getAllByRole('listitem').map(li => li.querySelector('p').textContent)
        expect(names).toEqual(['★ Santa Maria flour tortilla wrap 12"', 'Flour plain wraps 12"'])
        expect(row('Flour plain wraps').getByText('Bought here')).toBeInTheDocument()
        expect(row('Santa Maria').getByText('Recommended')).toBeInTheDocument()
        expect(row('Santa Maria').getByText('Sysco Ireland, code 497870')).toBeInTheDocument()
    })

    it('lets an owner recommend a version', async () => {
        const changed = open()
        await userEvent.click(row('Flour plain wraps').getByRole('button', { name: 'Recommend it' }))
        expect(written).toEqual([{ table: 'product_versions', patch: { is_recommended: true }, id: 'v2' }])
        await waitFor(() => expect(changed).toHaveBeenCalled())
    })

    it('lets an owner say nothing in particular is recommended', async () => {
        open()
        await userEvent.click(screen.getByRole('radio', { name: /Nothing in particular/ }))
        expect(written).toEqual([{ table: 'products', patch: { recommends: 'any' }, id: 'p1' }])
    })

    it('stars nothing when any version is fine', () => {
        open({ product: { ...TORTILLA, recommends: 'any' } })
        expect(screen.queryByText('Recommended')).toBeNull()
        expect(screen.queryByRole('button', { name: 'Recommend it' })).toBeNull()
    })

    it('lets an owner rename a version, saved on leaving the box', async () => {
        open()
        const box = row('Flour plain wraps').getByLabelText('Name')
        await userEvent.clear(box)
        await userEvent.type(box, 'Plain wraps 12"')
        await userEvent.tab()
        expect(written).toEqual([{ table: 'product_versions', patch: { name: 'Plain wraps 12"' }, id: 'v2' }])
    })

    // A store manager says where things are kept, and nothing about what
    // the brand recommends.
    it('gives a store manager where it is kept, and no recommending', async () => {
        open({ canRecommend: false })
        expect(screen.queryByRole('radio')).toBeNull()
        expect(screen.queryByRole('button', { name: 'Recommend it' })).toBeNull()
        expect(screen.queryByLabelText('Name')).toBeNull()
        await userEvent.selectOptions(row('Flour plain wraps').getByLabelText('Kept in'), 'Freezer')
        expect(written).toEqual([{ table: 'product_versions', patch: { section: 'Freezer', also_in: [] }, id: 'v2' }])
    })

    it('keeps a version where the product is until it says otherwise, and adds other places', async () => {
        open({ canRecommend: false })
        expect(row('Flour plain wraps').getByLabelText('Kept in')).toHaveValue('Dry')
        await userEvent.click(row('Flour plain wraps').getByRole('button', { name: 'Cold Room' }))
        expect(written).toEqual([{ table: 'product_versions', patch: { section: 'Dry', also_in: ['Cold Room'] }, id: 'v2' }])
    })
})
