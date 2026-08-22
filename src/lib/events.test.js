import { describe, it, expect } from 'vitest'
import { groupByWeek, statusNote, dayName, categoryStyle, weekTitle, agendaRows } from './events'

const on = date => ({ id: date, event_date: date })

describe('groupByWeek', () => {
    it('keeps one week together', () => {
        // Sunday 23 August 2026 to Saturday 29 August 2026.
        const out = groupByWeek([on('2026-08-24'), on('2026-08-27'), on('2026-08-29')])
        expect(out).toHaveLength(1)
        expect(out[0].weekStart).toBe('2026-08-23')
        expect(out[0].events).toHaveLength(3)
    })

    it('breaks at the Saturday, not at the month', () => {
        const out = groupByWeek([on('2026-08-29'), on('2026-08-30')])
        expect(out.map(w => w.weekStart)).toEqual(['2026-08-23', '2026-08-30'])
    })

    it('keeps a week that runs across the end of a month in one piece', () => {
        const out = groupByWeek([on('2026-08-31'), on('2026-09-01'), on('2026-09-05')])
        expect(out).toHaveLength(1)
        expect(out[0].weekStart).toBe('2026-08-30')
    })

    it('leaves out the weeks with nothing in them', () => {
        const out = groupByWeek([on('2026-08-24'), on('2026-09-21')])
        expect(out.map(w => w.weekStart)).toEqual(['2026-08-23', '2026-09-20'])
    })

    it('keeps the order it was given, since the query already sorted it', () => {
        const out = groupByWeek([on('2026-08-24'), on('2026-08-26'), on('2026-08-25')])
        expect(out[0].events.map(e => e.event_date)).toEqual(['2026-08-24', '2026-08-26', '2026-08-25'])
    })

    it('copes with nothing at all', () => {
        expect(groupByWeek([])).toEqual([])
        expect(groupByWeek(null)).toEqual([])
    })

    it('loses no events on the way through', () => {
        const dates = ['2026-08-24', '2026-08-29', '2026-08-30', '2026-09-14', '2026-09-15']
        const out = groupByWeek(dates.map(on))
        expect(out.flatMap(w => w.events).map(e => e.event_date)).toEqual(dates)
    })
})

describe('statusNote', () => {
    it('says nothing about an event that is simply on sale', () => {
        expect(statusNote('onsale')).toBe(null)
    })

    it('says nothing when the status was never filled in', () => {
        expect(statusNote(null)).toBe(null)
        expect(statusNote('')).toBe(null)
        expect(statusNote(undefined)).toBe(null)
    })

    it('reads off sale as probably sold out', () => {
        expect(statusNote('offsale').text).toMatch(/sold out/)
        expect(statusNote('offsale').tone).toBe('warn')
    })

    it('treats a cancelled event as the quiet night it is', () => {
        expect(statusNote('cancelled').tone).toBe('bad')
    })

    it('does not mind how Ticketmaster capitalises it', () => {
        expect(statusNote('OffSale').text).toBe(statusNote('offsale').text)
    })

    it('says nothing about a status it has never seen', () => {
        expect(statusNote('something new')).toBe(null)
    })
})

describe('dayName', () => {
    it('names the day', () => {
        expect(dayName('2026-08-23')).toBe('Sun')
        expect(dayName('2026-08-29')).toBe('Sat')
    })
})

describe('categoryStyle', () => {
    it('gives a category its own colour', () => {
        expect(categoryStyle('Music')).toContain('purple')
        expect(categoryStyle('Sports')).toContain('blue')
    })

    it('falls back to grey rather than to nothing', () => {
        expect(categoryStyle('Something else')).toContain('gray')
        expect(categoryStyle(null)).toContain('gray')
    })
})

