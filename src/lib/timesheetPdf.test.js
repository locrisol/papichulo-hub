// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import {
    timesheetPdf, COL_WIDTH, SUMMARY_HEADS, HEAD_SIZE, HEAD_SPACING,
} from '@/lib/timesheetPdf'
import { personPeriod } from '@/lib/timesheet'
import { periodDates } from '@/lib/payPeriod'

// Proof that it builds at all.
//
// Nothing here checks what the page looks like, which a test cannot do
// honestly. It checks that a fortnight with everything in it goes all the way
// through and comes out as a PDF, which is the shape of risk a long function
// that draws in order carries: it would throw on the first thing out of place.
//
// jsPDF runs in jsdom, so this is the real library and the real drawing, not a
// stand in. Saving is the only part skipped.

const PERIOD = '2026-10-25'
const DATES = periodDates(PERIOD)

const shift = over => ({ kind: 'worked', ...over })

// Everything that can appear on one: a bank holiday worked, a split day, a
// comment, a trial, a training day, a sick day, unpaid leave, a holiday run
// and somebody who did nothing at all.
const people = personPeriod({
    people: [
        { id: 'e1', full_name: 'Aoife Byrne' },
        { id: 'e2', full_name: 'Cathal Nolan' },
        { id: 'e3', full_name: 'Niamh Walsh' },
    ],
    entries: [
        shift({ employee_id: 'e1', work_date: '2026-10-25', starts_at: '09:26:07', ends_at: '17:34:05', hours: 8.13 }),
        shift({ employee_id: 'e1', work_date: '2026-10-26', starts_at: '17:05:13', ends_at: '22:20:12', hours: 5.25 }),
        shift({ employee_id: 'e1', work_date: '2026-10-27', starts_at: '09:00:00', ends_at: '13:00:00', hours: 4 }),
        shift({ employee_id: 'e1', work_date: '2026-10-27', starts_at: '17:30:00', ends_at: '21:00:00', hours: 3.5 }),
        shift({
            employee_id: 'e1', work_date: '2026-11-03', starts_at: '09:00:00', ends_at: '15:00:00',
            hours: 6, note: 'Left early for the dentist, agreed on the day, and it is a long enough sentence to need wrapping on the page',
        }),
        shift({ employee_id: 'e2', work_date: '2026-10-30', kind: 'trial', starts_at: '17:00:00', ends_at: '22:00:00', hours: 5 }),
        shift({ employee_id: 'e2', work_date: '2026-11-05', kind: 'training', starts_at: '09:00:00', ends_at: '13:00:00', hours: 4 }),
    ],
    absences: [
        { employee_id: 'e1', kind: 'sick', status: 'approved', starts_on: '2026-10-28', ends_on: '2026-10-29' },
        { employee_id: 'e1', kind: 'unpaid', status: 'approved', starts_on: '2026-11-04', ends_on: '2026-11-04' },
        { employee_id: 'e3', kind: 'holiday', status: 'approved', starts_on: '2026-10-25', ends_on: '2026-11-07', hours: 70 },
    ],
    dates: DATES,
})

const restaurant = { name: 'Point Campus' }

describe('building the paper', () => {
    it('gets a whole pay period all the way through', async () => {
        const doc = await timesheetPdf({ restaurant, periodStart: PERIOD, people, save: false })
        expect(doc).toBeTruthy()
    })

    // Somebody on holiday the whole fortnight has no days at all, which is the
    // one that would walk off the end of an empty list.
    it('copes with a person who worked none of it', async () => {
        const away = people.filter(p => p.name === 'Niamh Walsh')
        expect(away).toHaveLength(1)
        await expect(timesheetPdf({ restaurant, periodStart: PERIOD, people: away, save: false }))
            .resolves.toBeTruthy()
    })

    it('builds a period with nobody on it', async () => {
        await expect(timesheetPdf({ restaurant, periodStart: PERIOD, people: [], save: false }))
            .resolves.toBeTruthy()
    })

    it('does not fall over without a restaurant name', async () => {
        await expect(timesheetPdf({ periodStart: PERIOD, people, save: false }))
            .resolves.toBeTruthy()
    })

    // A long team runs past one page, and the page top is drawn again.
    it('runs onto more than one page for a long team', async () => {
        const many = Array.from({ length: 14 }, (_, i) => ({ ...people[0], name: `Person ${i}` }))
        const doc = await timesheetPdf({ restaurant, periodStart: PERIOD, people: many, save: false })
        expect(doc.getNumberOfPages()).toBeGreaterThan(1)
    })
})

// What jsPDF has actually drawn, read back off the page. The text sits in the
// content stream as (...)Tj, so a name that was printed can be found and one
// that was not cannot.
function drawnOn(doc, page) {
    return String(doc.internal.pages[page] || '')
}

// He found this on a printed page: HOURS WORKED, BANK HOLIDAY and HOLIDAY ran
// into one another and the last of them hung off the end of the dark band,
// because the columns were 24, 24, 28, 22 and 18 while the headings are all
// about the same length. Measured here rather than found again.
describe('the summary headings fit their own columns', () => {
    it.each(SUMMARY_HEADS)('%s', async label => {
        const JsPDF = (await import('jspdf')).default
        const pdf = new JsPDF({ unit: 'mm', format: 'a4' })
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(HEAD_SIZE)

        // charSpace is added per character on top of the measured width.
        const width = pdf.getTextWidth(label) + label.length * HEAD_SPACING
        // Two millimetres of padding on the right, and a millimetre of air on
        // the left so two headings never touch.
        expect(width).toBeLessThan(COL_WIDTH - 3)
    })
})

describe('a person is kept in one piece', () => {
    // The rule the stock take and the allergen sheets already follow. Two days
    // stranded at the foot of a page, with the name overleaf, is a page nobody
    // can file.
    it('starts somebody on a fresh page rather than splitting them', async () => {
        // Eight people who each take well over a third of a page, so the
        // breaks have to fall between them rather than through one.
        const team = Array.from({ length: 8 }, (_, i) => ({ ...people[0], name: `Person${i}` }))
        const doc = await timesheetPdf({ restaurant, periodStart: PERIOD, people: team, save: false })

        // It really does run over several pages, or the check below proves
        // nothing at all.
        expect(doc.getNumberOfPages()).toBeGreaterThan(2)
        for (let page = 1; page <= doc.getNumberOfPages(); page++) {
            expect(drawnOn(doc, page)).not.toContain('continued')
        }
    })

    // Somebody with a full fortnight can be taller than a whole page. Then it
    // does run on, and says whose it is at the top.
    it('says whose page it is when one person will not fit on any page', async () => {
        const huge = {
            ...people[0],
            name: 'Someone Long',
            days: Array.from({ length: 40 }, (_, i) => ({
                ...people[0].days[0],
                date: '2026-10-25',
                week: i < 20 ? 0 : 1,
                notes: ['A sentence about this day, long enough to take a line of its own'],
            })),
        }
        const doc = await timesheetPdf({ restaurant, periodStart: PERIOD, people: [huge], save: false })
        const all = Array.from({ length: doc.getNumberOfPages() }, (_, i) => drawnOn(doc, i + 1)).join('')
        expect(all).toContain('continued')
    })
})
