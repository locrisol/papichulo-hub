// How a line was counted, as the packs somebody typed in: "6 Box", "15 Bag".
//
// The count screen and the finished stock take each drew these, in two looks:
// grey boxes on one and white on the other, and a white pill for a line with
// no packs. This is the count screen's, because that is the one people work
// from, and whitespace-nowrap so "6 Box" never breaks across two lines on a
// phone.
//
// parts come from breakdownParts, which gives null for a line saved before
// packs could be counted. Then there is nothing to draw.
export default function CountedAs({ parts }) {
    if (!parts || parts.length === 0) return null

    return (
        <div className="flex flex-wrap gap-1">
            {parts.map(part => (
                <span
                    key={part.key}
                    className="inline-block bg-gray-100 border border-border rounded-md px-2 py-0.5 text-xs font-medium text-gray-700 whitespace-nowrap"
                >
                    {part.text}
                </span>
            ))}
        </div>
    )
}
