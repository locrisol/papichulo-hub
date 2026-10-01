// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import process from 'node:process'
import { todayISO, weekStartOf, addDays, shortDate } from '@/lib/dates'

// The page opens on last week, because a timesheet is filled in once the week
// has finished and the till's report for it exists.
const WEEK = addDays(weekStartOf(todayISO()), -7)

// The page talks to four tables and a confirm dialog. Everything is stubbed so
// what is under test is the one thing that was broken: whether a cell with
// nothing saved in it can be typed into at all.
const rows = {
    employees: [{ id: 'e1', full_name: 'Aoife', hourly_rate: 16.5, sort_order: 0, started_on: '2026-01-01', ended_on: null }],
    timesheet_entries: [],
    absences: [],
    roster_shifts: [],
    sales_records: [],
    cost_target_overrides: [],
}
const inserted = []
const updated = []
const deleted = []
// Set by the tests about what the screen does when the database refuses a
// write.
const broken = { update: false, delete: false }
// What the confirm dialog was asked, and what it answers.
const asked = []
const answer = { yes: true }

function chain(table) {
    const result = Promise.resolve({ data: rows[table] || [], error: null })
    const self = {
        select: () => self,
        eq: () => self,
        gte: () => self,
        lte: () => self,
        in: () => self,
        order: () => self,
        // The week's own row, which says whether the till's report has been
        // read in for it. Not set in these tests, so every week reads as one
        // nobody has imported.
        maybeSingle: () => Promise.resolve({ data: (rows[table] || [])[0] || null, error: null }),
        insert: values => {
            inserted.push({ table, values })
            const made = { id: `new-${inserted.length}`, ...values }
            rows[table] = [...(rows[table] || []), made]
            return { select: () => Promise.resolve({ data: [made], error: null }) }
        },
        update: patch => ({
            eq: (_, id) => ({
                select: () => {
                    // The restaurant row, which an owner's rules never match:
                    // no error and no row, the way the real API answers.
                    if (table === 'restaurants') {
                        updated.push({ table, id, patch })
                        const answer = { data: null, error: null }
                        return { maybeSingle: () => Promise.resolve(answer) }
                    }
                    if (broken.update) return Promise.resolve({ data: null, error: { message: 'refused' } })
                    updated.push({ table, id, patch })
                    const was = (rows[table] || []).find(r => r.id === id) || {}
                    const now = { ...was, ...patch }
                    rows[table] = (rows[table] || []).map(r => (r.id === id ? now : r))
                    return Promise.resolve({ data: [now], error: null })
                },
            }),
        }),
        delete: () => ({
            eq: (_, id) => {
                if (broken.delete) return Promise.resolve({ error: { message: 'refused' } })
                deleted.push({ table, id })
                rows[table] = (rows[table] || []).filter(r => r.id !== id)
                return Promise.resolve({ error: null })
            },
        }),
        then: (...args) => result.then(...args),
    }
    return self
}

// Who is signed in. A store manager unless a test says otherwise.
const me = { id: 'u1', role: 'store_manager' }

vi.mock('@/lib/supabase', () => ({ supabase: { from: table => chain(table) } }))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: me }) }))
vi.mock('@/context/confirm', () => ({
    useConfirm: () => question => {
        asked.push(question)
        return Promise.resolve(answer.yes)
    },
}))
vi.mock('@/context/restaurant', () => ({
    useRestaurant: () => ({
        activeRestaurant: {
            id: 'r1', hourly_rate: 15, pay_period_start: '2026-01-04', timesheet_recipients: ['payroll@example.ie'],
        },
        setActiveRestaurant: () => {},
    }),
}))

const { default: TimesheetPage } = await import('@/pages/costs/TimesheetPage')

const boxes = () => Array.from(document.querySelectorAll('input[data-r]'))

const off_the_till = {
    id: 't1', restaurant_id: 'r1', employee_id: 'e1', work_date: WEEK,
    starts_at: '09:00:00', ends_at: '17:00:00', kind: 'worked', source: 'import',
}

