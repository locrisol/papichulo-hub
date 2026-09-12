import { describe, it, expect } from 'vitest'
import { drawChart, chartPlan, keyLines, MAIL_WIDTH } from './reportChartImage'
import { chartSpecs } from './reportCharts'

// A canvas that writes down what it was asked to do instead of drawing it.
//
// There is no canvas in node and adding one would be a compiled dependency to
// test arithmetic we already have the numbers for. What is worth checking here
// is not what the picture looks like, which is a thing to look at: it is that
// the drawing runs at all, that it puts its ink inside the frame it claims,
// and that it leaves a week nobody wrote up alone. All three of those are
// visible in the calls.
function stub() {
    const calls = []
    const points = []
    const ctx = {
        calls, points,
        canvas: null,
        font: '', fillStyle: '', strokeStyle: '', textAlign: '', textBaseline: '',
        lineWidth: 1, lineJoin: '', lineCap: '', globalAlpha: 1,
        scale: (...a) => calls.push(['scale', ...a]),
        fillRect: (...a) => calls.push(['fillRect', ...a]),
        beginPath: () => calls.push(['beginPath']),
        closePath: () => calls.push(['closePath']),
        moveTo: (x, y) => { points.push([x, y]); calls.push(['moveTo', x, y]) },
        lineTo: (x, y) => { points.push([x, y]); calls.push(['lineTo', x, y]) },
        arc: (x, y, r) => { points.push([x, y]); calls.push(['arc', x, y, r]) },
        stroke: () => calls.push(['stroke']),
        fill: () => calls.push(['fill']),
        fillText: (t, x, y) => calls.push(['fillText', t, x, y]),
        // Every character the same width, so the label spacing is worked out
        // from something predictable rather than from whatever font the machine
        // running the tests happens to have.
        measureText: t => ({ width: String(t).length * 6 }),
    }

    const canvas = {
        width: 0, height: 0, style: {},
        getContext: () => ctx,
    }
    ctx.canvas = canvas
    return { canvas, ctx }
}

const week = n => {
    const d = new Date(Date.UTC(2026, 0, 4) + n * 7 * 86400000)
    return d.toISOString().slice(0, 10)
}

const rows = Array.from({ length: 30 }, (_, i) => ({
    week: week(i),
    net: 12000 + i * 90,
    food: 3800 + i * 20,
    labour: 3600 + i * 25,
    packaging: 520,
    earnings: 1500 + i * 30,
}))

const salesSpec = () => {
    const spec = chartSpecs().sales
    return { rows, series: spec.series, stacked: spec.stacked, format: spec.format, formatAxis: spec.formatAxis }
}

describe('chartPlan', () => {
    it('says there is something to draw', () => {
        const plan = chartPlan({ rows, series: chartSpecs().sales.series })
        expect(plan.anything).toBe(true)
        expect(plan.shown.length).toBe(30)
    })

    it('says there is nothing when every week is empty', () => {
        const blank = rows.map(r => ({ week: r.week }))
        expect(chartPlan({ rows: blank, series: chartSpecs().sales.series }).anything).toBe(false)
    })

    it('says there is nothing when there are no weeks at all', () => {
        expect(chartPlan({ rows: [], series: chartSpecs().sales.series }).anything).toBe(false)
    })
})

describe('keyLines', () => {
    it('keeps a short key on one row', () => {
        expect(keyLines([{ label: 'Net sales' }, { label: 'Food' }], MAIL_WIDTH)).toHaveLength(1)
    })

    it('wraps a key too wide for the picture', () => {
        const many = Array.from({ length: 9 }, (_, i) => ({ label: `A fairly long platform name ${i}` }))
        expect(keyLines(many, MAIL_WIDTH).length).toBeGreaterThan(1)
    })

    it('never leaves a row empty, however long one label is', () => {
        const rowsOut = keyLines([{ label: 'x'.repeat(400) }, { label: 'Food' }], MAIL_WIDTH)
        expect(rowsOut.every(r => r.length > 0)).toBe(true)
    })
})

