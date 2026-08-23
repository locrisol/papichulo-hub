import { cardHeader } from '../lib/controlStyles'

// One part of a dialog.
//
// A filled bar in the app's dark green, exactly the same one the table headings
// and the card headings use, and the description underneath it on white where it
// can actually be read.
//
// This is the third attempt at it. A plain bold label was not enough of a break,
// and neither was a rule under the label, because both of them read as text with
// a line near it rather than as a heading. The rest of the project had already
// settled this: everywhere else a heading is a filled row, on the sales tables,
// on the till receipt rows, on every card. A dialog had no business inventing a
// fourth way of doing it.
//
// The description is a prop rather than something the caller writes first,
// because that is the bit that kept coming out in a different size and colour in
// each dialog.
export default function ModalSection({ title, description, children, className = '' }) {
    return (
        <div>
            {title && <div className={cardHeader}>{title}</div>}
            <div className={`px-5 py-4 ${className}`}>
                {description && (
                    <p className="text-xs text-muted mb-3 leading-relaxed">{description}</p>
                )}
                {children}
            </div>
        </div>
    )
}
