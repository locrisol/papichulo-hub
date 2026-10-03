import { absenceDays } from '@/lib/absences'
import { requestLabel, partWords } from '@/lib/timeOff'
import { stampDate, stampDateTime } from '@/lib/dates'
import { DAY_NAMES } from '@/lib/events'
import { loadJsPdf, letterhead, footers } from '@/lib/pdfPage'
import logo from '@/assets/PapiChuloLogoPrint.png?inline'

// The answer to a time off request, as a piece of paper.
//
// Somebody asks for a week in October, a manager says yes, and three months
// later nobody can remember who agreed it or when. This is the thing that
// remembers. It goes out attached to the email that tells them the answer, and
// it is one page on purpose: a record is only useful if it can be kept, sent on
// and read without scrolling.
//
// Part of a day never gets one. Leaving at three on a Tuesday is a note between
// two people, not something anybody needs filed.
//
// The top and the foot are the stock take report's, because both are the same
// kind of thing: a page this app produced that somebody outside the app will
// read.

const GREEN = [46, 125, 82]
const RED = [185, 28, 28]
const INK = [40, 40, 40]

// A day off with its weekday in front, for example Mon 05/10/2026. The weekday
// stays because somebody reading the record asks which days they were.
function fmtDate(iso) {
    if (!iso) return '—'
    const d = iso.length === 10 ? new Date(iso + 'T00:00:00') : new Date(iso)
    if (isNaN(d)) return '—'
    return `${DAY_NAMES[d.getDay()]} ${stampDate(d)}`
}

function fmtStamp(iso) {
    if (!iso) return '—'
    const d = new Date(iso)
    if (isNaN(d)) return '—'
    return stampDateTime(d)
}

// What to call the file. The person's name and the dates, so a folder of these
// sorts into something readable and two do not collide.
export function recordName(absence, employeeName) {
    const who = String(employeeName || 'employee').replace(/[^a-z0-9]+/gi, '-')
    return `${who}-${absence.starts_on}-time-off`.toLowerCase().replace(/^-+|-+$/g, '')
}

// The record itself, as a jsPDF document.
//
// Handed back rather than saved, because this one has two jobs: the manager may
// want it on screen, and the email needs the same bytes as an attachment.
export async function timeOffRecordPdf({ absence, employeeName, restaurant, answeredBy, cleared }) {
    const pdf = new (await loadJsPdf())({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const marginX = 18
    const rightEdge = pageWidth - marginX

    const approved = absence.status === 'approved'
    const accent = approved ? GREEN : RED
    const days = absenceDays(absence)
    const freed = cleared || absence.cleared_shifts || []

    // ---------- the top ----------
    letterhead(pdf, {
        logo,
        label: 'TIME OFF RECORD',
        name: restaurant?.name,
        lines: [`Produced ${fmtStamp(new Date())}`],
        margin: marginX,
    })

    // ---------- the answer ----------
    // The one thing anybody opens this to find out, so it is the biggest thing
    // on the page and it is a colour before it is a word.
    pdf.setFillColor(...accent)
    pdf.rect(marginX, 40, rightEdge - marginX, 16, 'F')

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(14)
    pdf.setTextColor(255)
    pdf.text(approved ? 'APPROVED' : 'NOT APPROVED', marginX + 6, 50.5, { charSpace: 0.6 })

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.text(fmtStamp(absence.decided_at), rightEdge - 6, 50.5, { align: 'right' })

    // ---------- what was asked for ----------
    let y = 70
    const labelX = marginX
    const valueX = marginX + 42

    function row(label, value, { bold = false, gap = 9 } = {}) {
        if (value == null || value === '') return
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(7.5)
        pdf.setTextColor(140)
        pdf.text(String(label).toUpperCase(), labelX, y, { charSpace: 0.4 })

        pdf.setFont('helvetica', bold ? 'bold' : 'normal')
        pdf.setFontSize(bold ? 12 : 10)
        pdf.setTextColor(...INK)
        const lines = pdf.splitTextToSize(String(value), rightEdge - valueX)
        pdf.text(lines, valueX, y)
        y += gap + (lines.length - 1) * 5
    }

    row('Who', employeeName, { bold: true })
    row('What', requestLabel(absence), { bold: true })

    const range = absence.ends_on && absence.ends_on !== absence.starts_on
        ? `${fmtDate(absence.starts_on)}\nto ${fmtDate(absence.ends_on)}`
        : fmtDate(absence.starts_on)
    row('When', range, { bold: true })
    row('How long', `${days} ${days === 1 ? 'day' : 'days'}`)

    const hours = partWords(absence)
    if (hours) row('Hours', hours.charAt(0).toUpperCase() + hours.slice(1))
    if (absence.note) row('Their note', `"${absence.note}"`)

    y += 3
    pdf.setDrawColor(225)
    pdf.line(marginX, y, rightEdge, y)
    y += 11

    // The answer's own date is up in the band already, so it is not repeated
    // here. These two are the rest of the trail: when it was asked, and who
    // it was that said yes.
    row('Asked on', fmtStamp(absence.created_at))
    row('Answered by', answeredBy || '—')

    // ---------- what it did to the roster ----------
    // Only worth saying when it took shifts off somebody. It is the part of an
    // approval that changed something other than a date on a list.
    if (approved && freed.length > 0) {
        y += 4
        pdf.setFillColor(247, 245, 240)
        const boxTop = y
        const boxHeight = 12 + freed.length * 5.5
        pdf.rect(marginX, boxTop, rightEdge - marginX, boxHeight, 'F')

        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(9)
        pdf.setTextColor(...INK)
        pdf.text(
            `${freed.length} ${freed.length === 1 ? 'shift was' : 'shifts were'} removed from the roster`,
            marginX + 5, boxTop + 7.5,
        )

        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(9)
        pdf.setTextColor(90)
        freed.forEach((s, i) => {
            pdf.text(
                `${fmtDate(s.date)}, ${String(s.starts_at).slice(0, 5)} to ${String(s.ends_at).slice(0, 5)}`,
                marginX + 5, boxTop + 13.5 + i * 5.5,
            )
        })
        y = boxTop + boxHeight
    }

    // ---------- the foot ----------
    // One page on purpose, so the right hand side says which request this
    // was rather than Page 1 of 1.
    footers(pdf, {
        left: 'Produced by Papi Chulo Hub when the request was answered. Keep it with your own records.',
        right: () => `Reference ${String(absence.id || '').slice(0, 8)}`,
        margin: marginX,
    })

    return pdf
}

// The same page as bytes, for hanging off an email.
export async function timeOffRecordBase64(args) {
    return (await timeOffRecordPdf(args)).output('datauristring').split(',')[1]
}
