import { describe, it, expect } from 'vitest'
import { shareName, weekTable, weekCsv, sheetLayout, wrapLines, AWAY } from './rosterShare'
import { ABSENCE_KINDS } from './absences'

const DATES = [
    '2026-08-23', '2026-08-24', '2026-08-25', '2026-08-26',
    '2026-08-27', '2026-08-28', '2026-08-29',
]
const employees = [
    { id: 'e1', full_name: 'Ana', hourly_rate: 12 },
    { id: 'e2', full_name: 'Bea', hourly_rate: 15 },
]
const shifts = [
    { id: 's1', employee_id: 'e1', shift_date: DATES[1], starts_at: '09:00', ends_at: '17:00', break_minutes: 30 },
    { id: 's2', employee_id: 'e1', shift_date: DATES[3], starts_at: '14:00', ends_at: '21:30', break_minutes: 30 },
    { id: 's3', employee_id: 'e2', shift_date: DATES[1], starts_at: '09:00', ends_at: '13:00', break_minutes: 0 },
]
const openingHours = {
    0: { open: '10:00', close: '21:00' },
    1: { open: '09:00', close: '21:00' },
    3: { open: '09:00', close: '21:00' },
}

const build = (extra = {}) => weekTable({
    dates: DATES,
    employees,
    shifts,
    dayNotes: [],
    events: [],
    openingHours,
    restaurantName: 'Point Campus',
    ...extra,
})

describe('shareName', () => {
    it('carries the week, so three in a chat are three weeks', () => {
        expect(shareName('Point Campus', '2026-08-23', 'png')).toBe('roster-point-campus-2026-08-23.png')
    })

    it('survives a name with punctuation in it', () => {
        expect(shareName("Papi Chulo, Dún Laoghaire!", '2026-08-23', 'pdf'))
            .toBe('roster-papi-chulo-d-n-laoghaire-2026-08-23.pdf')
    })

    it('has something to call itself with no name at all', () => {
        expect(shareName('', '2026-08-23', 'csv')).toBe('roster-roster-2026-08-23.csv')
    })
})

describe('weekTable', () => {
    it('gives one column per day and one row per person', () => {
        const t = build()
        expect(t.head).toHaveLength(7)
        expect(t.people).toHaveLength(2)
        expect(t.people[0].days).toHaveLength(7)
    })

    it('resolves the times rather than leaving that to whoever draws it', () => {
        const t = build()
        expect(t.people[0].days[1].shifts[0].text).toBe('09:00 – 17:00')
    })

    it('says Closing on a shift that runs past it, the same as the screen does', () => {
        // Wednesday closes at 21:00 and the shift runs to 21:30.
        const t = build()
        expect(t.people[0].days[3].shifts[0].end).toBe('Closing')
    })

    it('carries the breaks beside the times', () => {
        const t = build()
        expect(t.people[0].days[1].shifts[0].break).toBe('30 minutes')
        expect(t.people[1].days[1].shifts[0].break).toBe('No break')
    })

    it('leaves an empty day empty rather than putting a dash in a spreadsheet', () => {
        const t = build()
        expect(t.people[0].days[0].shifts).toEqual([])
    })

    it('marks the finish of a shift that closes the store, and not the start', () => {
        const t = build()
        const shift = t.people[0].days[3].shifts[0]
        expect(shift.closes).toBe(true)
        expect(shift.opens).toBe(false)
    })

    it('marks the start of a shift that opens the store', () => {
        // Monday opens at 09:00 and this one starts at 08:00.
        const t = build({
            shifts: [{
                id: 'x', employee_id: 'e1', shift_date: DATES[1],
                starts_at: '08:00', ends_at: '16:00', break_minutes: 30,
            }],
        })
        const shift = t.people[0].days[1].shifts[0]
        expect(shift.opens).toBe(true)
        expect(shift.closes).toBe(false)
    })

    it('marks both ends of a shift that opens and closes', () => {
        const t = build({
            shifts: [{
                id: 'x', employee_id: 'e1', shift_date: DATES[1],
                starts_at: '08:00', ends_at: '22:00', break_minutes: 60,
            }],
        })
        const shift = t.people[0].days[1].shifts[0]
        expect(shift.opens).toBe(true)
        expect(shift.closes).toBe(true)
    })

    it('marks neither end of an ordinary shift', () => {
        const t = build()
        const shift = t.people[0].days[1].shifts[0]
        expect(shift.opens).toBe(false)
        expect(shift.closes).toBe(false)
    })

    it('reads the store hours off the day', () => {
        const t = build()
        expect(t.storeHours[0]).toBe('10:00 to 21:00')
        expect(t.storeHours[2]).toBe('')
    })

    it('says a closed day is closed', () => {
        const t = build({ dayNotes: [{ note_date: DATES[2], is_closed: true }] })
        expect(t.storeHours[2]).toBe('Closed')
    })

    it('puts what is on beside the day, with the doors time', () => {
        const t = build({
            events: [{ id: 'v1', event_date: DATES[4], name: 'Westlife', event_time: '18:00:00' }],
        })
        expect(t.whatIsOn[4]).toBe('Westlife (18:00)')
    })

    it('runs two events on one day together rather than losing one', () => {
        const t = build({
            events: [
                { id: 'v1', event_date: DATES[4], name: 'One', event_time: '13:00:00' },
                { id: 'v2', event_date: DATES[4], name: 'Two', event_time: '19:00:00' },
            ],
        })
        expect(t.whatIsOn[4]).toBe('One (13:00), Two (19:00)')
    })

    it('adds each person and each day up', () => {
        const t = build()
        expect(t.people[0].hours).toBe('15.50')
        expect(t.people[1].hours).toBe('4.00')
        expect(t.dayHours[1]).toBe('12.00')
        expect(t.totalHours).toBe('19.50')
    })

    it('carries the labels and the messages', () => {
        const t = build({
            dayNotes: [{ note_date: DATES[6], note: 'Deep Cleaning Day', message: 'Bring your own mop' }],
        })
        expect(t.notes[6]).toBe('Deep Cleaning Day')
        expect(t.messages).toEqual(['29 Aug: Bring your own mop'])
    })

    it('copes with a week nobody is working', () => {
        const t = weekTable({ dates: DATES, employees: [], shifts: [], openingHours })
        expect(t.people).toEqual([])
        expect(t.totalHours).toBe('0.00')
    })
})

