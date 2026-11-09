// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The upload, with the file's reading stubbed: the readers have tests of their
// own against his real exports, and what is under test here is what the
// dialog asks and what it writes. His case of 9 November 2026: our Camila on
// the till as SOLIS Camila, and a second Camila from another restaurant as
// VALENZUELA ALVAREZ Camila.
const WEEK = '2026-11-01'
const WEEK_END = '2026-11-07'

const shifts = [
    { name: 'SOLIS Camila', work_date: '2026-11-05', starts_at: '17:32:15', ends_at: '21:31:18', hours: 3.98 },
    { name: 'VALENZUELA ALVAREZ Camila', work_date: '2026-11-05', starts_at: '13:28:23', ends_at: '18:02:37', hours: 4.57 },
]

vi.mock('@/lib/timesheetImport', () => ({
    readTimesheet: () => ({ from: WEEK, to: WEEK_END }),
    fileFits: () => ({ ok: true }),
    insideWeek: () => ({ shifts, breaks: [], breakHours: 0, sameTime: [], outside: 0, outsideWeeks: [] }),
    sameTimeWho: () => '',
}))

const tables = {}
const inserted = []

function chain(table) {
    const self = {
        select: () => self,
        eq: () => self,
        is: () => self,
        in: () => self,
        order: () => self,
        insert: values => {
            inserted.push({ table, values })
            return Promise.resolve({ error: null })
        },
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        upsert: () => Promise.resolve({ error: null }),
        then: (...args) => Promise.resolve({ data: tables[table] || [], error: null }).then(...args),
    }
    return self
}

vi.mock('@/lib/supabase', () => ({ supabase: { from: table => chain(table) } }))
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const { default: ImportDialog } = await import('@/components/timesheet/ImportDialog')

const camila = { id: 'e3', full_name: 'Camila' }

function open() {
    render(
        <ImportDialog
            restaurantId="r1"
            restaurantName="Point Campus"
            weekStart={WEEK}
            weekEnd={WEEK_END}
            people={[camila]}
            team={[camila]}
            entries={[]}
            absences={[]}
            onClose={() => {}}
            onDone={() => {}}
        />,
    )
}

async function upload() {
    const file = new File(['<xml />'], 'timesheet.xml', { type: 'text/xml' })
    // jsdom's File has no text() everywhere it runs.
    file.text = () => Promise.resolve('<xml />')
    await userEvent.upload(screen.getByLabelText(/The report/), file)
    await screen.findByText('VALENZUELA ALVAREZ Camila')
}

beforeEach(() => {
    inserted.length = 0
    tables.timesheet_names = [{ name: 'SOLIS Camila', employee_id: 'e3', ignored: false }]
    tables.timesheet_entries = []
})

describe('somebody from another restaurant at the upload', () => {
    it('offers her, with a name made from the till\'s', async () => {
        open()
        await upload()

        await userEvent.selectOptions(screen.getByLabelText('Who VALENZUELA ALVAREZ Camila is'), 'From another restaurant')

        expect(screen.getByLabelText('Their name')).toHaveValue('Camila Valenzuela')
        expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
    })

    it('starts from the name she had last time', async () => {
        tables.timesheet_entries = [{ till_name: 'VALENZUELA ALVAREZ Camila', person_name: 'Camila V.', work_date: '2026-10-08' }]
        open()
        await upload()

        await userEvent.selectOptions(screen.getByLabelText('Who VALENZUELA ALVAREZ Camila is'), 'From another restaurant')

        expect(screen.getByLabelText('Their name')).toHaveValue('Camila V.')
        expect(screen.getByText(/Last time this name was Camila V\./)).toBeInTheDocument()
    })

    // Answered names fold into the plan as they are given, and the box she is
    // being named in must not vanish while it is typed into.
    it('keeps the name on screen while it is typed, and will not go on with a name the team has', async () => {
        open()
        await upload()

        await userEvent.selectOptions(screen.getByLabelText('Who VALENZUELA ALVAREZ Camila is'), 'From another restaurant')
        const box = screen.getByLabelText('Their name')
        await userEvent.clear(box)
        await userEvent.type(box, 'Camila')

        expect(screen.getByLabelText('Their name')).toHaveValue('Camila')
        expect(screen.getByText(/Camila is already on the team/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: '1 still to answer' })).toBeDisabled()
    })

    it('writes her rows with her name and the till\'s, apart from the team\'s, and remembers nothing', async () => {
        open()
        await upload()

        await userEvent.selectOptions(screen.getByLabelText('Who VALENZUELA ALVAREZ Camila is'), 'From another restaurant')
        await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
        expect(screen.getByText(/Camila Valenzuela, from another restaurant: 1 shift/)).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Import' }))

        await screen.findByText(/Camila Valenzuela from another restaurant/)
        expect(inserted.filter(i => i.table === 'timesheet_names')).toEqual([])
        const rows = inserted.filter(i => i.table === 'timesheet_entries').map(i => i.values)
        expect(rows).toHaveLength(2)
        // Our Camila's row as it always was, with no new columns in it.
        expect(rows[0]).toEqual([expect.not.objectContaining({ till_name: expect.anything() })])
        expect(rows[0][0]).toMatchObject({ employee_id: 'e3', starts_at: '17:32:15' })
        expect(rows[1]).toEqual([expect.objectContaining({
            employee_id: null, person_name: 'Camila Valenzuela', till_name: 'VALENZUELA ALVAREZ Camila',
            work_date: '2026-11-05', starts_at: '13:28:23', ends_at: '18:02:37', source: 'import',
        })])
    })
})
