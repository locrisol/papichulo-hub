import { describe, it, expect } from 'vitest'
import {
    weekAsSent, whatChanged, earlierSends, isPeriodStart, timesheetEmail, changeLine, personPeriod, addDays,
    CHANGED_LOOK, CHANGE_FIELDS, CHANGE_WORDS, SEND_SHAPE,
} from '../../supabase/functions/weekly-report-email/timesheet'
import {
    weekAsSent as appWeekAsSent, whatChanged as appWhatChanged, earlierSends as appEarlierSends,
    sendScope, weekOneOver, changeShort, changeNames, guestPerson,
    CHANGED_LOOK as appChangedLook, CHANGE_FIELDS as appFields, CHANGE_WORDS as appWords, SEND_SHAPE as appShape,
} from '@/lib/timesheet'
import { periodOf } from '@/lib/payPeriod'

// The hours go every week now (his, 9 November 2026): week 1 on its own, for
// the owners' records and not for the payroll, and the pay period after week
// 2 with the PDF. A week changed after an email carried it is said in red the
// next time the hours go. The Hub keeps what each email said and lays the
// week as it is now over it, in the function for the email and in the browser
// for the PDF, the send dialog and the Timesheet, so the two copies of the
// code are run over the same rows here and made to agree.
//
// Point Campus's real pay period, 1 to 14 November 2026, with invented people.
const PERIOD = '2026-11-01'
const WEEK2 = '2026-11-08'
const team = [
    { id: 'e1', full_name: 'Aoife Byrne', sort_order: 0 },
    { id: 'e2', full_name: 'Camila', sort_order: 1 },
    { id: 'e3', full_name: 'Cathal Nolan', sort_order: 2 },
    { id: 'e4', full_name: 'Niamh Walsh', sort_order: 3 },
]
const row = over => ({ kind: 'worked', note: null, ...over })
const base = [
    row({ employee_id: 'e1', work_date: '2026-11-01', starts_at: '09:00:00', ends_at: '17:00:00', hours: 8 }),
    row({ employee_id: 'e1', work_date: '2026-11-02', starts_at: '09:00:00', ends_at: '17:30:00', hours: 8.5 }),
    row({ employee_id: 'e2', work_date: '2026-11-05', starts_at: '17:00:00', ends_at: '22:00:00', hours: 5 }),
    row({ employee_id: 'e3', work_date: '2026-11-03', starts_at: '09:00:00', ends_at: '17:00:00', hours: 8 }),
]
const sick = [{ employee_id: 'e3', kind: 'sick', status: 'approved', starts_on: '2026-11-04', ends_on: '2026-11-04' }]

// Both copies, the same arguments.
const week = (entries, absences = [], weekStart = PERIOD) => {
    const args = { team, entries, absences, periodStart: PERIOD, weekStart }
    return [weekAsSent(args), appWeekAsSent(args)]
}
const changed = (before, after, scope = 'week') => {
    const [sent] = week(...before)
    const [now] = week(...after)
    const fn = whatChanged(sent, now, { scope })
    const app = appWhatChanged(sent, now, { scope })
    expect(app).toEqual(fn)
    return fn
}
const moved = (entries, test, patch) => entries.map(e => (test(e) ? { ...e, ...patch } : e))
const camila = e => e.employee_id === 'e2'

describe('the two copies are one', () => {
    it('share the red, the fields, their words and the shape', () => {
        expect(appChangedLook).toEqual(CHANGED_LOOK)
        expect(CHANGED_LOOK).toEqual({ label: 'Changed after it was sent', ink: '#B91C1C', wash: '#FDECEC' })
        expect(appFields).toEqual(CHANGE_FIELDS)
        expect(appWords).toEqual(CHANGE_WORDS)
        expect(appShape).toBe(SEND_SHAPE)
    })

    it('agree about the week as it is sent, both weeks, and carry each person\'s id', () => {
        const rows = [...base, row({ employee_id: 'e4', work_date: '2026-11-09', starts_at: '10:00:00', ends_at: '14:00:00', hours: 4 })]
        for (const weekStart of [PERIOD, WEEK2]) {
            const [fn, app] = week(rows, sick, weekStart)
            expect(app).toEqual(fn)
            expect(fn.every(p => p.id)).toBe(true)
        }
        const [first] = week(rows, sick)
        expect(first.map(p => p.name)).toEqual(['Aoife Byrne', 'Camila', 'Cathal Nolan'])
        const [second] = week(rows, sick, WEEK2)
        expect(second.map(p => p.name)).toEqual(['Niamh Walsh'])
    })

    // Bank holiday hours sit in weekBank[0] in a week on its own, whichever
    // week of the fortnight it is: the reason one is only ever laid over the
    // other of the same kind.
    it('puts a week\'s bank holiday hours in its own first slot', () => {
        const args = {
            team, absences: [], periodStart: '2026-10-25', weekStart: '2026-10-25',
            entries: [row({ employee_id: 'e1', work_date: '2026-10-26', starts_at: '09:00:00', ends_at: '15:00:00', hours: 6 })],
        }
        const [aoife] = weekAsSent(args)
        expect(aoife.weekBank).toEqual([6, 0])
        expect(aoife.bankHoliday).toBe(6)
        expect(aoife.worked).toBe(0)
    })
})

