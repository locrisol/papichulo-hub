// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithRouter, tableOf } from '@/test/helpers'

// Answering A version of one we have from Products, with the same
// suggestions Review makes. The green pepper codes are the real Sysco ones;
// the rest is invented.

let tables
const db = {
    from: vi.fn(table => tableOf(tables[table] || [])),
    storage: {
        from: vi.fn(() => ({
            createSignedUrls: vi.fn(paths => Promise.resolve({
                data: paths.map(path => ({ path, signedUrl: `https://pictures.test/${path}` })),
            })),
        })),
    },
}
vi.mock('@/lib/supabase', async importOriginal => ({
    everyRow: (await importOriginal()).everyRow,
    supabase: new Proxy({}, { get: (_, k) => db[k] }),
}))
const settle = vi.fn(() => Promise.resolve({ error: null, said: '' }))
vi.mock('@/lib/reviewWrites', async importOriginal => ({
    ...(await importOriginal()),
    settleRequest: (...args) => settle(...args),
}))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'owner' } }) }))
vi.mock('@/context/confirm', () => ({ useConfirm: () => vi.fn(() => Promise.resolve(true)) }))

// jsdom draws nothing, so the search list has nowhere to scroll to.
Element.prototype.scrollIntoView ??= () => {}

const { default: SentForReview } = await import('./SentForReview')

const REQUEST = {
    id: 'q1', restaurant_id: 'r2', kind: 'new', name: 'Green peppers', reason: null,
    supplier_id: 's1', supplier_code: '5099001', description: 'GREEN PEPPERS 1X5 KG', pack_size: '1X5 KG',
    price_per_case: 13.35, units_per_case: 5, sent_at: '2026-10-02T09:00:00Z', answer: null,
    sender: { full_name: 'Maria', role: 'store_manager' }, restaurants: { name: 'Dun Laoghaire' },
    suppliers: { name: 'Sysco Ireland' },
}
const version = (id, productId, code, name, extra = {}) => ({
    id, product_id: productId, supplier_id: 's1', supplier_code: code, name, description: null,
    is_recommended: false, is_active: true, suppliers: { name: 'Sysco Ireland' }, ...extra,
})

beforeEach(() => {
    tables = {
        product_requests: [REQUEST],
        products: [
            { id: 'p1', name: 'Green Peppers', section: 'Cold Room', unit: 'KG', is_mix: false, is_active: true, recommends: 'versions' },
            { id: 'p2', name: 'Red Peppers', section: 'Cold Room', unit: 'KG', is_mix: false, is_active: true, recommends: 'versions' },
        ],
        product_versions: [
            version('a', 'p1', '483508', 'Green Peppers 1x5 Kg', { is_recommended: true }),
            version('b', 'p1', '5018758', 'Green Peppers 1x5 Kg'),
            version('r', 'p2', '700200', 'Red Peppers 1x5 Kg'),
        ],
        version_codes: [],
        version_pictures: [{ version_id: 'a', path: 'a/box.jpg', sort_order: 0 }],
    }
})

async function answerWithAVersion(user) {
    renderWithRouter(<SentForReview />)
    await user.click(await screen.findByRole('button', { name: 'A version of one we have' }))
    return within(screen.getByRole('dialog'))
}

describe('A version of one we have', () => {
    it('shows the suggestions above the search, with the picture', async () => {
        const dialog = await answerWithAVersion(userEvent.setup())
        const list = dialog.getByText('Suggested').nextElementSibling
        const shown = within(list).getAllByRole('button')
        expect(shown).toHaveLength(2)
        expect(shown[0]).toHaveTextContent('Green Peppers 1x5 KgSysco Irelandcode 483508Recommended')
        expect(shown[1]).toHaveTextContent('code 5018758')
        expect(shown[0].compareDocumentPosition(dialog.getByRole('combobox')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        await waitFor(() => expect(shown[0].querySelector('img')).not.toBeNull())
        expect(shown[0].querySelector('img').getAttribute('src')).toBe('https://pictures.test/a/box.jpg')
    })

    // Renumbered by the supplier, and the same thing. The switched off one
    // under the same code is never offered.
    it('puts the version that goes by the code first, through one of its other codes', async () => {
        tables.version_codes = [{ version_id: 'b', supplier_id: 's1', code: '5099001' }]
        tables.product_versions.push(version('x', 'p1', '5099001', 'Old peppers', { is_active: false }))
        const dialog = await answerWithAVersion(userEvent.setup())
        const shown = within(dialog.getByText('Suggested').nextElementSibling).getAllByRole('button')
        expect(shown[0]).toHaveTextContent('code 5099001')
        expect(within(shown[0]).getByText('Same code')).toBeInTheDocument()
        expect(dialog.queryByText('Old peppers')).toBeNull()
    })

    it('settles the request on the product picked', async () => {
        const user = userEvent.setup()
        const dialog = await answerWithAVersion(user)
        await user.click(dialog.getByRole('button', { name: /code 5018758/ }))
        expect(dialog.getByRole('combobox')).toHaveValue('Green Peppers (KG)')
        await user.click(dialog.getByRole('button', { name: 'Match' }))
        await waitFor(() => expect(settle).toHaveBeenCalledTimes(1))
        expect(settle.mock.calls[0][0]).toMatchObject({ id: 'q1' })
        expect(settle.mock.calls[0][1]).toMatchObject({ answer: 'version', productId: 'p1', unitsPerCase: 5 })
    })

    // Brand-wide only, and only what the suggestions use.
    it('reads only the columns it uses', async () => {
        await answerWithAVersion(userEvent.setup())
        const asked = table => db.from.mock.calls
            .map((call, i) => (call[0] === table ? db.from.mock.results[i].value.select.mock.calls[0][0] : null))
            .filter(Boolean)
        for (const table of ['product_versions', 'version_codes', 'version_pictures']) {
            expect(asked(table).length).toBeGreaterThan(0)
            expect(asked(table).join(' ')).not.toContain('*')
        }
        expect(db.from).not.toHaveBeenCalledWith('supplier_codes')
    })
})
