// Checklists: the cleaning lists staff tick on the phone.
//
// Asked for on 27 September 2026 to replace what Kitchtech does for us. A list
// is categories, elements, and sub elements under an element. Only the things
// at the bottom are ticked: an element with things under it is done when they
// all are, which is the database's rule too (checklist_left in schema.sql), so
// the two cannot disagree about when a round is finished.
//
// A round is one go at a list, started by anybody and open until everything is
// ticked. It counts in the week it finishes. Everything in here is worked out
// from rows the page has already read, so all of it can be tested without a
// database.

import {
    addDays, addMonths, dayLabel, daysBetween, monthName, monthStart, shortDate, stampDay, toISODate, WEEKDAY_NAMES, weekStartOf,
} from '@/lib/dates'

// Timestamps come back from the database as text with an offset, and a
// comparison of two strings only works when both are written the same way. So
// every comparison in here goes through the clock.
const ms = stamp => new Date(stamp).getTime()

const byOrder = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)

// The list as it is now: its categories in order, each with its elements, each
// element with its sub elements. What was taken off the list is left out, and
// so is a sub element whose element was taken off.
export function listTree(categories, tasks) {
    const live = tasks.filter(t => t.is_active)
    const subsOf = new Map()
    for (const t of live) {
        if (!t.parent_id) continue
        if (!subsOf.has(t.parent_id)) subsOf.set(t.parent_id, [])
        subsOf.get(t.parent_id).push(t)
    }
    return categories
        .filter(c => c.is_active)
        .sort(byOrder)
        .map(category => ({
            category,
            elements: live
                .filter(t => !t.parent_id && t.category_id === category.id)
                .sort(byOrder)
                .map(task => ({ task, subs: (subsOf.get(task.id) || []).sort(byOrder) })),
        }))
}

// Every thing that gets ticked, in the order the list reads.
export function tickable(tree) {
    return tree.flatMap(({ elements }) =>
        elements.flatMap(({ task, subs }) => (subs.length ? subs : [task])))
}

// How far a round has got: what is ticked out of what is on the list now.
export function progressOf(tree, ticks) {
    const ticked = new Set(ticks.map(t => t.task_id))
    const all = tickable(tree)
    return { done: all.filter(t => ticked.has(t.id)).length, total: all.length }
}

// An element is done when it is ticked, or when everything under it is.
export function elementDone({ task, subs }, ticked) {
    return subs.length ? subs.every(s => ticked.has(s.id)) : ticked.has(task.id)
}

export function repeatWords(list) {
    if (list.repeats === 'monthly') return 'Every month'
    if (list.repeats === 'once') return 'Once'
    return list.every_weeks === 1 ? 'Every week' : `Every ${list.every_weeks} weeks`
}

// The stretch of days a date falls in, for how often the list repeats. Every
// so many weeks counts from the week of starts_on, Sunday to Saturday like
// every other week in the Hub. A month is the calendar month. A list done once
// has one stretch, from the day it is due to the day it should be finished by,
// which may be open ended.
export function periodOf(list, date) {
    if (list.repeats === 'monthly') {
        const from = monthStart(date)
        return { from, to: addDays(addMonths(from, 1), -1) }
    }
    if (list.repeats === 'once') return { from: list.starts_on, to: list.finish_by || null }
    const length = 7 * list.every_weeks
    const anchor = weekStartOf(list.starts_on)
    const steps = Math.floor(daysBetween(anchor, weekStartOf(date)) / length)
    const from = addDays(anchor, steps * length)
    return { from, to: addDays(from, length - 1) }
}

// How a stretch is spoken of on the phone.
export function periodWords(list) {
    if (list.repeats === 'monthly') return 'this month'
    if (list.repeats === 'once') return ''
    return list.every_weeks === 1 ? 'this week' : `these ${list.every_weeks} weeks`
}

// A day with no time, the way last done is always written: Tue 22 Sept. His
// word: "only day, not time".
export function doneDay(stamp) {
    if (!stamp) return ''
    return dayLabel(stampDay(stamp))
}

// The same with the weekday written out, for a sentence: Tuesday 22 Sept.
export function doneDayLong(stamp) {
    if (!stamp) return ''
    const date = stampDay(stamp)
    return `${WEEKDAY_NAMES[new Date(date + 'T00:00:00').getDay()]} ${shortDate(date)}`
}