describe('what counts as a change since week 1 went on its own', () => {
    it('finds hours that moved, and the day that moved them', () => {
        const out = changed([base], [moved(base, camila, { starts_at: '12:30:00', hours: 9.5 })])
        expect(out).toHaveLength(1)
        expect(out[0]).toMatchObject({ id: 'e2', name: 'Camila', added: false, gone: false })
        expect(out[0].figures).toEqual([{ field: 'worked', was: 5, now: 9.5 }])
        expect(out[0].days.map(d => d.date)).toEqual(['2026-11-05'])
        expect(out[0].days[0].was.hours).toBe(5)
        expect(out[0].days[0].now.hours).toBe(9.5)
    })

    // The week 1 email had no clock times, so times that moved with the hours
    // the same are not a change to it.
    it('does not count clock times the email never had', () => {
        const later = moved(base, camila, { starts_at: '18:00:00', ends_at: '23:00:00' })
        expect(changed([base], [later])).toEqual([])
    })

    it('finds a day added and a day taken away', () => {
        const added = [...base, row({ employee_id: 'e1', work_date: '2026-11-06', starts_at: '09:00:00', ends_at: '13:00:00', hours: 4 })]
        const [aoife] = changed([base], [added])
        expect(aoife.days).toEqual([expect.objectContaining({ date: '2026-11-06', was: null })])
        const [again] = changed([added], [base])
        expect(again.days).toEqual([expect.objectContaining({ date: '2026-11-06', now: null })])
    })

    it('finds a holiday added', () => {
        const holiday = [{ employee_id: 'e1', kind: 'holiday', status: 'approved', starts_on: '2026-11-04', ends_on: '2026-11-04', hours: 8 }]
        const [aoife] = changed([base], [base, holiday])
        expect(aoife.figures).toEqual([{ field: 'holiday', was: 0, now: 8 }])
        expect(aoife.days.map(d => d.date)).toEqual(['2026-11-04'])
    })

    it('finds a sick day turned into part of a day', () => {
        const part = [{ ...sick[0], can_work_from: '13:00' }]
        const [cathal] = changed([base, sick], [base, part])
        expect(cathal.figures).toEqual([
            { field: 'sickDays', was: 1, now: 0 },
            { field: 'sickParts', was: 0, now: 1 },
        ])
    })

    it('finds somebody added since, and somebody taken off', () => {
        const niamh = row({ employee_id: 'e4', work_date: '2026-11-03', starts_at: '09:00:00', ends_at: '15:00:00', hours: 6 })
        const [added] = changed([base], [[...base, niamh]])
        expect(added).toMatchObject({ id: 'e4', added: true })
        const out = changed([[...base, niamh]], [base])
        expect(out).toEqual([expect.objectContaining({ id: 'e4', gone: true, name: 'Niamh Walsh' })])
    })

    // His call: a comment on its own is never a change.
    it('never counts a comment on its own', () => {
        const said = moved(base, camila, { note: 'Came in early to cover lunch' })
        expect(changed([base], [said])).toEqual([])
        const onlyComment = [...base, row({ employee_id: 'e4', work_date: '2026-11-03', starts_at: null, ends_at: null, hours: 0, note: 'Swapped with Aoife' })]
        expect(changed([base], [onlyComment])).toEqual([])
    })

    // Net, not edits, the same as the report.
    it('says nothing once a change is put back', () => {
        const there = moved(base, camila, { hours: 9.5 })
        const back = moved(there, camila, { hours: 5 })
        expect(changed([base], [back])).toEqual([])
    })

    // Hours added up in floats never give the same float twice.
    it('takes the figures to two places before comparing them', () => {
        const thirds = [
            row({ employee_id: 'e1', work_date: '2026-11-01', starts_at: '09:00:00', ends_at: '10:00:00', hours: 0.1 }),
            row({ employee_id: 'e1', work_date: '2026-11-01', starts_at: '11:00:00', ends_at: '12:00:00', hours: 0.2 }),
        ]
        const one = [row({ employee_id: 'e1', work_date: '2026-11-01', starts_at: '09:00:00', ends_at: '10:00:00', hours: 0.3 })]
        expect(changed([thirds], [one])).toEqual([])
    })

    // A name is not hours. Somebody from another restaurant is matched by her
    // name, so a rename with the same days is the rename it is.
    it('takes a visitor renamed with the same days as the same person', () => {
        const hers = name => [...base, row({ employee_id: null, person_name: name, work_date: '2026-11-05', starts_at: '13:28:23', ends_at: '18:02:37', hours: 4.57 })]
        expect(changed([hers('Camila V')], [hers('Camila Valenzuela')])).toEqual([])
        const more = moved(hers('Camila Valenzuela'), e => !e.employee_id, { hours: 6 })
        const out = changed([hers('Camila V')], [more])
        expect(out.map(c => [c.name, c.added, c.gone])).toEqual([['Camila Valenzuela', true, false], ['Camila V', false, true]])
        expect(out[0].guest).toBe(true)
    })
})

