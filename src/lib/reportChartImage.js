// The report's charts, drawn as pictures for the mail.
//
// A mail cannot draw. It has tables and inline styles and that is the end of
// it, so the five charts on the report page have to arrive as five pictures or
// not arrive at all.
//
// Drawn rather than screenshotted, the same call rosterImage.js made. There is
// no html2canvas here, and adding one to photograph an SVG we generated
// ourselves would be a large library doing a job we already have the numbers
// for.
//
// **The geometry comes out of reportChart.js, the same file WeekChart reads.**
// That is the whole point of it living there. The picture in the mail and the
// chart on the screen work out their scale, their gridlines and their gaps in
// one place, so a picture cannot quietly say something the report does not.
// What is different here is only what canvas needs and SVG does not: a fixed
// width, because a mail has no ResizeObserver and no idea how wide the window
// is, and the labels placed by measureText rather than by a text anchor.

import { shortDate } from './dates'
import {
    inRange, fromFirstFigure, scaleFor, ticks, segments, isMissing, labelIndices, DEFAULT_RANGE,
} from './reportChart'

// The width the mail's own tables are built to, so a chart is exactly as wide
// as the figures above it rather than being scaled down to fit and going soft.
//
// The same number lives in the mail as WIDTH. It is written twice rather than
// imported, because importing it would pull the whole mail template into the
// browser bundle to read one integer. A test holds the two together, which is
// what stops them drifting.
export const MAIL_WIDTH = 680
const HEIGHT = 260

// Two device pixels to the point. The picture is shown at the size it says it
// is, rather than resized by a chat app the way the roster is, so three would
// be weight for nothing.
const SCALE = 2

const PAD = { left: 64, right: 16, top: 14, bottom: 34 }

const MUTED = '#6B6459'
const RULE = '#E8E3DB'
const PAPER = '#FFFFFF'

const FONT = (size, weight = '400') =>
    `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`

const num = v => (v == null || isNaN(Number(v)) ? 0 : Number(v))

// Canvas has globalAlpha where SVG has fill-opacity. Same thing said
// differently, and the same value, so the bands match the screen.
const BAND_ALPHA = 0.3

// What the picture is made of, worked out before anything is drawn so the
// height is known and the caller can be told when there is nothing to draw.
export function chartPlan({ rows, series, range = DEFAULT_RANGE }) {
    const shown = inRange(fromFirstFigure(rows, series.map(s => s.key)), range)
    const anything = shown.some(row => series.some(s => !isMissing(row[s.key])))
    return { shown, anything: shown.length > 0 && anything }
}

// The key, wrapped onto as many rows as it needs.
//
// Worked out before the drawing starts because it decides how tall the picture
// is, and a canvas resized after something has been drawn on it is a canvas
// that has been wiped.
export function keyLines(series, width) {
    const rows = [[]]
    let used = 0
    for (const s of series) {
        // Close enough without a canvas to measure against: the swatch, the
        // gap, and about six points a character.
        const w = 26 + s.label.length * 6 + 14
        if (used + w > width && rows[rows.length - 1].length > 0) {
            rows.push([])
            used = 0
        }
        rows[rows.length - 1].push(s)
        used += w
    }
    return rows
}

function drawKey(c, rows, top) {
    c.textAlign = 'left'
    c.font = FONT(11)
    rows.forEach((row, n) => {
        let at = 0
        const y = top + 12 + n * 18
        for (const s of row) {
            const h = s.heavy ? 3.5 : 2
            const bar = s.heavy ? 20 : 16
            c.fillStyle = s.colour
            c.fillRect(at, y - h / 2 - 1, bar, h)

            c.fillStyle = MUTED
            c.fillText(s.label, at + bar + 6, y + 3)
            at += bar + 6 + c.measureText(s.label).width + 16
        }
    })
    return rows.length * 18 + 6
}

