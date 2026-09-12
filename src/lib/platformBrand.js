// The colour a delivery platform wears.
//
// Deliveroo blue, Uber Eats green, Just Eat orange, so a platform reads the
// same wherever it appears: the report, the charts and the mail.
//
// Two colours each rather than one. `mark` paints a dot, an edge or a chart
// line. `ink` is the same colour taken down until it reads as lettering on
// white. The brand colours themselves are built for a white logo sitting on top
// of them and are far too light for either job, so both are darkened.
//
// They are also pulled apart from each other on purpose. Deliveroo's real
// turquoise and Uber's real green are close enough to be the same colour to a
// lot of eyes, so the blue is taken toward blue and the green left green, which
// separates them for everybody. The three land on distinct lightness steps as
// well, so they still tell apart printed in black and white.
//
// Matched on the name, loosely, because sales_platforms is manager editable and
// nothing joins it to anything here. A platform that matches nothing gets the
// neutral, which is not a failure, it just has no brand of its own.
const BRANDS = [
    { match: /deliveroo/i, mark: '#1A6E9E', ink: '#145C86' },
    { match: /uber/i, mark: '#248C58', ink: '#1B6B43' },
    { match: /just\s*eat/i, mark: '#D67F08', ink: '#96600A' },
]

export const NEUTRAL = { mark: '#6B6459', ink: '#3A352E' }

export function brandFor(name) {
    const found = BRANDS.find(b => b.match.test(String(name || '')))
    return found ? { mark: found.mark, ink: found.ink } : NEUTRAL
}