// Against a pay period email, whose PDF had every clock time and every day.
describe('what counts as a change since the pay period went', () => {
    it('counts clock times that moved with the hours the same', () => {
        const later = moved(base, camila, { starts_at: '18:00:00', ends_at: '23:00:00' })
        const [c] = changed([base], [later], 'period')
        expect(c.figures).toEqual([])
        expect(c.days.map(d => d.date)).toEqual(['2026-11-05'])
    })

    it('still never counts a comment on its own', () => {
        expect(changed([base], [moved(base, camila, { note: 'Late delivery' })], 'period')).toEqual([])
    })
})

describe('which send each week is compared with', () => {
    const [now1] = week(moved(base, camila, { hours: 9.5 }))
    const [now2] = week(base, [], WEEK2)
    const [sent1] = week(base)
    const weeks = [{ weekStart: PERIOD, now: now1 }, { weekStart: WEEK2, now: now2 }]
    const copy = over => ({ week_start: PERIOD, scope: 'week', sent_at: '2026-11-09T10:12:00+00:00', shape: 1, held: false, people: sent1, ...over })
    const both = args => {
        const fn = earlierSends(args)
        expect(appEarlierSends(args)).toEqual(fn)
        return fn
    }

    it('takes the latest real email that carried the week', () => {
        const older = copy({ sent_at: '2026-11-08T10:00:00+00:00', people: [] })
        const [one, two] = both({ weeks, sends: [older, copy()], filed: { [PERIOD]: '2026-11-09T10:12:00+00:00' } })
        expect(one).toMatchObject({ week: 0, scope: 'week', sentAt: '2026-11-09T10:12:00+00:00' })
        expect(one.changes.map(c => c.name)).toEqual(['Camila'])
        expect(two).toBeNull()
    })

    // Nobody on the list got held mail, so it is never what an email says it
    // replaces, and a week filed only by held mail was never really sent.
    it('never compares with held mail', () => {
        const held = copy({ held: true, sent_at: '2026-11-10T08:00:00+00:00', people: [] })
        const [one] = both({ weeks, sends: [copy(), held], filed: { [PERIOD]: '2026-11-10T08:00:00+00:00' } })
        expect(one.sentAt).toBe('2026-11-09T10:12:00+00:00')
        const [alone] = both({ weeks, sends: [held], filed: { [PERIOD]: '2026-11-10T08:00:00+00:00' } })
        expect(alone).toBeNull()
    })

    // Before the Hub kept copies a pay period stamped both weeks with one
    // time. It went, and nothing can be said about what changed.
    it('knows a pay period sent before copies were kept', () => {
        const at = '2026-10-19T09:00:00+00:00'
        const out = both({ weeks, sends: [], filed: { [PERIOD]: at, [WEEK2]: at } })
        expect(out).toEqual([
            { week: 0, weekStart: PERIOD, scope: 'period', sentAt: at, changes: null },
            { week: 1, weekStart: WEEK2, scope: 'period', sentAt: at, changes: null },
        ])
    })

    // A send whose copy could not be written: the stamp is newer than any copy.
    it('says nothing about what changed when the latest send kept no copy', () => {
        const [one] = both({ weeks, sends: [copy()], filed: { [PERIOD]: '2026-11-11T09:00:00+00:00' } })
        expect(one).toMatchObject({ scope: 'week', changes: null })
    })

    it('never compares with a copy in a shape it does not know', () => {
        const [one] = both({ weeks, sends: [copy({ shape: 2 })], filed: { [PERIOD]: '2026-11-09T10:12:00+00:00' } })
        expect(one).toMatchObject({ scope: 'week', changes: null })
    })
})

