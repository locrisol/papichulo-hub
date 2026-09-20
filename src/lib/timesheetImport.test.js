// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import {
    csvRows, longDate, stamp, fileHeader, readTimesheet, fileFits, insideWeek,
    isoStamp, BREAK_KIND,
} from '@/lib/timesheetImport'

// The real export's shape, with invented people.
//
// Names are not copied out of the real file on purpose: the shape is what is
// being tested and staff names have no business in the repository. Everything
// awkward about the real one is kept, because that is the part worth pinning:
// the whole header repeated on every line, the company name before the
// restaurant name, the tabs in the date range, the two-space stamps, a till
// login with no wage, somebody with no surname, and the break rows.
const HEADERS = '"Shift Type","Shift Start","Shift End","Reg. Hours","OTHours","Total Hours","Wage Due"'
const RANGE = '"    From\t: 06 September 2026    To\t: 12 September 2026"'
const PREFIX = `"ABC Company","Employee OverTime Shifts Summary","Employee     -- Shifts",${RANGE},${HEADERS},`
    + `"Papi Chulo Point Campus","Employee OverTime Shifts Summary","Employee     -- Shifts",${RANGE},${HEADERS}`

function line(name, kind, date, from, to, hours, wage) {
    return `${PREFIX},"${name}","Reference #:",,"${kind}",${date}  ${from},${date}  ${to},`
        + `${hours},0.00,${hours},${wage}`
}

const FILE = [
    line(' Rosa', 'Shift', '07/09/2026', '08:30:19', '21:17:08', '12.78', '153.40'),
    line('QUINN Aoife', 'Shift', '06/09/2026', '11:58:04', '20:03:12', '8.09', '133.49'),
    line('QUINN Aoife', BREAK_KIND, '06/09/2026', '17:00:41', '18:09:28', '-1.15', '-18.98'),
    line('O BRIEN MURPHY Cathal', 'Shift', '08/09/2026', '09:01:22', '17:33:16', '8.53', '127.95'),
    line('O BRIEN MURPHY Cathal', BREAK_KIND, '08/09/2026', '14:17:57', '14:45:11', '-0.47', '-7.05'),
    line('MANAGER Manager', 'Shift', '09/09/2026', '10:00:00', '10:00:30', '0.01', '0.00'),
].join('\n')

describe('reading the file', () => {
    const read = readTimesheet(FILE)

    it('knows which restaurant it is for', () => {
        expect(read.restaurant).toBe('Papi Chulo Point Campus')
    })

    it('knows which week it covers', () => {
        expect(read.from).toBe('2026-09-06')
        expect(read.to).toBe('2026-09-12')
    })

    it('finds the shifts and leaves the breaks out of them', () => {
        expect(read.shifts).toHaveLength(4)
        expect(read.shifts.every(s => s.kind === 'Shift')).toBe(true)
    })

    // The one that would cost money. In his real week there were seven of
    // these across four people, worth 5.51 hours and EUR 77.82, and the report
    // deducts every one. Breaks are paid here.
    it('takes the break rows out', () => {
        expect(read.breaks).toHaveLength(2)
        expect(read.breakHours).toBe(1.62)
    })

    it('counts a negative row as a break even if it is called something else', () => {
        const odd = readTimesheet(line('QUINN Aoife', 'Rest period', '06/09/2026', '17:00:00', '17:30:00', '-0.50', '-7.50'))
        expect(odd.shifts).toHaveLength(0)
        expect(odd.breaks).toHaveLength(1)
    })

    it('reads a stamp into a day and a time', () => {
        const aoife = read.shifts.find(s => s.name === 'QUINN Aoife')
        expect(aoife).toMatchObject({
            work_date: '2026-09-06', starts_at: '11:58:04', ends_at: '20:03:12',
        })
    })

    it('lists every name once, including the ones that are not people', () => {
        expect(read.names).toEqual([
            'MANAGER Manager', 'O BRIEN MURPHY Cathal', 'QUINN Aoife', 'Rosa',
        ])
    })

    // Every shape the file actually contains: two surnames, one surname, and
    // none at all. No rule matches these to an employee row, which is why the
    // import asks instead of guessing.
    it('keeps a name with no surname', () => {
        expect(read.names).toContain('Rosa')
    })

    it('finds nothing in an empty file rather than throwing', () => {
        expect(readTimesheet('')).toMatchObject({ shifts: [], breaks: [], names: [] })
        expect(readTimesheet(null)).toMatchObject({ shifts: [] })
    })
})

