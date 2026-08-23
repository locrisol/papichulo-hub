// The rules a roster gets checked against.
//
// Two kinds, and they are not treated the same.
//
// Rest, days off and the long term average are about somebody being worn out.
// They warn, they never refuse, and they are off until a restaurant turns them
// on. A manager sometimes knows something the roster does not, and a tool that
// refuses is a tool people work around.
//
// A visa cap is different. Going over it is an offence by the employer rather
// than a bad week for the employee, so it is on from the start and it stops the
// week going out until somebody deliberately overrides it.
//
// None of this is legal advice and the numbers should be checked against
// current guidance. They are here as settings rather than as constants for
// exactly that reason.

import { shiftHours, shiftMinutes, toMinutes, shortTime } from './roster'
import { outsideAvailability, windowsLabel, dayNameOf } from './availability'

// What each immigration stamp allows, in hours a week.
//
// null means no cap from us: either there is no restriction, or the restriction
// is of a kind the roster cannot check, like a permit tied to one employer.
export const WORK_PERMISSIONS = [
    { value: '', label: 'Not recorded', term: null, holiday: null },
    { value: 'unrestricted', label: 'No restriction (citizen, EU, Stamp 4)', term: null, holiday: null },
    { value: 'stamp2', label: 'Stamp 2 (student)', term: 20, holiday: 40 },
    { value: 'stamp2a', label: 'Stamp 2A (no permission to work)', term: 0, holiday: 0 },
    { value: 'stamp1', label: 'Stamp 1 (employment permit)', term: null, holiday: null },
    { value: 'stamp1g', label: 'Stamp 1G (graduate)', term: null, holiday: null },
]

// The food safety training a restaurant records against somebody.
export const FOOD_SAFETY_LEVELS = [
    { value: '', label: 'None recorded' },
    { value: 'induction', label: 'Induction skills' },
    { value: 'level1', label: 'Level 1, additional skills' },
    { value: 'level2', label: 'Level 2, HACCP' },
    { value: 'level3', label: 'Level 3, management' },
]

export const DEFAULT_RULES = {
    dailyRest: { on: false, hours: 11 },
    weeklyRest: { on: false, hours: 35 },
    daysOff: { on: false, count: 2 },
    maxWeek: { on: false, hours: 48, lookbackWeeks: 17 },
    underAge: { on: true },
    // On from the start, unlike the rest of the warnings, because it can
    // only ever fire about somebody whose availability has actually been
    // typed in. A restaurant that never fills any in never hears from it.
    availability: { on: true },
    // blocks says whether going over somebody's permitted hours holds the week
    // back or only says so. It holds by default, because going over is the
    // company's offence rather than the person's. Turning it down to a warning
    // is a decision a restaurant can make, and the check keeps saying it either
    // way rather than going quiet.
    visaCap: { on: true, blocks: true },
    foodSafety: { on: true, warnDays: 60, validMonths: 24 },
    gridHours: { before: 3, after: 3 },
    holidayPeriods: [
        { from: '06-01', to: '09-30' },
        { from: '12-15', to: '01-15' },
    ],
}