describe('which email the button makes', () => {
    const period = periodOf('2026-11-01', '2026-09-20')

    it('sends week 1 while the pay period runs, and the pay period once it is over', () => {
        expect(sendScope({ period, today: '2026-11-10' })).toBe('week')
        expect(sendScope({ period, today: '2026-11-15' })).toBe('period')
    })

    it('sends the pay period once it has gone, even before it is over', () => {
        expect(sendScope({ period, today: '2026-11-10', filed: { '2026-11-08': '2026-11-10T09:00:00Z' } })).toBe('period')
    })

    it('lets week 1 really go only once its Saturday is over', () => {
        expect(weekOneOver(period, '2026-11-07')).toBe(false)
        expect(weekOneOver(period, '2026-11-08')).toBe(true)
    })

    // The function checks the date it is handed the same way the app counts.
    it('knows a pay period start from any other Sunday, the same as the app', () => {
        for (const date of ['2026-11-01', '2026-11-15', '2026-10-18', '2026-09-20', '2027-01-10']) {
            expect(isPeriodStart(date, '2026-09-20')).toBe(periodOf(date, '2026-09-20').start === date)
        }
        expect(isPeriodStart('2026-11-08', '2026-09-20')).toBe(false)
        expect(isPeriodStart('2026-11-02', '2026-09-20')).toBe(false)
        // A reference typed on a Wednesday is snapped back to its Sunday.
        expect(isPeriodStart('2026-11-01', '2026-09-23')).toBe(true)
    })
})

describe('the words on screen', () => {
    it('says each person in a line short enough for a notice', () => {
        expect(changeShort({ name: 'Camila', added: false, gone: false, figures: [{ field: 'worked', was: 22, now: 26.5 }], days: [{ date: '2026-11-05' }] }))
            .toMatch(/^Camila: worked 22\.00 h then, 26\.50 h now \(Thu 5 Nov\)\.$/)
        expect(changeShort({ name: 'Cathal', figures: [{ field: 'sickDays', was: 1, now: 0 }], days: [] }))
            .toBe('Cathal: 1 day sick then, none now.')
        expect(changeShort({ name: 'Niamh', added: true, figures: [], days: [{ date: '2026-11-03' }] }))
            .toMatch(/^Niamh: added since \(Tue 3 Nov\)\.$/)
    })

    it('names who changed for the Timesheet', () => {
        expect(changeNames([
            { name: 'Camila', days: [{ date: '2026-11-05' }] },
            { name: 'Cathal', days: [{ date: '2026-11-04' }] },
            { name: 'Niamh', added: true, days: [] },
        ])).toMatch(/^Camila \(Thu 5 Nov\), Cathal \(Wed 4 Nov\) and Niamh \(added\)$/)
    })
})

// ---------------------------------------------------------------------------
// The emails, word for word (the plan's preview, 9 November 2026)
// ---------------------------------------------------------------------------

const weekOne = (over = {}) => timesheetEmail({
    restaurantName: 'Point Campus',
    periodStart: PERIOD,
    people: week(base, sick)[0],
    permissions: [],
    today: '2026-11-09',
    scope: 'week',
    ...over,
})
const fortnight = (over = {}) => timesheetEmail({
    restaurantName: 'Point Campus',
    periodStart: PERIOD,
    people: personPeriod({ people: team, entries: base, absences: sick, dates: Array.from({ length: 14 }, (_, i) => addDays(PERIOD, i)) }),
    permissions: [],
    today: '2026-11-16',
    paper: true,
    ...over,
})
// Week 1 as it went on Monday 9 November, and as it is now.
const camilaLater = moved(base, camila, { starts_at: '12:30:00', hours: 9.5, note: 'Came in early to cover lunch, agreed on the day' })
const sentAlone = changes => ({ week: 0, weekStart: PERIOD, scope: 'week', sentAt: '2026-11-09T10:12:00+00:00', changes })
const theChange = () => whatChanged(week(base, sick)[0], week(camilaLater, sick)[0])