describe('weekCsv', () => {
    it('gives a row per person and a row of breaks under it', () => {
        const lines = weekCsv(build()).split('\n')
        expect(lines[4]).toContain('Ana')
        expect(lines[5]).toContain('Breaks')
    })

    it('starts with the days and their dates', () => {
        const lines = weekCsv(build()).split('\n')
        expect(lines[0]).toContain('Point Campus')
        expect(lines[0]).toContain('Sun')
        expect(lines[0]).toContain('Hours')
        expect(lines[1]).toContain('23/08/2026')
    })

    it('quotes anything with a comma in it, or the columns shift', () => {
        const table = build({
            events: [
                { id: 'v1', event_date: DATES[4], name: 'One', event_time: '13:00:00' },
                { id: 'v2', event_date: DATES[4], name: 'Two', event_time: '19:00:00' },
            ],
        })
        const line = weekCsv(table).split('\n').find(l => l.startsWith('What is on'))
        expect(line).toContain('"One (13:00), Two (19:00)"')
    })

    it('doubles a quote inside a value rather than ending the field', () => {
        const table = build({ dayNotes: [{ note_date: DATES[0], note: 'The "big" clean' }] })
        const line = weekCsv(table).split('\n').find(l => l.startsWith('Notes'))
        expect(line).toContain('"The ""big"" clean"')
    })

    it('runs two shifts on one day together in one cell', () => {
        const table = build({
            shifts: [
                ...shifts,
                { id: 's4', employee_id: 'e1', shift_date: DATES[1], starts_at: '18:00', ends_at: '21:00', break_minutes: 0 },
            ],
        })
        const line = weekCsv(table).split('\n').find(l => l.startsWith('Ana'))
        expect(line).toContain('09:00 – 17:00 / 18:00 – 21:00')
    })

    it('ends with the totals', () => {
        const lines = weekCsv(build()).split('\n')
        const totals = lines.find(l => l.startsWith('Hours on the day'))
        expect(totals).toContain('19.50')
    })
})

describe('sheetLayout', () => {
    it('gives every day the same width', () => {
        const l = sheetLayout(build())
        const widths = [0, 1, 2, 3, 4, 5, 6].map(i => l.columnX(i + 1) - l.columnX(i))
        for (const w of widths) expect(w).toBeCloseTo(l.dayCol, 6)
    })

    it('leaves the name and hours columns out of the seven', () => {
        const l = sheetLayout(build(), { width: 1500, pad: 28 })
        expect(l.columnX(0)).toBe(28 + l.nameCol)
        expect(l.columnX(7)).toBeCloseTo(l.hoursX, 6)
    })

    it('puts the hours down the middle of their own column rather than at the edge', () => {
        const l = sheetLayout(build(), { width: 1500, pad: 28 })
        expect(l.hoursCentreX).toBeCloseTo(l.hoursX + l.hoursCol / 2, 6)
    })

    it('makes the events row taller when a day needs more than one line', () => {
        const one = sheetLayout(build(), { eventLines: 1 })
        const three = sheetLayout(build(), { eventLines: 3 })
        expect(three.eventsH).toBeGreaterThan(one.eventsH)
        expect(three.height - one.height).toBe(three.eventsH - one.eventsH)
    })

    it('grows with the number of people', () => {
        const one = sheetLayout(weekTable({
            dates: DATES, employees: [employees[0]], shifts, openingHours,
        }))
        const two = sheetLayout(build())
        expect(two.height).toBeGreaterThan(one.height)
        expect(two.height - one.height).toBe(one.shiftH + one.breakH)
    })

    it('makes room for the messages only when there are some', () => {
        const without = sheetLayout(build())
        const with_ = sheetLayout(build({
            dayNotes: [{ note_date: DATES[0], message: 'Something' }],
        }))
        expect(without.messagesH).toBe(0)
        expect(with_.height).toBeGreaterThan(without.height)
    })
})