describe('a shift that runs past midnight', () => {
    // The stamp on the end carries the next day. The day it belongs to is the
    // day it started, or a Saturday night lands in the following week.
    const read = readTimesheet(
        `${PREFIX},"QUINN Aoife","Reference #:",,"Shift",12/09/2026  17:00:00,13/09/2026  01:30:00,8.50,0.00,8.50,127.50`,
    )

    it('files it on the day it started', () => {
        expect(read.shifts[0].work_date).toBe('2026-09-12')
    })

    it('says so, so nothing has to work it out again', () => {
        expect(read.shifts[0].ends_next_day).toBe(true)
        expect(read.shifts[0].ends_at).toBe('01:30:00')
    })
})

describe('whether the file belongs here', () => {
    const header = { restaurant: 'Papi Chulo Point Campus', from: '2026-09-06', to: '2026-09-12' }
    const week = { weekStart: '2026-09-06', weekEnd: '2026-09-12' }

    it('accepts the right file', () => {
        expect(fileFits({ header, restaurantName: 'Point Campus', ...week })).toEqual({ ok: true })
    })

    it('refuses the wrong week and says which one it is', () => {
        const out = fileFits({ header, restaurantName: 'Point Campus', weekStart: '2026-10-25', weekEnd: '2026-10-31' })
        expect(out).toMatchObject({ ok: false, why: 'week', from: '2026-09-06', to: '2026-09-12' })
    })

    it('refuses the other restaurant and names it', () => {
        const out = fileFits({ header, restaurantName: 'Dun Laoghaire', ...week })
        expect(out).toMatchObject({ ok: false, why: 'restaurant', found: 'Papi Chulo Point Campus' })
    })

    // The restaurant is called "Point Campus" in the Hub and "Papi Chulo Point
    // Campus" in the till. A strict match would refuse every real file.
    it('matches a name that is part of the other', () => {
        expect(fileFits({ header, restaurantName: 'point campus', ...week }).ok).toBe(true)
        expect(fileFits({ header: { ...header, restaurant: 'Point Campus' }, restaurantName: 'Papi Chulo Point Campus', ...week }).ok).toBe(true)
    })

    // Better not to check than to refuse over a field that is not there.
    it('lets a file through that does not name a restaurant', () => {
        expect(fileFits({ header: { ...header, restaurant: null }, restaurantName: 'Dun Laoghaire', ...week }).ok).toBe(true)
    })

    it('refuses something it could not read at all', () => {
        expect(fileFits({ header: {}, restaurantName: 'Point Campus', ...week }))
            .toMatchObject({ ok: false, why: 'unreadable' })
    })
})

