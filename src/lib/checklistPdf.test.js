// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { blankListPdf, roundPdf, reportPdf, loadPictures, fitPicture } from '@/lib/checklistPdf'
import { listTree } from '@/lib/checklists'

// The real jsPDF, run for real, with its drawing calls watched. What is
// checked is his rule for the printed list: nothing is cut between pages, and a
// category heading is never left at the foot of a page with nothing under it.
//
// Invented lists throughout.

afterEach(() => vi.unstubAllGlobals())

const PICTURE = { data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', width: 1200, height: 900 }

// A long list: four categories, each with elements, some with sub elements,
// many with guide pictures, so rows of every height land on every part of a
// page.
function bigList() {
    const categories = []
    const tasks = []
    for (let c = 0; c < 4; c++) {
        categories.push({ id: `c${c}`, checklist_id: 'L', name: `Area ${c + 1}`, sort_order: c, is_active: true })
        for (let e = 0; e < 7; e++) {
            const id = `c${c}e${e}`
            tasks.push({ id, checklist_id: 'L', category_id: `c${c}`, parent_id: null, name: `Element ${e + 1} of area ${c + 1}`, how_to: e % 2 ? 'Use the green spray and the blue roll, then dry it with a clean cloth so there are no streaks left on it.' : null, guide_photos: e % 3 === 0 ? ['g.jpg'] : e === 5 ? ['g.jpg', 'g2.jpg', 'g3.jpg', 'g4.jpg'] : [], sort_order: e, is_active: true })
            if (e % 2 === 0) {
                for (let s = 0; s < 3; s++) {
                    tasks.push({ id: `${id}s${s}`, checklist_id: 'L', category_id: `c${c}`, parent_id: id, name: `Sub element ${s + 1}`, how_to: null, guide_photos: s === 1 ? ['g.jpg', 'g2.jpg'] : [], sort_order: s, is_active: true })
                }
            }
        }
    }
    return listTree(categories, tasks)
}

// Every drawing call, with the page it landed on. jsPDF is made inside the
// code under test, so the module is swapped for one that watches each
// document it makes.
const made = []
vi.mock('jspdf', async importOriginal => {
    const Real = (await importOriginal()).default
    class Watched extends Real {
        constructor(...args) {
            super(...args)
            const log = []
            for (const name of ['addImage', 'text', 'roundedRect', 'rect']) {
                const real = this[name].bind(this)
                this[name] = (...a) => { log.push({ name, args: a, page: this.getCurrentPageInfo().pageNumber }); return real(...a) }
            }
            made.push(log)
        }
    }
    return { default: Watched }
})

async function drawn(make) {
    const pdf = await make()
    return { pdf, log: made[made.length - 1] }
}

const RESTAURANT = { name: 'Testville' }
const LIST = { id: 'L', name: 'Weekly Deep Clean', repeats: 'weeks', every_weeks: 1 }

describe('the blank list to print', () => {
    it('never lets a picture run past the bottom of a page', async () => {
        const pictures = new Map([['g.jpg', PICTURE], ['g2.jpg', PICTURE], ['g3.jpg', PICTURE], ['g4.jpg', PICTURE]])
        const { pdf, log } = await drawn(() => blankListPdf({ restaurant: RESTAURANT, list: LIST, tree: bigList(), pictures, save: false }))
        const bottom = pdf.internal.pageSize.getHeight() - 16
        const images = log.filter(l => l.name === 'addImage' && l.args[0] !== undefined && l.args[3] > 30)
        expect(images.length).toBeGreaterThan(5)
        for (const { args } of images) expect(args[3] + args[5]).toBeLessThanOrEqual(bottom + 0.01)
        expect(pdf.getNumberOfPages()).toBeGreaterThan(2)
    })

    it('never leaves a category heading alone at the foot of a page', async () => {
        const pictures = new Map([['g.jpg', PICTURE], ['g2.jpg', PICTURE], ['g3.jpg', PICTURE], ['g4.jpg', PICTURE]])
        const { log } = await drawn(() => blankListPdf({ restaurant: RESTAURANT, list: LIST, tree: bigList(), pictures, save: false }))
        const headings = log.filter(l => l.name === 'roundedRect')
        expect(headings.length).toBeGreaterThan(3)
        for (const h of headings) {
            const after = log.slice(log.indexOf(h) + 1).filter(l => l.name === 'text' && l.page === h.page && l.args[2] > h.args[1] + 8)
            expect(after.length).toBeGreaterThan(0)
        }
    })

    it('gives every thing to tick a box, and none to an element ticked through what is under it', async () => {
        const { log } = await drawn(() => blankListPdf({ restaurant: RESTAURANT, list: LIST, tree: bigList(), save: false }))
        const boxes = log.filter(l => l.name === 'rect')
        // 4 areas: 4 elements with 3 subs each and 3 elements on their own.
        expect(boxes).toHaveLength(4 * (4 * 3 + 3))
    })
})

// His call, 27 September: on the printed list every category starts a page
// of its own, and runs on over as many pages as it needs.
describe('each category on the printed list', () => {
    it('starts at the top of a new page', async () => {
        const pictures = new Map([['g.jpg', PICTURE], ['g2.jpg', PICTURE], ['g3.jpg', PICTURE], ['g4.jpg', PICTURE]])
        const { pdf, log } = await drawn(() => blankListPdf({ restaurant: RESTAURANT, list: LIST, tree: bigList(), pictures, save: false }))
        const named = log.filter(l => l.name === 'text' && /^AREA \d$/.test([].concat(l.args[0]).join('')))
        expect(named.map(l => [].concat(l.args[0]).join(''))).toEqual(['AREA 1', 'AREA 2', 'AREA 3', 'AREA 4'])
        const pages = named.map(l => l.page)
        expect(new Set(pages).size).toBe(4)
        for (const l of named.slice(1)) expect(l.args[2]).toBeLessThan(55)
        // And a long one still runs on: more pages than categories.
        expect(pdf.getNumberOfPages()).toBeGreaterThan(4)
    })

    it('does the same on the record of a finished round', async () => {
        const round = { started_at: new Date('2026-09-22T09:00:00').toISOString(), ended_at: new Date('2026-09-23T09:00:00').toISOString(), ended_by: null }
        const { log } = await drawn(() => roundPdf({ restaurant: RESTAURANT, list: LIST, tree: bigList(), round, ticks: [], save: false }))
        const named = log.filter(l => l.name === 'text' && /^AREA \d$/.test([].concat(l.args[0]).join('')))
        expect(named).toHaveLength(4)
        expect(new Set(named.map(l => l.page)).size).toBe(4)
        for (const l of named.slice(1)) expect(l.args[2]).toBeLessThan(55)
    })
})

describe('the record of a round', () => {
    it('says who did each thing and what was not done', async () => {
        const tree = bigList()
        const ticks = [{ task_id: 'c0e0s0', done_by_name: 'Aoife', done_at: new Date('2026-09-22T10:42:00').toISOString(), photos: [] }]
        const round = { started_at: new Date('2026-09-22T09:00:00').toISOString(), started_by_name: 'Aoife', ended_at: null }
        const { log } = await drawn(() => roundPdf({ restaurant: RESTAURANT, list: LIST, tree, round, ticks, save: false }))
        const words = log.filter(l => l.name === 'text').map(l => [].concat(l.args[0]).join(' '))
        expect(words).toContain('1 of 60 done')
        expect(words).toContain('Aoife')
        expect(words.filter(w => w === 'Not done')).toHaveLength(59)
    })

    it('says a photo was taken once the nightly job has deleted it', async () => {
        const tree = bigList()
        const ticks = [{ task_id: 'c0e1', done_by_name: 'Aoife', done_at: new Date('2026-09-22T10:42:00').toISOString(), photos: ['p.jpg'], photos_gone_at: '2026-09-30T00:00:00Z' }]
        const round = { started_at: new Date('2026-09-22T09:00:00').toISOString(), ended_at: new Date('2026-09-23T09:00:00').toISOString(), ended_by: null }
        const { log } = await drawn(() => roundPdf({ restaurant: RESTAURANT, list: LIST, tree, round, ticks, save: false }))
        const words = log.filter(l => l.name === 'text').map(l => [].concat(l.args[0]).join(' '))
        expect(words.some(w => w.startsWith('A photo was taken.'))).toBe(true)
    })
})

describe('fetching the pictures first', () => {
    it('reads each one once with its size, and leaves off one that will not load', async () => {
        vi.stubGlobal('fetch', vi.fn(async url => {
            if (url === 'bad') throw new Error('offline')
            return { blob: async () => new Blob(['x'], { type: 'image/jpeg' }) }
        }))
        vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 800, height: 600 })))
        const sign = vi.fn(async paths => Object.fromEntries(paths.map(p => [p, p === 'b.jpg' ? 'bad' : 'ok'])))
        const got = await loadPictures(['a.jpg', 'a.jpg', null, 'b.jpg'], sign)
        expect(sign).toHaveBeenCalledWith(['a.jpg', 'b.jpg'])
        expect([...got.keys()]).toEqual(['a.jpg'])
        expect(got.get('a.jpg')).toMatchObject({ width: 800, height: 600 })
        expect(got.get('a.jpg').data).toMatch(/^data:/)
    })

    it('fits a picture in its box keeping its shape', () => {
        const fitted = fitPicture({ width: 1200, height: 900 }, 70, 38)
        expect(fitted.w).toBeCloseTo(50.67, 2)
        expect(fitted.h).toBe(38)
        expect(fitPicture({ width: 2000, height: 500 }, 70, 38)).toEqual({ w: 70, h: 17.5 })
    })
})

