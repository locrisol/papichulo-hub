import { describe, it, expect } from 'vitest'
import {
    NOTICE_DEFAULT, noticeDays, noticeBlocks, daysBefore, noticeProblem,
    isPartDay, requestLabel, partWords, hitsShift, shiftsHit,
    isCovered, openGaps, waiting, askedOff,
} from './timeOff'

const TODAY = '2026-09-04'

const ask = (extra = {}) => ({
    id: 'a1', employee_id: 'e1', kind: 'holiday',
    starts_on: '2026-10-12', ends_on: '2026-10-19',
    status: 'requested', ...extra,
})

const shift = (date, starts, ends, employee = 'e1') => ({
    id: date + starts, employee_id: employee, shift_date: date,
    starts_at: starts, ends_at: ends,
})

describe('how much notice', () => {
    it('asks for thirty days unless told otherwise', () => {
        expect(NOTICE_DEFAULT).toBe(30)
        expect(noticeDays(null)).toBe(30)
        expect(noticeDays({})).toBe(30)
        expect(noticeDays({ holidayNoticeDays: 14 })).toBe(14)
    })

    it('takes zero as none asked for, not as nothing set', () => {
        expect(noticeDays({ holidayNoticeDays: 0 })).toBe(0)
        expect(noticeProblem('holiday', '2026-09-05', { holidayNoticeDays: 0 }, TODAY)).toBeNull()
    })

    it('warns rather than blocks unless the box is ticked', () => {
        expect(noticeBlocks({})).toBe(false)
        expect(noticeBlocks({ holidayNoticeBlocks: true })).toBe(true)
    })

    it('counts whole days to the first day off', () => {
        expect(daysBefore('2026-09-04', TODAY)).toBe(0)
        expect(daysBefore('2026-09-13', TODAY)).toBe(9)
        expect(daysBefore('2026-10-12', TODAY)).toBe(38)
    })

    it('says nothing when there is enough notice', () => {
        expect(noticeProblem('holiday', '2026-10-12', {}, TODAY)).toBeNull()
    })

    it('says how short it is when there is not', () => {
        expect(noticeProblem('holiday', '2026-09-13', {}, TODAY))
            .toEqual({ needed: 30, actual: 9, blocks: false })
    })

    it('leaves a day off and a part day alone', () => {
        // Something came up tomorrow is the ordinary case, not a telling off.
        expect(noticeProblem('day_off', '2026-09-05', {}, TODAY)).toBeNull()
    })
})

describe('part of a day', () => {
    it('knows one from a whole day', () => {
        expect(isPartDay(ask())).toBe(false)
        expect(isPartDay(ask({ can_work_to: '15:00' }))).toBe(true)
        expect(isPartDay(ask({ can_work_from: '15:00' }))).toBe(true)
    })

    it('calls it a part of a day rather than a day off', () => {
        expect(requestLabel(ask({ kind: 'day_off' }))).toBe('Day off')
        expect(requestLabel(ask({ kind: 'holiday' }))).toBe('Holiday')
        expect(requestLabel(ask({ kind: 'day_off', can_work_to: '15:00' }))).toBe('Part of a day')
    })

    it('says the hours the way somebody would say them', () => {
        expect(partWords(ask({ can_work_to: '15:00' }))).toBe('can work until 15:00')
        expect(partWords(ask({ can_work_from: '15:00' }))).toBe('can work from 15:00')
        expect(partWords(ask({ can_work_from: '12:00', can_work_to: '16:00' })))
            .toBe('can work 12:00 to 16:00')
        expect(partWords(ask())).toBe('')
    })
})

