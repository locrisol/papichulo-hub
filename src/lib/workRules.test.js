import { describe, it, expect } from 'vitest'
import {
    inHolidayPeriod, weeklyCap, ageOn, longestRest, shortestGap, checkWeek,
    permissionFor, DEFAULT_RULES, findingsByEmployee, worstLevel, overlapFindings,
} from './workRules'

// Sunday 23 August 2026 to Saturday the 29th.
const WEEK = [
    '2026-08-23', '2026-08-24', '2026-08-25', '2026-08-26',
    '2026-08-27', '2026-08-28', '2026-08-29',
]
const shift = (date, starts_at, ends_at, employee_id = 'e1') =>
    ({ shift_date: date, starts_at, ends_at, employee_id })

const person = (extra = {}) => ({ id: 'e1', full_name: 'Ana', ...extra })

describe('inHolidayPeriod', () => {
    const periods = DEFAULT_RULES.holidayPeriods

    it('knows the summer months', () => {
        expect(inHolidayPeriod('2026-06-01', periods)).toBe(true)
        expect(inHolidayPeriod('2026-08-23', periods)).toBe(true)
        expect(inHolidayPeriod('2026-09-30', periods)).toBe(true)
    })

    it('knows term time', () => {
        expect(inHolidayPeriod('2026-10-01', periods)).toBe(false)
        expect(inHolidayPeriod('2026-05-31', periods)).toBe(false)
        expect(inHolidayPeriod('2026-11-15', periods)).toBe(false)
    })

    it('handles the period that runs across the new year', () => {
        // 15 December to 15 January, which is the one easy to get wrong.
        expect(inHolidayPeriod('2026-12-14', periods)).toBe(false)
        expect(inHolidayPeriod('2026-12-15', periods)).toBe(true)
        expect(inHolidayPeriod('2026-12-31', periods)).toBe(true)
        expect(inHolidayPeriod('2027-01-01', periods)).toBe(true)
        expect(inHolidayPeriod('2027-01-15', periods)).toBe(true)
        expect(inHolidayPeriod('2027-01-16', periods)).toBe(false)
    })

    it('is false when nothing is configured', () => {
        expect(inHolidayPeriod('2026-07-01', [])).toBe(false)
        expect(inHolidayPeriod('2026-07-01', null)).toBe(false)
    })
})

describe('weeklyCap', () => {
    it('caps a student at twenty in term time', () => {
        const term = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']
        expect(weeklyCap(person({ work_permission: 'stamp2' }), term, DEFAULT_RULES).hours).toBe(20)
    })

    it('lets a student work full time in the summer', () => {
        expect(weeklyCap(person({ work_permission: 'stamp2' }), WEEK, DEFAULT_RULES).hours).toBe(40)
    })

    it('takes the lower of the two on a week that straddles', () => {
        // 27 September to 3 October: four holiday days and three term days, and
        // there is no way to spend a holiday allowance on a term day.
        const straddle = ['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03']
        expect(weeklyCap(person({ work_permission: 'stamp2' }), straddle, DEFAULT_RULES).hours).toBe(20)
    })

    it('gives Stamp 2A no hours at all', () => {
        expect(weeklyCap(person({ work_permission: 'stamp2a' }), WEEK, DEFAULT_RULES).hours).toBe(0)
    })

    it('caps nobody with no restriction', () => {
        expect(weeklyCap(person({ work_permission: 'unrestricted' }), WEEK, DEFAULT_RULES)).toBe(null)
        expect(weeklyCap(person({ work_permission: '' }), WEEK, DEFAULT_RULES)).toBe(null)
        expect(weeklyCap(person(), WEEK, DEFAULT_RULES)).toBe(null)
    })

    it('does not try to cap a permit tied to an employer', () => {
        expect(weeklyCap(person({ work_permission: 'stamp1' }), WEEK, DEFAULT_RULES)).toBe(null)
    })
})

describe('permissionFor', () => {
    it('finds one and falls back rather than breaking', () => {
        expect(permissionFor('stamp2').term).toBe(20)
        expect(permissionFor('something else').term).toBe(null)
        expect(permissionFor(null).value).toBe('')
    })
})