beforeEach(() => {
    me.role = 'store_manager'
    inserted.length = 0
    updated.length = 0
    deleted.length = 0
    asked.length = 0
    answer.yes = true
    broken.update = false
    broken.delete = false
    rows.timesheet_entries = []
    rows.absences = []
    rows.roster_shifts = []
    rows.sales_records = []
    rows.timesheet_weeks = []
})

describe('typing into a cell with nothing in it', () => {
    // The bug. The boxes are controlled, so their value comes from an entry,
    // and a cell with no entry had nothing to hold what was being typed: React
    // put the empty value back on every keystroke and nothing could be typed
    // into an empty cell at all, on a phone or anywhere else.
    it('lets the digits land', async () => {
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        const box = boxes()[0]
        await userEvent.type(box, '0900')
        expect(box).toHaveValue('09:00')
    })

    it('puts the colons in as it goes', async () => {
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        const box = boxes()[0]
        await userEvent.type(box, '115804')
        expect(box).toHaveValue('11:58:04')
    })

    it('saves the pair once the box is left', async () => {
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.type(boxes()[0], '0900')
        await userEvent.tab()

        await waitFor(() => expect(inserted).toHaveLength(1))
        expect(inserted[0].table).toBe('timesheet_entries')
        expect(inserted[0].values).toMatchObject({
            employee_id: 'e1', starts_at: '09:00:00', source: 'typed',
        })
    })

    // Half a pair is a real thing while somebody is still typing, and it must
    // not be saved as a shift that started and never ended by accident.
    it('keeps an out time waiting until there is an in time', async () => {
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.type(boxes()[1], '1700')
        await userEvent.tab()

        expect(inserted).toHaveLength(0)
        expect(boxes()[1]).toHaveValue('17:00:00')
    })

    it('saves both together once the in time arrives', async () => {
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.type(boxes()[1], '1700')
        await userEvent.type(boxes()[0], '0900')
        await userEvent.tab()

        await waitFor(() => expect(inserted).toHaveLength(1))
        expect(inserted[0].values).toMatchObject({ starts_at: '09:00:00', ends_at: '17:00:00' })
    })

    it('saves nothing at all for a box somebody typed in and emptied again', async () => {
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.type(boxes()[0], '09')
        await userEvent.clear(boxes()[0])
        await userEvent.tab()

        expect(inserted).toHaveLength(0)
    })
})

// His, on 21 September. Typing a clock in and tabbing put the cursor in the
// clock out box correctly, and then the row came back from the database with a
// real id, the cell was rebuilt under the cursor, and focus fell to the top of
// the document. The next Tab started again from the box he had just left, which
// is why it looked like the message was stealing it.
describe('Tab keeps its place while the row is being saved', () => {
    it('stays in the clock out box after the row lands', async () => {
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.type(boxes()[0], '0900')
        await userEvent.tab()
        expect(boxes()[1]).toHaveFocus()

        await waitFor(() => expect(inserted).toHaveLength(1))
        expect(boxes()[1]).toHaveFocus()
    })

    // The same cell, still being typed into. Whatever the save did to the row
    // underneath, the box has to go on taking digits.
    it('takes the out time straight afterwards', async () => {
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.type(boxes()[0], '0900')
        await userEvent.tab()
        await waitFor(() => expect(inserted).toHaveLength(1))

        await userEvent.type(boxes()[1], '1700')
        expect(boxes()[1]).toHaveValue('17:00')
    })

    // Tab out of the last box of a day and the cursor belongs on the next day,
    // not back at the start of the week.
    it('carries on to the next day rather than starting over', async () => {
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.type(boxes()[0], '0900')
        await userEvent.tab()
        await waitFor(() => expect(inserted).toHaveLength(1))

        await userEvent.tab()
        expect(boxes()[2]).toHaveFocus()
    })
})

