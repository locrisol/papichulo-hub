import jsPDF from 'jspdf'
import { absenceDays } from './absences'
import { requestLabel, partWords } from './timeOff'
import logo from '../assets/PapiChuloLogoPrint.png?inline'

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
// The header is the stock take report's header, because both are the same kind
// of thing: a page this app produced that somebody outside the app will read.

const LOGO_WIDTH = 26
const LOGO_HEIGHT = (LOGO_WIDTH * 249) / 400

const GREEN = [46, 125, 82]
const RED = [185, 28, 28]
const INK = [40, 40, 40]

function fmtDate(iso) {
    if (!iso) return '—'
    const d = iso.length === 10 ? new Date(iso + 'T00:00:00') : new Date(iso)
    if (isNaN(d)) return '—'
    return d.toLocaleDateString('en-IE', {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    })
}

function fmtStamp(iso) {
    if (!iso) return '—'
    const d = new Date(iso)
    if (isNaN(d)) return '—'
    return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })
        + ', ' + d.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })
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
export function timeOffRecordPdf({ absence, employeeName, restaurant, answeredBy, cleared }) {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const marginX = 18
    const rightEdge = pageWidth - marginX

    const approved = absence.status === 'approved'
    const accent = approved ? GREEN : RED
    const days = absenceDays(absence)
    const freed = cleared || absence.cleared_shifts || []

    // ---------- the top ----------
    pdf.addImage(logo, 'PNG', marginX, 12, LOGO_WIDTH, LOGO_HEIGHT)
    const textX = marginX + LOGO_WIDTH + 6

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7)
    pdf.setTextColor(150)
    pdf.text('TIME OFF RECORD', textX, 16, { charSpace: 0.7 })

    pdf.setFontSize(15)
    pdf.setTextColor(...INK)
    pdf.text(restaurant?.name || '', textX, 23.5)

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(130)
    pdf.text(`Produced ${fmtStamp(new Date().toISOString())}`, rightEdge, 16, { align: 'right' })

    pdf.setDrawColor(200)
    pdf.setLineWidth(0.2)
    pdf.line(marginX, 32, rightEdge, 32)

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
            `${freed.length} ${freed.length === 1 ? 'shift was' : 'shifts were'} taken off the roster`,
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
    pdf.setDrawColor(220)
    pdf.line(marginX, pageHeight - 22, rightEdge, pageHeight - 22)

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7.5)
    pdf.setTextColor(150)
    pdf.text(
        'Produced by Papi Chulo Hub when the request was answered. Keep it with your own records.',
        marginX, pageHeight - 16,
    )
    pdf.text(`Reference ${String(absence.id || '').slice(0, 8)}`, rightEdge, pageHeight - 16, { align: 'right' })

    return pdf
}

// The same page as bytes, for hanging off an email.
export function timeOffRecordBase64(args) {
    return timeOffRecordPdf(args).output('datauristring').split(',')[1]
}