describe('week 1 on its own', () => {
    it('says week 1 of 2 in the subject, the preheader and the header', () => {
        const mail = weekOne()
        expect(mail.subject).toBe('Hours, week 1 of 2, 1 to 7 November 2026, Point Campus')
        expect(mail.html).toContain('Week 1 of 2, not for the payroll yet. 1 to 7 November 2026')
        expect(mail.html).toContain('Hours, 1 to 7 November 2026')
        expect(mail.html).toContain('Week 1 of 2, pay period 1 November to 14 November 2026')
    })

    it('tells her it is not for the payroll yet', () => {
        const words = weekOne().html.replace(/\s+/g, ' ')
        expect(words).toContain('Week 1 of 2, sent on its own, and not for the payroll yet. The whole pay period comes after'
            + ' week 2 with the PDF, and it will say at the top if anything in week 1 has changed.&#32;Bank holiday and'
            + ' holiday hours are not in Worked.')
    })

    it('gives a week Name, Worked, Holiday and Sundays, spread across the width', () => {
        const html = weekOne().html
        const heads = html.slice(html.indexOf('>Name</th>') - 400, html.indexOf('</tr>', html.indexOf('>Name</th>')))
        expect(heads.match(/<th /g)).toHaveLength(4)
        expect(heads.match(/<th width="20%"/g)).toHaveLength(3)
        expect(heads).toContain('<th width="40%"')
        expect(heads).not.toContain('Week&nbsp;1')
        expect(html).not.toContain('Bank hol.')
    })

    // A week with a bank holiday in it gets the column, headed with no week.
    it('has Bank hol. only on a week with one', () => {
        const html = timesheetEmail({
            restaurantName: 'Point Campus', periodStart: '2026-10-25', scope: 'week', permissions: [], today: '2026-11-02',
            people: weekAsSent({ team, entries: [row({ employee_id: 'e1', work_date: '2026-10-26', starts_at: '09:00:00', ends_at: '15:00:00', hours: 6 })], periodStart: '2026-10-25', weekStart: '2026-10-25' }),
        }).html
        expect(html).toContain('>Bank hol.</th>')
        expect(html.match(/<th width="16%"/g)).toHaveLength(4)
        expect(html).toContain('<th width="36%"')
    })

    it('carries no PDF words and no week columns in the plain text', () => {
        const { text } = weekOne()
        expect(text).toContain('Point Campus, hours, 1 to 7 November 2026')
        expect(text).toContain('Week 1 of 2, pay period 1 November to 14 November 2026')
        expect(text).toContain('Aoife Byrne: worked 16.50 h')
        expect(text).not.toContain('(week 1 ')
        expect(text).not.toContain('PDF attached')
        expect(text).not.toContain('Bank holiday')
    })

    it('says a test of week 1 does not mark it as sent', () => {
        const mail = weekOne({ test: true })
        expect(mail.subject).toBe('[Test] Hours, week 1 of 2, 1 to 7 November 2026, Point Campus')
        expect(mail.html).toContain('The hours below are real, but sending this test does not mark week 1 as sent.')
        expect(mail.text).toContain('[Test] Sending this test does not mark week 1 as sent.')
    })

    it('says Corrected and what changed when week 1 goes again', () => {
        const mail = weekOne({ people: week(camilaLater, sick)[0], earlier: [sentAlone(theChange())] })
        expect(mail.subject).toBe('Corrected: Hours, week 1 of 2, 1 to 7 November 2026, Point Campus')
        expect(mail.html).toContain('This replaces the week 1 email sent on Monday 9 November')
        expect(mail.html).toContain('Camila: worked 5.00 h when sent, 9.50 h now. Thursday 5 November changed.')
        const same = weekOne({ earlier: [sentAlone([])] })
        expect(same.html).toContain('The hours have not changed from that email.')
    })
})