describe('wrapLines', () => {
    // A ruler that counts characters, so the wrapping can be tested without a
    // canvas or a PDF to measure with.
    const chars = t => t.length

    it('leaves something that fits on one line', () => {
        expect(wrapLines('Westlife', 20, chars)).toEqual(['Westlife'])
    })

    it('breaks at a space rather than mid word', () => {
        expect(wrapLines('The Rock Orchestra', 10, chars)).toEqual(['The Rock', 'Orchestra'])
    })

    it('keeps going over as many lines as it needs', () => {
        const out = wrapLines('One Two Three Four Five Six', 9, chars)
        expect(out).toEqual(['One Two', 'Three', 'Four Five', 'Six'])
        expect(out.join(' ')).toBe('One Two Three Four Five Six')
    })

    it('lets a single long word overflow rather than cutting it in half', () => {
        expect(wrapLines('Supercalifragilistic', 8, chars)).toEqual(['Supercalifragilistic'])
    })

    it('has nothing to wrap when there is nothing there', () => {
        expect(wrapLines('', 10, chars)).toEqual([])
        expect(wrapLines(null, 10, chars)).toEqual([])
        expect(wrapLines('   ', 10, chars)).toEqual([])
    })

    it('loses no words on the way through', () => {
        const text = 'Diljit Dosanjh Aura World Tour (18:30), KATSEYE (18:00)'
        expect(wrapLines(text, 14, chars).join(' ')).toBe(text)
    })
})

// What goes out and what does not.
//
// The manager building the week sees whether somebody is on holiday, off sick
// or at the other restaurant. Nothing that leaves the building says which, and
// this is the one place that boundary is drawn, so it is the one place worth
// holding down with tests.
describe('time off on a shared week', () => {
    const away = [{
        id: 'a1', employee_id: 'e1', kind: 'sick',
        starts_on: DATES[2], ends_on: DATES[3], status: 'approved',
    }]

    it('marks the days somebody is not about', () => {
        const table = build({ absences: away })
        const ana = table.people.find(p => p.name === 'Ana')
        expect(ana.days.map(d => d.away)).toEqual([false, false, true, true, false, false, false])
    })

    it('leaves everybody else alone', () => {
        const table = build({ absences: away })
        const bea = table.people.find(p => p.name === 'Bea')
        expect(bea.days.some(d => d.away)).toBe(false)
    })

    it('says nothing when there is no time off', () => {
        const table = build({ absences: [] })
        expect(table.people.every(p => p.days.every(d => d.away === false))).toBe(true)
    })

    it('ignores time off that was turned down', () => {
        const declined = [{ ...away[0], status: 'declined' }]
        const table = build({ absences: declined })
        expect(table.people.flatMap(p => p.days).filter(d => d.away)).toEqual([])
    })

    // The one that matters. Every kind has to be unreachable from the shape the
    // picture, the PDF and the spreadsheet are all drawn from, whatever any of
    // them decides to print.
    it('never carries the reason, whatever the kind is', () => {
        for (const kind of ABSENCE_KINDS) {
            const table = build({ absences: [{ ...away[0], kind: kind.value }] })
            const printed = JSON.stringify(table)
            expect(printed).not.toContain(kind.label)
            expect(printed).not.toContain(kind.value)
        }
    })

    it('says it in the spreadsheet without saying why', () => {
        const csv = weekCsv(build({ absences: away }))
        expect(csv).toContain(AWAY.label)
        expect(csv).not.toContain('sick')
    })

    // A shift on a day somebody is down as away is still a shift, and the
    // printed copy has to show it or the roster and the wall disagree.
    it('keeps a shift rostered on a day they are away', () => {
        const clash = [{ ...away[0], starts_on: DATES[1], ends_on: DATES[1] }]
        const csv = weekCsv(build({ absences: clash }))
        expect(csv).toContain('09:00')
        expect(csv).toContain(AWAY.label)
    })
})
