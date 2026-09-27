import { describe, it, expect } from 'vitest'
import {
    listTree, tickable, progressOf, elementDone, repeatWords, periodOf, doneDay, doneDayLong,
    agoWords, lastDoneByTask, cardState, weekCleaning, periodRecord, cleaningWords, ticksByWeekday,
    ticksByHour, placeOf, roundOutcome, ticksByTimeOfDay, busiestWords, lastDoneRows,
} from './checklists'
import { shortDate } from './dates'

// Invented lists and people throughout. The week of 20 September 2026 runs
// Sunday 20 to Saturday 26.

// A local time as the database would hand it back.
const at = (day, time = '10:00') => new Date(`${day}T${time}:00`).toISOString()

const KITCHEN = { id: 'c1', checklist_id: 'L1', name: 'Kitchen', sort_order: 1, is_active: true }
const TOILETS = { id: 'c2', checklist_id: 'L1', name: 'Toilets', sort_order: 2, is_active: true }
const OLD = { id: 'c3', checklist_id: 'L1', name: 'Old yard', sort_order: 3, is_active: false }

const task = (id, name, extra = {}) => ({
    id, checklist_id: 'L1', category_id: 'c1', parent_id: null, name, sort_order: 0, is_active: true, ...extra,
})
const TOASTER = task('t1', 'Small toaster area', { sort_order: 1 })
const UNDER = task('t2', 'Clean under the toaster', { parent_id: 't1', sort_order: 1 })
const SIDES = task('t3', 'Clean toaster sides', { parent_id: 't1', sort_order: 2 })
const FLOOR = task('t4', 'Mop the floor', { category_id: 'c2', needs_photo: true })
const GONE = task('t5', 'Descale the kettle', { sort_order: 2, is_active: false })
const YARD = task('t6', 'Sweep the yard', { category_id: 'c3' })

const CATEGORIES = [TOILETS, OLD, KITCHEN]
const TASKS = [FLOOR, SIDES, UNDER, TOASTER, GONE, YARD]

const WEEKLY = { id: 'L1', name: 'Weekly Deep Clean', repeats: 'weeks', every_weeks: 1, starts_on: '2026-08-01', is_active: true, sort_order: 1 }

describe('the list as it is now', () => {
    const tree = listTree(CATEGORIES, TASKS)

    it('puts the categories and what is under them in order, leaving out what was taken off', () => {
        expect(tree.map(g => g.category.name)).toEqual(['Kitchen', 'Toilets'])
        expect(tree[0].elements.map(e => e.task.name)).toEqual(['Small toaster area'])
        expect(tree[0].elements[0].subs.map(s => s.name)).toEqual(['Clean under the toaster', 'Clean toaster sides'])
    })

    it('ticks the things at the bottom, never an element with things under it', () => {
        expect(tickable(tree).map(t => t.id)).toEqual(['t2', 't3', 't4'])
    })

    it('counts a round against what is on the list now', () => {
        expect(progressOf(tree, [{ task_id: 't2' }, { task_id: 't5' }])).toEqual({ done: 1, total: 3 })
    })

    it('calls an element done when everything under it is', () => {
        const toaster = tree[0].elements[0]
        expect(elementDone(toaster, new Set(['t2']))).toBe(false)
        expect(elementDone(toaster, new Set(['t2', 't3']))).toBe(true)
    })

    it('knows where each thing sits, for a sentence', () => {
        expect(placeOf(tree).get('t2')).toEqual({ category: 'Kitchen', element: 'Small toaster area', label: 'Small toaster area: Clean under the toaster' })
        expect(placeOf(tree).get('t4').label).toBe('Mop the floor')
    })
})