describe('saying why, when there are no times to hang it on', () => {
    // The block says "times or a reason" and could only ever take the first of
    // them. A shift swapped after the roster went up was not a holiday and not
    // a sick day, and the box to write that in only appeared once a row
    // existed, which meant the day that most needed a reason had nowhere to
    // put one.
    it('writes a comment on a day with nothing on it', async () => {
        rows.roster_shifts = [{
            id: 's1', employee_id: 'e1', shift_date: WEEK, starts_at: '09:00:00', ends_at: '17:00:00',
        }]
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        // The banner says the same words, so the button is asked for by role.
        await userEvent.click(screen.getByRole('button', { name: '+ comment' }))
        const box = await screen.findByLabelText('Why nothing was worked, for the accountant')
        await userEvent.type(box, 'Swapped with somebody after the roster went up')
        await userEvent.tab()

        await waitFor(() => expect(inserted).toHaveLength(1))
        expect(inserted[0].values).toMatchObject({
            employee_id: 'e1',
            work_date: WEEK,
            starts_at: null,
            ends_at: null,
            note: 'Swapped with somebody after the roster went up',
        })
    })
})

describe('rubbing out a comment', () => {
    // His, on Georgiana's 10th of September: a day with no times and the letter
    // A typed into it while testing. Clearing it asked the database to keep a
    // row saying nothing at all, which it refuses, and the screen came back
    // with a sentence about a column.
    const comment_only = {
        id: 't9', restaurant_id: 'r1', employee_id: 'e1', work_date: WEEK,
        starts_at: null, ends_at: null, kind: 'worked', source: 'typed', note: 'A',
    }

    it('takes the row with it when there is nothing else on the day', async () => {
        rows.timesheet_entries = [comment_only]
        rows.roster_shifts = [{
            id: 's1', employee_id: 'e1', shift_date: WEEK, starts_at: '09:00:00', ends_at: '17:00:00',
        }]
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.click(screen.getByText('A'))
        const box = await screen.findByLabelText('Why nothing was worked, for the accountant')
        await userEvent.clear(box)
        await userEvent.tab()

        await waitFor(() => expect(deleted).toHaveLength(1))
        expect(deleted[0].id).toBe('t9')
        expect(updated).toHaveLength(0)
    })

    // A till shift somebody emptied is a correction waiting to be explained, so
    // clearing the words leaves the row exactly where it is.
    it('keeps an emptied till shift, which is still a correction', async () => {
        rows.timesheet_entries = [{ ...comment_only, source: 'corrected' }]
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        // It carries a comment, so the cell shows that rather than asking for
        // one. Pressing it is how the day opens either way.
        await userEvent.click(screen.getByText('A'))
        const box = await screen.findByLabelText('Why nothing was worked, for the accountant')
        await userEvent.clear(box)
        await userEvent.tab()

        await waitFor(() => expect(updated).toHaveLength(1))
        expect(updated[0].patch).toEqual({ note: null })
        expect(deleted).toHaveLength(0)
    })
})