describe('the pay period after week 1 went on its own', () => {
    it('says week 1 has not changed when it went alone and nothing moved', () => {
        const mail = fortnight({ earlier: [sentAlone([]), null] })
        expect(mail.subject).toBe('Hours, 1 November to 14 November 2026, Point Campus')
        expect(mail.html).toContain('Week 1 was sent on its own on Monday 9 November, and it has not changed since.')
        expect(mail.text).toContain('Week 1 was sent on its own on Monday 9 November, and it has not changed since.')
    })

    it('puts a red band under the header when week 1 changed after it was sent', () => {
        const mail = fortnight({ earlier: [sentAlone(theChange()), null] })
        expect(mail.subject).toBe('Week 1 changed: Hours, 1 November to 14 November 2026, Point Campus')
        expect(mail.html).toContain('Week 1 changed after it was sent. 1 November to 14 November 2026')
        const header = mail.html.indexOf('Pay period, two weeks')
        const band = mail.html.indexOf('Week 1 changed after it was sent</div>')
        expect(band).toBeGreaterThan(header)
        expect(band).toBeLessThan(mail.html.indexOf('>Name</th>'))
        expect(mail.html).toContain(`border-bottom:2px solid ${CHANGED_LOOK.ink}`)
        expect(mail.html).toContain('Week 1 was sent on its own on Monday 9 November. Some of its hours have changed since,'
            + ' so that email is out of date. The table below has the hours as they are now, and the PDF shows each change day by day.')
        expect(mail.html).toContain('Camila: worked 5.00 h when sent, 9.50 h now. Thursday 5 November changed.')
        expect(mail.html).not.toContain('has not changed since')
    })

    it('marks each person who changed in the table, and only them', () => {
        const mail = fortnight({ earlier: [sentAlone(theChange()), null] })
        const mark = 'Week 1&#32;<span style="white-space:nowrap;">changed</span>'
        expect(mail.html.split(mark)).toHaveLength(2)
        const camilaRow = mail.html.slice(mail.html.indexOf('Camila'), mail.html.indexOf('Cathal Nolan'))
        expect(camilaRow).toContain(mark)
        expect(mail.text).toContain('week 1 changed')
    })

    // The email never carries a comment: the PDF has each one beside its day.
    it('never carries the comment on a changed day', () => {
        const mail = fortnight({ earlier: [sentAlone(theChange()), null] })
        expect(mail.html).not.toContain('Came in early')
        expect(mail.text).not.toContain('Came in early')
    })

    // Plain text has no red, so it says the band in words at the top.
    it('says it at the top of the plain text, never "in red"', () => {
        const { text } = fortnight({ earlier: [sentAlone(theChange()), null] })
        const lines = text.split('\n')
        expect(lines.indexOf('Week 1 changed after it was sent.')).toBeLessThan(lines.findIndex(l => l.startsWith('Week 1 (')))
        expect(text).toContain('  Camila: worked 5.00 h when sent, 9.50 h now. Thursday 5 November changed.')
        expect(text).not.toMatch(/in red/)
    })
})

describe('the pay period sent again', () => {
    const sentPeriod = (week, changes) => ({ week, weekStart: week ? WEEK2 : PERIOD, scope: 'period', sentAt: '2026-11-15T09:30:00+00:00', changes })

    it('says Corrected, what it replaces and what changed, week by week', () => {
        const mail = fortnight({ earlier: [sentPeriod(0, theChange()), sentPeriod(1, [])] })
        expect(mail.subject).toBe('Corrected: Hours, 1 November to 14 November 2026, Point Campus')
        expect(mail.html).toContain('Corrected. 1 November to 14 November 2026')
        expect(mail.html).toContain('This replaces the hours sent on Sunday 15 November')
        expect(mail.html).toContain('If the payroll for this period has already been run, these are the hours to put right.')
        expect(mail.html).toContain('Week 1, Camila: worked 5.00 h when sent, 9.50 h now. Thursday 5 November changed.')
    })

    it('says when nothing changed, and when there is no copy to tell', () => {
        expect(fortnight({ earlier: [sentPeriod(0, []), sentPeriod(1, [])] }).html)
            .toContain('The hours have not changed from the email sent on Sunday 15 November.')
        expect(fortnight({ earlier: [sentPeriod(0, null), sentPeriod(1, null)] }).html)
            .toContain('The Hub did not keep a copy of that email, so it cannot say what changed.')
    })

    it('marks a week 2 change as week 2', () => {
        const mail = fortnight({ earlier: [sentPeriod(0, []), sentPeriod(1, [{ id: 'e1', name: 'Aoife Byrne', added: false, gone: false, figures: [{ field: 'worked', was: 32, now: 34 }], days: [{ date: '2026-11-10', was: {}, now: {} }] }])] })
        expect(mail.html).toContain('Week 2, Aoife Byrne: worked 32.00 h when sent, 34.00 h now. Tuesday 10 November changed.')
        expect(mail.html).toContain('Week 2&#32;<span style="white-space:nowrap;">changed</span>')
    })
})

