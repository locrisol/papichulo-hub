// A slice of a donut, as an SVG path, on a 100 by 100 square.
//
// Angles start at the top and go clockwise, which is how a pie is read.
//
// One slice covering the whole circle cannot be drawn as an arc: its start and
// end points are the same, so the browser draws nothing at all and the chart
// comes out blank. A week taken entirely one way, or a stock take where
// everything was counted in one place, is perfectly ordinary, so that case is
// drawn as two half circles instead.
//
// This lives on its own because two charts use it now and neither of them owns
// it. It was written for the week taken pie on the dashboard and the stock take
// pie draws the same shape.
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

// The same slice, as a list of points, for anything that cannot draw an arc.
//
// jsPDF has no arc. It draws straight lines between points and fills what they
// enclose, so a curve has to be handed to it as enough points that the corners
// stop showing. One point every three degrees does it at the size the report
// prints the pie, and a slice of any size gets at least two.
//
// Returns [[x, y], ...] on the same 100 by 100 square, going out along the
// outer edge and back along the inner one, ready to be closed.
export function slicePoints(startAngle, endAngle, outer, inner, step = 3) {
    const point = (angle, radius) => {
        const rad = ((angle - 90) * Math.PI) / 180
        return [50 + radius * Math.cos(rad), 50 + radius * Math.sin(rad)]
    }

    const steps = Math.max(2, Math.ceil((endAngle - startAngle) / step))
    const angles = []
    for (let i = 0; i <= steps; i++) {
        angles.push(startAngle + ((endAngle - startAngle) * i) / steps)
    }

    return [
        ...angles.map(a => point(a, outer)),
        ...angles.slice().reverse().map(a => point(a, inner)),
    ]
}
