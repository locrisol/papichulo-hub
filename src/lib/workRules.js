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
import { outsideAvailability, windowsLabel, dayNameOf, availabilityOn, availabilityStart } from './availability'
import { absencesOn, kindPhrase, isPartDay } from './absences'
import { hitsShift, partWords } from './timeOff'
import { shortDate } from './dates'

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
    // Same reasoning as availability: it can only ever say something about a
    // day somebody has actually been marked away for, so it stays quiet on its
    // own until there is something to say.
    timeOff: { on: true },
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

// Where a shift sits on a real timeline, counted in minutes from midnight at
// the start of the week.
//
// It is worked out from the dates themselves rather than from where the day
// falls in the week, which is the whole point: a shift last Saturday and a
// shift next Monday both have a place on this line, and the week's own edges
// stop being walls.
function placeOf(anchor, shift) {
    return daysBetween(anchor, shift.shift_date) * 1440 + toMinutes(shift.starts_at)
}

function inOrder(shifts) {
    return (shifts || []).slice().sort((a, b) =>
        a.shift_date.localeCompare(b.shift_date) || toMinutes(a.starts_at) - toMinutes(b.starts_at),
    )
}

// The longest run of hours somebody is not working, around a week.
//
// Rest does not stop on a Saturday night, so neither does this. Give it the
// shifts either side of the week as well as the week's own and it measures from
// the last shift before to the first shift after.
//
// Nothing back means it cannot say, and that is different from saying somebody
// is fine. Two of those:
//
//   nothing rostered after the week   the week after has not been built yet, so
//                                     a long break at the end of this one is a
//                                     guess. It stays quiet rather than clearing
//                                     somebody who might be in on Sunday.
//   nothing rostered in the week      no shifts, nothing to check.
//
// Nothing rostered before the week is not the same case. The week before either
// was worked or was not, and an empty one is a week off, so the run in front of
// the first shift is as long as we like.
export function longestRest(shifts, weekDates) {
    const first = weekDates?.[0]
    const last = weekDates?.[6]
    if (!first || !last) return null

    const sorted = inOrder(shifts)
    const inWeek = sorted.filter(s => s.shift_date >= first && s.shift_date <= last)
    if (inWeek.length === 0) return null

    const next = sorted.find(s => s.shift_date > last)
    if (!next) return null

    const previous = sorted.filter(s => s.shift_date < first).pop()

    const startOf = s => placeOf(first, s)
    const endOf = s => startOf(s) + shiftMinutes(s.starts_at, s.ends_at)

    const run = [...(previous ? [previous] : []), ...inWeek, next]
    let best = previous ? 0 : Infinity
    for (let i = 1; i < run.length; i++) {
        best = Math.max(best, startOf(run[i]) - endOf(run[i - 1]))
    }
    return best / 60
}

// The shortest gap between two shifts in a row.
//
// Same timeline, and for the same reason. Somebody closing on Saturday night
// and opening on Sunday morning is the exact turnaround the eleven hour rule
// exists to catch, and it used to go unnoticed because the two shifts were in
// different weeks.
//
// A pair is only measured if one of the two is in the week being checked.
// Last week's own turnarounds were last week's problem.
export function shortestGap(shifts, weekDates) {
    const first = weekDates?.[0]
    const last = weekDates?.[6]
    if (!first || !last) return { hours: Infinity, after: null }

    const sorted = inOrder(shifts)
    const startOf = s => placeOf(first, s)
    const endOf = s => startOf(s) + shiftMinutes(s.starts_at, s.ends_at)
    const thisWeek = s => s.shift_date >= first && s.shift_date <= last

    let best = Infinity
    let after = null
    for (let i = 1; i < sorted.length; i++) {
        const before = sorted[i - 1]
        const then = sorted[i]
        if (!thisWeek(before) && !thisWeek(then)) continue
        const gap = startOf(then) - endOf(before)
        if (gap < best) { best = gap; after = before }
    }
    return { hours: best / 60, after }
}