// Two years on from a date, which is the usual term for a food safety
// certificate. Offered rather than enforced: a certificate that says something
// different should be able to say something different here.
export function expiryFrom(issued, months = 24) {
    if (!issued) return ''
    const d = new Date(issued + 'T00:00:00')
    d.setMonth(d.getMonth() + months)
    const pad = n => String(n).padStart(2, '0')
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

// How something expiring reads against a week: already gone, going part way
// through it, or coming up soon enough to do something about.
export function expiryState(expires, weekStart, weekEnd, warnDays) {
    if (!expires || !weekStart || !weekEnd) return null
    if (expires < weekStart) return 'expired'
    if (expires <= weekEnd) return 'expiring'
    if (daysBetween(weekEnd, expires) <= (warnDays ?? 60)) return 'soon'
    return null
}

export function permissionFor(value) {
    return WORK_PERMISSIONS.find(p => p.value === (value || '')) || WORK_PERMISSIONS[0]
}

// Is this date inside one of the periods a student may work full time?
//
// A period given as 12-15 to 01-15 runs across the new year, so it is inside if
// the date is after the start or before the end rather than both.
export function inHolidayPeriod(date, periods) {
    const md = String(date).slice(5)
    for (const period of periods || []) {
        if (!period?.from || !period?.to) continue
        const wraps = period.from > period.to
        const inside = wraps
            ? md >= period.from || md <= period.to
            : md >= period.from && md <= period.to
        if (inside) return true
    }
    return false
}

// How many hours this person may work in the week starting on this date.
//
// A week that straddles term time and a holiday period takes the lower of the
// two, because the twenty hour cap applies to the days it applies to and there
// is no way to spend the holiday allowance on a term time day.
export function weeklyCap(employee, weekDates, rules) {
    const permission = permissionFor(employee?.work_permission)
    if (permission.term === null && permission.holiday === null) return null

    const periods = rules?.holidayPeriods || DEFAULT_RULES.holidayPeriods
    const caps = (weekDates || []).map(d =>
        inHolidayPeriod(d, periods) ? permission.holiday : permission.term,
    )
    if (caps.length === 0) return null
    return { hours: Math.min(...caps), permission }
}

// How old somebody is on a given day, or nothing if we do not know.
export function ageOn(dateOfBirth, date) {
    if (!dateOfBirth || !date) return null
    const born = new Date(dateOfBirth + 'T00:00:00')
    const on = new Date(date + 'T00:00:00')
    let age = on.getFullYear() - born.getFullYear()
    const monthDay = on.getMonth() - born.getMonth()
        || on.getDate() - born.getDate()
    if (monthDay < 0) age -= 1
    return age
}

// The longest run of hours somebody is not working, across a week.
//
// Measured from the end of one shift to the start of the next, so a person with
// one shift on Monday and one on Friday has a very long rest and a person on
// every day has whatever their nights come to.
export function longestRest(shifts, weekDates) {
    const sorted = (shifts || []).slice().sort((a, b) =>
        a.shift_date.localeCompare(b.shift_date) || toMinutes(a.starts_at) - toMinutes(b.starts_at),
    )
    if (sorted.length === 0) return Infinity

    const dayIndex = d => (weekDates || []).indexOf(d)
    const startOf = s => dayIndex(s.shift_date) * 1440 + toMinutes(s.starts_at)
    const endOf = s => startOf(s) + shiftMinutes(s.starts_at, s.ends_at)

    // The week's own edges count: time before the first shift and after the
    // last one is rest as far as this week can see.
    let best = Math.max(startOf(sorted[0]), 7 * 1440 - endOf(sorted[sorted.length - 1]))
    for (let i = 1; i < sorted.length; i++) {
        best = Math.max(best, startOf(sorted[i]) - endOf(sorted[i - 1]))
    }
    return best / 60
}

// The shortest gap between two shifts in a row.
export function shortestGap(shifts, weekDates) {
    const sorted = (shifts || []).slice().sort((a, b) =>
        a.shift_date.localeCompare(b.shift_date) || toMinutes(a.starts_at) - toMinutes(b.starts_at),
    )
    if (sorted.length < 2) return { hours: Infinity, after: null }

    const dayIndex = d => (weekDates || []).indexOf(d)
    const startOf = s => dayIndex(s.shift_date) * 1440 + toMinutes(s.starts_at)
    const endOf = s => startOf(s) + shiftMinutes(s.starts_at, s.ends_at)

    let best = Infinity
    let after = null
    for (let i = 1; i < sorted.length; i++) {
        const gap = startOf(sorted[i]) - endOf(sorted[i - 1])
        if (gap < best) { best = gap; after = sorted[i - 1] }
    }
    return { hours: best / 60, after }
}

// Everything wrong with a week, as a list of findings.
//
// A finding is either a block or a warning. Blocks stop the week going out,
// warnings do not. Nothing here throws anything away or refuses to save: it is
// all said out loud and left to the person building the roster.
export function checkWeek({ shifts, employees, weekDates, rules, priorHoursByEmployee }) {
    const settings = { ...DEFAULT_RULES, ...(rules || {}) }
    const findings = []
    const weekEnd = weekDates?.[6]

    for (const employee of employees || []) {
        const mine = (shifts || []).filter(s => s.employee_id === employee.id)
        const hours = mine.reduce((t, s) => t + shiftHours(s), 0)
        const name = employee.full_name
        const add = (level, kind, text) => findings.push({ level, kind, employeeId: employee.id, name, text })

        // Anything with an expiry date, checked before the hour rules, because
        // if one of these is wrong none of the rest matters.
        const permission = expiryState(
            employee.work_permission_expires, weekDates?.[0], weekEnd, 60,
        )
        if (permission === 'expired') {
            add('block', 'permissionExpired',
                `${name}'s permission to work ran out on ${employee.work_permission_expires}.`)
        } else if (permission === 'expiring') {
            add('block', 'permissionExpiring',
                `${name}'s permission to work runs out on ${employee.work_permission_expires}, part way through this week.`)
        } else if (permission === 'soon') {
            add('warn', 'permissionSoon',
                `${name}'s permission to work runs out on ${employee.work_permission_expires}.`)
        }

        // Food safety training. A certificate nobody is watching is one that
        // has quietly run out, and finding that out during an inspection is the
        // expensive way. It warns rather than blocks: an expired certificate is
        // a course to book, not a reason the roster cannot go out.
        if (settings.foodSafety?.on) {
            const food = expiryState(
                employee.food_safety_expires, weekDates?.[0], weekEnd,
                settings.foodSafety.warnDays,
            )
            if (food === 'expired') {
                add('warn', 'foodSafetyExpired',
                    `${name}'s food safety training ran out on ${employee.food_safety_expires}.`)
            } else if (food === 'expiring' || food === 'soon') {
                add('warn', 'foodSafetySoon',
                    `${name}'s food safety training runs out on ${employee.food_safety_expires}.`)
            }
        }

        if (mine.length === 0) continue

        // The visa cap. On from the start and it blocks, because going over it
        // is the employer's offence rather than the employee's problem.
        if (settings.visaCap?.on) {
            const cap = weeklyCap(employee, weekDates, settings)
            if (cap && hours > cap.hours) {
                add(settings.visaCap.blocks === false ? 'warn' : 'block', 'visaCap',
                    `${name} is on ${cap.permission.label} and is rostered ${hours.toFixed(2)} hours against a limit of ${cap.hours}.`)
            }
        }

        // Under 18s have their own set, and they are stricter throughout.
        if (settings.underAge?.on) {
            const age = ageOn(employee.date_of_birth, weekDates?.[0])
            if (age !== null && age < 18) {
                if (hours > 40) {
                    add('block', 'minorWeek', `${name} is under 18 and is rostered ${hours.toFixed(2)} hours against a limit of 40.`)
                }
                for (const s of mine) {
                    if (shiftHours(s) > 8) {
                        add('block', 'minorDay', `${name} is under 18 and has a ${shiftHours(s).toFixed(2)} hour shift on ${s.shift_date}, against a limit of 8.`)
                        break
                    }
                }
                const late = mine.find(s => toMinutes(s.starts_at) + shiftMinutes(s.starts_at, s.ends_at) > 22 * 60)
                if (late) {
                    add('block', 'minorLate', `${name} is under 18 and is rostered past ten at night on ${late.shift_date}.`)
                }
                const gap = shortestGap(mine, weekDates)
                if (gap.hours < 12) {
                    add('warn', 'minorRest', `${name} is under 18 and has only ${gap.hours.toFixed(1)} hours between two shifts, against 12.`)
                }
            }
        }

        // What they said they can work.
        //
        // A warning and never a block. It is a promise to the person rather
        // than the law about the company, and a manager who knows the college
        // timetable changed this term should be able to roster straight over it
        // and be told once.
        if (settings.availability?.on) {
            for (const s of mine) {
                const outside = outsideAvailability(employee.availability, s)
                if (!outside) continue

                if (outside.kind === 'day') {
                    add('warn', 'availabilityDay',
                        `${name} is rostered on ${s.shift_date}, a ${dayNameOf(s.shift_date)} they said they cannot work.`)
                } else {
                    add('warn', 'availabilityTime',
                        `${name} is rostered ${shortTime(s.starts_at)} to ${shortTime(s.ends_at)} on ${s.shift_date} and can work ${windowsLabel(outside.windows)}.`)
                }
            }
        }

        if (settings.dailyRest?.on) {
            const gap = shortestGap(mine, weekDates)
            if (gap.hours < settings.dailyRest.hours) {
                add('warn', 'dailyRest',
                    `${name} has only ${gap.hours.toFixed(1)} hours between two shifts, against ${settings.dailyRest.hours}.`)
            }
        }

        if (settings.weeklyRest?.on) {
            const rest = longestRest(mine, weekDates)
            if (rest < settings.weeklyRest.hours) {
                add('warn', 'weeklyRest',
                    `${name}'s longest break this week is ${rest.toFixed(1)} hours, against ${settings.weeklyRest.hours}.`)
            }
        }

        if (settings.daysOff?.on) {
            const worked = new Set(mine.map(s => s.shift_date)).size
            const off = 7 - worked
            if (off < settings.daysOff.count) {
                add('warn', 'daysOff',
                    `${name} has ${off} ${off === 1 ? 'day' : 'days'} off this week, against ${settings.daysOff.count}.`)
            }
        }

        // The forty eight hour week is an average and not a ceiling, so a single
        // long week is not a breach and warning on one would cry wolf every
        // time somebody covered a holiday.
        if (settings.maxWeek?.on) {
            const prior = priorHoursByEmployee?.[employee.id] || []
            const weeks = prior.length + 1
            const average = (prior.reduce((t, h) => t + h, 0) + hours) / weeks
            if (average > settings.maxWeek.hours) {
                add('warn', 'maxWeek',
                    `${name} averages ${average.toFixed(1)} hours a week over the last ${weeks}, against ${settings.maxWeek.hours}.`)
            }
        }
    }

    return findings
}

function daysBetween(from, to) {
    return Math.round(
        (new Date(to + 'T00:00:00') - new Date(from + 'T00:00:00')) / 86400000,
    )
}
