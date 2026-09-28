import { describe, it, expect, vi } from 'vitest'
import { itemsFromPage, readPdfText } from '@/lib/pdfText'

// A stand in for the PDF engine, so the reader can be tested without loading
// most of a megabyte of it. What is being checked here is the shape of what
// comes out and that the worker is let go afterwards, not that pdfjs works.
function fakePdfjs({ pages = 1, height = 842, byPage = {} } = {}) {
    const destroy = vi.fn(() => Promise.resolve())
    return {
        destroy,
        engine: {
            getDocument: () => ({
                promise: Promise.resolve({
                    numPages: pages,
                    destroy,
                    getPage: page => Promise.resolve({
                        getViewport: () => ({ height }),
                        getTextContent: () => Promise.resolve({ items: byPage[page] || [] }),
                    }),
                }),
            }),
        },
    }
}

const file = { arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }

// [a, b, c, d, e, f] where e is x and f is y.
const run = (str, x, y, width = 20) => ({ str, transform: [1, 0, 0, 1, x, y], width, height: 8 })

describe('reading one page', () => {
    // PDF space has its origin at the bottom left and counts upward, so sorting
    // rows by y reads a page backwards. Flipping it here is what lets
    // everything above say "the next row down" and mean it.
    it('counts y from the top of the page', () => {
        const items = itemsFromPage({ items: [run('top', 40, 800), run('bottom', 40, 100)] }, 842, 1)
        expect(items.map(i => i.str)).toEqual(['top', 'bottom'])
        expect(items[0].y).toBe(42)
        expect(items[1].y).toBe(742)
    })

    it('keeps the page number on every item', () => {
        const items = itemsFromPage({ items: [run('a', 40, 800)] }, 842, 3)
        expect(items[0].page).toBe(3)
    })

    it('drops lettering that is only whitespace', () => {
        const items = itemsFromPage({ items: [run(' ', 40, 800), run('a', 60, 800)] }, 842, 1)
        expect(items.map(i => i.str)).toEqual(['a'])
    })

    it('copes with a page that has nothing on it', () => {
        expect(itemsFromPage(null, 842, 1)).toEqual([])
        expect(itemsFromPage({ items: [] }, 842, 1)).toEqual([])
    })
})

describe('reading a whole file', () => {
    it('walks every page in order', async () => {
        const { engine } = fakePdfjs({
            pages: 2,
            byPage: { 1: [run('one', 40, 800)], 2: [run('two', 40, 800)] },
        })
        const read = await readPdfText(file, () => Promise.resolve(engine))

        expect(read.pages).toBe(2)
        expect(read.items.map(i => `${i.page}:${i.str}`)).toEqual(['1:one', '2:two'])
    })

    // The worker is a real thread and it does not go away on its own. Twenty
    // invoices in one batch is twenty of them otherwise.
    it('lets the worker go afterwards', async () => {
        const { engine, destroy } = fakePdfjs({ byPage: { 1: [run('one', 40, 800)] } })
        await readPdfText(file, () => Promise.resolve(engine))
        expect(destroy).toHaveBeenCalled()
    })

    it('lets it go even when a page throws', async () => {
        const destroy = vi.fn(() => Promise.resolve())
        const engine = {
            getDocument: () => ({
                promise: Promise.resolve({
                    numPages: 1,
                    destroy,
                    getPage: () => Promise.reject(new Error('that file is not a PDF')),
                }),
            }),
        }

        await expect(readPdfText(file, () => Promise.resolve(engine))).rejects.toThrow('not a PDF')
        expect(destroy).toHaveBeenCalled()
    })
})
