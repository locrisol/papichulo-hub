import logo from '@/assets/PapiChuloLogoPrint.png?inline'
import { doneDayLong, repeatWords, tickable } from '@/lib/checklists'
import { stampDate, stampDateTime } from '@/lib/dates'

// Checklists on paper: a blank list to print and pin up, and the record of a
// round that has been done.
//
// The blank one was asked for on 27 September: "a printable version in case we
// want to create a list to print and allow employees that complete each tasks
// to put their name and date after completion. Kind of same rules as when
// printing other things like the Allergens report, not elements being cut
// between pages." And then: "Sub-elements might have to jump to other pages if
// we have pictures in the printed version, that's fine as long as one element
// doesn't get cut into two pieces."
//
// So every row, an element or a sub element with its words and its picture, is
// measured before it is drawn, and a row that does not fit what is left of the
// page starts the next one. A category heading never sits alone at the bottom
// of a page either: it goes over with the first row under it.
//
// The header is the stock take's, same logo, same size and place, so the
// papers the Hub prints look like one family.

let jsPdfModule = null
async function loadJsPdf() {
    if (!jsPdfModule) jsPdfModule = (await import('jspdf')).default
    return jsPdfModule
}

const LOGO_WIDTH = 26
const LOGO_HEIGHT = (LOGO_WIDTH * 249) / 400
const GREEN = [24, 47, 36]
const INK = 40
const MARGIN = 15
const BOTTOM = 16
const PICTURE_HEIGHT = 38
const PHOTO_HEIGHT = 30

// The guide pictures and photos, fetched and read before any drawing starts,
// because jsPDF wants the bytes and their size and drawing cannot wait on a
// network. sign turns paths into addresses; it is the bucket's signed urls in
// the app and a stand in under test. A picture that will not load is left off
// rather than stopping the paper.
export async function loadPictures(paths, sign) {
    const wanted = [...new Set(paths.filter(Boolean))]
    const out = new Map()
    if (!wanted.length) return out
    const urls = await sign(wanted)
    await Promise.all(wanted.map(async path => {
        try {
            const blob = await (await fetch(urls[path])).blob()
            const size = await sizeOf(blob)
            const data = await new Promise((resolve, reject) => {
                const reader = new FileReader()
                reader.onload = () => resolve(reader.result)
                reader.onerror = reject
                reader.readAsDataURL(blob)
            })
            out.set(path, { data, ...size })
        } catch {
            // Left off the paper, said nowhere: the list is still the list.
        }
    }))
    return out
}

async function sizeOf(blob) {
    const bitmap = await createImageBitmap(blob)
    const size = { width: bitmap.width, height: bitmap.height }
    bitmap.close?.()
    return size
}

// A picture fitted into a box, keeping its shape.
export function fitPicture(picture, maxWidth, maxHeight) {
    const scale = Math.min(maxWidth / picture.width, maxHeight / picture.height)
    return { w: picture.width * scale, h: picture.height * scale }
}