describe('drawChart', () => {
    it('draws, and says it did', () => {
        const { canvas, ctx } = stub()
        expect(drawChart(canvas, salesSpec())).toBe(true)
        expect(ctx.calls.length).toBeGreaterThan(50)
    })

    it('says it did not when there is nothing to draw', () => {
        const { canvas } = stub()
        const blank = rows.map(r => ({ week: r.week }))
        expect(drawChart(canvas, { ...salesSpec(), rows: blank })).toBe(false)
    })

    it('sizes the canvas at two device pixels to the point', () => {
        const { canvas } = stub()
        drawChart(canvas, salesSpec())
        expect(canvas.width).toBe(MAIL_WIDTH * 2)
        expect(canvas.style.width).toBe(`${MAIL_WIDTH}px`)
        // The height it reports and the height it drew at have to agree, or
        // the picture arrives with a strip of nothing under it.
        expect(canvas.height).toBe(parseInt(canvas.style.height, 10) * 2)
    })

    it('keeps every mark inside the picture', () => {
        const { canvas, ctx } = stub()
        drawChart(canvas, salesSpec())
        const height = parseInt(canvas.style.height, 10)
        for (const [x, y] of ctx.points) {
            expect(x).toBeGreaterThanOrEqual(0)
            expect(x).toBeLessThanOrEqual(MAIL_WIDTH)
            expect(y).toBeGreaterThanOrEqual(0)
            expect(y).toBeLessThanOrEqual(height)
        }
    })

    it('never writes a date on top of the one beside it', () => {
        const { canvas, ctx } = stub()
        drawChart(canvas, salesSpec())
        // The dates are the only centred text, and they all share a baseline.
        const dates = ctx.calls.filter(c => c[0] === 'fillText' && /^\d/.test(c[1]))
        const lowest = Math.max(...dates.map(c => c[3]))
        const bottom = dates.filter(c => c[3] === lowest).sort((a, b) => a[2] - b[2])
        for (let i = 1; i < bottom.length; i++) {
            const gap = bottom[i][2] - bottom[i - 1][2]
            const needed = (bottom[i][1].length * 6) / 2 + (bottom[i - 1][1].length * 6) / 2
            expect(gap).toBeGreaterThan(needed)
        }
    })

    it('leaves a gap rather than drawing a nought for a week nobody wrote up', () => {
        // Net earnings only exists on a week that has a report. A missing week
        // drawn as nought is a week that reads as a disaster.
        const holed = rows.map((r, i) => ({ ...r, earnings: i === 10 ? null : r.earnings }))
        const spec = chartSpecs().earnings
        const { canvas, ctx } = stub()
        drawChart(canvas, {
            rows: holed, series: spec.series, format: spec.format,
            formatAxis: spec.formatAxis, zero: false,
        })
        // Two runs of line, so two moveTo starts rather than one unbroken path.
        const starts = ctx.calls.filter(c => c[0] === 'moveTo').length
        expect(starts).toBeGreaterThan(1)
    })

    it('puts a title on when it is given one', () => {
        const { canvas, ctx } = stub()
        drawChart(canvas, { ...salesSpec(), title: 'Sales and costs' })
        expect(ctx.calls.some(c => c[0] === 'fillText' && c[1] === 'SALES AND COSTS')).toBe(true)
    })

    it('is taller with a title than without one', () => {
        const a = stub(); const b = stub()
        drawChart(a.canvas, salesSpec())
        drawChart(b.canvas, { ...salesSpec(), title: 'Sales and costs' })
        expect(b.canvas.height).toBeGreaterThan(a.canvas.height)
    })

    it('draws a single week as a dot, since a line through one point is nothing', () => {
        const spec = chartSpecs().earnings
        const { canvas, ctx } = stub()
        drawChart(canvas, {
            rows: [{ week: week(0), earnings: 1500, net: 12000 }],
            series: spec.series, format: spec.format, formatAxis: spec.formatAxis, zero: false,
        })
        expect(ctx.calls.some(c => c[0] === 'arc')).toBe(true)
    })
})
