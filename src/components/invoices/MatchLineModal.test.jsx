// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Which product a new code is, with the brand's suggestions above the
// search (his decision of 19 October 2026). The green pepper codes are the
// real Sysco ones; the rest is invented.

const signed = []
const db = {
    storage: {
        from: vi.fn(() => ({
            createSignedUrls: vi.fn(paths => {
                signed.push(...paths)
                return Promise.resolve({ data: paths.map(path => ({ path, signedUrl: `https://pictures.test/${path}` })) })
            }),
        })),
    },
}
vi.mock('@/lib/supabase', async () => ({
    ...(await vi.importActual('@/lib/supabase')),
    supabase: new Proxy({}, { get: (_, k) => db[k] }),
}))

// jsdom draws nothing, so the search list has nowhere to scroll to.
Element.prototype.scrollIntoView ??= () => {}

const { default: MatchLineModal } = await import('./MatchLineModal')

const PRODUCTS = [
    { id: 'p1', name: 'Green Peppers', section: 'Cold Room', unit: 'KG', is_active: true, recommends: 'versions' },
    { id: 'p2', name: 'Red Peppers', section: 'Cold Room', unit: 'KG', is_active: true, recommends: 'versions' },
    { id: 'p3', name: 'Basmati Rice', section: 'Dry', unit: 'KG', is_active: true, recommends: 'versions' },
]
const version = (id, productId, code, name, extra = {}) => ({
    id, product_id: productId, supplier_id: 's1', supplier_code: code, name, description: null,
    is_recommended: false, supplierName: 'Sysco Ireland', otherCodes: [], pictures: [], ...extra,
})
const VERSIONS = [
    version('a', 'p1', '483508', 'Green Peppers 1x5 Kg', { is_recommended: true, pictures: ['a/box.jpg', 'a/side.jpg'] }),
    version('c', 'p1', '5016517', 'Green Peppers 1x1 Kg'),
    version('r', 'p2', '700200', 'Red Peppers 1x5 Kg'),
]

const row = (extra = {}) => ({
    line: { code: '5099001', description: 'GREEN PEPPERS 1X5 KG', pack_size: '1X5 KG', price_per_case: 13.35 },
    wantedUnits: 5,
    supplierId: 's1',
    ...extra,
})

let onMatch
beforeEach(() => {
    signed.length = 0
    onMatch = vi.fn(() => Promise.resolve())
})

const open = (props = {}) => render(
    <MatchLineModal row={row()} products={PRODUCTS} versions={VERSIONS} onClose={() => {}} onMatch={onMatch} {...props} />,
)
const suggestion = name => screen.getByRole('button', { name: new RegExp(name) })

describe('the suggestions', () => {
    it('shows them above the search, best first, each with its supplier and code', () => {
        open()
        const list = screen.getByText('Suggested').nextElementSibling
        const shown = within(list).getAllByRole('button')
        expect(shown.map(b => b.textContent)).toEqual([
            'Green PeppersGreen Peppers 1x5 KgSysco Irelandcode 483508Recommended',
            'No pictureGreen PeppersGreen Peppers 1x1 KgSysco Irelandcode 5016517',
        ])
        const search = screen.getByRole('combobox')
        expect(shown[0].compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(within(list).queryByText(/Red Peppers/)).toBeNull()
    })

    it('shows the first picture of each, asked for in one go', async () => {
        const { container } = open()
        await waitFor(() => expect(container.querySelector('img')).not.toBeNull())
        expect(container.querySelector('img').getAttribute('src')).toBe('https://pictures.test/a/box.jpg')
        expect(signed).toEqual(['a/box.jpg'])
    })

    it('says when a version already goes by the code on the line', () => {
        open({ row: row({ line: { ...row().line, code: '5016517' } }) })
        const first = within(screen.getByText('Suggested').nextElementSibling).getAllByRole('button')[0]
        expect(first).toHaveTextContent('Green Peppers 1x1 Kg')
        expect(within(first).getByText('Same code')).toBeInTheDocument()
    })

    it('shows nothing above the search when nothing is like it', () => {
        open({ row: row({ line: { ...row().line, description: 'MOP HEAD' } }) })
        expect(screen.queryByText('Suggested')).toBeNull()
        expect(screen.getByRole('combobox')).toBeInTheDocument()
    })
})

describe('picking one', () => {
    it('picks its product, the way the search does, and matches with the version as well', async () => {
        const user = userEvent.setup()
        open()
        await user.click(suggestion('1x5 Kg'))
        expect(suggestion('1x5 Kg')).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByRole('combobox')).toHaveValue('Green Peppers (KG)')
        await user.click(screen.getByRole('button', { name: 'Match' }))
        expect(onMatch).toHaveBeenCalledWith({ productId: 'p1', unitsPerCase: 5, versionId: 'a' })
    })

    it('lets go of the version when another product is chosen in the search', async () => {
        const user = userEvent.setup()
        open()
        await user.click(suggestion('1x5 Kg'))
        await user.click(screen.getByRole('button', { name: 'Clear' }))
        await user.type(screen.getByRole('combobox'), 'basmati')
        await user.click(screen.getByText('Basmati Rice'))
        expect(suggestion('1x5 Kg')).toHaveAttribute('aria-pressed', 'false')
        await user.click(screen.getByRole('button', { name: 'Match' }))
        expect(onMatch).toHaveBeenCalledWith({ productId: 'p3', unitsPerCase: 5, versionId: null })
    })

    it('leaves the search working as it did, with no version', async () => {
        const user = userEvent.setup()
        open({ versions: [] })
        expect(screen.queryByText('Suggested')).toBeNull()
        await user.type(screen.getByRole('combobox'), 'green')
        await user.click(screen.getByText('Green Peppers'))
        await user.click(screen.getByRole('button', { name: 'Match' }))
        expect(onMatch).toHaveBeenCalledWith({ productId: 'p1', unitsPerCase: 5, versionId: null })
    })
})