// Everything wrong with a week, as a list of findings.
//
// A finding is either a block or a warning. Blocks stop the week going out,
// warnings do not. Nothing here throws anything away or refuses to save: it is
// all said out loud and left to the person building the roster.
export function checkWeek({
    shifts, employees, weekDates, rules, priorHoursByEmployee, absences, nearbyShifts, today,
}) {
    const settings = { ...DEFAULT_RULES, ...(rules || {}) }
    const findings = []
    const weekEnd = weekDates?.[6]
    // The first date availability is allowed to say anything about. Taken as an
    // argument so it can be pinned in a test rather than moving with the clock.
    const availableFrom = availabilityStart(today)

    for (const employee of employees || []) {
        const mine = (shifts || []).filter(s => s.employee_id === employee.id)
        const hours = mine.reduce((t, s) => t + shiftHours(s), 0)
        // The same person's week with a few days of either side added on, for
        // the two checks about rest. Everything else is about this week alone.
        const around = [
            ...mine,
            ...(nearbyShifts || []).filter(s =>
                s.employee_id === employee.id
                && (s.shift_date < weekDates?.[0] || s.shift_date > weekEnd)),
        ]
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
                const gap = shortestGap(around, weekDates)
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
                // Nothing on a week that has gone, for the same reason
                // the grid stops shading one: availability carries no date,
                // so today's answer is not evidence about last month.
                const outside = outsideAvailability(availabilityOn(employee, s.shift_date, availableFrom), s)
                if (!outside) continue

                if (outside.kind === 'day') {
                    add('warn', 'availabilityDay',
                        `${name} is rostered on ${s.shift_date}, a ${dayNameOf(s.shift_date)} they said they cannot work.`)
                } else {
                    add('warn', 'availabilityTime',
                        `${name} is rostered ${shortTime(s.starts_at)} to ${shortTime(s.ends_at)} on ${shortDate(s.shift_date)} and can work ${windowsLabel(outside.windows)}.`)
                }
            }
        }

        // Days they are down as away.
        //
        // A warning, and for the same reason as availability. Somebody back
        // early from a holiday, or coming in for one shift in the middle of a
        // week off, is a real thing rather than a mistake.
        if (settings.timeOff?.on) {
            for (const s of mine) {
                // Only the ones the shift actually runs into. Somebody who can
                // work until three and is on nine to one has no clash, and
                // warning about it would be crying wolf at the one person who
                // did everything right.
                const off = absencesOn(absences, employee.id, s.shift_date)
                    .filter(a => hitsShift(a, s))
                if (off.length === 0) continue

                const first = off[0]
                add('warn', 'timeOff', isPartDay(first)
                    ? `${name} is rostered ${shortTime(s.starts_at)} to ${shortTime(s.ends_at)} on ${shortDate(s.shift_date)} and ${partWords(first)}.`
                    : `${name} is rostered on ${shortDate(s.shift_date)} and is down as ${kindPhrase(first.kind)}.`)
            }
        }

        if (settings.dailyRest?.on) {
            const gap = shortestGap(around, weekDates)
            if (gap.hours < settings.dailyRest.hours) {
                add('warn', 'dailyRest',
                    `${name} has only ${gap.hours.toFixed(1)} hours between two shifts, against ${settings.dailyRest.hours}.`)
            }
        }

        // Nothing back from longestRest means the week after has not been
        // built, so there is no honest answer yet. It waits rather than
        // warning about a break that has not been decided.
        if (settings.weeklyRest?.on) {
            const rest = longestRest(around, weekDates)
            if (rest !== null && rest < settings.weeklyRest.hours) {
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

// Everything the week found, filed under the person it is about.
//
// The roster reads down a column of names, so a warning that only exists in a
// banner above the grid is a warning nobody sees. This is what lets the row
// itself carry it.
export function findingsByEmployee(findings) {
    const out = {}
    for (const finding of findings || []) {
        if (!finding.employeeId) continue
        if (!out[finding.employeeId]) out[finding.employeeId] = []
        out[finding.employeeId].push(finding)
    }
    return out
}

// The worse of what a person has, since one mark has to stand for all of it.
export function worstLevel(findings) {
    if (!findings?.length) return null
    return findings.some(f => f.level === 'block') ? 'block' : 'warn'
}

// Somebody in two places at once, in the same shape as everything else.
//
// It is worked out separately from checkWeek because it is about two shifts
// rather than about a person, but on the grid it is the same thing: something
// wrong with that row. A warning rather than a block, which is what it already
// was before it had anywhere to appear.
export function overlapFindings(clashes, employeesById) {
    return (clashes || []).map(([a, b]) => ({
        level: 'warn',
        kind: 'clash',
        employeeId: a.employee_id,
        name: employeesById?.[a.employee_id]?.full_name || '',
        text: `Rostered twice over the same hours on ${a.shift_date}, ${shortTime(a.starts_at)} and ${shortTime(b.starts_at)}.`,
    }))
}

function daysBetween(from, to) {
    return Math.round(
        (new Date(to + 'T00:00:00') - new Date(from + 'T00:00:00')) / 86400000,
    )
}