describe('changing a time the till gave', () => {
    // His rule. A week typed from nothing is what it looks like and so is a
    // week off the clock; a clock time somebody moved afterwards looks exactly
    // like a clock time, and only they know what happened. So it is marked,
    // and the week is blocked until it says why.
    it('marks it as corrected', async () => {
        rows.timesheet_entries = [off_the_till]
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.clear(boxes()[0])
        await userEvent.type(boxes()[0], '0920')
        await userEvent.tab()

        await waitFor(() => expect(updated).toHaveLength(1))
        expect(updated[0].patch).toMatchObject({ starts_at: '09:20:00', source: 'corrected' })
    })

    // Rubbing both times out is how a shift goes, since the x is only ever on
    // a day off. A till row emptied that way used to disappear with nothing
    // left to say it ever existed, which is the one change bigger than an edit
    // and the only one that escaped having to explain itself.
    it('is emptied rather than deleted when both times are rubbed out', async () => {
        rows.timesheet_entries = [off_the_till]
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.clear(boxes()[0])
        await userEvent.tab()
        await userEvent.clear(boxes()[1])
        await userEvent.tab()

        await waitFor(() => expect(updated.length).toBeGreaterThan(0))
        expect(deleted).toHaveLength(0)
        // What it ends up as, rather than what the last patch said: rubbing out
        // the first box already marked it, so the second one has nothing left
        // to mark.
        expect(rows.timesheet_entries[0]).toMatchObject({
            id: 't1', starts_at: null, ends_at: null, source: 'corrected',
        })
    })

    it('deletes a row somebody typed, because no report disagrees with it', async () => {
        rows.timesheet_entries = [{ ...off_the_till, source: 'typed' }]
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.clear(boxes()[0])
        await userEvent.tab()
        await userEvent.clear(boxes()[1])
        await userEvent.tab()

        await waitFor(() => expect(deleted).toHaveLength(1))
        expect(deleted[0].id).toBe('t1')
    })

    // His, on the 15th of September: 09:20:00 to 18:00:00, typed out to
    // 21:50:25, and nothing happened at all. No save, no error, no line saying
    // anything. Typing all six digits produces exactly what the value settles
    // to, so the guard that skips a box nobody changed was comparing the new
    // figure with the one already sitting in the box and finding them equal.
    it('saves a time typed out in full, seconds and all', async () => {
        rows.timesheet_entries = [{ ...off_the_till, source: 'typed' }]
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.clear(boxes()[1])
        await userEvent.type(boxes()[1], '215025')
        await userEvent.tab()

        await waitFor(() => expect(updated).toHaveLength(1))
        expect(updated[0].patch).toEqual({ ends_at: '21:50:25' })
    })

    // The guard is still there and still does its job: tabbing through a row
    // without changing anything must not write, and on a till row a write
    // would mark it as corrected and ask for a comment about nothing.
    it('writes nothing when a box is left exactly as it was', async () => {
        rows.timesheet_entries = [off_the_till]
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.click(boxes()[1])
        await userEvent.tab()

        expect(updated).toHaveLength(0)
    })

    it('writes nothing when the same time is typed over itself', async () => {
        rows.timesheet_entries = [off_the_till]
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.clear(boxes()[1])
        await userEvent.type(boxes()[1], '170000')
        await userEvent.tab()

        expect(updated).toHaveLength(0)
    })

    it('leaves a time somebody typed alone', async () => {
        rows.timesheet_entries = [{ ...off_the_till, source: 'typed' }]
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.clear(boxes()[0])
        await userEvent.type(boxes()[0], '0920')
        await userEvent.tab()

        await waitFor(() => expect(updated).toHaveLength(1))
        expect(updated[0].patch).toEqual({ starts_at: '09:20:00' })
    })
})

describe('marking a day with times on it as holiday or off sick', () => {
    // A stray s, or a tap on the touch bar landing on the wrong cell, used to
    // delete the till's times and mark the day off sick without a word. The
    // week then went to the accountant with a sick day and no hours, against
    // the till's report she holds herself.
    it('asks first, and says the times from the till go', async () => {
        rows.timesheet_entries = [off_the_till]
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.type(boxes()[0], 's')

        await waitFor(() => expect(asked).toHaveLength(1))
        expect(asked[0].message).toContain("till's report")
    })

    it('leaves the times alone when the answer is no', async () => {
        rows.timesheet_entries = [off_the_till]
        answer.yes = false
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.type(boxes()[0], 's')

        await waitFor(() => expect(asked).toHaveLength(1))
        expect(deleted).toHaveLength(0)
        expect(inserted).toHaveLength(0)
    })

    it('replaces them when the answer is yes', async () => {
        rows.timesheet_entries = [off_the_till]
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.type(boxes()[0], 's')

        await waitFor(() => expect(inserted).toHaveLength(1))
        expect(deleted.map(d => d.id)).toEqual(['t1'])
        expect(inserted[0]).toMatchObject({ table: 'absences', values: { kind: 'sick' } })
    })

    // Half done is worse than not done: the times gone and no absence, or the
    // absence in and the times still counted under it.
    it('stops when the times could not be deleted', async () => {
        rows.timesheet_entries = [off_the_till]
        broken.delete = true
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.type(boxes()[0], 's')

        await waitFor(() => expect(screen.getByText('Not saved')).toBeInTheDocument())
        expect(inserted).toHaveLength(0)
    })

    // A time half typed into an empty day is not saved yet, so there is
    // nothing to ask about. Asking took the focus off the box, which saved
    // the half time as a real clock in, and then the delete of the unsaved
    // one failed and the day was never marked.
    it('does not ask about a time still being typed', async () => {
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.type(boxes()[0], '09s')

        await waitFor(() => expect(inserted).toHaveLength(1))
        expect(inserted[0]).toMatchObject({ table: 'absences', values: { kind: 'sick' } })
        expect(asked).toHaveLength(0)
        expect(deleted).toHaveLength(0)
    })

    // Nothing to lose, so nothing to ask.
    it('does not ask on an empty day', async () => {
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.type(boxes()[0], 'h')

        await waitFor(() => expect(inserted).toHaveLength(1))
        expect(asked).toHaveLength(0)
    })
})