describe('the cleaning report on paper', () => {
    it('draws the days, the times and every list with when each thing was last done', async () => {
        const { pdf, log } = await drawn(() => reportPdf({
            restaurant: RESTAURANT, fromLabel: '31 Aug', toLabel: '26 Sept 2026',
            byDay: [0, 4, 9, 2, 0, 1, 0],
            byTime: [{ label: 'Before 9am', count: 3 }, { label: '9am to 12pm', count: 13 }],
            lists: Array.from({ length: 6 }, (_, i) => ({
                name: `List ${i + 1}`, repeats: 'Every week', summary: 'Finished in 3 of the last 4 weeks.',
                record: [{ label: '6 Sept', outcome: 'done', finishedOn: 'Tue 8 Sept' }, { label: '13 Sept', outcome: 'missed' }],
                rows: Array.from({ length: 12 }, (_, j) => ({ label: `Thing ${j + 1}`, category: 'Kitchen', doneAt: j ? new Date('2026-09-22T10:00:00').toISOString() : null })),
            })),
            save: false,
        }))
        const words = log.filter(l => l.name === 'text').map(l => [].concat(l.args[0]).join(' '))
        expect(words).toContain('Tuesday')
        expect(words).toContain('9 (56%)')
        expect(words.filter(w => w === 'Never done')).toHaveLength(6)
        expect(pdf.getNumberOfPages()).toBeGreaterThan(1)
        const bottom = pdf.internal.pageSize.getHeight() - 16
        for (const l of log.filter(x => x.name === 'text' && typeof x.args[2] === 'number' && x.args[2] > 40 && x.args[2] < 280)) {
            expect(l.args[2]).toBeLessThanOrEqual(bottom)
        }
    })
})

// Up to four guide pictures on a task since 27 September, side by side on one
// line so the row is no taller for having more.
describe('a task with several guide pictures', () => {
    it('prints all four side by side, inside the text column', async () => {
        const pictures = new Map([['g.jpg', PICTURE], ['g2.jpg', PICTURE], ['g3.jpg', PICTURE], ['g4.jpg', PICTURE]])
        const { pdf, log } = await drawn(() => blankListPdf({ restaurant: RESTAURANT, list: LIST, tree: bigList(), pictures, save: false }))
        const width = pdf.internal.pageSize.getWidth()
        const images = log.filter(l => l.name === 'addImage' && l.args[3] > 30)
        const rows = new Map()
        for (const { args, page } of images) {
            const key = `${page}:${args[3].toFixed(2)}`
            rows.set(key, [...(rows.get(key) || []), args])
        }
        const four = [...rows.values()].filter(r => r.length === 4)
        expect(four.length).toBeGreaterThan(0)
        for (const r of four) {
            for (let i = 1; i < r.length; i++) expect(r[i][2]).toBeGreaterThan(r[i - 1][2] + r[i - 1][4] - 0.01)
            expect(r[3][2] + r[3][4]).toBeLessThan(width - 15 - 58)
        }
    })
})
