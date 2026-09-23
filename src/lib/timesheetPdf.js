import { AWAY_LOOK, KIND_LOOK, BANK_LOOK } from '@/lib/timesheet'
import { periodWords } from '@/lib/payPeriod'
import { addDays, weekRange, stampDateTime } from '@/lib/dates'
import logo from '@/assets/PapiChuloLogoPrint.png?inline'

// The pay period as a piece of paper, for the accountant's files.
//
// **It is his own spreadsheet.** Summary on top, then everybody in turn: hours
// per week per person, a total, holiday kept out of it and bank holiday kept
// inside it. That is the sheet he has kept by hand for years, and the whole
// point of putting it on paper in the same shape is that nothing has to be
// learnt and nothing has to be explained to her.
//
// The same three rules the mail obeys. No money anywhere, because a rate is
// what somebody costs the company and not what they are paid. Nothing about the
// roster, because she never sees it. Times to the second, because that is what
// the till reports and what the hours are paid on.
//
// The figures are not worked out here. They come from personPeriod, the same
// one the mail is built from, and a test runs that against the function's own
// copy so the paper and the mail cannot disagree.

let jsPdfModule = null

// jsPDF is fetched when somebody asks for a PDF, not when the screen opens. It
// is 400KB, and most visits to the timesheet never press the button.
async function loadJsPdf() {
    if (!jsPdfModule) jsPdfModule = (await import('jspdf')).default
    return jsPdfModule
}

// The logo, in millimetres. The file is 400 by 249. The same size and the same
// place the stock take and the allergen sheets put it, so a page of this is
// recognisably from the same set.
const LOGO_WIDTH = 26
const LOGO_HEIGHT = (LOGO_WIDTH * 249) / 400

const DARK = [24, 47, 36]
const INK = [40, 40, 40]
const MUTED = [107, 100, 89]
const LINE = [222, 217, 207]