describe('which shifts it lands on', () => {
    const week = ask({ kind: 'holiday', starts_on: '2026-09-13', ends_on: '2026-09-20' })

    it('takes every shift inside the dates for a whole day off', () => {
        const shifts = [
            shift('2026-09-12', '09:00', '17:00'),
            shift('2026-09-14', '08:30', '15:00'),
            shift('2026-09-16', '08:30', '23:00'),
            shift('2026-09-21', '09:00', '17:00'),
        ]
        expect(shiftsHit(week, shifts).map(s => s.shift_date))
            .toEqual(['2026-09-14', '2026-09-16'])
    })

    it('leaves somebody else alone', () => {
        const shifts = [shift('2026-09-14', '08:30', '15:00', 'e2')]
        expect(shiftsHit(week, shifts)).toEqual([])
    })

    it('only takes the shift that runs past the hours they can work', () => {
        // Finishing at three. A shift that ended at one is not a clash.
        const part = ask({ kind: 'day_off', starts_on: '2026-09-16', ends_on: '2026-09-16', can_work_to: '15:00' })
        expect(hitsShift(part, shift('2026-09-16', '09:00', '13:00'))).toBe(false)
        expect(hitsShift(part, shift('2026-09-16', '09:00', '17:00'))).toBe(true)
    })

    it('the same the other way round for somebody starting late', () => {
        const part = ask({ kind: 'day_off', starts_on: '2026-09-16', ends_on: '2026-09-16', can_work_from: '15:00' })
        expect(hitsShift(part, shift('2026-09-16', '16:00', '23:00'))).toBe(false)
        expect(hitsShift(part, shift('2026-09-16', '09:00', '17:00'))).toBe(true)
    })

    it('is not bothered by a day outside the dates', () => {
        expect(hitsShift(week, shift('2026-09-21', '09:00', '17:00'))).toBe(false)
    })
})

describe('what a freed day leaves behind', () => {
    const approved = {
        id: 'a1', employee_id: 'e1', status: 'approved',
        starts_on: '2026-09-13', ends_on: '2026-09-20',
        cleared_shifts: [
            { date: '2026-09-14', starts_at: '08:30', ends_at: '15:00' },
            { date: '2026-09-16', starts_at: '08:30', ends_at: '23:00' },
        ],
    }

    it('lists what nobody is on for', () => {
        expect(openGaps([approved], [], []).map(g => g.date))
            .toEqual(['2026-09-14', '2026-09-16'])
    })

    it('drops a gap the moment anybody is rostered over it', () => {
        const covered = [shift('2026-09-14', '09:00', '15:00', 'e2')]
        expect(openGaps([approved], covered, []).map(g => g.date))
            .toEqual(['2026-09-16'])
    })

    it('takes any overlap as covered, not the same hours', () => {
        // Four of the six hours is a manager's judgement, not a thing to keep
        // shouting about.
        expect(isCovered({ date: '2026-09-14', starts_at: '08:30', ends_at: '15:00' },
            [shift('2026-09-14', '11:00', '15:00', 'e2')])).toBe(true)
    })

    it('does not count a shift that finished before the gap started', () => {
        expect(isCovered({ date: '2026-09-14', starts_at: '15:00', ends_at: '23:00' },
            [shift('2026-09-14', '08:30', '15:00', 'e2')])).toBe(false)
    })

    it('keeps to the week being looked at when it is given one', () => {
        expect(openGaps([approved], [], ['2026-09-16']).map(g => g.date)).toEqual(['2026-09-16'])
    })

    it('says nothing about a request nobody has answered yet', () => {
        expect(openGaps([{ ...approved, status: 'requested' }], [], [])).toEqual([])
    })
})

describe('what is waiting', () => {
    const rows = [
        ask({ id: 'a2', created_at: '2026-09-03T10:00:00' }),
        ask({ id: 'a1', created_at: '2026-09-01T10:00:00' }),
        ask({ id: 'a3', status: 'approved', created_at: '2026-09-02T10:00:00' }),
    ]

    it('is the ones nobody has answered, longest waiting first', () => {
        expect(waiting(rows).map(a => a.id)).toEqual(['a1', 'a2'])
    })

    it('marks the days somebody has asked for but not been given', () => {
        const asks = [ask({ starts_on: '2026-09-13', ends_on: '2026-09-15' })]
        expect(askedOff(asks, 'e1', '2026-09-14')).toBe(true)
        expect(askedOff(asks, 'e1', '2026-09-16')).toBe(false)
        expect(askedOff(asks, 'e2', '2026-09-14')).toBe(false)
    })

    it('stops marking them once it has been answered', () => {
        const asks = [ask({ status: 'approved', starts_on: '2026-09-13', ends_on: '2026-09-15' })]
        expect(askedOff(asks, 'e1', '2026-09-14')).toBe(false)
    })
})
