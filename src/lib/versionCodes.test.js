import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeQuery } from '@/test/helpers'

// Every code each version goes by. Invented codes.

let tables
let asked
const db = {
    from: vi.fn(table => {
        const q = makeQuery({ data: tables[table] || [], error: null })
        asked.push({ table, q })
        return q
    }),
}
vi.mock('@/lib/supabase', async () => ({
    ...(await vi.importActual('@/lib/supabase')),
    supabase: new Proxy({}, { get: (_, k) => db[k] }),
}))

const { versionCodesOf, versionOfCode, productsWithCode } = await import('./versionCodes')

beforeEach(() => {
    tables = {}
    asked = []
})

const VERSIONS = [
    { id: 'v1', product_id: 'p1', supplier_id: 's1', supplier_code: '9001', is_active: true },
    { id: 'v2', product_id: 'p1', supplier_id: 's1', supplier_code: null, is_active: true },
    { id: 'v3', product_id: 'p2', supplier_id: 's1', supplier_code: '9003', is_active: false },
]

describe('every code each version goes by', () => {
    it('is its own code and the others it gained, never an empty one', () => {
        expect(versionCodesOf(VERSIONS, [{ version_id: 'v1', supplier_id: 's1', code: '8001' }, { version_id: 'gone', supplier_id: 's1', code: '7' }]))
            .toEqual([
                { version_id: 'v1', product_id: 'p1', supplier_id: 's1', code: '9001', is_active: true },
                { version_id: 'v3', product_id: 'p2', supplier_id: 's1', code: '9003', is_active: false },
                { version_id: 'v1', product_id: 'p1', supplier_id: 's1', code: '8001', is_active: true },
            ])
    })
})

describe('the version a code belongs to', () => {
    const codes = versionCodesOf(VERSIONS, [{ version_id: 'v1', supplier_id: 's1', code: '8001' }])

    it('finds it by an old number as well as its own, case and spaces aside', () => {
        expect(versionOfCode(codes, 's1', ' 8001 ')?.version_id).toBe('v1')
        expect(versionOfCode(codes, null, '9001')?.version_id).toBe('v1')
    })

    it('is nothing for a switched off version, another supplier or no code', () => {
        expect(versionOfCode(codes, 's1', '9003')).toBeNull()
        expect(versionOfCode(codes, 's2', '9001')).toBeNull()
        expect(versionOfCode(codes, 's1', '')).toBeNull()
    })
})

describe('the products a code already belongs to', () => {
    it('asks both the versions and their other codes, for that supplier', async () => {
        tables.product_versions = [{ product_id: 'p1' }]
        tables.version_codes = [{ product_versions: { product_id: 'p2' } }, { product_versions: { product_id: 'p1' } }]
        const { data, error } = await productsWithCode('s1', '9001')
        expect(error).toBeNull()
        expect(data).toEqual(['p1', 'p2'])
        for (const { q } of asked) expect(q.eq).toHaveBeenCalledWith('supplier_id', 's1')
    })

    it('treats a percent sign in a code as itself', async () => {
        await productsWithCode('s1', '50%_OFF')
        expect(asked[0].q.ilike).toHaveBeenCalledWith('supplier_code', '50\\%\\_OFF')
    })

    it('asks nothing without a supplier and a code', async () => {
        expect(await productsWithCode(null, '9001')).toEqual({ data: [], error: null })
        expect(await productsWithCode('s1', ' ')).toEqual({ data: [], error: null })
        expect(asked).toEqual([])
    })
})
