import { describe, it, expect } from 'vitest'
import {
    windowOf, isWholeShift, weekAfter, hoursFor, hoursChange, shortlist, gapTo,
    waitingOn, requestsOnShift, writesFor, newFindings,
} from './shiftRequests'

const WED = '2026-08-26'
const THU = '2026-08-27'

const shift = (id, employee_id, shift_date, starts_at, ends_at, extra = {}) => ({
    id, employee_id, shift_date, starts_at, ends_at, break_minutes: 0, ...extra,
})

// Ana works Wednesday nine to nine. Ben is on the Wednesday morning only.
const WEEK = [
    shift('s1', 'ana', WED, '09:00', '21:00'),
    shift('s2', 'ben', WED, '09:00', '15:00'),
    shift('s3', 'ben', THU, '09:00', '17:00'),
]

describe('windowOf', () => {
    it('is the whole shift when no times are written on it', () => {
        expect(windowOf(WEEK[0], null, null)).toEqual({ from: '09:00', to: '21:00' })
    })

    it('is the times when there are times', () => {
        expect(windowOf(WEEK[0], '15:00', '21:00')).toEqual({ from: '15:00', to: '21:00' })
    })
})

describe('isWholeShift', () => {
    it('knows the whole of one', () => {
        expect(isWholeShift(WEEK[0], null, null)).toBe(true)
        expect(isWholeShift(WEEK[0], '09:00', '21:00')).toBe(true)
    })

    it('knows part of one', () => {
        expect(isWholeShift(WEEK[0], '15:00', '21:00')).toBe(false)
    })
})

describe('weekAfter', () => {
    it('hands a whole shift over as one change of name', () => {
        const request = {
            from_employee_id: 'ana', to_employee_id: 'ben', give_shift_id: 's1',
        }
        const { shifts, removedIds } = weekAfter(request, WEEK)
        const moved = shifts.filter(s => s.employee_id === 'ben' && s.shift_date === WED)

        // Nine to nine and nine to three meet, so Ben has one shift and not two.
        expect(moved).toHaveLength(1)
        expect(moved[0].starts_at).toBe('09:00')
        expect(moved[0].ends_at).toBe('21:00')
        expect(shifts.some(s => s.employee_id === 'ana')).toBe(false)
        expect(removedIds).toHaveLength(1)
    })

    it('leaves the asker with the half they kept', () => {
        const request = {
            from_employee_id: 'ana', to_employee_id: 'ben',
            give_shift_id: 's1', give_from: '15:00', give_to: '21:00',
        }
        const { shifts } = weekAfter(request, WEEK)
        const ana = shifts.filter(s => s.employee_id === 'ana')

        expect(ana).toHaveLength(1)
        expect(ana[0].starts_at).toBe('09:00')
        expect(ana[0].ends_at).toBe('15:00')
    })

    it('joins the evening onto the morning the taker already had', () => {
        const request = {
            from_employee_id: 'ana', to_employee_id: 'ben',
            give_shift_id: 's1', give_from: '15:00', give_to: '21:00',
        }
        const { shifts } = weekAfter(request, WEEK)
        const ben = shifts.filter(s => s.employee_id === 'ben' && s.shift_date === WED)

        expect(ben).toHaveLength(1)
        expect(ben[0].starts_at).toBe('09:00')
        expect(ben[0].ends_at).toBe('21:00')
    })

    it('works the break out again for the joined shift', () => {
        const request = {
            from_employee_id: 'ana', to_employee_id: 'ben',
            give_shift_id: 's1', give_from: '15:00', give_to: '21:00',
        }
        const { shifts } = weekAfter(request, WEEK)
        const ben = shifts.find(s => s.employee_id === 'ben' && s.shift_date === WED)

        // Twelve hours as one shift, so the full hour rather than the two
        // half day breaks the same hours were earning apart.
        expect(ben.break_minutes).toBe(60)
        expect(ben.break_is_manual).toBe(false)
    })

    it('does not join two shifts that do not meet', () => {
        const week = [
            shift('s1', 'ana', WED, '17:00', '21:00'),
            shift('s2', 'ben', WED, '09:00', '13:00'),
        ]
        const request = { from_employee_id: 'ana', to_employee_id: 'ben', give_shift_id: 's1' }
        const { shifts } = weekAfter(request, week)

        expect(shifts.filter(s => s.employee_id === 'ben')).toHaveLength(2)
    })

    it('splits a shift when the middle of it is given away', () => {
        const week = [shift('s1', 'ana', WED, '09:00', '21:00')]
        const request = {
            from_employee_id: 'ana', to_employee_id: 'ben',
            give_shift_id: 's1', give_from: '12:00', give_to: '15:00',
        }
        const { shifts } = weekAfter(request, week)
        const ana = shifts.filter(s => s.employee_id === 'ana')
            .sort((a, b) => a.starts_at.localeCompare(b.starts_at))

        expect(ana).toHaveLength(2)
        expect(ana[0].ends_at).toBe('12:00')
        expect(ana[1].starts_at).toBe('15:00')
        expect(shifts.filter(s => s.employee_id === 'ben')).toHaveLength(1)
    })

    it('does both halves of a trade at once', () => {
        const request = {
            from_employee_id: 'ana', to_employee_id: 'ben',
            give_shift_id: 's1', give_from: '15:00', give_to: '21:00',
            take_shift_id: 's3',
        }
        const { shifts } = weekAfter(request, WEEK)

        expect(shifts.find(s => s.shift_date === THU).employee_id).toBe('ana')
        expect(shifts.find(s => s.employee_id === 'ben' && s.shift_date === WED).ends_at).toBe('21:00')
    })

    it('leaves the week alone when the request names nothing', () => {
        const { shifts, removedIds } = weekAfter({}, WEEK)
        expect(shifts).toHaveLength(3)
        expect(removedIds).toHaveLength(0)
    })
})

