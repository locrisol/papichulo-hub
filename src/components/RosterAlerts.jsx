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
// A button when there are warnings to open, and a plain mark when there are
// only blocks, because a block is already open underneath and there is nothing
// left for pressing it to do.
export function AlertBadge({ findings, open, onToggle }) {
    if (!findings?.length) return null

    const tone = worstLevel(findings) === 'block' ? 'text-red-600' : 'text-amber-500'
    const inside = (
        <>
            <Triangle className="w-3.5 h-3.5" />
            {findings.length > 1 && (
                <span className="text-[0.625rem] font-bold leading-none">{findings.length}</span>
            )}
        </>
    )

    if (!onToggle) {
        return (
            <span className={`inline-flex items-center gap-0.5 flex-shrink-0 ${tone}`}>{inside}</span>
        )
    }

    return (
        <button
            type="button"
            onClick={onToggle}
            aria-expanded={!!open}
            aria-label={open ? 'Hide what is worth a look' : 'Show what is worth a look'}
            className={`inline-flex items-center gap-0.5 flex-shrink-0 rounded transition-opacity
                hover:opacity-70 focus:outline-none focus:ring-2 focus:ring-accent ${tone}`}
        >
            {inside}
        </button>
    )
}


// The messages themselves, sitting under the row for as long as they are true.
//
// A block is never behind a press. Something you have to open is something you
// have to know is there, and a block is the thing that holds the week back, so
// missing it is missing the reason you cannot publish. A strip takes itself
// away when the shift causing it is fixed, so the only way to clear one is to
// deal with what it says.
//
// Warnings fold behind the mark, which they did not used to. That was right
// when a warning was a rare thing about a shift somebody had just put in. It
// stopped being right once every person waiting on a permission renewal carried
// one every week: seven rows of amber under a grid you came to read is a grid
// you cannot read, and a warning nobody can see past is not being read either.
//
// Full width under the row rather than floating beside the name. The grid
// scrolls sideways inside a box that clips anything hanging out of it, so a
// bubble would be cut in half exactly on the wide screens this is built for.
//
// The ground it sits on says which kind it is before anybody reads a word.
export function AlertStrip({ findings, open, className = '' }) {
    const shown = open ? findings : (findings || []).filter(f => f.level === 'block')

    // Nothing at all when there is nothing to say, so no caller can leave a
    // bare yellow band behind with no words in it.
    if (!shown.length) return null

    const ground = worstLevel(shown) === 'block'
        ? 'bg-red-50 border-red-200'
        : 'bg-amber-50 border-amber-200'

    return (
        <div className={`px-4 py-2 space-y-1 ${ground} ${className}`}>
            {shown.map((finding, i) => (
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
