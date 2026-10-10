// The parts every printed page from the Hub shares: jsPDF itself, the logo's
// size, the top of the page and the line along the bottom.
//
// Each PDF had its own copy of these, and the copies had started to drift: the
// logo sat at three different heights on four papers whose comments all said
// it was in the same place. Here once, so the papers stay one family.

// jsPDF is fetched when somebody asks for a PDF, not when the screen opens.
//
// It is 400KB with its own optional dependencies behind it, and a plain import
// at the top of a file means every visit to a screen that can make one pays for
// it whether or not anybody presses the button. Most never do.
//
// The promise is kept rather than the module, so two papers asked for at once
// share one fetch instead of starting two. A fetch that fails is forgotten, so
// pressing the button again tries again, after a phone loses signal or a deploy
// has moved the file, rather than every PDF failing until the page is reloaded.
let jsPdfModule = null

export function loadJsPdf() {
    if (!jsPdfModule) {
        jsPdfModule = import('jspdf')
            .then(m => m.default)
            .catch(err => {
                jsPdfModule = null
                throw err
            })
    }
    return jsPdfModule
}

// The Hub's own font, DM Sans, carried inside a PDF so it looks like the screen
// and the picture of the roster rather than like Helvetica (his, 10 October).
//
// A PDF can only use a handful of fonts without carrying them, and DM Sans is
// not one, so the two files ride along: about 150KB more on a PDF that uses
// them. Fetched from /fonts the first time somebody asks for such a PDF, and
// kept, the same as jsPDF above. Static files rather than the variable font
// the screen loads, because jsPDF draws a variable one at its default weight.
// SIL Open Font License, which is beside them in public/fonts.
//
// If they cannot be had the PDF is still made, in Helvetica: a sheet in the
// wrong font is better than no sheet on a phone that lost its signal.
export const HUB_FONT = 'DMSans'
const HUB_FONT_FILES = { normal: 'DMSans-Regular.ttf', bold: 'DMSans-Bold.ttf' }
let hubFontFiles = null

function base64Of(buffer) {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
    return btoa(binary)
}

function loadHubFontFiles(fetchFile) {
    if (!hubFontFiles) {
        const base = import.meta.env?.BASE_URL || '/'
        hubFontFiles = Promise.all(Object.entries(HUB_FONT_FILES).map(async ([style, file]) => {
            const res = await fetchFile(`${base}fonts/${file}`)
            if (!res.ok) throw new Error(`${file}: ${res.status}`)
            return [style, base64Of(await res.arrayBuffer())]
        }))
            .then(Object.fromEntries)
            .catch(err => {
                hubFontFiles = null
                throw err
            })
    }
    return hubFontFiles
}

// Puts DM Sans in this PDF and says which family to draw with: DM Sans, or
// Helvetica when the files could not be fetched.
export async function useHubFont(pdf, fetchFile = (...args) => fetch(...args)) {
    try {
        const files = await loadHubFontFiles(fetchFile)
        for (const [style, file] of Object.entries(HUB_FONT_FILES)) {
            pdf.addFileToVFS(file, files[style])
            pdf.addFont(file, HUB_FONT, style)
        }
        return HUB_FONT
    } catch {
        return 'helvetica'
    }
}

// The logo, in millimetres. The file is 400 by 249.
export const LOGO_WIDTH = 26
export const LOGO_HEIGHT = (LOGO_WIDTH * 249) / 400

// A colour written as #RRGGBB, as the three numbers jsPDF wants.
export function rgb(hex) {
    const n = parseInt(String(hex).slice(1), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// The top of a page: the logo, what the paper is in small capitals, whose it
// is, a line saying which one, and up to a few short lines on the right saying
// when. A rule underneath, and the y where the page's own content starts.
//
// The logo is handed in rather than imported here, because the roster sheet
// uses this file too and has no logo to carry.
//
// The timesheet does not use this. Its top was reworked with him on 23
// September, with the pay period on the right, and is kept as it is.
export function letterhead(pdf, { logo, label, name, title, lines = [], margin = 15 }) {
    const width = pdf.internal.pageSize.getWidth()
    pdf.addImage(logo, 'PNG', margin, 9, LOGO_WIDTH, LOGO_HEIGHT)
    const textX = margin + LOGO_WIDTH + 6

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7)
    pdf.setTextColor(150)
    pdf.text(label, textX, 13, { charSpace: 0.7 })

    pdf.setFontSize(15)
    pdf.setTextColor(40)
    pdf.text(name || '', textX, 20.5)

    pdf.setFont('helvetica', 'normal')
    if (title) {
        // One line only. Three lines on the right end above it, so it can run
        // to the margin; a fourth would come down beside it, so then it stops
        // short of them. Cut short, it says so with an ellipsis rather than
        // losing its last words without a sign.
        pdf.setFontSize(10)
        pdf.setTextColor(90)
        const room = width - textX - (lines.length > 3 ? 60 : margin)
        const [first, ...rest] = pdf.splitTextToSize(title, room)
        const shown = rest.length
            ? `${pdf.splitTextToSize(title, room - pdf.getTextWidth('...'))[0].replace(/[\s,.;:]+$/, '')}...`
            : first
        pdf.text(shown, textX, 26)
    }

    pdf.setFontSize(8)
    pdf.setTextColor(130)
    lines.forEach((line, i) => pdf.text(line, width - margin, 13 + i * 4, { align: 'right' }))

    pdf.setDrawColor(200)
    pdf.setLineWidth(0.2)
    pdf.line(margin, 31, width - margin, 31)

    return 37
}

// The line along the bottom of every page, written once the paper is finished
// so there is a page count to say out of. A page on its own saying 4 tells you
// nothing about whether you are holding all of it.
//
// left says what the paper is, so a page that comes loose still does. right is
// asked for each page, and is the page count unless the paper has something
// better to say there.
export function footers(pdf, { left = '', margin = 15, right = (page, pages) => `Page ${page} of ${pages}` } = {}) {
    const width = pdf.internal.pageSize.getWidth()
    const height = pdf.internal.pageSize.getHeight()
    const pages = pdf.getNumberOfPages()
    for (let page = 1; page <= pages; page++) {
        pdf.setPage(page)
        pdf.setFont('helvetica', 'italic')
        pdf.setFontSize(7)
        pdf.setTextColor(140)
        pdf.text(left, margin, height - 8)
        pdf.text(right(page, pages), width - margin, height - 8, { align: 'right' })
    }
}