describe('the pieces', () => {
    it('reads a quoted csv with commas and doubled quotes inside', () => {
        expect(csvRows('"a,b","say ""hi""",c\n1,2,3')).toEqual([['a,b', 'say "hi"', 'c'], ['1', '2', '3']])
    })

    it('drops blank lines', () => {
        expect(csvRows('a,b\n\n\nc,d')).toEqual([['a', 'b'], ['c', 'd']])
    })

    it('takes a file with carriage returns', () => {
        expect(csvRows('a,b\r\nc,d')).toEqual([['a', 'b'], ['c', 'd']])
    })

    it.each([
        ['06 September 2026', '2026-09-06'],
        ['1 January 2027', '2027-01-01'],
        ['31 December 2026', '2026-12-31'],
    ])('reads %s', (text, date) => {
        expect(longDate(text)).toBe(date)
    })

    it.each(['', null, 'Septober 2026', '06 September', '40 May 2026'])('refuses %s', value => {
        expect(longDate(value)).toBeNull()
    })

    it('reads a stamp, day first', () => {
        expect(stamp('07/09/2026  08:30:19')).toEqual({ date: '2026-09-07', time: '08:30:19' })
    })

    it.each(['', null, '07/09/2026', '2026-09-07 08:30:19'])('refuses the stamp %s', value => {
        expect(stamp(value)).toBeNull()
    })

    it('finds the header on any line, since every line carries it', () => {
        expect(fileHeader(csvRows(FILE))).toMatchObject({
            restaurant: 'Papi Chulo Point Campus', from: '2026-09-06', to: '2026-09-12',
        })
    })
})

// The same report as XML, which is what Crystal should be asked for. It is the
// one export with named fields and ISO timestamps, so nothing is read by
// counting along from a marker and no date has to be guessed at.
const XML = `<?xml version="1.0" encoding="UTF-8" ?>
<CrystalReport xmlns="urn:crystal-reports:schemas:report-detail">
<Group Level="1"><GroupHeader><Section SectionNumber="0">
<Text Name="Text7"><TextValue>    From	: 13 September 2026
    To	: 20 September 2026</TextValue></Text>
<Field Name="DESCRIPTION1" FieldName="{StoreInfo.DESCRIPTION}"><FormattedValue>Papi Chulo Point Campus</FormattedValue><Value>Papi Chulo Point Campus</Value></Field>
</Section></GroupHeader>
<Group Level="2"><GroupHeader><Section SectionNumber="0">
<Field Name="GroupNameempName1" FieldName="GroupName ({@empName})"><FormattedValue> Rosa</FormattedValue><Value> Rosa</Value></Field>
</Section></GroupHeader>
<Details Level="3"><Section SectionNumber="0">
<Field Name="shiftType1"><FormattedValue>Shift</FormattedValue><Value>Shift</Value></Field>
<Field Name="punchedIn1"><FormattedValue>14/09/2026  08:30:03</FormattedValue><Value>2026-09-14T08:30:03</Value></Field>
<Field Name="punchedOut1"><FormattedValue>14/09/2026  17:16:16</FormattedValue><Value>2026-09-14T17:16:16</Value></Field>
<Field Name="shiftHoursTotal1"><FormattedValue>8.77</FormattedValue><Value>8.77</Value></Field>
</Section></Details>
<Details Level="3"><Section SectionNumber="0">
<Field Name="shiftType1"><FormattedValue>Unpaid Meal break</FormattedValue><Value>Unpaid Meal break</Value></Field>
<Field Name="punchedIn1"><FormattedValue>14/09/2026  14:09:20</FormattedValue><Value>2026-09-14T14:09:20</Value></Field>
<Field Name="punchedOut1"><FormattedValue>14/09/2026  15:09:06</FormattedValue><Value>2026-09-14T15:09:06</Value></Field>
<Field Name="shiftHoursTotal1"><FormattedValue>-1.00</FormattedValue><Value>-1.00</Value></Field>
</Section></Details>
<Details Level="3"><Section SectionNumber="0">
<Field Name="shiftType1"><FormattedValue>Shift</FormattedValue><Value>Shift</Value></Field>
<Field Name="punchedIn1"><FormattedValue>20/09/2026  09:00:00</FormattedValue><Value>2026-09-20T09:00:00</Value></Field>
<Field Name="punchedOut1"><FormattedValue>20/09/2026  17:00:00</FormattedValue><Value>2026-09-20T17:00:00</Value></Field>
<Field Name="shiftHoursTotal1"><FormattedValue>8.00</FormattedValue><Value>8.00</Value></Field>
</Section></Details>
</Group>
</Group>
</CrystalReport>`

