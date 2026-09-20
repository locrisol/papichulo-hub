import { describe, it, expect } from 'vitest'
import {
    shareName, weekTable, sheetLayout, wrapLines,
} from '@/lib/rosterShare'
import { ABSENCE_KINDS } from '@/lib/absences'

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
        expect(t.people[0].days[1].shifts[0].text).toBe('09:00 - 17:00')
    })

    it('says Closing on a shift that runs past it, the same as the screen does', () => {
        // Wednesday closes at 21:00 and the shift runs to 21:30.
        const t = build()
        expect(t.people[0].days[3].shifts[0].end).toBe('Closing')
    })

    // On the day rather than on each shift, the same as the screen. A split
    // day where neither stretch earns one printed No break twice, which is one
    // fact said twice.
    it('carries the breaks on the day', () => {
        const t = build()
        expect(t.people[0].days[1].breaks).toEqual(['30 minutes'])
        expect(t.people[1].days[1].breaks).toEqual(['No break'])
    })

    it('says No break once for a split day that earns none', () => {
        const split = [
            { id: 'a', employee_id: 'e1', shift_date: DATES[1], starts_at: '09:00', ends_at: '13:00', break_minutes: 0 },
            { id: 'b', employee_id: 'e1', shift_date: DATES[1], starts_at: '17:30', ends_at: '21:00', break_minutes: 0 },
        ]
        const t = build({ shifts: split })
        expect(t.people[0].days[1].breaks).toEqual(['No break'])
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

    // Next door joins the same row the catering and the deliveries are on,
    // rather than having a band of its own in the app's orange above them.
    // Two lists of the same thing, one of them wearing catering's colour.
    it('puts what is on next door beside the day, with the place', () => {
        const t = build({
            nearby: [{
                kind: 'arena',
                time: '18:00',
                place: { id: 'p1', name: '3Arena' },
                event: { id: 'v1', event_date: DATES[4], name: 'Westlife', event_time: '18:00:00' },
            }],
        })
        expect(t.extras[4]).toEqual([
            { name: 'Westlife, 3Arena', time: '18:00', kind: 'arena', checked: true },
        ])
    })

    it('runs two on one day together rather than losing one', () => {
        const t = build({
            nearby: [
                {
                    kind: 'nearby',
                    time: '13:00',
                    place: { id: 'p1', name: 'Odeon' },
                    event: { id: 'v1', event_date: DATES[4], name: 'One', event_time: '13:00:00' },
                },
                {
                    kind: 'nearby',
                    time: '19:00',
                    place: { id: 'p1', name: 'Odeon' },
                    event: { id: 'v2', event_date: DATES[4], name: 'Two', event_time: '19:00:00' },
                },
            ],
        })
        expect(t.extras[4].map(e => `${e.time} ${e.name}`))
            .toEqual(['13:00 One, Odeon', '19:00 Two, Odeon'])
    })

    // A market over three weekends is one row, and drawing it on the first day
    // only would be a lie about it.
    it('draws a run of days on every day it covers', () => {
        const t = build({
            nearby: [{
                kind: 'nearby',
                time: '',
                place: { id: 'p1', name: 'Point Square' },
                event: {
                    id: 'v1', name: 'Christmas market',
                    event_date: DATES[1], ends_on: DATES[3],
                },
            }],
        })
        expect(t.extras.map(list => list.length)).toEqual([0, 1, 1, 1, 0, 0, 0])
    })

    // Marked rather than held back, the same as on screen.
    it('marks one nobody has checked', () => {
        const t = build({
            nearby: [{
                kind: 'nearby',
                time: '',
                checked: false,
                place: { id: 'p1', name: 'Pavilion' },
                event: { id: 'v1', name: 'Pentangle', event_date: DATES[4] },
            }],
        })
        expect(t.extras[4][0].checked).toBe(false)
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

    // One band now rather than two, so the one that grows is this one.
    it('makes the row taller when a day needs more than one line', () => {
        const withOne = build({ dayNotes: [{ note_date: DATES[0], extras: [{ name: 'Feedr', time: '12:00' }] }] })
        const one = sheetLayout(withOne, { deliveryLines: 1 })
        const three = sheetLayout(withOne, { deliveryLines: 3 })
        expect(three.deliveriesH).toBeGreaterThan(one.deliveriesH)
        expect(three.height - one.height).toBe(three.deliveriesH - one.deliveriesH)
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

    it('counts a day they never work as one they are not about', () => {
        // The screen has always hatched these. The sheet and the picture knew
        // only about time off, so a day somebody does not work came out blank
        // and read as a day nobody had got round to filling in.
        const table = build({
            employees: [{ ...employees[0], availability: { 0: [], 2: [] } }, employees[1]],
            today: DATES[0],
        })
        const ana = table.people.find(p => p.name === 'Ana')
        expect(ana.days.map(d => d.away)).toEqual([true, false, true, false, false, false, false])
    })

    it('leaves a day they work part of alone', () => {
        // Somebody who can only do afternoons is in that afternoon. Marking the
        // whole day would say they were not there at all.
        const table = build({
            employees: [{ ...employees[0], availability: { 0: [['15:00', '21:00']] } }, employees[1]],
            today: DATES[0],
        })
        const ana = table.people.find(p => p.name === 'Ana')
        expect(ana.days.some(d => d.away)).toBe(false)
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
            // The days are where a reason could hide, and they are all it is
            // ever handed. Checked here rather than over the whole table,
            // because the table also carries a holiday hours column that is
            // asked for and is a number rather than a reason.
            const printed = JSON.stringify(table.people.flatMap(p => p.days))
            expect(printed).not.toContain(kind.label)
            expect(printed).not.toContain(kind.value)
        }
    })

    // Whatever a day carries, it is these and nothing else. A new field with a
    // reason in it would have to get past this line first.
    it('gives a day nothing but the date, the shifts and away', () => {
        const table = build({ absences: away })
        for (const day of table.people.flatMap(p => p.days)) {
            expect(Object.keys(day).sort()).toEqual(['away', 'breaks', 'date', 'shifts'])
        }
    })


    // A shift on a day somebody is down as away is still a shift, and the
    // printed copy has to show it or the roster and the wall disagree.

})

// What Excel does with the file, which is not the same question as what is in
// it. A week came back with a name mangled and every shift reading a stray
// symbol where the dash should be, and none of that was in the string.
// The other things a day has on, and the line at the bottom of every roster.
describe('deliveries and the standing note', () => {
    const notes = [{
        id: 'n1', note_date: DATES[1],
        extras: [{ name: 'Clockmeal', time: '15:00' }, { name: 'Feedr', time: '12:00' }],
    }]

    // One entry each rather than one string. Joined, Feedr and Clockmeal came
    // out on the same line of the picture and only broke where the column ran
    // out, which had nothing to do with where one ended and the next began.
    it('puts them on the day in the order they land, one each', () => {
        const table = build({ dayNotes: notes })
        expect(table.deliveries[1]).toEqual(['12:00 Feedr', '15:00 Clockmeal'])
    })

    it('leaves the other days empty', () => {
        const table = build({ dayNotes: notes })
        expect(table.deliveries[0]).toEqual([])
    })

    it('keeps one with no time, at the end', () => {
        const loose = [{
            id: 'n1', note_date: DATES[1],
            extras: [{ name: 'Office delivery' }, { name: 'Feedr', time: '12:00' }],
        }]
        expect(build({ dayNotes: loose }).deliveries[1]).toEqual(['12:00 Feedr', 'Office delivery'])
    })


    // The sheet is a fixed height worked out before anything is drawn, so a
    // week with no deliveries has to come out shorter rather than carrying an
    // empty band.
    it('takes no room on the sheet when no day has one', () => {
        expect(sheetLayout(build()).deliveriesH).toBe(0)
        expect(sheetLayout(build({ dayNotes: notes })).deliveriesH).toBeGreaterThan(0)
    })

    // Apart from the day messages rather than in with them. They are about this
    // week and it is not, and one list would make it read as one more thing
    // that happened.
    it('keeps the standing note apart from the day messages', () => {
        const table = build({
            dayNotes: [{ id: 'n1', note_date: DATES[1], message: 'Back door this week' }],
            standingNote: 'Swaps have to be agreed with a manager.',
        })
        expect(table.messages).toHaveLength(1)
        expect(table.standing).toBe('Swaps have to be agreed with a manager.')
    })

    it('is empty rather than missing when there is none', () => {
        expect(build().standing).toBe('')
        expect(build({ standingNote: '   ' }).standing).toBe('')
    })

})

// The holiday column, which is only there in a week that needs one.
describe('holiday hours on a shared week', () => {
    const holiday = employeeId => ([{
        id: 'a1', employee_id: employeeId, kind: 'holiday', hours: 20,
        starts_on: DATES[1], ends_on: DATES[5], status: 'approved',
    }])

    it('is not there at all in an ordinary week', () => {
        const table = build()
        expect(table.anyHoliday).toBe(false)
        expect(table.people.every(p => p.holiday === '')).toBe(true)
        expect(sheetLayout(table).holidayCol).toBe(0)
    })

    it('appears when somebody has some', () => {
        const table = build({ absences: holiday('e1') })
        expect(table.anyHoliday).toBe(true)
        expect(sheetLayout(table).holidayCol).toBeGreaterThan(0)
    })

    it('puts the hours against the right person and nobody else', () => {
        const table = build({ absences: holiday('e1') })
        expect(table.people.find(p => p.name === 'Ana').holiday).toBe('20.00')
        expect(table.people.find(p => p.name === 'Bea').holiday).toBe('')
    })

    // The column comes out of the seven days rather than off the edge of the
    // sheet, or a week with holiday in it would be wider than one without.
    it('takes its width out of the days', () => {
        const plain = sheetLayout(build())
        const withHoliday = sheetLayout(build({ absences: holiday('e1') }))
        expect(withHoliday.width).toBe(plain.width)
        expect(withHoliday.dayCol).toBeLessThan(plain.dayCol)
    })

})

describe('what is on reaches the shared week', () => {
    const catering = {
        id: 'c1', kind: 'catering', title: 'Trinity dept lunch', scope: 'sites',
        starts_on: DATES[2], ends_on: null, starts_at: '12:00:00', status: 'confirmed',
    }
    const promotion = {
        id: 'p1', kind: 'promotion', title: '15% off wraps', scope: 'all_sites',
        starts_on: DATES[0], ends_on: DATES[2], starts_at: null, status: 'confirmed',
    }

    // A week printed and pinned up that leaves the catering off is worse than
    // one that never had it.
    it('puts a catering job on its day, with the kind in front of the name', () => {
        const t = build({ diary: [catering] })
        expect(t.deliveries[2]).toContain('12:00 Catering (Trinity dept lunch)')
        expect(t.deliveries[1]).toEqual([])
    })

    // One thing, drawn once. It used to repeat on each day it covered, because
    // a flat sheet had no band to draw, and now both sheets draw one.
    it('draws something running several days as one band', () => {
        const t = build({ diary: [promotion] })
        expect(t.bands).toHaveLength(1)
        expect(t.bands[0]).toMatchObject({
            label: 'Promotion (15% off wraps)', kind: 'promotion', start: 0, span: 3,
        })
        expect(t.deliveries[0]).toEqual([])
        expect(t.deliveries[2]).toEqual([])
    })

    it('leaves a one day thing as a chip rather than a band of one column', () => {
        const t = build({ diary: [catering] })
        expect(t.bands).toEqual([])
        expect(t.deliveries[2]).toContain('12:00 Catering (Trinity dept lunch)')
    })

    // A bar clipped at the edge of the sheet cannot say on its own that it
    // began before the week or carries on after it.
    it('says when one began before the week or runs past it', () => {
        const long = { ...promotion, starts_on: '2026-08-01', ends_on: '2026-12-01' }
        const t = build({ diary: [long] })
        expect(t.bands[0]).toMatchObject({ start: 0, span: 7, runsIn: true, runsOn: true })
    })

    it('gives the sheet no band row to draw when the week has none', () => {
        expect(build().bands).toEqual([])
    })

    // The kind rides along so a card can be drawn in the colour it has on
    // screen. Every card on this band used to be slate, so a catering job and
    // a Feedr drop looked identical on the one copy that gets pinned up.
    it('keeps the time and the name apart for the sheet, the way deliveries are', () => {
        const t = build({ diary: [catering] })
        expect(t.extras[2][0]).toEqual({
            name: 'Catering (Trinity dept lunch)', time: '12:00', kind: 'catering',
        })
    })

    it('tells a delivery apart from a catering job by its kind', () => {
        const t = build({
            diary: [catering],
            dayNotes: [{ note_date: DATES[2], extras: [{ name: 'Feedr', time: '13:00' }] }],
        })
        expect(t.extras[2].map(e => e.kind)).toEqual(['catering', 'delivery'])
    })

    // The form promises nobody else sees a private one, and a printed week
    // pinned to a wall is about as seen as anything gets.
    it('never shares a private entry', () => {
        const t = build({ diary: [{ ...catering, scope: 'private' }] })
        expect(t.deliveries[2]).toEqual([])
    })

    it('leaves a cancelled one off too, since nobody is needed for it', () => {
        const t = build({ diary: [{ ...catering, status: 'cancelled' }] })
        expect(t.deliveries[2]).toEqual([])
    })

    it('puts what is on before the deliveries, the same order the screen uses', () => {
        const notes = [{ note_date: DATES[2], extras: [{ name: 'Feedr', time: '12:00' }] }]
        const t = build({ diary: [catering], dayNotes: notes })
        expect(t.deliveries[2][0]).toContain('Catering')
        expect(t.deliveries[2][1]).toContain('Feedr')
    })

    it('changes nothing at all on a week with no diary', () => {
        expect(build().deliveries.every(d => Array.isArray(d))).toBe(true)
    })
})

describe('a label on a band', () => {
    const promotion = {
        id: 'p1', kind: 'promotion', title: '15% off wraps', scope: 'all_sites',
        starts_on: DATES[0], ends_on: DATES[2], starts_at: null, status: 'confirmed',
    }

    // A band runs across days and has the width. The chip on a single day does
    // not, and there the name is the part that has to survive being cut.
    it('rides on the band, after the name', () => {
        const t = build({ diary: [{ ...promotion, labels: ['Students'] }] })
        expect(t.bands[0].label).toBe('Promotion (15% off wraps) [Students]')
    })

    it('leaves the band alone when there are none', () => {
        expect(build({ diary: [promotion] }).bands[0].label)
            .toBe('Promotion (15% off wraps)')
    })
})