describe('ageOn', () => {
    it('works out an age', () => {
        expect(ageOn('2000-01-01', '2026-08-23')).toBe(26)
    })

    it('has not counted a birthday that has not happened yet', () => {
        expect(ageOn('2009-08-24', '2026-08-23')).toBe(16)
        expect(ageOn('2009-08-23', '2026-08-23')).toBe(17)
    })

    it('is nothing when the date of birth was never recorded', () => {
        expect(ageOn(null, '2026-08-23')).toBe(null)
    })
})

describe('shortestGap', () => {
    it('measures overnight between two days', () => {
        const shifts = [shift(WEEK[0], '09:00', '21:00'), shift(WEEK[1], '09:00', '17:00')]
        expect(shortestGap(shifts, WEEK).hours).toBe(12)
    })

    it('spots a short turnaround', () => {
        const shifts = [shift(WEEK[0], '13:00', '23:00'), shift(WEEK[1], '08:00', '16:00')]
        expect(shortestGap(shifts, WEEK).hours).toBe(9)
    })

    it('has no gap to measure with one shift', () => {
        expect(shortestGap([shift(WEEK[0], '09:00', '17:00')], WEEK).hours).toBe(Infinity)
    })
})

describe('longestRest', () => {
    it('finds a long stretch in the middle of a week', () => {
        const shifts = [shift(WEEK[0], '09:00', '17:00'), shift(WEEK[4], '09:00', '17:00')]
        // Sunday 17:00 to Thursday 09:00 is 88 hours.
        expect(longestRest(shifts, WEEK)).toBe(88)
    })

    it('counts the run before the first shift', () => {
        const shifts = [shift(WEEK[5], '09:00', '17:00')]
        // Nothing until Friday morning.
        expect(longestRest(shifts, WEEK)).toBe(5 * 24 + 9)
    })

    it('gives somebody with nothing rostered the whole week', () => {
        expect(longestRest([], WEEK)).toBe(Infinity)
    })
})