describe('weekTitle', () => {
    // Saturday 22 August 2026. Its week runs from Sunday the 16th.
    const today = '2026-08-22'

    it('names this week rather than dating it', () => {
        expect(weekTitle('2026-08-16', today)).toBe('This week')
    })

    it('names next week too, since those are the two being rostered', () => {
        expect(weekTitle('2026-08-23', today)).toBe('Next week')
    })

    it('dates anything further out, with the month written out', () => {
        expect(weekTitle('2026-08-30', today)).toBe('Week of 30 August')
    })

    it('gets next week right when it lands in the following month', () => {
        // Sunday 30 August, so next week starts on 6 September.
        expect(weekTitle('2026-09-06', '2026-08-31')).toBe('Next week')
    })

    it('gets next week right across the new year', () => {
        // Thursday 31 December 2026 sits in the week starting Sunday 27 December.
        expect(weekTitle('2027-01-03', '2026-12-31')).toBe('Next week')
    })
})

describe('agendaRows', () => {
    const today = '2026-08-22'
    const at = (date, id) => ({ id: id || date, event_date: date })
    const types = rows => rows.map(r => r.type)
    const labels = rows => rows.filter(r => r.type !== 'day').map(r => r.label)

    it('puts a month heading and a week heading over the first day', () => {
        // Today is Saturday 22 August, so its week ends that night and the
        // 25th belongs to the next one.
        const rows = agendaRows([at('2026-08-25')], today)
        expect(types(rows)).toEqual(['month', 'week', 'day'])
        expect(labels(rows)).toEqual(['August 2026', 'Next week'])
    })

    it('writes the month out in full rather than shortening it', () => {
        const rows = agendaRows([at('2026-09-01')], today)
        expect(rows[0].label).toBe('September 2026')
    })

    it('does not repeat a heading for days in the same week', () => {
        const rows = agendaRows([at('2026-08-25'), at('2026-08-27')], today)
        expect(types(rows)).toEqual(['month', 'week', 'day', 'day'])
    })

    it('starts a new week heading at the Saturday', () => {
        const rows = agendaRows([at('2026-08-29'), at('2026-08-31')], today)
        expect(types(rows)).toEqual(['month', 'week', 'day', 'week', 'day'])
    })

    it('starts a new month heading when the month turns', () => {
        const rows = agendaRows([at('2026-09-26'), at('2026-10-04')], today)
        expect(labels(rows)).toEqual([
            'September 2026', 'Week of 20 September',
            'October 2026', 'Week of 4 October',
        ])
    })

    it('repeats the week under a new month, so a week across the end of one still reads as one week', () => {
        // Sunday 30 August to Saturday 5 September is one week in two months.
        const rows = agendaRows([at('2026-08-31'), at('2026-09-02')], today)
        expect(types(rows)).toEqual(['month', 'week', 'day', 'month', 'week', 'day'])
        expect(labels(rows)).toEqual([
            'August 2026', 'Week of 30 August',
            'September 2026', 'Week of 30 August',
        ])
    })

    it('gives every row a key of its own, even the repeated week', () => {
        const rows = agendaRows([at('2026-08-31'), at('2026-09-02')], today)
        expect(new Set(rows.map(r => r.key)).size).toBe(rows.length)
    })

    it('keeps two events on one day together on one day row', () => {
        const rows = agendaRows([at('2026-10-04', 'a'), at('2026-10-04', 'b')], today)
        const days = rows.filter(r => r.type === 'day')
        expect(days).toHaveLength(1)
        expect(days[0].events.map(e => e.id)).toEqual(['a', 'b'])
    })

    it('names this week and next week rather than dating them', () => {
        const rows = agendaRows([at('2026-08-20'), at('2026-08-25')], today)
        expect(labels(rows)).toEqual(['August 2026', 'This week', 'Next week'])
    })

    it('loses no events on the way through', () => {
        const dates = ['2026-08-25', '2026-08-31', '2026-09-02', '2026-10-04']
        const rows = agendaRows(dates.map(d => at(d)), today)
        expect(rows.filter(r => r.type === 'day').flatMap(r => r.events).map(e => e.event_date))
            .toEqual(dates)
    })

    it('copes with nothing at all', () => {
        expect(agendaRows([], today)).toEqual([])
        expect(agendaRows(null, today)).toEqual([])
    })
})
