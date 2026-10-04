import { describe, it, expect } from 'vitest'
import { needsCode, priceProblem, hasPrice } from '@/lib/productPrice'

const SYSCO = { id: 's1', name: 'Sysco Ireland', works_without_codes: false }
const LOCAL = { id: 's2', name: 'Local', works_without_codes: true }
const suppliers = [SYSCO, LOCAL]
const form = extra => ({ supplier_id: 's1', purchase_type: 'case', supplier_code: '497870', price_per_case: '30.30', units_per_case: '100', ...extra })

// Since 4 October the code names the version bought, so every supplier's
// prices need one, except a supplier marked as working without codes.
describe('the supplier code', () => {
    it('is needed for a supplier that uses codes, and not for one that does not', () => {
        expect(needsCode('s1', suppliers)).toBe(true)
        expect(needsCode('s2', suppliers)).toBe(false)
        expect(needsCode('', suppliers)).toBe(false)
    })

    it('is asked for when it is left empty', () => {
        expect(priceProblem(form({ supplier_code: '  ' }), suppliers).supplier_code).toMatch(/Enter the supplier's code/)
        expect(priceProblem(form(), suppliers)).toEqual({})
    })

    it('is not asked for at a supplier that works without codes', () => {
        expect(priceProblem(form({ supplier_id: 's2', supplier_code: '' }), suppliers)).toEqual({})
    })

    // A supplier the page could not read is treated as one that uses codes,
    // which asks for more rather than less.
    it('is asked for when the supplier is not known', () => {
        expect(priceProblem(form({ supplier_id: 's9', supplier_code: '' }), suppliers).supplier_code).toBeTruthy()
    })
})

describe('the rest of a price', () => {
    it('needs a supplier, and a price and pack for a case', () => {
        expect(priceProblem(form({ supplier_id: '' }), suppliers).supplier_id).toBe('Pick a supplier')
        expect(priceProblem(form({ price_per_case: '0' }), suppliers).price_per_case).toBeTruthy()
        expect(priceProblem(form({ units_per_case: '' }), suppliers).units_per_case).toBeTruthy()
    })

    it('counts as a price once a supplier is picked', () => {
        expect(hasPrice(form())).toBe(true)
        expect(hasPrice(form({ supplier_id: '' }))).toBe(false)
    })
})