describe('the XML export, which is the better one', () => {
    const read = readTimesheet(XML)

    it('is picked by what the file holds, not by its name', () => {
        expect(read.shifts.length).toBeGreaterThan(0)
    })

    it('takes the restaurant off a named field', () => {
        expect(read.restaurant).toBe('Papi Chulo Point Campus')
    })

    it('takes the range off the header', () => {
        expect(read.from).toBe('2026-09-13')
        expect(read.to).toBe('2026-09-20')
    })

    // The whole reason to prefer it. No reading 06/09 as the sixth and hoping.
    it('takes the ISO value rather than the printed one', () => {
        expect(read.shifts[0]).toMatchObject({
            work_date: '2026-09-14', starts_at: '08:30:03', ends_at: '17:16:16',
        })
    })

    it('takes the name off the group it belongs to', () => {
        expect(read.names).toEqual(['Rosa'])
    })

    it('still drops the break lines', () => {
        expect(read.breaks).toHaveLength(1)
        expect(read.breakHours).toBe(1)
    })

    it('gives nothing back for something that is not a report', () => {
        expect(readTimesheet('<?xml version="1.0"?><nonsense/>').shifts).toEqual([])
    })

    it.each([
        ['2026-09-14T08:30:03', { date: '2026-09-14', time: '08:30:03' }],
        ['', null],
        ['14/09/2026 08:30:03', null],
    ])('reads the ISO stamp %s', (text, want) => {
        expect(isoStamp(text)).toEqual(want)
    })
})

describe('a file that covers more than the week', () => {
    // Real: Pixel Point lets you pick the range and one came back as the 13th
    // to the 20th for a week that runs the 13th to the 19th. Refusing that
    // would turn a good file away over a date dragged one day too far.
    const header = { restaurant: 'Papi Chulo Point Campus', from: '2026-09-13', to: '2026-09-20' }
    const week = { weekStart: '2026-09-13', weekEnd: '2026-09-19' }

    it('is accepted', () => {
        expect(fileFits({ header, restaurantName: 'Point Campus', ...week })).toEqual({ ok: true })
    })

    it('is refused when it does not take the whole week in', () => {
        const short = { ...header, from: '2026-09-15' }
        expect(fileFits({ header: short, restaurantName: 'Point Campus', ...week }))
            .toMatchObject({ ok: false, why: 'week' })
    })

    it('leaves the days outside it for the week they belong to', () => {
        const read = readTimesheet(XML)
        const mine = insideWeek(read, '2026-09-13', '2026-09-19')
        expect(mine.shifts).toHaveLength(1)
        expect(mine.outside).toBe(1)
        expect(mine.breaks).toHaveLength(1)
    })

    // He exported the 6th to the 19th and only the 13th to the 19th went in,
    // which is right and looked like half the file had been swallowed. Saying
    // which weeks the rest belong to is the difference between a number and an
    // instruction.
    it('says which weeks the rest belong to', () => {
        const read = {
            shifts: [
                { work_date: '2026-09-02' }, { work_date: '2026-09-08' },
                { work_date: '2026-09-09' }, { work_date: '2026-09-15' },
            ],
            breaks: [],
        }
        const mine = insideWeek(read, '2026-09-13', '2026-09-19')

        expect(mine.outside).toBe(3)
        // The two days in the same week are one answer, in date order.
        expect(mine.outsideWeeks).toEqual(['2026-08-30', '2026-09-06'])
    })

    it('says nothing about other weeks when the file is one week', () => {
        const mine = insideWeek({ shifts: [{ work_date: '2026-09-15' }], breaks: [] }, '2026-09-13', '2026-09-19')
        expect(mine.outside).toBe(0)
        expect(mine.outsideWeeks).toEqual([])
    })
})
