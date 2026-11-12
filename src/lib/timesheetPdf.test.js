// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import {
    timesheetPdf, COL_WIDTHS, SUMMARY_HEADS, NAME_HEAD, HEAD_SIZE, HEAD_SPACING,
} from '@/lib/timesheetPdf'
import { personPeriod } from '@/lib/timesheet'
import { periodDates } from '@/lib/payPeriod'
import { permissionList } from '@/lib/workRules'

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
    // The one column that is not a figure, and not centred either: a list of
    // names reads down the left, not down the middle.
    it('calls the first column what it holds', () => {
        expect(NAME_HEAD).toBe('NAME')
    })

    it('has a width for every heading', () => {
        expect(COL_WIDTHS).toHaveLength(SUMMARY_HEADS.length)
    })

    it.each(SUMMARY_HEADS.map((label, i) => [label, COL_WIDTHS[i]]))('%s', async (label, column) => {
        const JsPDF = (await import('jspdf')).default
        const pdf = new JsPDF({ unit: 'mm', format: 'a4' })
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(HEAD_SIZE)

        // charSpace is added per character on top of the measured width.
        const width = pdf.getTextWidth(label) + label.length * HEAD_SPACING
        // Two millimetres of padding on the right, and a millimetre of air on
        // the left so two headings never touch.
        expect(width).toBeLessThan(column - 3)
    })
})

// Worked nine to three and went home sick. The summary used to say a whole day
// sick beside six worked hours, and no day on the page said which one.
describe('a day somebody went home sick part way through', () => {
    it('says part of the day beside the times, and never a whole day', async () => {
        const mine = personPeriod({
            people: [{ id: 'e1', full_name: 'Aoife Byrne' }],
            entries: [shift({ employee_id: 'e1', work_date: '2026-11-03', starts_at: '09:00:00', ends_at: '15:00:00', hours: 6 })],
            absences: [{
                employee_id: 'e1', kind: 'sick', status: 'approved',
                starts_on: '2026-11-03', ends_on: '2026-11-03', can_work_to: '15:00:00',
            }],
            dates: DATES,
        })
        const doc = await timesheetPdf({ restaurant, periodStart: PERIOD, people: mine, save: false })
        const all = Array.from({ length: doc.getNumberOfPages() }, (_, i) => drawnOn(doc, i + 1)).join('')

        expect(all).toContain('OFF SICK, PART OF THE DAY')
        expect(all).toContain('1 PART DAY SICK')
        expect(all).not.toContain('1 DAY SICK')
    })
})