describe('hoursChange', () => {
    it('says what each of them would end up working', () => {
        const request = {
            from_employee_id: 'ana', to_employee_id: 'ben',
            give_shift_id: 's1', give_from: '15:00', give_to: '21:00',
        }
        const change = hoursChange(request, WEEK)

        expect(change[0]).toEqual({ employeeId: 'ana', before: 12, after: 6 })
        expect(change[1]).toEqual({ employeeId: 'ben', before: 14, after: 20 })
    })
})

describe('hoursFor', () => {
    it('adds up one person and leaves the rest out', () => {
        expect(hoursFor(WEEK, 'ben')).toBe(14)
    })
})

describe('gapTo', () => {
    it('is nothing when the shift and the offer meet', () => {
        expect(gapTo([shift('x', 'ben', WED, '09:00', '15:00')], { from: '15:00', to: '21:00' })).toBe(0)
    })

    it('measures the wait in between', () => {
        expect(gapTo([shift('x', 'ben', WED, '09:00', '13:00')], { from: '15:00', to: '21:00' })).toBe(120)
    })

    it('has nothing to measure against an empty day', () => {
        expect(gapTo([], { from: '15:00', to: '21:00' })).toBe(Infinity)
    })
})

describe('shortlist', () => {
    const people = [
        { id: 'ana', full_name: 'Ana' },
        { id: 'ben', full_name: 'Ben' },
        { id: 'cara', full_name: 'Cara' },
        { id: 'dan', full_name: 'Dan' },
    ]
    const week = [
        shift('s1', 'ana', WED, '09:00', '21:00'),
        shift('s2', 'ben', WED, '09:00', '15:00'),
        shift('s4', 'dan', WED, '13:00', '21:00'),
    ]
    const away = [{ employee_id: 'cara', starts_on: WED, ends_on: WED }]

    const run = () => shortlist({
        date: WED,
        window: { from: '15:00', to: '21:00' },
        employees: people,
        shifts: week,
        absences: away,
        askerId: 'ana',
    })

    it('puts the person already in that day at the top', () => {
        expect(run().finishing.map(f => f.person.id)).toEqual(['ben'])
    })

    it('finds nobody free', () => {
        expect(run().free).toEqual([])
    })

    it('rules out somebody already on those hours', () => {
        const cannot = run().cannot
        expect(cannot.find(c => c.person.id === 'dan').why).toBe('clash')
    })

    it('rules out somebody who is away', () => {
        expect(run().cannot.find(c => c.person.id === 'cara').why).toBe('away')
    })

    it('never offers the asker themselves', () => {
        const all = run()
        const everyone = [...all.finishing, ...all.free, ...all.cannot]
        expect(everyone.some(e => e.person.id === 'ana')).toBe(false)
    })

    it('puts the closest finisher first', () => {
        const list = shortlist({
            date: WED,
            window: { from: '17:00', to: '21:00' },
            employees: [
                { id: 'ben', full_name: 'Ben' },
                { id: 'eve', full_name: 'Eve' },
            ],
            shifts: [
                shift('s2', 'ben', WED, '09:00', '13:00'),
                shift('s5', 'eve', WED, '09:00', '17:00'),
            ],
            absences: [],
            askerId: 'ana',
        })
        expect(list.finishing.map(f => f.person.id)).toEqual(['eve', 'ben'])
    })
})