function rgb(hex) {
    const n = parseInt(String(hex).slice(1), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const h = n => (Number(n) || 0).toFixed(2)
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

function dayWords(iso) {
    const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`)
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December']
    return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]}`
}

function clock(time) {
    const m = /^(\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(time ?? ''))
    return m ? `${m[1]}:${m[2]}:${m[3] || '00'}` : ''
}

export async function timesheetPdf({
    restaurant, periodStart, people = [], at = new Date(), save = true,
}) {
    const JsPDF = await loadJsPdf()
    const pdf = new JsPDF({ unit: 'mm', format: 'a4' })

    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const marginX = 15
    const right = pageWidth - marginX

    const weeks = [periodStart, addDays(periodStart, 7)]
    const period = periodWords(periodStart)

    const T = {
        week: [
            people.reduce((t, p) => t + p.week[0], 0),
            people.reduce((t, p) => t + p.week[1], 0),
        ],
        worked: people.reduce((t, p) => t + p.worked, 0),
        bankHoliday: people.reduce((t, p) => t + p.bankHoliday, 0),
        holiday: people.reduce((t, p) => t + p.holiday, 0),
    }

    let y = 0

    // The top of every page: the logo, what this is, whose it is and when it
    // was made. A page of it on its own still says all four.
    function drawPageTop() {
        pdf.addImage(logo, 'PNG', marginX, 11, LOGO_WIDTH, LOGO_HEIGHT)
        // Twelve rather than six. At six the label sat against the edge of the
        // logo and the three lines read as one crowded block, which is what he
        // meant by squeezed.
        const textX = marginX + LOGO_WIDTH + 12

        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(7)
        pdf.setTextColor(150)
        pdf.text('HOURS', textX, 14.5, { charSpace: 0.7 })

        pdf.setFontSize(15)
        pdf.setTextColor(...INK)
        pdf.text(restaurant?.name || 'Papi Chulo', textX, 22.5)

        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(10)
        pdf.setTextColor(90)
        pdf.text(`Pay period, ${period}`, textX, 28.5)

        pdf.setFontSize(7)
        pdf.setTextColor(150)
        pdf.text(`Prepared ${stampDateTime(at)}`, right, 14.5, { align: 'right' })

        pdf.setDrawColor(...LINE)
        pdf.setLineWidth(0.3)
        pdf.line(marginX, 35, right, 35)

        y = 43
    }

    // Whose section is being drawn, so a page break inside one can say so.
    let onPage = null

    function drawPersonHead(name) {
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(10)
        pdf.setTextColor(...DARK)
        pdf.text(name, marginX, y)
        y += 1.6
        pdf.setDrawColor(...DARK)
        pdf.setLineWidth(0.5)
        pdf.line(marginX, y, right, y)
        y += 5
    }

    function room(needed) {
        if (y + needed <= pageHeight - 16) return
        pdf.addPage()
        drawPageTop()
        // **The same rule the stock take follows.** A section that has to run
        // onto another page says whose it is at the top of it, because a page
        // of times with no name on it is a page nobody can file.
        if (onPage) drawPersonHead(`${onPage}, continued`)
    }

    // Roughly how tall a person's section will be, so one can be kept whole.
    function heightOf(person) {
        let need = 13
        for (const w of [0, 1]) {
            const mine = person.days.filter(day => day.week === w)
            need += 4 + 8.5
            need += mine.length
                ? mine.reduce((t, day) => t + 5.4 + day.notes.length * 3.6, 0)
                : 5.4
        }
        return need + 4
    }

    // One mark: a word in its own ink on its own pale ground.
    //
    // **It puts the pen back where it found it.** It used to leave the size at
    // 5.6 and the colour at its own ink, so the hours drawn after a trial mark
    // came out tiny and pink. It showed up on the first real fortnight and
    // nowhere else, because only a trial or a training day draws one mid row.
    function drawMark(look, words, x, top) {
        const text = String(words || look.label).toUpperCase()
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(5.6)
        const width = pdf.getTextWidth(text) + 3
        pdf.setFillColor(...rgb(look.wash))
        pdf.roundedRect(x, top - 2.6, width, 3.6, 0.6, 0.6, 'F')
        pdf.setTextColor(...rgb(look.ink))
        pdf.text(text, x + 1.5, top)

        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(8)
        pdf.setTextColor(...INK)
        return width + 1.5
    }

    // ---- the summary ------------------------------------------------------
    //
    // **The payroll can be done from this alone.** Everything after it is for
    // the question that comes back, not for the run itself.
    const cols = [right - 116, right - 92, right - 68, right - 40, right - 18, right]

    function drawSummaryHead() {
        pdf.setFillColor(...DARK)
        pdf.rect(marginX, y - 4.4, right - marginX, 6, 'F')
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(6)
        pdf.setTextColor(255)
        pdf.text('WHO', marginX + 2, y, { charSpace: 0.4 })
        const heads = ['WEEK 1', 'WEEK 2', 'HOURS WORKED', 'BANK HOLIDAY', 'HOLIDAY']
        heads.forEach((label, i) => {
            pdf.text(label, cols[i + 1] - 2, y, { align: 'right', charSpace: 0.4 })
        })
        y += 6
    }

    drawPageTop()
    drawSummaryHead()

    pdf.setFont('helvetica', 'normal')
    for (const person of people) {
        const marks = []
        if (person.trial > 0) marks.push([KIND_LOOK.trial, `Trial ${h(person.trial)} h`])
        if (person.training > 0) marks.push([KIND_LOOK.training, `Training ${h(person.training)} h`])
        if (person.sickDays > 0) marks.push([AWAY_LOOK.sick, `${plural(person.sickDays, 'day')} sick`])
        if (person.unpaidDays > 0) marks.push([AWAY_LOOK.unpaid, `${plural(person.unpaidDays, 'day')} unpaid`])

        room(marks.length ? 11 : 7)

        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(8.5)
        pdf.setTextColor(...INK)
        pdf.text(person.name, marginX + 2, y)

        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(8.5)
        const figures = [
            h(person.week[0]), h(person.week[1]), null,
            person.bankHoliday > 0 ? h(person.bankHoliday) : '-',
            person.holiday > 0 ? h(person.holiday) : '-',
        ]
        figures.forEach((value, i) => {
            if (value === null) return
            pdf.text(value, cols[i + 1] - 2, y, { align: 'right' })
        })
        pdf.setFont('helvetica', 'bold')
        pdf.text(h(person.worked), cols[3] - 2, y, { align: 'right' })

        if (marks.length) {
            let x = marginX + 2
            marks.forEach(([look, words]) => { x += drawMark(look, words, x, y + 4) })
            y += 4
        }

        y += 2.6
        pdf.setDrawColor(...LINE)
        pdf.setLineWidth(0.2)
        pdf.line(marginX, y, right, y)
        y += 4.4
    }

    // Everybody.
    room(10)
    pdf.setDrawColor(...DARK)
    pdf.setLineWidth(0.6)
    pdf.line(marginX, y - 4.6, right, y - 4.6)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8.5)
    pdf.setTextColor(...INK)
    pdf.text('Everybody', marginX + 2, y)
    ;[h(T.week[0]), h(T.week[1]), h(T.worked), h(T.bankHoliday), h(T.holiday)]
        .forEach((value, i) => pdf.text(value, cols[i + 1] - 2, y, { align: 'right' }))
    y += 8

    // ---- what is inside what ----------------------------------------------
    room(22)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    pdf.setTextColor(...MUTED)
    const note = `Week 1 is ${weekRange(weeks[0])}, week 2 is ${weekRange(weeks[1])}. `
        + 'Hours worked is the two weeks added together. Bank holiday hours are inside it and '
        + 'listed again on their own. Holiday is apart and is not inside anything. Days off sick '
        + 'and on unpaid leave are counted in days, because no hours are recorded against them. '
        + 'The extra entitlement for a public holiday is not worked out here. '
        + 'Every time below is what the clock recorded, to the second.'
    for (const line of pdf.splitTextToSize(note, right - marginX)) {
        pdf.text(line, marginX, y)
        y += 3.4
    }
    y += 2.5

    // The key, so a colour means something.
    let keyX = marginX
    for (const look of [BANK_LOOK, AWAY_LOOK.holiday, AWAY_LOOK.sick, AWAY_LOOK.unpaid,
        KIND_LOOK.trial, KIND_LOOK.training]) {
        keyX += drawMark(look, null, keyX, y) + 1.5
    }
    y += 9

    // ---- everybody, day by day --------------------------------------------
    for (const person of people) {
        // **One person, one piece, wherever they fit.** The same thing the
        // stock take does with a section: if what is left on the page cannot
        // hold them, start them on a fresh one rather than leaving two days
        // stranded at the foot. Somebody with a full fortnight can be taller
        // than a whole page, and then they run on and say "continued".
        onPage = null
        const need = heightOf(person)
        if (need > pageHeight - 16 - y && y > 50) {
            pdf.addPage()
            drawPageTop()
        }
        onPage = person.name

        drawPersonHead(person.name)

        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(7)
        pdf.setTextColor(...MUTED)
        pdf.text(
            `Week 1 ${h(person.week[0])}    Week 2 ${h(person.week[1])}    `
            + `Hours worked ${h(person.worked)}    Bank holiday ${h(person.bankHoliday)}    `
            + `Holiday ${h(person.holiday)}`,
            marginX, y,
        )
        y += 6

        for (const w of [0, 1]) {
            const mine = person.days.filter(day => day.week === w)
            room(12)

            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(6)
            pdf.setTextColor(...MUTED)
            pdf.text(`WEEK ${w + 1}, ${weekRange(weeks[w]).toUpperCase()}`, marginX, y, { charSpace: 0.4 })
            y += 4

            if (!mine.length) {
                pdf.setFont('helvetica', 'italic')
                pdf.setFontSize(8)
                pdf.text('Nothing worked this week', marginX + 2, y)
                y += 5.4
            }

            for (const day of mine) {
                room(9)
                pdf.setFont('helvetica', 'normal')
                pdf.setFontSize(8)
                pdf.setTextColor(...INK)
                pdf.text(dayWords(day.date), marginX + 2, y)

                let x = marginX + 48
                if (day.bankHoliday) x += drawMark(BANK_LOOK, null, x, y)

                if (day.spans.length) {
                    const times = day.spans
                        .map(s => `${clock(s.starts_at)} to ${clock(s.ends_at)}`).join(',  ')
                    pdf.setTextColor(...INK)
                    pdf.setFont('helvetica', 'normal')
                    pdf.setFontSize(8)
                    pdf.text(times, x, y)
                    const kinds = day.spans.map(s => s.kind).filter(k => k && KIND_LOOK[k])
                    if (kinds.length) {
                        drawMark(KIND_LOOK[kinds[0]], null, x + pdf.getTextWidth(times) + 3, y)
                    }
                    pdf.setFont('helvetica', 'bold')
                    pdf.text(`${h(day.hours)} h`, right, y, { align: 'right' })
                } else if (day.away && AWAY_LOOK[day.away]) {
                    drawMark(AWAY_LOOK[day.away], null, x, y)
                } else {
                    pdf.setFont('helvetica', 'italic')
                    pdf.setTextColor(...MUTED)
                    pdf.setFontSize(8)
                    pdf.text('Nothing worked', x, y)
                }

                y += 5.4

                // His own words, under the day they belong to.
                for (const words of day.notes) {
                    pdf.setFont('helvetica', 'italic')
                    pdf.setFontSize(7)
                    pdf.setTextColor(...MUTED)
                    for (const line of pdf.splitTextToSize(words, right - marginX - 54)) {
                        room(5)
                        pdf.text(line, marginX + 52, y)
                        y += 3.2
                    }
                    y += 0.6
                }

                pdf.setDrawColor(...LINE)
                pdf.setLineWidth(0.15)
                pdf.line(marginX + 2, y - 3.4, right, y - 3.4)
            }

            room(9)
            pdf.setDrawColor(...DARK)
            pdf.setLineWidth(0.3)
            pdf.line(marginX + 2, y - 3, right, y - 3)
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(8)
            pdf.setTextColor(...INK)
            pdf.text(`Week ${w + 1}`, marginX + 2, y + 1.4)
            pdf.text(`${h(person.week[w])} h`, right, y + 1.4, { align: 'right' })
            y += 8.5
        }

        onPage = null
        y += 5
    }

    // Every page says what it is and where it sits, because one of them will be
    // printed on its own and queried three months later.
    const pages = pdf.getNumberOfPages()
    for (let page = 1; page <= pages; page++) {
        pdf.setPage(page)
        pdf.setFont('helvetica', 'italic')
        pdf.setFontSize(7)
        pdf.setTextColor(140)
        pdf.text(
            `${restaurant?.name || 'Papi Chulo'}, hours, ${period}. Nothing on this page is money.`,
            marginX, pageHeight - 8,
        )
        pdf.text(`Page ${page} of ${pages}`, right, pageHeight - 8, { align: 'right' })
    }

    // Saving is the only part a test skips, since a test has no business
    // putting a file anywhere.
    if (save) {
        const safeName = (restaurant?.name || 'hours').toLowerCase().replace(/[^a-z0-9]+/g, '-')
        pdf.save(`hours-${safeName}-${periodStart}.pdf`)
    }
    return pdf
}
