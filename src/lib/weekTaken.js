// The sums behind the "how the week was taken" chart.
//
// Kept out of the component so they can be tested, which is the same split the
// rest of lib uses: no React in here, just the arithmetic.

// A colour for each row on the till, by name.
//
// The colour belongs to the row, not to how big it was that week. Handing them
// out by size instead meant Feedr was yellow one week and pink the next, which
// makes two weeks side by side impossible to compare and is the one thing a
// chart like this is for.
//
// Matched on the name as it reads on the till. Rename a row and it takes the
// next colour nobody is using rather than breaking, so nothing here has to be
// kept in step with the till by hand.
export const TENDER_COLOURS = [
    { name: 'kiosk', colour: '#1f6fd0' },            // blue
    { name: 'card', colour: '#8e44ad' },             // violet
    { name: 'cash sales', colour: '#c2185b' },       // crimson
    { name: 'online platforms', colour: '#17a2b8' }, // teal
    { name: 'feedr', colour: '#136b3a' },            // dark green
    { name: 'lunch team', colour: '#eb6834' },       // orange
    { name: 'clockmeal', colour: '#5cc27a' },        // light green
    { name: 'catering', colour: '#e06ce0' },         // magenta
]

// What these eight are worth, so nobody has to take it on trust.
//
// Checked with a palette validator against a white card, every pair against
// every other, because a colour now belongs to a row and any two rows can end
// up beside each other depending on the week.
//
// The worst pair for ordinary sight is 15.3, just over the mark of 15. The
// worst for the commonest kind of colour blindness is 6.4, which is inside the
// band that is allowed only where colour is not the one thing telling you what
// a slice is. That is the case here: the legend is always on and always carries
// the name and the amount, there is a white gap between every pair of slices,
// and both the other two views use no colour at all.
//
// Catering is magenta and not the obvious yellow because yellow sat too close
// to Lunch Team's orange. Feedr's dark green, Lunch Team's orange and
// Clockmeal's light green were asked for and the other five were picked around
// them, so changing one of those three means picking the rest again.
//
// Eight is the ceiling. Nothing that clears the marks above can be added to
// these, which is what the fold below is for.
export const OTHER_COLOUR = '#8a8578'

// One hue for the bars, because every bar is the same measure. Which row is
// which is said by the label beside it, so colour has no work to do, and giving
// each bar its own would suggest a difference that is not there. This is the
// app's own green, which comes out at 5:1 on white.
export const BAR_COLOUR = '#2E7D52'

// Compared loosely, so a stray capital or a trailing space on the till does not
// cost a row its colour.
function tidy(label) {
    return String(label ?? '').trim().toLowerCase()
}

// Hands a colour to every row: the one it owns if it has one, and otherwise the
// first colour no row on screen has claimed.
//
// The second half is what happens when the till gains a row or renames one.
// Taking a colour already in use would put two rows in the same colour, which
// is worse than an unexpected colour, so it takes an unclaimed one instead.
function withColours(rows) {
    const claimed = new Set()
    const owned = rows.map(r => {
        const match = TENDER_COLOURS.find(c => c.name === tidy(r.label))
        if (match) claimed.add(match.colour)
        return match?.colour ?? null
    })

    const spare = TENDER_COLOURS.map(c => c.colour).filter(c => !claimed.has(c))
    return rows.map((r, i) => ({ ...r, colour: owned[i] ?? spare.shift() ?? OTHER_COLOUR }))
}

// Turns the till rows into slices, biggest first.
//
// Rows that took nothing are dropped. A slice of zero is invisible on a pie and
// an empty line on a bar chart, and it still uses up a colour: with a row added
// to the till before it starts taking anything, that is a real case rather than
// a theoretical one.
//
// Past eight rows the tail folds into one grey slice, because there is no ninth
// colour and there should not be.
export function toSlices(rows) {
    const withMoney = (rows || [])
        .filter(r => Number(r.amount) > 0)
        .sort((a, b) => b.amount - a.amount)

    if (withMoney.length <= TENDER_COLOURS.length) return withColours(withMoney)

    const kept = withMoney.slice(0, TENDER_COLOURS.length - 1)
    const rest = withMoney.slice(TENDER_COLOURS.length - 1)

    return [
        ...withColours(kept),
        {
            label: `Other (${rest.length})`,
            amount: rest.reduce((sum, r) => sum + r.amount, 0),
            colour: OTHER_COLOUR,
        },
    ]
}

// A slice of a donut, as an SVG path, on a 100 by 100 square.
//
// Angles start at the top and go clockwise, which is how a pie is read.
//
// One slice covering the whole circle cannot be drawn as an arc: its start and
// end points are the same, so the browser draws nothing at all and the chart
// comes out blank. A week where everything came in one way is perfectly
// ordinary, so that case is drawn as two half circles instead.
export function slicePath(startAngle, endAngle, outer, inner) {
    const point = (angle, radius) => {
        const rad = ((angle - 90) * Math.PI) / 180
        return [50 + radius * Math.cos(rad), 50 + radius * Math.sin(rad)]
    }

    if (endAngle - startAngle >= 359.999) {
        return [
            `M 50 ${50 - outer}`,
            `A ${outer} ${outer} 0 1 1 50 ${50 + outer}`,
            `A ${outer} ${outer} 0 1 1 50 ${50 - outer}`,
            `M 50 ${50 - inner}`,
            `A ${inner} ${inner} 0 1 0 50 ${50 + inner}`,
            `A ${inner} ${inner} 0 1 0 50 ${50 - inner}`,
            'Z',
        ].join(' ')
    }

    const large = endAngle - startAngle > 180 ? 1 : 0
    const [x1, y1] = point(startAngle, outer)
    const [x2, y2] = point(endAngle, outer)
    const [x3, y3] = point(endAngle, inner)
    const [x4, y4] = point(startAngle, inner)

    return [
        `M ${x1} ${y1}`,
        `A ${outer} ${outer} 0 ${large} 1 ${x2} ${y2}`,
        `L ${x3} ${y3}`,
        `A ${inner} ${inner} 0 ${large} 0 ${x4} ${y4}`,
        'Z',
    ].join(' ')
}