// A clock in with no clock out holds the send, but the paper can still be
// downloaded, and a day must not drop off it as if nobody had worked.
describe('a clock in with no clock out', () => {
    it('is on the page, saying the clock out is missing', async () => {
        const mine = personPeriod({
            people: [{ id: 'e1', full_name: 'Aoife Byrne' }],
            entries: [shift({ employee_id: 'e1', work_date: '2026-10-28', starts_at: '09:00:00', ends_at: null, hours: null })],
            absences: [],
            dates: DATES,
        })
        const doc = await timesheetPdf({ restaurant, periodStart: PERIOD, people: mine, save: false })
        const all = Array.from({ length: doc.getNumberOfPages() }, (_, i) => drawnOn(doc, i + 1)).join('')

        expect(all).toContain('Clock in 09:00:00, no clock out')
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

// His, 1 November 2026: everybody's permission to work, grouped, on the paper.
describe('permission to work on the paper', () => {
    it('builds with the list on it, every state included', async () => {
        const permissions = permissionList([
            { full_name: 'Aoife Byrne', work_permission: 'unrestricted' },
            { full_name: 'Cathal Nolan', work_permission: 'stamp2', work_permission_expires: '2026-10-01', permission_renewal_applied: '2026-09-20' },
            { full_name: 'Dara Walsh', work_permission: 'stamp2', work_permission_expires: '2026-10-01' },
            { full_name: 'Eimear Ryan', work_permission: 'stamp1g', work_permission_expires: '2026-12-10' },
            { full_name: 'Fionn Kelly', work_permission: '' },
        ], '2026-11-01')
        const pdf = await timesheetPdf({
            restaurant: { name: 'Point Campus' }, periodStart: PERIOD, people, permissions, today: '2026-11-01', save: false,
        })
        expect(pdf.getNumberOfPages()).toBeGreaterThan(0)
    })
})

// His, 9 November 2026: somebody from another restaurant is on the paper with
// her hours, marked in the summary and on her own band.
describe('somebody from another restaurant on the paper', () => {
    it('marks her in the summary, on her band and in the note', async () => {
        const mine = personPeriod({
            people: [{ id: 'e1', full_name: 'Aoife Byrne' }, { id: 'guest:Camila Valenzuela', full_name: 'Camila Valenzuela', guest: true }],
            entries: [
                shift({ employee_id: 'e1', work_date: '2026-10-28', starts_at: '09:00:00', ends_at: '15:00:00', hours: 6 }),
                shift({ employee_id: null, person_name: 'Camila Valenzuela', work_date: '2026-10-29', starts_at: '13:28:23', ends_at: '18:02:37', hours: 4.57 }),
            ],
            absences: [],
            dates: DATES,
        })
        const doc = await timesheetPdf({ restaurant, periodStart: PERIOD, people: mine, save: false })
        const all = Array.from({ length: doc.getNumberOfPages() }, (_, i) => drawnOn(doc, i + 1)).join('')

        expect(all).toContain('FROM ANOTHER RESTAURANT')
        expect(all).toContain('Camila Valenzuela, from another restaurant')
        expect(all).toContain('13:28:23 to 18:02:37')
        expect(all).toMatch(/is on another restaurant.s team and worked these hours here/)
    })

    it('says nothing about another restaurant when nobody is from one', async () => {
        const doc = await timesheetPdf({ restaurant, periodStart: PERIOD, people, save: false })
        const all = Array.from({ length: doc.getNumberOfPages() }, (_, i) => drawnOn(doc, i + 1)).join('')
        expect(all).not.toMatch(/another restaurant/i)
    })
})

// His, 9 November 2026: a week changed after an email carried it is "a
// bigger issue to remark on the report in PDF in red or a strong color".
// Aoife's Monday 3 November was 6 hours when week 1 of 1 to 14 November went
// on its own; it is 8 now. Cathal's Tuesday is gone since.
describe('what changed since an email carried a week', () => {
    const START = '2026-11-01'
    const team = [{ id: 'e1', full_name: 'Aoife Byrne' }, { id: 'e2', full_name: 'Cathal Nolan' }]
    const rows = hours => [
        shift({ employee_id: 'e1', work_date: '2026-11-02', starts_at: '09:00:00', ends_at: hours === 6 ? '15:00:00' : '17:00:00', hours, note: 'Stayed to cover the lunch rush' }),
        shift({ employee_id: 'e2', work_date: '2026-11-04', starts_at: '09:00:00', ends_at: '13:00:00', hours: 4 }),
    ]
    const now = personPeriod({ people: team, entries: rows(8).slice(0, 1), absences: [], dates: periodDates(START) })
    const changes = [
        {
            id: 'e1', name: 'Aoife Byrne', added: false, gone: false, figures: [{ field: 'worked', was: 6, now: 8 }],
            days: [{ date: '2026-11-02', was: { spans: [{ starts_at: '09:00:00', ends_at: '15:00:00', hours: 6 }], open: [], hours: 6 }, now: now[0].days[0] }],
        },
        {
            id: 'e2', name: 'Cathal Nolan', added: false, gone: true, figures: [{ field: 'worked', was: 4, now: 0 }],
            days: [{ date: '2026-11-04', was: { spans: [{ starts_at: '09:00:00', ends_at: '13:00:00', hours: 4 }], open: [], hours: 4 }, now: null }],
        },
    ]
    const alone = list => [{ week: 0, weekStart: START, scope: 'week', sentAt: '2026-11-09T10:12:00Z', changes: list }, null]
    const paper = async earlier => {
        const doc = await timesheetPdf({ restaurant, periodStart: START, people: now, save: false, earlier })
        return Array.from({ length: doc.getNumberOfPages() }, (_, i) => drawnOn(doc, i + 1))
    }

    it('starts page 1 with the red section, above the summary', async () => {
        const [first] = await paper(alone(changes))
        expect(first).toContain('WEEK 1 CHANGED AFTER IT WAS SENT')
        expect(first).toContain('WHAT CHANGED IN WEEK 1')
        expect(first.indexOf('WEEK 1 CHANGED AFTER IT WAS SENT')).toBeLessThan(first.indexOf('HOURS WORKED'))
        expect(first).toContain('When sent: 09:00:00 to 15:00:00, 6.00 h')
        expect(first).toContain('Now: 09:00:00 to 17:00:00, 8.00 h')
        expect(first).toContain('Comment: Stayed to cover the lunch rush')
        expect(first).toContain('Cathal Nolan, taken off since it was sent')
        // The red, 185 28 28, is what the pen is set to.
        expect(first).toContain('0.725 0.11 0.11 rg')
    })

    it('marks who changed in the summary, and the day in red with what it was', async () => {
        const all = (await paper(alone(changes))).join('')
        expect(all).toContain('WEEK 1 CHANGED')
        expect(all).toContain('When sent on 9 Nov: 09:00:00 to 15:00:00, 6.00 h')
    })

    it('draws a day that is gone with what it was', async () => {
        const mine = [{ ...changes[0], id: 'e1', gone: false, figures: [{ field: 'worked', was: 12, now: 8 }], days: [{ date: '2026-11-03', was: { spans: [{ starts_at: '10:00:00', ends_at: '14:00:00', hours: 4 }], open: [], hours: 4 }, now: null }] }]
        const all = (await paper(alone(mine))).join('')
        expect(all).toContain('Nothing now')
        expect(all).toContain('When sent on 9 Nov: 10:00:00 to 14:00:00, 4.00 h')
    })

    it('leaves the red out when nothing changed, and says week 1 is the same', async () => {
        const all = (await paper(alone([]))).join('')
        expect(all).not.toContain('CHANGED')
        expect(all).not.toContain('When sent')
        expect(all).toContain('Week 1 was emailed on its own on')
        expect(all).toContain('and has not changed since.')
    })

    it('says the pay period was sent before when it goes again', async () => {
        const again = [{ week: 0, weekStart: START, scope: 'period', sentAt: '2026-11-15T09:30:00Z', changes }, { week: 1, weekStart: '2026-11-08', scope: 'period', sentAt: '2026-11-15T09:30:00Z', changes: [] }]
        const [first] = await paper(again)
        expect(first).toContain('CHANGED AFTER THIS PAY PERIOD WAS SENT')
        expect(first).toContain('If the payroll has already been run')
        expect(first).toContain('WEEK 1, ')
    })
})