// Draw one chart onto a canvas. Returns false when there was nothing to draw,
// so the mail leaves the picture out rather than sending an empty frame.
//
// The canvas is sized in here rather than by the caller, because the caller has
// no business knowing about SCALE and would get it wrong once.
export function drawChart(canvas, {
    rows, series, stacked = [], format, formatAxis, zero = true,
    width = MAIL_WIDTH, height = HEIGHT, range = DEFAULT_RANGE, title,
}) {
    const { shown, anything } = chartPlan({ rows, series, range })
    if (!anything) return false

    const rowsOfKey = keyLines(series, width)
    const titleH = title ? 24 : 0
    const H = height + rowsOfKey.length * 18 + 6 + titleH

    canvas.width = width * SCALE
    canvas.height = H * SCALE
    canvas.style.width = width + 'px'
    canvas.style.height = H + 'px'

    const c = canvas.getContext('2d')
    c.scale(SCALE, SCALE)
    c.textBaseline = 'alphabetic'

    c.fillStyle = PAPER
    c.fillRect(0, 0, width, H)

    let top = 0
    if (title) {
        c.font = FONT(12, '700')
        c.fillStyle = MUTED
        c.textAlign = 'left'
        c.fillText(title.toUpperCase(), 0, 14)
        top = titleH
    }

    top += drawKey(c, rowsOfKey, top)

    const iw = width - PAD.left - PAD.right
    const ih = height - PAD.top - PAD.bottom
    const base = top + PAD.top

    const { min, max } = scaleFor(shown, {
        stacked,
        lines: series.filter(s => !stacked.includes(s.key)).map(s => s.key),
        zero,
    })

    const x = i => (shown.length === 1 ? PAD.left + iw / 2 : PAD.left + (i / (shown.length - 1)) * iw)
    const y = v => base + ih - ((v - min) / (max - min || 1)) * ih

    // ---- gridlines, and the money down the side ----
    c.font = FONT(10)
    for (const value of ticks(min, max)) {
        const gy = Math.round(y(value)) + 0.5
        c.strokeStyle = RULE
        c.lineWidth = 1
        c.beginPath()
        c.moveTo(PAD.left, gy)
        c.lineTo(width - PAD.right, gy)
        c.stroke()

        c.fillStyle = MUTED
        c.textAlign = 'right'
        c.fillText((formatAxis || format)(value), PAD.left - 8, gy + 3.5)
    }

    // ---- the stacked bands, bottom up ----
    let floor = shown.map(() => 0)
    for (const key of stacked) {
        const spec = series.find(s => s.key === key)
        if (!spec) continue
        const tops = shown.map((r, i) => floor[i] + num(r[key]))

        c.beginPath()
        tops.forEach((v, i) => (i === 0 ? c.moveTo(x(i), y(v)) : c.lineTo(x(i), y(v))))
        for (let i = floor.length - 1; i >= 0; i--) c.lineTo(x(i), y(floor[i]))
        c.closePath()
        c.globalAlpha = BAND_ALPHA
        c.fillStyle = spec.colour
        c.fill()
        c.globalAlpha = 1

        // The band's own colour along its top, not a white seam between bands.
        // A seam can only take its width off the band underneath it, and the
        // thinnest band here is a packaging week that would vanish.
        c.beginPath()
        tops.forEach((v, i) => (i === 0 ? c.moveTo(x(i), y(v)) : c.lineTo(x(i), y(v))))
        c.strokeStyle = spec.colour
        c.lineWidth = 1.75
        c.lineJoin = 'round'
        c.lineCap = 'round'
        c.stroke()

        floor = tops
    }

    // ---- the lines on top ----
    for (const s of series) {
        if (stacked.includes(s.key)) continue
        const runs = segments(shown, s.key)
        c.strokeStyle = s.colour
        c.fillStyle = s.colour
        c.lineWidth = s.heavy ? 3.25 : 1.6
        c.lineJoin = 'round'
        c.lineCap = 'round'

        for (const run of runs) {
            if (run.length === 1) {
                // A week on its own between two gaps. A line through one point
                // draws nothing, so it gets a dot or it is not there at all.
                c.beginPath()
                c.arc(x(run[0].i), y(run[0].value), s.heavy ? 3 : 2.5, 0, Math.PI * 2)
                c.fill()
                continue
            }
            c.beginPath()
            run.forEach((pt, n) => (n === 0 ? c.moveTo(x(pt.i), y(pt.value)) : c.lineTo(x(pt.i), y(pt.value))))
            c.stroke()
        }

        const last = runs[runs.length - 1]
        const tip = last && last[last.length - 1]
        if (tip) {
            c.beginPath()
            c.arc(x(tip.i), y(tip.value), s.heavy ? 4 : 3, 0, Math.PI * 2)
            c.fill()
            c.strokeStyle = PAPER
            c.lineWidth = 1.5
            c.stroke()
        }
    }

    // ---- the weeks along the bottom ----
    //
    // Measured rather than counted. On the screen a label every nth week is
    // enough because the font is known; here the same date can come out wider
    // or narrower depending on what the machine had installed, so the spacing
    // is taken from what the text actually measures.
    c.font = FONT(9.5)
    c.fillStyle = MUTED
    c.textAlign = 'center'
    const widest = Math.max(...shown.map(r => c.measureText(shortDate(r.week)).width))
    const fits = Math.max(2, Math.floor(iw / (widest + 14)))
    for (const i of labelIndices(shown.length, fits)) {
        c.fillText(shortDate(shown[i].week), x(i), base + ih + 20)
    }

    return true
}

// A canvas is a thing on a page. This is the part that turns one into something
// that can be uploaded, kept separate so everything above can be tested without
// a browser.
export function chartToBlob(spec) {
    const canvas = document.createElement('canvas')
    if (!drawChart(canvas, spec)) return Promise.resolve(null)
    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
}