// The paper itself. Both kinds share it, and differ only in what goes on the
// right of each row and whether the box is ticked.
async function paper({ label, restaurant, title, lines, fileName }) {
    const JsPdf = await loadJsPdf()
    const pdf = new JsPdf({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    const width = pdf.internal.pageSize.getWidth()
    const height = pdf.internal.pageSize.getHeight()
    let y = 0

    function top() {
        pdf.addImage(logo, 'PNG', MARGIN, 9, LOGO_WIDTH, LOGO_HEIGHT)
        const textX = MARGIN + LOGO_WIDTH + 6
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(7)
        pdf.setTextColor(150)
        pdf.text(label, textX, 13, { charSpace: 0.7 })
        pdf.setFontSize(15)
        pdf.setTextColor(INK)
        pdf.text(restaurant.name, textX, 20.5)
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(10)
        pdf.setTextColor(90)
        pdf.text(pdf.splitTextToSize(title, width - textX - 60)[0], textX, 26)
        pdf.setFontSize(8)
        pdf.setTextColor(130)
        lines.forEach((line, i) => pdf.text(line, width - MARGIN, 13 + i * 4, { align: 'right' }))
        pdf.setDrawColor(200)
        pdf.setLineWidth(0.2)
        pdf.line(MARGIN, 31, width - MARGIN, 31)
        y = 37
    }

    function footers(words) {
        const pages = pdf.getNumberOfPages()
        for (let page = 1; page <= pages; page++) {
            pdf.setPage(page)
            pdf.setFont('helvetica', 'italic')
            pdf.setFontSize(7)
            pdf.setTextColor(140)
            pdf.text(words, MARGIN, height - 8)
            pdf.text(`Page ${page} of ${pages}`, width - MARGIN, height - 8, { align: 'right' })
        }
    }

    top()
    return {
        pdf, width, height,
        get y() { return y },
        set y(v) { y = v },
        room: () => height - BOTTOM - y,
        newPage() { pdf.addPage(); top() },
        // The tests ask for the document back rather than a download.
        finish(words, save) {
            footers(words)
            if (save) pdf.save(fileName)
            return pdf
        },
    }
}

// One row: the box, the name, the how to, the picture, and whatever the
// right hand column says. Measured and drawn by the same code, so the height a
// row was given is the height it takes.
function row(sheet, { indent, name, bold, howTo, pictures = [], box, ticked, right, photos, photosNote }) {
    const { pdf, width } = sheet
    const rightWidth = 58
    const x = MARGIN + indent + (box ? 7 : 0)
    const textWidth = width - MARGIN - rightWidth - x - 4

    pdf.setFont('helvetica', bold ? 'bold' : 'normal')
    pdf.setFontSize(10)
    const nameLines = pdf.splitTextToSize(name, textWidth)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    const howLines = howTo ? pdf.splitTextToSize(howTo, textWidth) : []
    // A task's guide pictures side by side on one line, each fitted into an
    // equal share of the width, so four are smaller than one but the row is
    // no taller.
    const share = pictures.length ? Math.min(70, (textWidth - 2 * (pictures.length - 1)) / pictures.length) : 0
    const shapes = pictures.map(p => fitPicture(p, share, PICTURE_HEIGHT))
    const pictureHeight = shapes.reduce((most, s) => Math.max(most, s.h), 0)
    const shots = (photos || []).map(p => fitPicture(p, 40, PHOTO_HEIGHT))

    const measure = () => {
        let h = 2 + nameLines.length * 4.6 + howLines.length * 3.6
        if (shapes.length) h += pictureHeight + 2
        if (shots.length) h += PHOTO_HEIGHT + 2
        if (photosNote) h += 3.8
        return Math.max(h + 2, right ? 11 : 8)
    }
    const h = measure()

    return {
        height: h,
        draw() {
            let yy = sheet.y + 5
            if (box) {
                pdf.setDrawColor(90)
                pdf.setLineWidth(0.35)
                pdf.rect(MARGIN + indent, sheet.y + 1.8, 4.2, 4.2)
                if (ticked) {
                    pdf.setDrawColor(24, 110, 60)
                    pdf.setLineWidth(0.6)
                    pdf.line(MARGIN + indent + 0.8, sheet.y + 4, MARGIN + indent + 1.9, sheet.y + 5.3)
                    pdf.line(MARGIN + indent + 1.9, sheet.y + 5.3, MARGIN + indent + 3.6, sheet.y + 2.5)
                }
            }
            pdf.setFont('helvetica', bold ? 'bold' : 'normal')
            pdf.setFontSize(10)
            pdf.setTextColor(INK)
            pdf.text(nameLines, x, yy)
            yy += nameLines.length * 4.6 - 1
            if (howLines.length) {
                pdf.setFont('helvetica', 'normal')
                pdf.setFontSize(8)
                pdf.setTextColor(110)
                pdf.text(howLines, x, yy + 0.6)
                yy += howLines.length * 3.6
            }
            if (shapes.length) {
                let px = x
                shapes.forEach((s, i) => {
                    pdf.addImage(pictures[i].data, 'JPEG', px, yy, s.w, s.h)
                    px += s.w + 2
                })
                yy += pictureHeight + 2
            }
            if (shots.length) {
                let px = x
                shots.forEach((s, i) => {
                    if (px + s.w > width - MARGIN - rightWidth) return
                    pdf.addImage(photos[i].data, 'JPEG', px, yy, s.w, s.h)
                    px += s.w + 2
                })
                yy += PHOTO_HEIGHT + 2
            }
            if (photosNote) {
                pdf.setFont('helvetica', 'italic')
                pdf.setFontSize(7.5)
                pdf.setTextColor(130)
                pdf.text(photosNote, x, yy + 2.5)
            }
            if (right) right(width - MARGIN - rightWidth, sheet.y)
            pdf.setDrawColor(225)
            pdf.setLineWidth(0.15)
            pdf.line(MARGIN + indent, sheet.y + h, width - MARGIN, sheet.y + h)
            sheet.y += h
        },
    }
}

function categoryBar(sheet, name) {
    const { pdf, width } = sheet
    pdf.setFillColor(...GREEN)
    pdf.roundedRect(MARGIN, sheet.y, width - 2 * MARGIN, 7, 1.2, 1.2, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9)
    pdf.setTextColor(255)
    pdf.text(name.toUpperCase(), MARGIN + 3, sheet.y + 4.8, { charSpace: 0.4 })
    sheet.y += 9
}

// Puts a run of rows down, a heading first. A row that does not fit starts a
// new page, and the heading goes with the first row under it rather than being
// left at the foot of the page on its own. Nothing is ever split.
function place(sheet, heading, rows, columns) {
    const first = rows[0]
    if (sheet.room() < 9 + (first ? first.height : 0)) {
        sheet.newPage()
        columns?.()
    }
    categoryBar(sheet, heading)
    for (const r of rows) {
        if (sheet.room() < r.height) {
            sheet.newPage()
            columns?.()
            categoryBar(sheet, `${heading} (continued)`)
        }
        r.draw()
    }
}

// The rows for one category: each element, and under it its sub elements
// indented, every one its own row.
function rowsFor(sheet, elements, cells, pictures, extra = () => ({})) {
    const rows = []
    for (const { task, subs } of elements) {
        const own = {
            indent: 0, name: task.name, bold: true, howTo: task.how_to,
            pictures: (task.guide_photos || []).map(p => pictures.get(p)).filter(Boolean),
        }
        if (subs.length) {
            rows.push(row(sheet, own))
            for (const s of subs) {
                rows.push(row(sheet, {
                    indent: 7, name: s.name, howTo: s.how_to, box: true,
                    pictures: (s.guide_photos || []).map(p => pictures.get(p)).filter(Boolean),
                    right: cells(s), ...extra(s),
                }))
            }
        } else {
            rows.push(row(sheet, { ...own, box: true, right: cells(task), ...extra(task) }))
        }
    }
    return rows
}

// A blank list to print. Each thing gets a box to tick and a space for the
// name and the date of whoever did it.
export async function blankListPdf({ restaurant, list, tree, pictures = new Map(), save = true }) {
    const sheet = await paper({
        label: 'CHECKLIST',
        restaurant,
        title: list.name,
        lines: [repeatWords(list), `Printed ${stampDate(new Date().toISOString())}`],
        fileName: `${list.name}.pdf`,
    })
    const { pdf, width } = sheet

    const columns = () => {
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(7.5)
        pdf.setTextColor(110)
        pdf.text('TICK WHEN DONE', MARGIN, sheet.y)
        pdf.text('DONE BY', width - MARGIN - 58, sheet.y)
        pdf.text('DATE', width - MARGIN - 20, sheet.y)
        sheet.y += 4
    }

    // Where the round began, for whoever pins it up.
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.setTextColor(80)
    pdf.text('Started on', MARGIN, sheet.y + 2)
    pdf.setDrawColor(150)
    pdf.setLineWidth(0.2)
    pdf.line(MARGIN + 18, sheet.y + 2.6, MARGIN + 70, sheet.y + 2.6)
    pdf.text('by', MARGIN + 74, sheet.y + 2)
    pdf.line(MARGIN + 79, sheet.y + 2.6, MARGIN + 140, sheet.y + 2.6)
    sheet.y += 9
    columns()

    const writeLines = () => (x, top) => {
        pdf.setDrawColor(150)
        pdf.setLineWidth(0.2)
        pdf.line(x, top + 6.5, x + 34, top + 6.5)
        pdf.line(x + 38, top + 6.5, x + 58, top + 6.5)
    }

    // Each category after the first starts on a page of its own, his call, 27
    // September, so a list can be split up and handed out an area at a time.
    // A category longer than a page still runs on over as many as it needs.
    let first = true
    for (const { category, elements } of tree) {
        if (!elements.length) continue
        if (!first) {
            sheet.newPage()
            columns()
        }
        first = false
        place(sheet, category.name, rowsFor(sheet, elements, writeLines, pictures), columns)
    }
    return sheet.finish(`${list.name}, printed from the Papi Chulo Hub`, save)
}

// The record of one round: what was done, by whom and when, with the photos
// that are still kept. Nothing here can be changed, which is the point of it.
export async function roundPdf({ restaurant, list, tree, round, ticks, pictures = new Map(), generatedBy, save = true }) {
    const byTask = new Map(ticks.map(t => [t.task_id, t]))
    const all = tickable(tree)
    const done = all.filter(t => byTask.has(t.id)).length
    const ended = round.ended_at
        ? round.ended_by
            ? `Ended ${stampDateTime(round.ended_at)} by ${round.ended_by_name || 'a manager'}`
            : `Finished ${stampDateTime(round.ended_at)}`
        : 'Still in progress'

    const sheet = await paper({
        label: 'CHECKLIST RECORD',
        restaurant,
        title: list.name,
        lines: [
            `Started ${stampDateTime(round.started_at)}${round.started_by_name ? ` by ${round.started_by_name}` : ''}`,
            ended,
            `Printed ${stampDate(new Date().toISOString())}${generatedBy ? ` by ${generatedBy}` : ''}`,
        ],
        fileName: `${list.name} ${stampDate(round.started_at).replaceAll('/', '-')}.pdf`,
    })
    const { pdf } = sheet

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.setTextColor(INK)
    pdf.text(`${done} of ${all.length} done`, MARGIN, sheet.y + 2)
    sheet.y += 8

    const who = task => (x, top) => {
        const tick = byTask.get(task.id)
        pdf.setFontSize(8.5)
        if (!tick) {
            pdf.setFont('helvetica', 'italic')
            pdf.setTextColor(170, 60, 40)
            pdf.text('Not done', x, top + 5)
            return
        }
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(INK)
        pdf.text(pdf.splitTextToSize(tick.done_by_name, 56)[0], x, top + 5)
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(110)
        pdf.text(stampDateTime(tick.done_at), x, top + 9)
    }
    const extra = task => {
        const tick = byTask.get(task.id)
        if (!tick) return { ticked: false }
        const kept = tick.photos_gone_at ? [] : (tick.photos || []).map(p => pictures.get(p)).filter(Boolean)
        const note = tick.photos?.length && !kept.length
            ? (tick.photos_gone_at ? `${tick.photos.length === 1 ? 'A photo was' : `${tick.photos.length} photos were`} taken. Only the last two rounds keep their photos.` : null)
            : null
        return { ticked: true, photos: kept, photosNote: note }
    }

    // Each category after the first on a page of its own, the same as the list
    // printed to be ticked by hand. His call, 27 September.
    let first = true
    for (const { category, elements } of tree) {
        if (!elements.length) continue
        if (!first) sheet.newPage()
        first = false
        // No guide pictures on the record: it is about what was done, and the
        // photos of it are the pictures that matter here.
        place(sheet, category.name, rowsFor(sheet, elements.map(e => ({
            task: { ...e.task, guide_photos: [] },
            subs: e.subs.map(s => ({ ...s, guide_photos: [] })),
        })), who, pictures, extra))
    }
    return sheet.finish(`${list.name}, ${doneDayLong(round.started_at)}. The Papi Chulo Hub checklist record`, save)
}

// The report on how the cleaning is going over a stretch of weeks: which days
// and times it gets done, each list's record, and the day each thing on a list
// was last done, the longest ago first. The screen's report on paper.
export async function reportPdf({ restaurant, fromLabel, toLabel, byDay, byTime, lists, generatedBy, save = true }) {
    const sheet = await paper({
        label: 'CLEANING REPORT',
        restaurant,
        title: `${fromLabel} to ${toLabel}`,
        lines: [`Printed ${stampDate(new Date().toISOString())}${generatedBy ? ` by ${generatedBy}` : ''}`],
        fileName: `Cleaning report ${fromLabel} to ${toLabel}.pdf`,
    })
    const { pdf, width } = sheet
    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

    // Bars for a count per label, drawn in one block that never splits.
    function bars(title, rows) {
        const height = 8 + rows.length * 6 + 3
        if (sheet.room() < height) sheet.newPage()
        categoryBar(sheet, title)
        const biggest = Math.max(1, ...rows.map(r => r.count))
        const total = rows.reduce((sum, r) => sum + r.count, 0)
        const barX = MARGIN + 34
        const barWidth = width - MARGIN - barX - 26
        for (const r of rows) {
            pdf.setFont('helvetica', 'normal')
            pdf.setFontSize(8.5)
            pdf.setTextColor(INK)
            pdf.text(r.label, MARGIN, sheet.y + 3.6)
            pdf.setFillColor(236, 236, 232)
            pdf.rect(barX, sheet.y + 0.8, barWidth, 3.8, 'F')
            if (r.count) {
                pdf.setFillColor(46, 125, 82)
                pdf.rect(barX, sheet.y + 0.8, Math.max(0.6, (r.count / biggest) * barWidth), 3.8, 'F')
            }
            pdf.setTextColor(90)
            const share = total ? ` (${Math.round((r.count / total) * 100)}%)` : ''
            pdf.text(`${r.count}${share}`, width - MARGIN, sheet.y + 3.6, { align: 'right' })
            sheet.y += 6
        }
        sheet.y += 3
    }

    bars('Ticks by day of the week', byDay.map((count, i) => ({ label: DAYS[i], count })))
    bars('Ticks by time of day', byTime)

    const OUTCOME = { done: 'Done', missed: 'Not done', ended: 'Ended early', current: 'Still going' }
    for (const l of lists) {
        const rows = []
        if (l.record.length) {
            rows.push(row(sheet, {
                indent: 0, bold: true, name: `${l.repeats}. ${l.summary}`,
                howTo: l.record.map(r => `${r.label}: ${OUTCOME[r.outcome]}${r.finishedOn ? ` ${r.finishedOn}` : ''}`).join(' · '),
            }))
        } else {
            rows.push(row(sheet, { indent: 0, bold: true, name: `${l.repeats}. ${l.summary}` }))
        }
        for (const t of l.rows) {
            rows.push(row(sheet, {
                indent: 4, name: t.label, howTo: t.category,
                right: (x, top) => {
                    pdf.setFont('helvetica', t.doneAt ? 'normal' : 'italic')
                    pdf.setFontSize(8.5)
                    if (t.doneAt) pdf.setTextColor(INK)
                    else pdf.setTextColor(170, 60, 40)
                    pdf.text(t.doneAt ? `Last done ${doneDayLong(t.doneAt)}` : 'Never done', x, top + 5)
                },
            }))
        }
        place(sheet, l.name, rows)
    }
    return sheet.finish(`Cleaning report, ${fromLabel} to ${toLabel}. The Papi Chulo Hub`, save)
}