describe('a line for each kind of change', () => {
    it('says counts, added, gone and times alone in plain words', () => {
        expect(changeLine({ name: 'Cathal Nolan', figures: [{ field: 'worked', was: 31.25, now: 39.25 }, { field: 'sickDays', was: 1, now: 0 }], days: [{ date: '2026-11-04', was: {}, now: {} }] }))
            .toBe('Cathal Nolan: worked 31.25 h when sent, 39.25 h now, and 1 day sick when sent, none now. Wednesday 4 November changed.')
        expect(changeLine({ name: 'Niamh Walsh', added: true, figures: [{ field: 'worked', was: 0, now: 6 }], days: [{ date: '2026-11-03', was: null, now: {} }] }))
            .toBe('Niamh Walsh: not in the week 1 email. Added since, with 6.00 h worked. Tuesday 3 November added.')
        expect(changeLine({ name: 'Niamh Walsh', gone: true, figures: [{ field: 'worked', was: 6, now: 0 }], days: [{ date: '2026-11-03', was: {}, now: null }] }))
            .toBe('Niamh Walsh: in the week 1 email with 6.00 h worked, not in this one. Tuesday 3 November taken away.')
        expect(changeLine({ name: 'Camila', figures: [], days: [{ date: '2026-11-05', was: {}, now: {} }] }))
            .toBe('Camila: Thursday 5 November changed. The hours are the same.')
        expect(changeLine({ name: 'Aoife', figures: [{ field: 'sundays', was: 1, now: 2 }], days: [] }))
            .toBe('Aoife: 1 Sunday when sent, 2 Sundays now.')
    })
})

// The same rules every hours mail keeps, over every new shape of it.
describe('every new shape keeps the rules', () => {
    const shapes = () => [
        weekOne(), weekOne({ test: true }), weekOne({ earlier: [sentAlone(theChange())] }),
        fortnight({ earlier: [sentAlone([]), null] }), fortnight({ earlier: [sentAlone(theChange()), null] }),
        fortnight({ earlier: [{ ...sentAlone(theChange()), scope: 'period' }, null] }),
    ]

    it('has no money, no dashes and no line ending in a space', () => {
        for (const mail of shapes()) {
            for (const part of [mail.html, mail.text, mail.subject]) {
                expect(part).not.toMatch(/€|&euro;/)
                expect(part).not.toMatch(/[–—]|&mdash;[A-Za-z]|&ndash;/)
            }
            for (const line of mail.text.split('\n')) expect(line).toBe(line.trimEnd())
        }
    })

    it('never says anything about the roster', () => {
        for (const mail of shapes()) expect(`${mail.html} ${mail.text}`).not.toMatch(/roster/i)
    })
})

describe('somebody from another restaurant after a send', () => {
    it('is marked as from another restaurant and as changed, both', () => {
        const visitor = guestPerson('Camila Valenzuela')
        const hers = [...base, row({ employee_id: null, person_name: 'Camila Valenzuela', work_date: '2026-11-05', starts_at: '13:28:23', ends_at: '18:02:37', hours: 4.57 })]
        const changes = changed([base], [hers])
        expect(changes).toEqual([expect.objectContaining({ id: visitor.id, added: true, guest: true })])
        const mail = fortnight({
            people: personPeriod({ people: [...team, visitor], entries: hers, absences: [], dates: Array.from({ length: 14 }, (_, i) => addDays(PERIOD, i)) }),
            earlier: [sentAlone(changes), null],
        })
        expect(mail.html).toContain('Camila Valenzuela: not in the week 1 email. Added since, with 4.57 h worked. Thursday 5 November added.')
        expect(mail.html).toContain('From another&#32;<span style="white-space:nowrap;">restaurant</span>')
        expect(mail.html).toContain('Week 1&#32;<span style="white-space:nowrap;">changed</span>')
    })
})