describe('a clock in with no clock out', () => {
    const half = {
        id: 't5', restaurant_id: 'r1', employee_id: 'e1', work_date: WEEK,
        starts_at: '09:00:00', ends_at: null, kind: 'worked', source: 'typed',
    }

    // It used to come to nought hours, count as an answer and drop out of the
    // payroll mail, with nothing on the screen but an empty box.
    it('says so on the day and above the week', async () => {
        rows.timesheet_entries = [half]
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        expect(screen.getAllByText('no clock out').length).toBeGreaterThan(0)
        expect(screen.getByText(/has a clock in with no clock out/)).toBeInTheDocument()
    })

    // Every day typed by hand is one of these for a moment: the clock in is
    // saved when its box is left, just before the clock out is typed. The
    // warning above the week must not jump in and out on every cell.
    it('does not warn above the week while the clock out is being typed', async () => {
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.type(boxes()[0], '0900')
        await userEvent.tab()
        await waitFor(() => expect(inserted).toHaveLength(1))

        expect(screen.queryByText(/has a clock in with no clock out/)).not.toBeInTheDocument()
    })
})

// An end at or before the start is the next morning, so a start and an end the
// same were saved as 24 hours, which went to the accountant like any other.
describe('a start and a finish at the same time', () => {
    const SAID = 'A shift cannot start and finish at the same time.'

    it('is not saved, and the figure goes back', async () => {
        rows.timesheet_entries = [{ ...off_the_till, source: 'typed' }]
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.clear(boxes()[1])
        await userEvent.type(boxes()[1], '090000')
        await userEvent.tab()

        await waitFor(() => expect(screen.getByText(SAID)).toBeInTheDocument())
        expect(updated).toHaveLength(0)
        expect(boxes()[1]).toHaveValue('17:00:00')
    })

    it('is not saved as a new row either', async () => {
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.type(boxes()[1], '0900')
        await userEvent.type(boxes()[0], '0900')
        await userEvent.tab()

        await waitFor(() => expect(screen.getByText(SAID)).toBeInTheDocument())
        expect(inserted).toHaveLength(0)
    })
})

describe('saying that it saved', () => {
    // The same three words the report page uses, because it is the same
    // promise: no Save button on either, both write when you leave a box, and
    // this line is the only thing that says it happened.
    it('says it saves as you type before anything has', async () => {
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))
        expect(screen.getByText('Saves as you type')).toBeInTheDocument()
    })

    it('says when it last saved', async () => {
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.type(boxes()[0], '0900')
        await userEvent.tab()

        await waitFor(() => expect(screen.getByText(/^Saved at /)).toBeInTheDocument())
    })

    // And what it must never say. A refused write used to leave the new figure
    // in the box looking saved, with one line of red above the fold.
    it('says nothing about saving when the write was refused, and puts the figure back', async () => {
        rows.timesheet_entries = [off_the_till]
        broken.update = true
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.clear(boxes()[0])
        await userEvent.type(boxes()[0], '0920')
        await userEvent.tab()

        await waitFor(() => expect(boxes()[0]).toHaveValue('09:00:00'))
        expect(screen.queryByText(/^Saved at /)).not.toBeInTheDocument()
        // And it says so where you are looking, beside the week's total,
        // rather than only at the top of a table you have scrolled past.
        expect(screen.getByText('Not saved')).toBeInTheDocument()
    })
})

