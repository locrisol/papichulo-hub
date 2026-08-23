import { worstLevel } from '../lib/workRules'

// What is wrong with somebody, said on their own row.
//
// All of this was in a banner above the grid, and a banner above the grid is
// only read on the way past. You scroll down to Thursday, put somebody on at
// nine, and nothing on screen tells you they said they cannot work Thursdays.
// The row is where the decision is being made, so the row is where it has to
// say so.
//
// The banner stays. It is the list of everything at once, and the blocks in it
// are what hold the week back when you go to publish. This is the same
// information where you are actually looking.
//
// Drawn rather than written as a character. The warning sign is an emoji in most
// fonts, which means it arrives in somebody else's colour and at somebody else's
// size, and this one has to be red because it is red.
function Triangle({ className = '' }) {
    return (
        <svg viewBox="0 0 20 18" aria-hidden="true" className={className} fill="currentColor">
            <path d="M10 0.8 19.4 17H0.6L10 0.8Z" />
            <path d="M9.1 6.2h1.8l-0.25 5.4h-1.3L9.1 6.2Zm0.9 6.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" fill="#fff" />
        </svg>
    )
}

// The mark beside a name. Nothing at all when there is nothing wrong, so a
// clean week looks exactly as it did before any of this.
//
// A mark and not a button. The messages are already open underneath it, so
// there is nothing left for pressing it to do, and something that looks
// pressable and does nothing is worse than something that plainly is not.
export function AlertBadge({ findings }) {
    if (!findings?.length) return null

    const tone = worstLevel(findings) === 'block' ? 'text-red-600' : 'text-amber-500'

    return (
        <span className={`inline-flex items-center gap-0.5 flex-shrink-0 ${tone}`}>
            <Triangle className="w-3.5 h-3.5" />
            {findings.length > 1 && (
                <span className="text-[10px] font-bold leading-none">{findings.length}</span>
            )}
        </span>
    )
}

// The messages themselves, sitting under the row for as long as they are true.
//
// Not behind a press. Something you have to open is something you have to know
// is there, and not knowing is the whole problem being solved. A strip takes
// itself away when the shift causing it is fixed, so the only way to clear one
// is to deal with what it says.
//
// Full width under the row rather than floating beside the name. The grid
// scrolls sideways inside a box that clips anything hanging out of it, so a
// bubble would be cut in half exactly on the wide screens this is built for.
//
// The ground it sits on says which kind it is before anybody reads a word.
export function AlertStrip({ findings, className = '' }) {
    // Nothing at all when there is nothing to say, so no caller can leave a
    // bare yellow band behind with no words in it.
    if (!findings?.length) return null

    const ground = worstLevel(findings) === 'block'
        ? 'bg-red-50 border-red-200'
        : 'bg-amber-50 border-amber-200'

    return (
        <div className={`px-4 py-2 space-y-1 ${ground} ${className}`}>
            {findings.map((finding, i) => (
                <p
                    key={i}
                    className={`text-xs leading-snug ${
                        finding.level === 'block' ? 'text-red-800' : 'text-amber-800'
                    }`}
                >
                    <span className="font-semibold">
                        {finding.level === 'block' ? 'Has to be fixed: ' : 'Worth a look: '}
                    </span>
                    {finding.text}
                </p>
            ))}
        </div>
    )
}