// How long ago, the way Kitchtech says Last updated 7 hours ago.
export function agoWords(stamp, now = new Date()) {
    const minutes = Math.floor((now - new Date(stamp)) / 60000)
    if (minutes < 1) return 'just now'
    if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`
    const days = daysBetween(stampDay(stamp), toISODate(now))
    return days === 1 ? 'yesterday' : `${days} days ago`
}

// The latest tick of each task, from any round.
export function lastDoneByTask(ticks) {
    const last = new Map()
    for (const t of ticks) {
        const seen = last.get(t.task_id)
        if (!seen || ms(t.done_at) > ms(seen)) last.set(t.task_id, t.done_at)
    }
    return last
}

// open, finished (everything was ticked) or ended (a manager stopped it with
// things left).
export function roundOutcome(round) {
    if (!round.ended_at) return 'open'
    return round.ended_by ? 'ended' : 'finished'
}

const latest = (rows, field) => rows.reduce((best, r) => (!best || ms(r[field]) > ms(best[field]) ? r : best), null)

// The round of the same list that ended most recently before this one began.
export function roundBefore(rounds, round) {
    return latest(rounds.filter(r => r.checklist_id === round.checklist_id && r.id !== round.id
        && r.ended_at && ms(r.ended_at) <= ms(round.started_at)), 'ended_at')
}

// What was left undone when a round was ended early, and is still on the list.
// It comes back as High priority on the next round until it is ticked. Asked
// for on 27 September: "the tasks that weren't completed last time should be
// label as High Priority and tinted in red". A round that finished left nothing
// undone, and something added to the list after the round ended was never
// left, so neither counts.
export function leftLastTime(tree, before, ticks) {
    if (!before || roundOutcome(before) !== 'ended') return new Set()
    const ticked = new Set(ticks.filter(t => t.round_id === before.id).map(t => t.task_id))
    return new Set(tickable(tree)
        .filter(t => !ticked.has(t.id) && !(t.created_at && ms(t.created_at) > ms(before.ended_at)))
        .map(t => t.id))
}

// What a list's card on the phone says, and whether it offers Start. Only one
// round is ever open, which the database holds to, so there is no choosing.
// `priority` is how many High priority things are waiting, said on the card.
export function cardState({ priority = 0, ...rest }) {
    return { ...stateOfCard(rest), priority }
}

function stateOfCard({ list, rounds, done, total, lastTick, today }) {
    const mine = rounds.filter(r => r.checklist_id === list.id)
    const open = mine.find(r => !r.ended_at)
    if (open) {
        return {
            kind: 'open', round: open, done, total,
            started: `Started ${doneDayLong(open.started_at)}${open.started_by_name ? ` by ${open.started_by_name}` : ''}`,
            lastTick: lastTick || null,
            canStart: false,
        }
    }
    const ended = latest(mine.filter(r => r.ended_at), 'ended_at')
    if (list.repeats === 'once') {
        return ended
            ? { kind: 'done', round: ended, when: doneDayLong(ended.ended_at), canStart: false, early: roundOutcome(ended) === 'ended' }
            : { kind: 'due', canStart: today >= list.starts_on, late: Boolean(list.finish_by && today > list.finish_by) }
    }
    const period = periodOf(list, today)
    if (ended && stampDay(ended.ended_at) >= period.from) {
        return { kind: 'done', round: ended, when: doneDayLong(ended.ended_at), canStart: true, early: roundOutcome(ended) === 'ended' }
    }
    return { kind: 'due', canStart: true, last: ended ? doneDayLong(ended.ended_at) : null, period }
}

// Ticks per day of the week, Sunday first, the way the Hub's week runs.
export function ticksByWeekday(ticks) {
    const days = [0, 0, 0, 0, 0, 0, 0]
    for (const t of ticks) days[new Date(t.done_at).getDay()] += 1
    return days
}

// Ticks per hour of the day, midnight first.
export function ticksByHour(ticks) {
    const hours = Array(24).fill(0)
    for (const t of ticks) hours[new Date(t.done_at).getHours()] += 1
    return hours
}

export const weekdayName = i => WEEKDAY_NAMES[i]

// The day cut into the parts a kitchen thinks in, since twenty four bars for
// the hours is more than anybody reads.
export const TIME_BANDS = [
    { label: 'Before 9am', from: 0, to: 9 },
    { label: '9am to 12pm', from: 9, to: 12 },
    { label: '12pm to 3pm', from: 12, to: 15 },
    { label: '3pm to 6pm', from: 15, to: 18 },
    { label: '6pm to 9pm', from: 18, to: 21 },
    { label: 'After 9pm', from: 21, to: 24 },
]

export function ticksByTimeOfDay(ticks) {
    const hours = ticksByHour(ticks)
    return TIME_BANDS.map(b => ({ label: b.label, count: hours.slice(b.from, b.to).reduce((sum, n) => sum + n, 0) }))
}

// Which day most of the ticking happens on and which least, in a sentence.
// Only days with something on them count as the least, or a list done on
// weekdays would always say Sunday.
export function busiestWords(byDay) {
    const total = byDay.reduce((sum, n) => sum + n, 0)
    if (!total) return ''
    const most = byDay.indexOf(Math.max(...byDay))
    const some = byDay.map((n, i) => [n, i]).filter(([n]) => n > 0)
    const least = some.reduce((best, x) => (x[0] < best[0] ? x : best))[1]
    const share = Math.round((byDay[most] / total) * 100)
    if (some.length === 1) return `All of it was done on ${WEEKDAY_NAMES[most]}s.`
    return `Most is done on ${WEEKDAY_NAMES[most]}s (${share}%), and the least on ${WEEKDAY_NAMES[least]}s.`
}

// Each thing on a list with the day it was last done, the longest ago first,
// and what has never been done before that. That order is the point: the
// things nobody gets round to are the ones worth seeing.
export function lastDoneRows(tree, lastDone) {
    const where = placeOf(tree)
    return tickable(tree)
        .map(t => ({ id: t.id, label: where.get(t.id).label, category: where.get(t.id).category, doneAt: lastDone.get(t.id) || null }))
        .sort((a, b) => (a.doneAt ? ms(a.doneAt) : -Infinity) - (b.doneAt ? ms(b.doneAt) : -Infinity))
}

// Every stretch of a repeating list that ended between two days, and whether a
// round was finished in it. The current one is marked, since it can still be
// done. A list done once has no record, only its one round.
export function periodRecord(list, rounds, from, to, today) {
    if (list.repeats === 'once') return []
    const finished = rounds
        .filter(r => r.checklist_id === list.id && r.ended_at)
        .map(r => ({ day: stampDay(r.ended_at), outcome: roundOutcome(r) }))
    const out = []
    let period = periodOf(list, from < list.starts_on ? list.starts_on : from)
    while (period.from <= to) {
        const inside = finished.filter(f => f.day >= period.from && f.day <= period.to)
        const done = inside.find(f => f.outcome === 'finished')
        out.push({
            ...period,
            outcome: done ? 'done' : period.to >= today ? 'current' : inside.length ? 'ended' : 'missed',
            finishedOn: done ? done.day : null,
        })
        period = periodOf(list, addDays(period.to, 1))
    }
    return out
}

// What a list looked like at the end of one week, for the Cleaning section of
// the weekly report. Worked out from the rows as they stood on Saturday night,
// so a report published on Monday says what Saturday knew.
//
// A weekly list gets a verdict every week: finished on a day, or not finished
// with what was left, or not started. A list every few weeks or every month
// only says how far it has got until its stretch ends, and only warns in the
// week it ends without being finished. His words: "only warn of something not
// done if the month ended without something being completed". A week that
// crosses the end of a month says both: how that month ended, and how the new
// one is going.
export function weekCleaning({ lists, categories, tasks, rounds, ticks, weekStart }) {
    const saturday = addDays(weekStart, 6)
    const start = ms(weekStart + 'T00:00:00')
    const end = ms(addDays(weekStart, 7) + 'T00:00:00')
    const known = ticks.filter(t => ms(t.done_at) < end)
    const lastDone = lastDoneByTask(known)
    const roundsThen = rounds.filter(r => ms(r.started_at) < end)
        .map(r => (r.ended_at && ms(r.ended_at) >= end ? { ...r, ended_at: null, ended_by: null } : r))

    const out = []
    for (const list of [...lists].sort(byOrder)) {
        if (!list.is_active || list.starts_on > saturday || (list.created_at && ms(list.created_at) >= end)) continue
        const tree = listTree(categories.filter(c => c.checklist_id === list.id), tasks.filter(t => t.checklist_id === list.id))
        const leaves = tickable(tree)
        if (!leaves.length) continue
        const mine = roundsThen.filter(r => r.checklist_id === list.id)
        const open = mine.find(r => !r.ended_at)
        const weekTicks = known.filter(t => ms(t.done_at) >= start && mine.some(r => r.id === t.round_id))
        const where = placeOf(tree)

        // What a round left, each with when it was last done and whether the
        // round before left it too. Missed two rounds running is the thing
        // worth a manager's eye, so it is marked.
        const leftOf = round => {
            const ticked = new Set(known.filter(t => t.round_id === round?.id).map(t => t.task_id))
            const before = round ? roundBefore(mine, round) : latest(mine.filter(r => r.ended_at), 'ended_at')
            const again = leftLastTime(tree, before, known)
            return leaves.filter(t => !ticked.has(t.id)).map(t => ({
                id: t.id, name: t.name, ...where.get(t.id),
                lastDone: lastDone.get(t.id) ? stampDay(lastDone.get(t.id)) : null,
                lastDoneWords: lastDone.get(t.id) ? `last done ${doneDay(lastDone.get(t.id))}` : 'never done',
                again: again.has(t.id),
            }))
        }
        const verdict = (label, period, warnWhenNotDone) => {
            const finished = latest(mine.filter(r => r.ended_at && stampDay(r.ended_at) >= period.from
                && (!period.to || stampDay(r.ended_at) <= period.to)), 'ended_at')
            if (finished && roundOutcome(finished) === 'finished') {
                return { label, state: 'done', on: stampDay(finished.ended_at), warn: false }
            }
            // A round ended early is spoken of by what it left, even when
            // another has been started since. That one is said on its own.
            if (finished) {
                const left = leftOf(finished)
                return { label, state: 'ended', on: stampDay(finished.ended_at), by: finished.ended_by_name, done: leaves.length - left.length, total: leaves.length, left, warn: true }
            }
            const left = leftOf(open)
            const done = leaves.length - left.length
            if (!open) return { label, state: 'not_started', done: 0, total: leaves.length, left, warn: warnWhenNotDone }
            return { label, state: warnWhenNotDone ? 'not_finished' : 'in_progress', done, total: leaves.length, left, warn: warnWhenNotDone }
        }

        const lines = []
        if (list.repeats === 'once') {
            const ended = latest(mine.filter(r => r.ended_at), 'ended_at')
            if (ended && stampDay(ended.ended_at) < weekStart) continue
            const late = Boolean(list.finish_by && list.finish_by <= saturday)
            lines.push(verdict(null, { from: list.starts_on, to: null }, late))
        } else {
            const now = periodOf(list, saturday)
            if (list.repeats === 'monthly' && now.from > weekStart) {
                const before = periodOf(list, weekStart)
                if (before.to >= (list.starts_on || before.to)) lines.push(verdict(monthName(before.from), before, true))
                lines.push(verdict(monthName(now.from), now, false))
            } else {
                lines.push(verdict(list.repeats === 'monthly' ? monthName(now.from) : null, now, now.to === saturday))
            }
        }
        // Started again after a round was ended early, which the end dialog
        // tells staff to do. It counts in the week it finishes, so it never
        // warns, it only says how far it has got.
        if (open && lines.at(-1)?.state === 'ended') {
            const left = leftOf(open)
            lines.push({ label: null, state: 'started_again', on: stampDay(open.started_at), done: leaves.length - left.length, total: leaves.length, left, warn: false })
        }

        out.push({
            id: list.id,
            name: list.name,
            repeats: repeatWords(list),
            // The words go with the figures because the mail cannot work them
            // out: nothing outside a function's own folder is deployed with it.
            lines: lines.map(line => ({ ...line, words: cleaningWords(line) })),
            // Every thing on the list with the day it was last done, as at
            // Saturday night. His words: last done on every recurring task, in
            // the weekly report too.
            all: lastDoneRows(tree, lastDone).map(r => ({ label: r.label, category: r.category, lastDone: r.doneAt ? doneDay(r.doneAt) : null })),
            ticked: weekTicks.length,
            photos: weekTicks.flatMap(t => (t.photos || []).map(path => ({
                path, task: where.get(t.task_id)?.label || '', by: t.done_by_name, at: t.done_at, gone: Boolean(t.photos_gone_at),
            }))),
        })
    }
    const byDay = ticksByWeekday(known.filter(t => ms(t.done_at) >= start))
    return { lists: out, byDay, busiest: busiestWords(byDay) }
}

// Where each ticked thing sits, for saying it in a sentence: Kitchen, Small
// toaster area, Clean under the toaster.
export function placeOf(tree) {
    const where = new Map()
    for (const { category, elements } of tree) {
        for (const { task, subs } of elements) {
            where.set(task.id, { category: category.name, element: null, label: task.name })
            for (const s of subs) where.set(s.id, { category: category.name, element: task.name, label: `${task.name}: ${s.name}` })
        }
    }
    return where
}

// One sentence for a line of the week's cleaning, the same on the page and in
// the mail.
export function cleaningWords(line) {
    const when = line.label ? `${line.label}: ` : ''
    if (line.state === 'done') return `${when}Done on ${doneDayLong(line.on + 'T12:00:00')}.`
    if (line.state === 'ended') return `${when}Ended on ${doneDayLong(line.on + 'T12:00:00')}${line.by ? ` by ${line.by}` : ''} with ${line.left.length} not done.`
    if (line.state === 'not_started') return line.warn ? `${when}Not done. Nobody started it.` : `${when}Not started yet.`
    if (line.state === 'not_finished') return `${when}Not finished: ${line.done} of ${line.total} done, ${line.left.length} left.`
    if (line.state === 'started_again') return `${when}Started again on ${doneDayLong(line.on + 'T12:00:00')}: ${line.done} of ${line.total} done so far.`
    return `${when}${line.done} of ${line.total} done so far.`
}