describe('when the hours were sent', () => {
    // The database hands the time back in UTC. Sent at half past midnight
    // Irish summer time on the 28th, it is still the 27th in UTC, and the line
    // used to cut the date off that and say the 27th. Pinned to Irish time so
    // the test means the same on any machine.
    const was = process.env.TZ
    beforeAll(() => { process.env.TZ = 'Europe/Dublin' })
    afterAll(() => {
        if (was === undefined) delete process.env.TZ
        else process.env.TZ = was
    })

    it('says the day it was sent here, not the day it was in UTC', async () => {
        rows.timesheet_weeks = [{ imported_at: null, filed_at: '2026-09-27T23:30:00+00:00' }]
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        expect(screen.getByText(`Sent ${shortDate('2026-09-28')}`, { exact: false })).toBeInTheDocument()
    })
})

describe('the button that takes you home', () => {
    // Home here is last week, not this one, so the button that said "This week"
    // in the colour that means "you are here" was pointing at the week there is
    // nothing to do on yet.
    it('says you are on last week, and offers to bring you back to it', async () => {
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        expect(screen.getByRole('button', { name: 'Last week' })).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'Next week' }))
        await waitFor(() => expect(screen.getByRole('button', { name: 'Go to last week' })).toBeInTheDocument())
    })
})

describe('what the week cost as a share of what it took', () => {
    // The figure the old Labour page was read for, put back. One shift at
    // 16.50 an hour against a day that took 500 euro.
    it('reads the day against the day the sales screen entered', async () => {
        rows.sales_records = [{ sale_date: WEEK, net_sales: 500, is_closed: false }]
        rows.timesheet_entries = [{
            id: 't1', restaurant_id: 'r1', employee_id: 'e1', work_date: WEEK,
            starts_at: '09:00:00', ends_at: '17:00:00', kind: 'worked', source: 'typed',
        }]
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        // 8 hours at 16.50 is 132.00, which is 26.4% of 500. Twice: on the
        // Sunday, and as the week, since it is the only day that traded.
        await waitFor(() => expect(screen.getByText('Of sales')).toBeInTheDocument())
        expect(screen.getAllByText('26.4%')).toHaveLength(2)
    })
})

describe('sending the hours', () => {
    // The mail function refuses an owner, and the list it goes to lives on the
    // restaurant, which an owner cannot change. Same as the report: a store
    // manager sends it, and an owner still gets the PDF.
    it('offers an owner the PDF rather than a send', async () => {
        me.role = 'owner'
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        expect(screen.queryByRole('button', { name: 'Send the hours' })).not.toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Download the hours' }))
        expect(await screen.findByRole('button', { name: 'Download the PDF' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Send it' })).not.toBeInTheDocument()
    })

    // A write the rules turn away changes no row and says nothing at all, so
    // the address went off the screen and stayed on the list it sends to.
    it('says so when the list was not kept, and puts it back', async () => {
        render(<TimesheetPage />)
        await waitFor(() => expect(boxes().length).toBeGreaterThan(0))

        await userEvent.click(screen.getByRole('button', { name: 'Send the hours' }))
        await userEvent.click(await screen.findByRole('button', { name: 'Take payroll@example.ie off the list' }))

        await waitFor(() => expect(updated.some(u => u.table === 'restaurants')).toBe(true))
        expect(await screen.findByText('That could not be saved, so nothing has changed.')).toBeInTheDocument()
        expect(screen.getByText('payroll@example.ie')).toBeInTheDocument()
    })
})
