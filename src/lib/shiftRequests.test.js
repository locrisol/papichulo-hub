import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
    windowOf, isWholeShift, weekAfter, hoursFor, hoursChange, shortlist, gapTo,
    waitingOn, requestsOnShift, writesFor, newFindings, shiftIdsOf, requestDate,
    canTakeBack, shiftsMoved, windowProblem, windowFits, windowsFit, hoursWords,
} from '@/lib/shiftRequests'

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

    // Two shifts became one and one of the two ids had to go. Which one is not
    // a detail: shift_requests points at both of these shifts and both foreign
    // keys are ON DELETE CASCADE, so deleting the id the request hangs off
    // deletes the request. The manager presses Approve, the row saying who
    // agreed what disappears, and the status update a moment later writes to
    // nothing.
    it('keeps the shifts the request hangs off when two of them merge', () => {
        // Ben is on the Wednesday morning. Ana gives him her evening, so the
        // two meet and join, and hers is the later of the two.
        const week = [
            shift('evening', 'ana', WED, '15:00', '21:00'),
            shift('morning', 'ben', WED, '09:00', '15:00'),
        ]
        const request = {
            from_employee_id: 'ana', to_employee_id: 'ben', give_shift_id: 'evening',
        }
        const { shifts, removedIds } = weekAfter(request, week)

        expect(shifts).toHaveLength(1)
        expect(shifts[0]).toMatchObject({ id: 'evening', employee_id: 'ben', starts_at: '09:00', ends_at: '21:00' })
        expect(removedIds).toEqual(['morning'])
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
    const away = [{ employee_id: 'cara', starts_on: WED, ends_on: WED, status: 'approved' }]

    const run = (over = {}) => shortlist({
        date: WED,
        window: { from: '15:00', to: '21:00' },
        employees: people,
        shifts: week,
        absences: away,
        askerId: 'ana',
        ...over,
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

    it('does not rule out somebody who has only asked to be away', () => {
        // Nobody has answered her yet, so she is still working that day and is
        // still somebody you can ask.
        const asked = [{ employee_id: 'cara', starts_on: WED, ends_on: WED, status: 'requested' }]
        expect(run({ absences: asked }).cannot.find(c => c.person.id === 'cara')).toBeUndefined()
    })

    // Only the person asked can answer, and somebody with no account never
    // can. The request sat at waiting on them for good, and nobody was told.
    it('rules out somebody with no account to answer with', () => {
        const noLogin = people.map(p => (p.id === 'ben' ? { ...p, has_login: false } : { ...p, has_login: true }))
        const list = run({ employees: noLogin })
        expect(list.cannot.find(c => c.person.id === 'ben').why).toBe('no_login')
        expect(list.finishing).toEqual([])
    })

    // Before the database says either way, nobody is ruled out for it.
    it('rules nobody out when it is not known who has an account', () => {
        expect(run().finishing.map(f => f.person.id)).toEqual(['ben'])
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

describe('taking a request back', () => {
    const mine = { from_employee_id: 'ana', to_employee_id: 'ben' }

    it('is for the person who asked, while nobody has answered', () => {
        expect(canTakeBack({ ...mine, status: 'asked' }, 'ana')).toBe(true)
        expect(canTakeBack({ ...mine, status: 'asked' }, 'ben')).toBe(false)
    })

    // The database refuses it once there is an answer, so a button there
    // could never work, and on an approved swap it read as an undo.
    it('is gone once there is an answer', () => {
        for (const status of ['accepted', 'declined', 'approved', 'refused', 'withdrawn']) {
            expect(canTakeBack({ ...mine, status }, 'ana')).toBe(false)
        }
    })

    it('is nobody when nobody is signed in', () => {
        expect(canTakeBack({ ...mine, status: 'asked' }, undefined)).toBe(false)
    })
})

describe('shifts that changed hands after the ask', () => {
    const request = {
        from_employee_id: 'ana', to_employee_id: 'ben', give_shift_id: 's1', take_shift_id: 's3',
    }
    const find = week => id => week.find(s => s.id === id) || null

    it('is nothing while each shift is still with the person it names', () => {
        expect(shiftsMoved(request, find([
            shift('s1', 'ana', WED, '09:00', '21:00'), shift('s3', 'ben', THU, '09:00', '17:00'),
        ]))).toBe(false)
    })

    // Approving moves whichever shift the request points at, so a manager
    // moving Ana's Wednesday to Cal after she asked would hand Cal's shift
    // to Ben.
    it('notices the shift being given now belongs to somebody else', () => {
        expect(shiftsMoved(request, find([
            shift('s1', 'cal', WED, '09:00', '21:00'), shift('s3', 'ben', THU, '09:00', '17:00'),
        ]))).toBe(true)
    })

    it('notices the shift being taken now belongs to somebody else', () => {
        expect(shiftsMoved(request, find([
            shift('s1', 'ana', WED, '09:00', '21:00'), shift('s3', 'cal', THU, '09:00', '17:00'),
        ]))).toBe(true)
    })

    // An approval that moved the shifts and then failed to mark itself
    // approved. Approve has to stay on, because pressing it again is what
    // finishes it.
    it('is nothing when a shift is already with the person taking it', () => {
        expect(shiftsMoved(request, find([
            shift('s1', 'ben', WED, '09:00', '21:00'), shift('s3', 'ana', THU, '09:00', '17:00'),
        ]))).toBe(false)
    })

    it('says nothing about a half the request does not have', () => {
        expect(shiftsMoved({ ...request, take_shift_id: null }, find([
            shift('s1', 'ana', WED, '09:00', '21:00'),
        ]))).toBe(false)
    })
})

// A shift that ends at midnight ends that night, and every sum about a request
// has to read it that way. Read as nought it was a shift finishing before it
// started, and approving a swap next to it deleted somebody's evening.
describe('a shift to midnight', () => {
    const SAT = '2026-09-26'
    const maria = shift('m1', 'maria', SAT, '17:00:00', '00:00:00')
    const ben = shift('b1', 'ben', SAT, '12:00:00', '17:00:00')

    it('keeps her evening when Ben gives her his afternoon', () => {
        const request = { from_employee_id: 'ben', to_employee_id: 'maria', give_shift_id: 'b1' }
        const { shifts } = weekAfter(request, [maria, ben])
        const hers = shifts.filter(s => s.employee_id === 'maria')

        expect(hers).toHaveLength(1)
        expect(hers[0].starts_at).toBe('12:00:00')
        expect(hers[0].ends_at).toBe('00:00:00')
        expect(hoursFor(shifts, 'maria')).toBe(12)
    })

    it('hands over only the part she gives', () => {
        const request = {
            from_employee_id: 'maria', to_employee_id: 'ben',
            give_shift_id: 'm1', give_from: '17:00', give_to: '20:00',
        }
        const { shifts } = weekAfter(request, [maria])
        const hers = shifts.filter(s => s.employee_id === 'maria')

        expect(hers).toHaveLength(1)
        expect(hers[0].starts_at).toBe('20:00')
        expect(hers[0].ends_at).toBe('00:00:00')
        expect(hoursFor(shifts, 'ben')).toBe(3)
    })

    it('hands over the end of it', () => {
        const request = {
            from_employee_id: 'maria', to_employee_id: 'ben',
            give_shift_id: 'm1', give_from: '20:00', give_to: '00:00',
        }
        const { shifts } = weekAfter(request, [maria])
        expect(hoursFor(shifts, 'maria')).toBe(3)
        expect(hoursFor(shifts, 'ben')).toBe(4)
    })

    it('counts somebody on until midnight as busy that evening', () => {
        const list = shortlist({
            date: SAT,
            window: { from: '20:00', to: '22:00' },
            employees: [{ id: 'maria', full_name: 'Maria' }],
            shifts: [maria],
            absences: [],
            askerId: 'ana',
        })
        expect(list.cannot.map(c => c.person.id)).toEqual(['maria'])
    })
})

// Ana has 12:00 to 17:00 and is giving part of it. Approving keeps whatever is
// either side of the hours named, so hours outside the shift came out as hours
// nobody was rostered for: 15:00 to 19:00 left her 12:00 to 15:00 and gave Ben
// 15:00 to 19:00, seven hours where there had been five.
describe('part of a shift has to be part of it', () => {
    const ana = shift('s9', 'ana', WED, '12:00:00', '17:00:00')

    it('takes hours inside the shift, its own two ends included', () => {
        expect(windowProblem(ana, '15:00', '17:00')).toBe('')
        expect(windowProblem(ana, '12:00', '14:00')).toBe('')
        expect(windowFits(ana, '12:00', '17:00')).toBe(true)
    })

    it('takes the whole shift when no times are written on it', () => {
        expect(windowFits(ana, null, null)).toBe(true)
    })

    it('refuses hours that run past the end', () => {
        expect(windowProblem(ana, '15:00', '19:00')).toBe('outside')
    })

    it('refuses hours that start before it does', () => {
        expect(windowProblem(ana, '07:00', '13:00')).toBe('outside')
    })

    it('refuses hours entirely outside it', () => {
        expect(windowProblem(ana, '18:00', '20:00')).toBe('outside')
        expect(windowProblem(ana, '07:00', '09:00')).toBe('outside')
    })

    it('says so when the hours finish before they start', () => {
        expect(windowProblem(ana, '16:00', '14:00')).toBe('order')
        expect(windowProblem(ana, '15:00', '15:00')).toBe('order')
    })

    // A shift that runs to midnight is measured the way it runs, from its own
    // start, so its last hours are inside it.
    it('measures a shift that runs to midnight from its own start', () => {
        const late = shift('s8', 'ana', WED, '17:00', '00:00')
        expect(windowProblem(late, '20:00', '00:00')).toBe('')
        expect(windowProblem(late, '17:00', '20:00')).toBe('')
        expect(windowProblem(late, '22:00', '01:00')).toBe('outside')
    })

    it('measures a shift that runs past midnight the same way', () => {
        const night = shift('s7', 'ana', WED, '18:00', '02:00')
        expect(windowProblem(night, '00:00', '02:00')).toBe('')
        expect(windowProblem(night, '01:00', '03:00')).toBe('outside')
    })

    // The desk asks again at the moment of approving, because a manager can
    // change the shift after the two of them agreed.
    describe('on a request', () => {
        const find = week => id => week.find(s => s.id === id) || null
        const request = {
            from_employee_id: 'ana', to_employee_id: 'ben',
            give_shift_id: 's9', give_from: '15:00', give_to: '17:00',
        }

        it('is fine while the hours are still inside the shift', () => {
            expect(windowsFit(request, find([ana]))).toBe(true)
        })

        it('notices the shift being shortened under it', () => {
            expect(windowsFit(request, find([{ ...ana, ends_at: '16:00:00' }]))).toBe(false)
        })

        it('checks the half coming back as well', () => {
            const ben = shift('s3', 'ben', THU, '09:00', '17:00')
            const trade = { ...request, take_shift_id: 's3', take_from: '16:00', take_to: '18:00' }
            expect(windowsFit(trade, find([ana, ben]))).toBe(false)
        })

        it('has nothing to say about a whole shift, or one not in hand', () => {
            expect(windowsFit({ ...request, give_from: null, give_to: null }, find([ana]))).toBe(true)
            expect(windowsFit(request, find([]))).toBe(true)
        })
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

    // A shift the way the roster page holds it: select('*'), every column.
    const PUBLISHED = '2026-08-20T10:00:00+00:00'
    const saved = (id, employee, date, from, to) => shift(id, employee, date, from, to, {
        restaurant_id: 'r1', position_id: 'bar', note: 'Cashes up', break_is_manual: false,
        published_at: PUBLISHED, created_by: 'u1', created_at: PUBLISHED, updated_at: PUBLISHED,
    })

    // The ordinary cover my evening, to somebody who is off that day. Nothing
    // of theirs to join it to, so it is the one case that writes a new row,
    // and approving it used to fail half way: the giver's shift was cut short
    // and then the new row was refused.
    it('gives a new row to somebody who is off that day', () => {
        const plan = writesFor({
            from_employee_id: 'ana', to_employee_id: 'ben',
            give_shift_id: 's1', give_from: '15:00', give_to: '21:00',
        }, [saved('s1', 'ana', WED, '09:00', '21:00')])

        expect(plan.updates).toHaveLength(1)
        expect(plan.updates[0]).toMatchObject({ id: 's1', employee_id: 'ana', ends_at: '15:00' })
        expect(plan.removes).toEqual([])
        expect(plan.inserts).toHaveLength(1)
        expect(plan.inserts[0]).toMatchObject({
            employee_id: 'ben', shift_date: WED, starts_at: '15:00', ends_at: '21:00',
            // The same work, so the same position, and still published.
            position_id: 'bar', published_at: PUBLISHED,
            // The note was written about Ana's shift, and she keeps it.
            note: null,
        })
    })

    it('leaves the giver both ends when the middle of a shift goes', () => {
        const plan = writesFor({
            from_employee_id: 'ana', to_employee_id: 'ben',
            give_shift_id: 's1', give_from: '12:00', give_to: '15:00',
        }, [saved('s1', 'ana', WED, '09:00', '21:00')])

        expect(plan.updates).toHaveLength(1)
        expect(plan.updates[0]).toMatchObject({ id: 's1', starts_at: '09:00', ends_at: '12:00' })

        const byStart = [...plan.inserts].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
        expect(byStart).toHaveLength(2)
        expect(byStart[0]).toMatchObject({
            employee_id: 'ben', starts_at: '12:00', ends_at: '15:00', position_id: 'bar', note: null,
        })
        // Still Ana's shift, so it keeps everything hers had.
        expect(byStart[1]).toMatchObject({
            employee_id: 'ana', starts_at: '15:00', ends_at: '21:00', position_id: 'bar', note: 'Cashes up',
        })
    })

    // The page sends these rows as they are. A key the table does not have
    // gets the whole insert refused, which is what notes for note did.
    it('writes a new row with only columns the table has', () => {
        const schema = readFileSync('supabase/schema.sql', 'utf8')
        const table = /CREATE TABLE IF NOT EXISTS "public"\."roster_shifts" \(([\s\S]*?)\n\);/.exec(schema)
        expect(table).not.toBeNull()
        const columns = [...table[1].matchAll(/^\s+"(\w+)"/gm)].map(m => m[1])

        const plan = writesFor({
            from_employee_id: 'ana', to_employee_id: 'ben',
            give_shift_id: 's1', give_from: '12:00', give_to: '15:00',
        }, [saved('s1', 'ana', WED, '09:00', '21:00')])

        for (const row of plan.inserts) {
            for (const key of Object.keys(row)) expect(columns).toContain(key)
            // The database gives it one. Sending null would be refused.
            expect(row).not.toHaveProperty('id')
        }
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

// Both screens fetch a week at a time, which is right for a roster and wrong
// for a request. These two are what lets a screen show one from another week:
// the ids to go and get, and the day to say it is on.
describe('the shifts a set of requests points at', () => {
    it('takes both ends of every one of them', () => {
        const ids = shiftIdsOf([
            { give_shift_id: 's1', take_shift_id: 's2' },
            { give_shift_id: 's3', take_shift_id: null },
        ])
        expect(ids.sort()).toEqual(['s1', 's2', 's3'])
    })

    // Two people can both be asking about the same Saturday, and fetching it
    // twice is a longer query for the same row.
    it('names one shift once', () => {
        expect(shiftIdsOf([
            { give_shift_id: 's1', take_shift_id: null },
            { give_shift_id: null, take_shift_id: 's1' },
        ])).toEqual(['s1'])
    })

    it('copes with nothing at all', () => {
        expect(shiftIdsOf(null)).toEqual([])
        expect(shiftIdsOf([{}])).toEqual([])
    })
})

describe('the day a request is about', () => {
    const find = id => WEEK.find(s => s.id === id) || null

    it('is the earlier of the two shifts', () => {
        expect(requestDate({ give_shift_id: 's3', take_shift_id: 's1' }, find)).toBe(WED)
    })

    it('is the one there is, when there is only one', () => {
        expect(requestDate({ give_shift_id: 's3' }, find)).toBe(THU)
    })

    // Not an error. A screen that cannot say when something is should say it
    // cannot, rather than draw a row with a gap where the date goes.
    it('is nothing when neither shift is in hand', () => {
        expect(requestDate({ give_shift_id: 'gone' }, find)).toBe(null)
        expect(requestDate({}, find)).toBe(null)
        expect(requestDate(null, find)).toBe(null)
    })
})

// The hours a request is about, the way the roster prints them. The swap mails
// say Closing for a finish after closing, and the cards on My shifts and the
// desk printed the time for part of a shift, the number the roster never
// shows.
describe('hoursWords', () => {
    const late = shift('s9', 'ana', WED, '17:00:00', '23:40:00')
    const hours = { open: '09:00', close: '23:00' }

    it('says Closing for a whole closing shift', () => {
        expect(hoursWords(late, null, null, hours)).toBe('17:00 to Closing')
    })

    it('says Closing for the last part of one', () => {
        expect(hoursWords(late, '20:00', '23:40', hours)).toBe('20:00 to Closing')
    })

    it('prints the time for a part that stops before closing', () => {
        expect(hoursWords(late, '17:00', '20:00', hours)).toBe('17:00 to 20:00')
    })

    it('prints the time with no hours to go on', () => {
        expect(hoursWords(late, '20:00', '23:40', null)).toBe('20:00 to 23:40')
    })
})
