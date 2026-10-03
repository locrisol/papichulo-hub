import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The two allergen papers, drawn on a stand in for jsPDF that remembers every
// piece of text, every picture and the name it was saved under. What the
// page around them does with a failed read is in the page's own test.

const made = []
vi.mock('jspdf', () => {
    class FakePdf {
        constructor(options) {
            this.options = options
            this.written = []
            this.images = []
            this.savedAs = null
            this.pages = 1
            const [width, height] = options.format === 'a6' ? [105, 148] : [297, 210]
            this.internal = { pageSize: { getWidth: () => width, getHeight: () => height } }
            made.push(this)
            // Everything that only sets a colour, a font or draws a line.
            for (const name of ['setFont', 'setFontSize', 'setTextColor', 'setDrawColor',
                'setFillColor', 'setLineWidth', 'rect', 'line']) {
                this[name] = () => {}
            }
        }
        text(words) { this.written.push(String(words)) }
        addImage(...args) { this.images.push(args) }
        splitTextToSize(words) { return [String(words)] }
        getTextWidth(words) { return String(words).length * 1.5 }
        addPage() { this.pages++ }
        save(name) { this.savedAs = name }
    }
    return { default: FakePdf }
})

// No browser here, so the logo never loads. The sheet already prints without
// it, with the name written in its place.
class NoPicture {
    set src(_) { setTimeout(() => this.onerror?.(), 0) }
}

const { qrCardPdf, allergenListPdf } = await import('@/lib/allergenPdf')

beforeEach(() => {
    made.length = 0
    globalThis.Image = NoPicture
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 30, 12, 0))
})

afterEach(() => {
    vi.useRealTimers()
    delete globalThis.Image
})

describe('the QR card', () => {
    it('carries the restaurant, the code and the address, and is named after the restaurant', async () => {
        const pdf = await qrCardPdf({
            restaurantName: 'Point Campus',
            qrDataUrl: 'data:image/png;base64,AAAA',
            publicUrl: 'https://example.ie/allergens/point-campus',
            slug: 'point-campus',
        })

        expect(pdf.options.format).toBe('a6')
        expect(pdf.written).toContain('Point Campus')
        expect(pdf.written).toContain('https://example.ie/allergens/point-campus')
        expect(pdf.images[0][0]).toBe('data:image/png;base64,AAAA')
        expect(pdf.savedAs).toBe('papi-chulo-allergens-point-campus.pdf')
    })
})

describe('the allergen record form', () => {
    const MENU = {
        changedAt: '2026-09-01T10:00:00+00:00',
        categories: [{ id: 'c1', name: 'Sides', sort_order: 0 }],
        menuItems: [
            { id: 'm1', name: 'Plain Rice', category_id: 'c1' },
            { id: 'm2', name: 'Cheesy Rice', category_id: 'c1' },
            { id: 'm3', name: 'Nutty Rice', category_id: 'c1' },
        ],
        components: [
            { id: 'k1', menu_item_id: 'm1', product_id: 'p1' },
            { id: 'k2', menu_item_id: 'm2', product_id: 'p1' },
            { id: 'k3', menu_item_id: 'm2', product_id: 'p2' },
            { id: 'k4', menu_item_id: 'm3', product_id: 'p1' },
            { id: 'k5', menu_item_id: 'm3', product_id: 'p3' },
        ],
        products: [
            { id: 'p1', name: 'Rice', is_mix: false },
            { id: 'p2', name: 'Grated Cheese', is_mix: false },
            { id: 'p3', name: 'Seasoning', is_mix: false },
        ],
        recipeLines: [],
        allergens: [
            { product_id: 'p1' },
            { product_id: 'p2', milk: 'contains' },
            { product_id: 'p3', nuts: 'may_contain' },
        ],
    }

    it('prints every dish, an X for contains and a ~ for may contain', async () => {
        const pdf = await allergenListPdf({ menuData: MENU, slug: 'point-campus', userName: 'A Manager' })

        expect(pdf.options).toMatchObject({ format: 'a4', orientation: 'landscape' })
        expect(pdf.written).toEqual(expect.arrayContaining(['Sides', 'Plain Rice', 'Cheesy Rice', 'Nutty Rice']))
        expect(pdf.written).toContain('X')
        expect(pdf.written).toContain('~')
        expect(pdf.written).toContain('X = Contains      ~ = May contain')
    })

    it('dates the form by the last change and says who printed it', async () => {
        const pdf = await allergenListPdf({ menuData: MENU, slug: 'point-campus', userName: 'A Manager' })

        expect(pdf.written).toContain('01/09/2026')
        expect(pdf.written).toContain('A Manager')
    })

    // Without the logo there is still a heading, rather than none at all.
    it('writes the name when the logo will not load', async () => {
        const pdf = await allergenListPdf({ menuData: MENU, slug: 'point-campus', userName: 'A Manager' })

        expect(pdf.images).toHaveLength(0)
        expect(pdf.written).toContain('Papi Chulo')
    })

    it('is saved under the restaurant and the day it was printed', async () => {
        const pdf = await allergenListPdf({ menuData: MENU, slug: 'point-campus', userName: 'A Manager' })

        expect(pdf.savedAs).toBe('papi-chulo-allergens-point-campus-30-09-2026.pdf')
    })
})