describe('how often a list comes round', () => {
    it('says it in words', () => {
        expect(repeatWords(WEEKLY)).toBe('Every week')
        expect(repeatWords({ repeats: 'weeks', every_weeks: 3 })).toBe('Every 3 weeks')
        expect(repeatWords({ repeats: 'monthly' })).toBe('Every month')
        expect(repeatWords({ repeats: 'once' })).toBe('Once')
    })

    it('runs a weekly list Sunday to Saturday', () => {
        expect(periodOf(WEEKLY, '2026-09-23')).toEqual({ from: '2026-09-20', to: '2026-09-26' })
    })

    it('counts every two weeks from the week it started in', () => {
        const fortnight = { repeats: 'weeks', every_weeks: 2, starts_on: '2026-09-09' }
        expect(periodOf(fortnight, '2026-09-10')).toEqual({ from: '2026-09-06', to: '2026-09-19' })
        expect(periodOf(fortnight, '2026-09-20')).toEqual({ from: '2026-09-20', to: '2026-10-03' })
        expect(periodOf(fortnight, '2026-10-03')).toEqual({ from: '2026-09-20', to: '2026-10-03' })
    })

    it('runs a monthly list over the calendar month, across a clock change', () => {
        expect(periodOf({ repeats: 'monthly' }, '2026-10-26')).toEqual({ from: '2026-10-01', to: '2026-10-31' })
        expect(periodOf({ repeats: 'monthly' }, '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    })

    it('gives a list done once its one stretch', () => {
        expect(periodOf({ repeats: 'once', starts_on: '2026-09-21', finish_by: '2026-09-30' }, '2026-12-01'))
            .toEqual({ from: '2026-09-21', to: '2026-09-30' })
    })

    it('writes the record of each stretch, done, missed or still going', () => {
        const rounds = [{ checklist_id: 'L1', started_at: at('2026-09-01'), ended_at: at('2026-09-03'), ended_by: null }]
        const record = periodRecord(WEEKLY, rounds, '2026-08-30', '2026-09-19', '2026-09-16')
        expect(record.map(r => [r.from, r.outcome])).toEqual([
            ['2026-08-30', 'done'], ['2026-09-06', 'missed'], ['2026-09-13', 'current'],
        ])
        expect(record[0].finishedOn).toBe('2026-09-03')
    })
})

describe('days and times, the way they are written', () => {
    it('writes a day with no time', () => {
        expect(doneDay(at('2026-09-22', '23:30'))).toBe(`Tue ${shortDate('2026-09-22')}`)
        expect(doneDayLong(at('2026-09-22'))).toBe(`Tuesday ${shortDate('2026-09-22')}`)
    })

    it('says how long ago, the way Kitchtech does', () => {
        const now = new Date('2026-09-22T18:00:00')
        expect(agoWords(at('2026-09-22', '17:59'), now)).toBe('1 minute ago')
        expect(agoWords(at('2026-09-22', '11:00'), now)).toBe('7 hours ago')
        expect(agoWords(at('2026-09-21', '09:00'), now)).toBe('yesterday')
        expect(agoWords(at('2026-09-18', '20:00'), now)).toBe('4 days ago')
    })

    it('keeps the latest tick of each task', () => {
        const last = lastDoneByTask([
            { task_id: 't2', done_at: at('2026-09-01') },
            { task_id: 't2', done_at: '2026-09-08T09:00:00+00:00' },
            { task_id: 't2', done_at: at('2026-09-05') },
        ])
        expect(last.get('t2')).toBe('2026-09-08T09:00:00+00:00')
    })

    it('counts the ticks by day of the week and hour of the day', () => {
        const ticks = [at('2026-09-20', '09:15'), at('2026-09-22', '09:40'), at('2026-09-22', '15:00')].map(done_at => ({ done_at }))
        expect(ticksByWeekday(ticks)).toEqual([1, 0, 2, 0, 0, 0, 0])
        expect(ticksByHour(ticks)[9]).toBe(2)
        expect(ticksByHour(ticks)[15]).toBe(1)
    })
})

describe('a list on the phone', () => {
    it('shows the round in progress and offers no second one', () => {
        const rounds = [{ id: 'r1', checklist_id: 'L1', started_at: at('2026-09-22'), started_by_name: 'Aoife', ended_at: null }]
        const state = cardState({ list: WEEKLY, rounds, done: 12, total: 30, today: '2026-09-23' })
        expect(state).toMatchObject({ kind: 'open', done: 12, total: 30, canStart: false })
        expect(state.started).toBe(`Started Tuesday ${shortDate('2026-09-22')} by Aoife`)
    })

    it('says it was done this week, and still lets it be started again', () => {
        const rounds = [{ id: 'r1', checklist_id: 'L1', started_at: at('2026-09-21'), ended_at: at('2026-09-22'), ended_by: null }]
        expect(cardState({ list: WEEKLY, rounds, today: '2026-09-24' })).toMatchObject({ kind: 'done', canStart: true, early: false })
    })

    it('says it is due when last week was the last time', () => {
        const rounds = [{ id: 'r1', checklist_id: 'L1', started_at: at('2026-09-14'), ended_at: at('2026-09-15'), ended_by: null }]
        expect(cardState({ list: WEEKLY, rounds, today: '2026-09-24' })).toMatchObject({ kind: 'due', canStart: true, last: `Tuesday ${shortDate('2026-09-15')}` })
    })

    it('never starts a list done once a second time', () => {
        const once = { id: 'L2', repeats: 'once', starts_on: '2026-09-21', finish_by: '2026-09-25' }
        expect(cardState({ list: once, rounds: [], today: '2026-09-20' })).toMatchObject({ kind: 'due', canStart: false })
        expect(cardState({ list: once, rounds: [], today: '2026-09-26' })).toMatchObject({ kind: 'due', canStart: true, late: true })
        const done = [{ id: 'r9', checklist_id: 'L2', started_at: at('2026-09-22'), ended_at: at('2026-09-23'), ended_by: 'u1' }]
        expect(cardState({ list: once, rounds: done, today: '2026-09-26' })).toMatchObject({ kind: 'done', canStart: false, early: true })
    })

    it('tells a finished round from one a manager ended', () => {
        expect(roundOutcome({ ended_at: null })).toBe('open')
        expect(roundOutcome({ ended_at: at('2026-09-22'), ended_by: null })).toBe('finished')
        expect(roundOutcome({ ended_at: at('2026-09-22'), ended_by: 'u1' })).toBe('ended')
    })
})

describe('the Cleaning section of the weekly report', () => {
    const week = '2026-09-20'
    const tick = (round, taskId, day, time = '10:00', extra = {}) => ({
        round_id: round, task_id: taskId, done_at: at(day, time), done_by_name: 'Aoife', photos: [], ...extra,
    })
    const cleaning = (rounds, ticks, lists = [WEEKLY]) =>
        weekCleaning({ lists, categories: CATEGORIES, tasks: TASKS, rounds, ticks, weekStart: week })

    it('says a weekly list was done, and on which day', () => {
        const rounds = [{ id: 'r1', checklist_id: 'L1', started_at: at('2026-09-21'), ended_at: at('2026-09-22', '15:00'), ended_by: null }]
        const ticks = [tick('r1', 't2', '2026-09-21'), tick('r1', 't3', '2026-09-22'),
            tick('r1', 't4', '2026-09-22', '15:00', { photos: ['p/floor.jpg'] })]
        const [list] = cleaning(rounds, ticks).lists
        expect(list.lines).toEqual([{ label: null, state: 'done', on: '2026-09-22', warn: false }])
        expect(cleaningWords(list.lines[0])).toBe(`Done on Tuesday ${shortDate('2026-09-22')}.`)
        expect(list.photos).toEqual([{ path: 'p/floor.jpg', task: 'Mop the floor', by: 'Aoife', at: ticks[2].done_at, gone: false }])
        expect(list.ticked).toBe(3)
    })

    it('says what is left, with when each thing was last done', () => {
        const rounds = [
            { id: 'r0', checklist_id: 'L1', started_at: at('2026-09-07'), ended_at: at('2026-09-08'), ended_by: null },
            { id: 'r1', checklist_id: 'L1', started_at: at('2026-09-24'), ended_at: null },
        ]
        const ticks = [tick('r0', 't2', '2026-09-07'), tick('r0', 't3', '2026-09-07'), tick('r0', 't4', '2026-09-08'),
            tick('r1', 't2', '2026-09-24')]
        const [line] = cleaning(rounds, ticks).lists[0].lines
        expect(line).toMatchObject({ state: 'not_finished', done: 1, total: 3, warn: true })
        expect(line.left.map(l => [l.label, l.lastDone])).toEqual([
            ['Small toaster area: Clean toaster sides', '2026-09-07'],
            ['Mop the floor', '2026-09-08'],
        ])
        expect(cleaningWords(line)).toBe('Not finished: 1 of 3 done, 2 left.')
    })

    it('says nobody started it', () => {
        const [line] = cleaning([], []).lists[0].lines
        expect(line).toMatchObject({ state: 'not_started', warn: true })
        expect(cleaningWords(line)).toBe('Not done. Nobody started it.')
    })

    // His answer: a round counts in the week it is finished. Started on
    // Saturday night and finished on Sunday, it is the new week's.
    it('gives a round finished on Sunday to the new week, not the one it started in', () => {
        const rounds = [{ id: 'r1', checklist_id: 'L1', started_at: at('2026-09-26', '21:00'), ended_at: at('2026-09-27', '09:00'), ended_by: null }]
        const ticks = [tick('r1', 't2', '2026-09-26', '21:30'), tick('r1', 't3', '2026-09-27', '08:00'), tick('r1', 't4', '2026-09-27', '09:00')]
        const [line] = cleaning(rounds, ticks).lists[0].lines
        expect(line).toMatchObject({ state: 'not_finished', done: 1, warn: true })
        const next = weekCleaning({ lists: [WEEKLY], categories: CATEGORIES, tasks: TASKS, rounds, ticks, weekStart: '2026-09-27' })
        expect(next.lists[0].lines[0]).toMatchObject({ state: 'done', on: '2026-09-27' })
    })

    it('says who ended a round early and what was left', () => {
        const rounds = [{ id: 'r1', checklist_id: 'L1', started_at: at('2026-09-21'), ended_at: at('2026-09-25'), ended_by: 'u1', ended_by_name: 'Ciara' }]
        const [line] = cleaning(rounds, [tick('r1', 't4', '2026-09-21')]).lists[0].lines
        expect(line).toMatchObject({ state: 'ended', warn: true, by: 'Ciara' })
        expect(cleaningWords(line)).toBe(`Ended on Friday ${shortDate('2026-09-25')} by Ciara with 2 not done.`)
    })

    const MONTHLY = { ...WEEKLY, id: 'L1', repeats: 'monthly', every_weeks: null }

    it('only says how far a monthly list has got in the middle of the month', () => {
        const rounds = [{ id: 'r1', checklist_id: 'L1', started_at: at('2026-09-02'), ended_at: null }]
        const [line] = cleaning(rounds, [tick('r1', 't4', '2026-09-02')], [MONTHLY]).lists[0].lines
        expect(line).toMatchObject({ label: 'September', state: 'in_progress', done: 1, total: 3, warn: false })
        expect(cleaningWords(line)).toBe('September: 1 of 3 done so far.')
    })

    it('warns about a month that ended in the week without being finished, and starts the next', () => {
        const lateWeek = '2026-09-27'
        const rounds = [{ id: 'r1', checklist_id: 'L1', started_at: at('2026-09-02'), ended_at: null }]
        const { lists } = weekCleaning({ lists: [MONTHLY], categories: CATEGORIES, tasks: TASKS, rounds, ticks: [tick('r1', 't4', '2026-09-02')], weekStart: lateWeek })
        expect(lists[0].lines.map(l => [l.label, l.state, l.warn])).toEqual([
            ['September', 'not_finished', true],
            ['October', 'in_progress', false],
        ])
    })

    it('shows a list done once until it is finished, and says when it is late', () => {
        const once = { id: 'L1', name: 'Paint touch ups', repeats: 'once', starts_on: '2026-09-14', finish_by: '2026-09-22', is_active: true }
        const [line] = cleaning([], [], [once]).lists[0].lines
        expect(line).toMatchObject({ state: 'not_started', warn: true })
        const before = weekCleaning({ lists: [once], categories: CATEGORIES, tasks: TASKS, rounds: [], ticks: [], weekStart: '2026-09-13' })
        expect(before.lists[0].lines[0]).toMatchObject({ state: 'not_started', warn: false })
        const finished = [{ id: 'r1', checklist_id: 'L1', started_at: at('2026-09-15'), ended_at: at('2026-09-16'), ended_by: null }]
        expect(cleaning(finished, [], [once]).lists).toEqual([])
    })

    it('leaves out a list that did not exist yet, and one taken off', () => {
        expect(cleaning([], [], [{ ...WEEKLY, starts_on: '2026-09-27' }]).lists).toEqual([])
        expect(cleaning([], [], [{ ...WEEKLY, is_active: false }]).lists).toEqual([])
    })

    it('counts the week\'s ticks by day', () => {
        const rounds = [{ id: 'r1', checklist_id: 'L1', started_at: at('2026-09-21'), ended_at: null }]
        const { byDay } = cleaning(rounds, [tick('r1', 't2', '2026-09-21'), tick('r1', 't3', '2026-09-21'), tick('r1', 't4', '2026-09-26')])
        expect(byDay).toEqual([0, 2, 0, 0, 0, 0, 1])
    })
})

describe('the reports on how the cleaning is going', () => {
    it('groups the ticks into parts of the day', () => {
        const ticks = ['08:30', '09:00', '11:59', '21:15'].map(t => ({ done_at: at('2026-09-22', t) }))
        expect(ticksByTimeOfDay(ticks).map(b => b.count)).toEqual([1, 2, 0, 0, 0, 1])
    })

    it('says which day most and least is done on', () => {
        expect(busiestWords([0, 2, 6, 0, 1, 1, 0])).toBe('Most is done on Tuesdays (60%), and the least on Thursdays.')
        expect(busiestWords([0, 0, 3, 0, 0, 0, 0])).toBe('All of it was done on Tuesdays.')
        expect(busiestWords([0, 0, 0, 0, 0, 0, 0])).toBe('')
    })

    it('puts what was never done first, then the longest ago', () => {
        const tree = listTree(CATEGORIES, TASKS)
        const rows = lastDoneRows(tree, new Map([['t2', at('2026-09-20')], ['t4', at('2026-09-01')]]))
        expect(rows.map(r => [r.label, r.category])).toEqual([
            ['Small toaster area: Clean toaster sides', 'Kitchen'],
            ['Mop the floor', 'Toilets'],
            ['Small toaster area: Clean under the toaster', 'Kitchen'],
        ])
    })
})
