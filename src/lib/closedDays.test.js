import { describe, it, expect } from 'vitest'
import { dayIsClosed, closedDates, noteIsEmpty, planNoteWrites } from './closedDays'

const note = (extra = {}) => ({ id: 'n1', note_date: '2026-08-24', ...extra })

describe('which side decides', () => {
    // The roster's day is the forward looking statement and the table whose
    // whole job is days that are not like the others, so it wins.
    it('takes the roster day over the sales row', () => {
        expect(dayIsClosed(note({ is_closed: true }), { is_closed: false })).toBe(true)
        expect(dayIsClosed(note({ is_closed: false }), { is_closed: true })).toBe(false)
    })

    // Which is what makes every day recorded before the two were tied together
    // still read correctly.
    it('falls back to the sales row when the roster says nothing at all', () => {
        expect(dayIsClosed(null, { is_closed: true })).toBe(true)
        expect(dayIsClosed(undefined, { is_closed: false })).toBe(false)
    })

    it('is open when neither says anything', () => {
        expect(dayIsClosed(null, null)).toBe(false)
    })

    it('lists the closed dates out of a week', () => {
        const notes = [
            note({ note_date: '2026-08-24', is_closed: true }),
            note({ note_date: '2026-08-25', is_bank_holiday: true }),
            note({ note_date: '2026-08-26', is_closed: true }),
        ]
        expect([...closedDates(notes)]).toEqual(['2026-08-24', '2026-08-26'])
        expect(closedDates(null).size).toBe(0)
    })
})

describe('noteIsEmpty', () => {
    it('is empty when it says nothing', () => {
        expect(noteIsEmpty(note())).toBe(true)
        expect(noteIsEmpty(null)).toBe(true)
    })

    it('is not empty for any one thing it could say', () => {
        expect(noteIsEmpty(note({ is_closed: true }))).toBe(false)
        expect(noteIsEmpty(note({ is_bank_holiday: true }))).toBe(false)
        expect(noteIsEmpty(note({ opens_at: '09:00' }))).toBe(false)
        expect(noteIsEmpty(note({ note: 'Deep Cleaning Day' }))).toBe(false)
        expect(noteIsEmpty(note({ message: 'Back door this week' }))).toBe(false)
        expect(noteIsEmpty(note({ extras: [{ name: 'Feedr' }] }))).toBe(false)
    })

    it('is empty with an extras list that holds nothing', () => {
        expect(noteIsEmpty(note({ extras: [] }))).toBe(true)
    })
})

describe('planNoteWrites', () => {
    it('closes a day the roster has never heard of', () => {
        const plan = planNoteWrites([], [{ date: '2026-08-24', closed: true }])
        expect(plan).toEqual({ close: [{ date: '2026-08-24', id: null }], open: [], remove: [] })
    })

    // A day that already has a row for something else gets that one field
    // changed rather than a whole row written over it.
    it('carries the id of a day that already has a row', () => {
        const existing = [note({ note: 'Deep Cleaning Day' })]
        const plan = planNoteWrites(existing, [{ date: '2026-08-24', closed: true }])
        expect(plan.close).toEqual([{ date: '2026-08-24', id: 'n1' }])
    })

    it('says nothing about a day already closed on both sides', () => {
        const existing = [note({ is_closed: true })]
        const plan = planNoteWrites(existing, [{ date: '2026-08-24', closed: true }])
        expect(plan).toEqual({ close: [], open: [], remove: [] })
    })

    it('says nothing about an ordinary day', () => {
        const plan = planNoteWrites([], [{ date: '2026-08-24', closed: false }])
        expect(plan).toEqual({ close: [], open: [], remove: [] })
    })

    // Unticking it has to take the row with it, or a normal day is left holding
    // a record that says nothing, which is exactly what day_notes exists to
    // avoid.
    it('takes the row away when closed was all it said', () => {
        const existing = [note({ is_closed: true })]
        const plan = planNoteWrites(existing, [{ date: '2026-08-24', closed: false }])
        expect(plan).toEqual({ close: [], open: [], remove: ['n1'] })
    })

    it('keeps the row when it still says something else', () => {
        const existing = [note({ is_closed: true, note: 'Deep Cleaning Day' })]
        const plan = planNoteWrites(existing, [{ date: '2026-08-24', closed: false }])
        expect(plan).toEqual({ close: [], open: ['2026-08-24'], remove: [] })
    })

    it('keeps a row that only carried different hours', () => {
        const existing = [note({ is_closed: true, opens_at: '12:00', closes_at: '20:00' })]
        const plan = planNoteWrites(existing, [{ date: '2026-08-24', closed: false }])
        expect(plan.open).toEqual(['2026-08-24'])
    })

    it('handles a whole week at once', () => {
        const existing = [
            note({ id: 'n1', note_date: '2026-08-24', is_closed: true }),
            note({ id: 'n2', note_date: '2026-08-25', is_closed: true, note: 'Stock take' }),
        ]
        const days = [
            { date: '2026-08-23', closed: true },
            { date: '2026-08-24', closed: false },
            { date: '2026-08-25', closed: false },
            { date: '2026-08-26', closed: false },
        ]
        expect(planNoteWrites(existing, days)).toEqual({
            close: [{ date: '2026-08-23', id: null }],
            open: ['2026-08-25'],
            remove: ['n1'],
        })
    })
})