describe('waitingOn', () => {
    it('is the person asked while it is only asked', () => {
        expect(waitingOn({ status: 'asked', to_employee_id: 'ben' }, 'ben', false)).toBe('answer')
        expect(waitingOn({ status: 'asked', to_employee_id: 'ben' }, 'ana', false)).toBe(null)
    })

    it('is a manager once it is accepted', () => {
        expect(waitingOn({ status: 'accepted' }, 'ana', true)).toBe('approve')
        expect(waitingOn({ status: 'accepted' }, 'ana', false)).toBe(null)
    })

    it('is nobody once it is done', () => {
        expect(waitingOn({ status: 'approved' }, 'ana', true)).toBe(null)
    })
})

describe('requestsOnShift', () => {
    const requests = [
        { id: 'r1', status: 'asked', give_shift_id: 's1' },
        { id: 'r2', status: 'declined', give_shift_id: 's1' },
        { id: 'r3', status: 'accepted', take_shift_id: 's1' },
    ]

    it('finds the live ones on either side of a trade', () => {
        expect(requestsOnShift(requests, 's1').map(r => r.id)).toEqual(['r1', 'r3'])
    })

    it('has nothing to say about a shift nobody asked about', () => {
        expect(requestsOnShift(requests, 's9')).toEqual([])
    })
})

describe('writesFor', () => {
    it('changes one row when a whole shift changes hands', () => {
        const week = [shift('s1', 'ana', WED, '09:00', '21:00')]
        const plan = writesFor(
            { from_employee_id: 'ana', to_employee_id: 'ben', give_shift_id: 's1' }, week)

        expect(plan.updates).toHaveLength(1)
        expect(plan.updates[0].id).toBe('s1')
        expect(plan.updates[0].employee_id).toBe('ben')
        expect(plan.inserts).toHaveLength(0)
        expect(plan.removes).toHaveLength(0)
    })

    it('removes the row that got merged away', () => {
        const plan = writesFor(
            { from_employee_id: 'ana', to_employee_id: 'ben', give_shift_id: 's1' }, WEEK)

        // Ana's twelve hours joined onto Ben's morning, so one of the two rows
        // has nothing left to be.
        expect(plan.removes).toHaveLength(1)
    })

    it('inserts the piece the other person picks up', () => {
        const plan = writesFor({
            from_employee_id: 'ana', to_employee_id: 'ben',
            give_shift_id: 's1', give_from: '15:00', give_to: '21:00',
        }, WEEK)

        expect(plan.updates.some(r => r.id === 's1' && r.ends_at === '15:00')).toBe(true)
        expect(plan.updates.some(r => r.id === 's2' && r.ends_at === '21:00')).toBe(true)
    })

    it('leaves a row alone when nothing about it moved', () => {
        const plan = writesFor({
            from_employee_id: 'ana', to_employee_id: 'ben',
            give_shift_id: 's1', give_from: '15:00', give_to: '21:00',
        }, WEEK)

        expect(plan.updates.some(r => r.id === 's3')).toBe(false)
    })

    it('reads the database time format the same as a time field', () => {
        const week = [shift('s1', 'ana', WED, '09:00:00', '21:00:00')]
        const plan = writesFor({
            from_employee_id: 'ana', to_employee_id: 'ben',
            give_shift_id: 's1', give_from: '09:00', give_to: '21:00',
        }, week)

        // The same hours written two ways is still the whole shift, so it is
        // one change of name rather than a split.
        expect(plan.updates).toHaveLength(1)
        expect(plan.inserts).toHaveLength(0)
    })
})

describe('newFindings', () => {
    const finding = (kind, employeeId, text) => ({ kind, employeeId, text })

    it('leaves out what was already wrong', () => {
        const before = [finding('dailyRest', 'ana', 'Ana has only 9 hours.')]
        const after = [
            finding('dailyRest', 'ana', 'Ana has only 9 hours.'),
            finding('visaCap', 'ben', 'Ben is over.'),
        ]
        expect(newFindings(before, after).map(f => f.kind)).toEqual(['visaCap'])
    })

    it('has nothing to say when the swap broke nothing', () => {
        const same = [finding('dailyRest', 'ana', 'Ana has only 9 hours.')]
        expect(newFindings(same, same)).toEqual([])
    })
})