describe('checkWeek', () => {
    const run = (shifts, employees, rules = {}) => checkWeek({
        shifts, employees, weekDates: WEEK, rules: { ...DEFAULT_RULES, ...rules },
    })

    it('is happy with an ordinary week', () => {
        const shifts = [shift(WEEK[1], '09:00', '17:00'), shift(WEEK[3], '09:00', '17:00')]
        expect(run(shifts, [person()])).toEqual([])
    })

    it('blocks a student over their cap', () => {
        const term = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']
        const shifts = term.slice(0, 4).map(d => shift(d, '09:00', '17:00'))
        const found = checkWeek({
            shifts, employees: [person({ work_permission: 'stamp2' })],
            weekDates: term, rules: DEFAULT_RULES,
        })
        const cap = found.find(f => f.kind === 'visaCap')
        expect(cap.level).toBe('block')
        expect(cap.text).toMatch(/32.00 hours against a limit of 20/)
    })

    it('lets the same week through in the summer', () => {
        const shifts = WEEK.slice(0, 4).map(d => shift(d, '09:00', '17:00'))
        const found = run(shifts, [person({ work_permission: 'stamp2' })])
        expect(found.filter(f => f.kind === 'visaCap')).toEqual([])
    })

    it('blocks a week for somebody whose permission has run out', () => {
        const shifts = [shift(WEEK[1], '09:00', '17:00')]
        const found = run(shifts, [person({ work_permission_expires: '2026-08-01' })])
        expect(found[0].kind).toBe('permissionExpired')
        expect(found[0].level).toBe('block')
    })

    it('blocks a week the permission runs out part way through', () => {
        const shifts = [shift(WEEK[1], '09:00', '17:00')]
        const found = run(shifts, [person({ work_permission_expires: WEEK[4] })])
        expect(found[0].kind).toBe('permissionExpiring')
        expect(found[0].level).toBe('block')
    })

    it('warns well ahead of a permission running out', () => {
        const shifts = [shift(WEEK[1], '09:00', '17:00')]
        const found = run(shifts, [person({ work_permission_expires: '2026-10-01' })])
        expect(found[0].kind).toBe('permissionSoon')
        expect(found[0].level).toBe('warn')
    })

    it('says nothing about a permission running out next year', () => {
        const shifts = [shift(WEEK[1], '09:00', '17:00')]
        expect(run(shifts, [person({ work_permission_expires: '2027-06-01' })])).toEqual([])
    })

    it('warns on a short turnaround only when that rule is on', () => {
        const shifts = [shift(WEEK[0], '13:00', '23:00'), shift(WEEK[1], '08:00', '16:00')]
        expect(run(shifts, [person()])).toEqual([])

        const found = run(shifts, [person()], { dailyRest: { on: true, hours: 11 } })
        expect(found[0].kind).toBe('dailyRest')
        expect(found[0].level).toBe('warn')
    })

    it('warns about too few days off', () => {
        const shifts = WEEK.slice(0, 6).map(d => shift(d, '09:00', '15:00'))
        const found = run(shifts, [person()], { daysOff: { on: true, count: 2 } })
        expect(found.find(f => f.kind === 'daysOff').text).toMatch(/1 day off/)
    })

    it('treats the forty eight hours as an average and not a ceiling', () => {
        // Sixty this week, but forty in each of the three before it.
        const shifts = WEEK.slice(0, 6).map(d => shift(d, '09:00', '19:00'))
        const quiet = checkWeek({
            shifts, employees: [person()], weekDates: WEEK,
            rules: { ...DEFAULT_RULES, maxWeek: { on: true, hours: 48, lookbackWeeks: 17 } },
            priorHoursByEmployee: { e1: [40, 40, 40] },
        })
        expect(quiet.filter(f => f.kind === 'maxWeek')).toEqual([])

        const busy = checkWeek({
            shifts, employees: [person()], weekDates: WEEK,
            rules: { ...DEFAULT_RULES, maxWeek: { on: true, hours: 48, lookbackWeeks: 17 } },
            priorHoursByEmployee: { e1: [55, 55, 55] },
        })
        expect(busy.find(f => f.kind === 'maxWeek').level).toBe('warn')
    })

    it('holds an under 18 to their own limits', () => {
        const young = person({ date_of_birth: '2010-01-01' })
        const long = [shift(WEEK[1], '09:00', '19:00')]
        const found = run(long, [young])
        expect(found.find(f => f.kind === 'minorDay').level).toBe('block')
    })

    it('stops an under 18 working past ten', () => {
        const young = person({ date_of_birth: '2010-01-01' })
        const found = run([shift(WEEK[1], '16:00', '23:00')], [young])
        expect(found.find(f => f.kind === 'minorLate').level).toBe('block')
    })

    it('leaves an adult alone under the same rules', () => {
        const found = run([shift(WEEK[1], '16:00', '23:00')], [person({ date_of_birth: '1990-01-01' })])
        expect(found).toEqual([])
    })

    it('says nothing at all about somebody with no shifts', () => {
        expect(run([], [person({ work_permission: 'stamp2a' })])).toEqual([])
    })

    // Availability. On by default, which is only safe because it can never say
    // anything about somebody who has none recorded, and nobody has until they
    // are typed in.
    it('leaves everybody alone until availability is typed in', () => {
        const shifts = [shift(WEEK[0], '09:00', '17:00'), shift(WEEK[1], '09:00', '17:00')]
        expect(run(shifts, [person()])).toEqual([])
    })

    it('says so when somebody is on a day they said they cannot work', () => {
        const off = person({ availability: { 0: [] } })
        const found = run([shift(WEEK[0], '09:00', '17:00')], [off])
        const said = found.find(f => f.kind === 'availabilityDay')
        expect(said.level).toBe('warn')
        expect(said.text).toContain('Sunday')
    })

    it('says nothing about the days that record says nothing about', () => {
        const off = person({ availability: { 0: [] } })
        expect(run([shift(WEEK[1], '09:00', '17:00')], [off])).toEqual([])
    })

    it('says so when a shift runs outside the hours they can work', () => {
        const student = person({ availability: { 1: [['17:00', '23:00']] } })
        const found = run([shift(WEEK[1], '09:00', '17:00')], [student])
        const said = found.find(f => f.kind === 'availabilityTime')
        expect(said.level).toBe('warn')
        expect(said.text).toContain('17:00 to 23:00')
    })

    it('is happy with a shift inside them', () => {
        const student = person({ availability: { 1: [['17:00', '23:00']] } })
        expect(run([shift(WEEK[1], '18:00', '22:00')], [student])).toEqual([])
    })

    it('never holds a week back over availability', () => {
        const off = person({ availability: { 0: [], 1: [] } })
        const shifts = [shift(WEEK[0], '09:00', '17:00'), shift(WEEK[1], '09:00', '17:00')]
        expect(run(shifts, [off]).every(f => f.level === 'warn')).toBe(true)
    })

    it('goes quiet when the rule is turned off', () => {
        const off = person({ availability: { 0: [] } })
        const found = run([shift(WEEK[0], '09:00', '17:00')], [off], { availability: { on: false } })
        expect(found).toEqual([])
    })

    // Time off. A warning like availability, because somebody back early from a
    // holiday or coming in for one shift is a real thing rather than a mistake.
    const holiday = {
        id: 'a1', employee_id: 'e1', kind: 'holiday',
        starts_on: WEEK[1], ends_on: WEEK[3], status: 'approved',
    }
    const withAbsences = (shifts, employees, absences) => checkWeek({
        shifts, employees, weekDates: WEEK, rules: DEFAULT_RULES, absences,
    })

    it('says so when somebody is rostered on their time off', () => {
        const found = withAbsences([shift(WEEK[2], '09:00', '17:00')], [person()], [holiday])
        const said = found.find(f => f.kind === 'timeOff')
        expect(said.level).toBe('warn')
        expect(said.text).toContain('on holiday')
    })

    it('counts the last day of the stretch', () => {
        const found = withAbsences([shift(WEEK[3], '09:00', '17:00')], [person()], [holiday])
        expect(found.find(f => f.kind === 'timeOff')).toBeTruthy()
    })

    it('leaves the day after it alone', () => {
        const found = withAbsences([shift(WEEK[4], '09:00', '17:00')], [person()], [holiday])
        expect(found).toEqual([])
    })

    it('says nothing when there is no time off recorded', () => {
        expect(withAbsences([shift(WEEK[2], '09:00', '17:00')], [person()], [])).toEqual([])
    })

    it('ignores one that was turned down', () => {
        const declined = [{ ...holiday, status: 'declined' }]
        expect(withAbsences([shift(WEEK[2], '09:00', '17:00')], [person()], declined)).toEqual([])
    })

    it('never holds a week back over time off', () => {
        const found = withAbsences([shift(WEEK[2], '09:00', '17:00')], [person()], [holiday])
        expect(found.every(f => f.level === 'warn')).toBe(true)
    })
})

// Getting the findings onto the row they are about. A banner above the grid is
// only read on the way past, and by the time somebody is putting a shift in on
// Thursday they have scrolled well past it.
describe('filing findings under the person', () => {
    const found = [
        { level: 'warn', kind: 'daysOff', employeeId: 'e1', text: 'a' },
        { level: 'block', kind: 'visaCap', employeeId: 'e1', text: 'b' },
        { level: 'warn', kind: 'daysOff', employeeId: 'e2', text: 'c' },
    ]

    it('groups them by person', () => {
        const by = findingsByEmployee(found)
        expect(by.e1).toHaveLength(2)
        expect(by.e2).toHaveLength(1)
        expect(by.e3).toBe(undefined)
    })

    it('leaves out anything not about a person', () => {
        expect(findingsByEmployee([{ level: 'warn', text: 'a' }])).toEqual({})
    })

    // One mark has to stand for everything on the row, so it has to be the
    // worse of them or a block hides behind a warning.
    it('takes the worse of what somebody has', () => {
        expect(worstLevel(found.filter(f => f.employeeId === 'e1'))).toBe('block')
        expect(worstLevel(found.filter(f => f.employeeId === 'e2'))).toBe('warn')
        expect(worstLevel([])).toBe(null)
        expect(worstLevel(null)).toBe(null)
    })

    it('puts a double booking in the same shape as the rest', () => {
        const a = { employee_id: 'e1', shift_date: '2026-08-24', starts_at: '09:00', ends_at: '17:00' }
        const b = { employee_id: 'e1', shift_date: '2026-08-24', starts_at: '12:00', ends_at: '20:00' }
        const [finding] = overlapFindings([[a, b]], { e1: { full_name: 'Ana' } })
        expect(finding.employeeId).toBe('e1')
        expect(finding.level).toBe('warn')
        expect(finding.text).toContain('09:00')
        expect(finding.text).toContain('12:00')
    })

    it('is happy with no clashes at all', () => {
        expect(overlapFindings([], {})).toEqual([])
        expect(overlapFindings(null, {})).toEqual([])
    })
})
