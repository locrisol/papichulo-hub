// Stepping back and forward through days and weeks.
//
// The same control on six screens, written six times, and wrong in the same
// three ways on all of them.
//
// The arrows were about thirty pixels square, which is fine under a mouse and
// too small for a thumb. They are the size of a finger now, and they stay the
// size of a finger, because they are the control people press most.
//
// The middle takes whatever room is left rather than a fixed width. A fixed
// width was there so the arrows did not shift when the text changed length, and
// on a phone it did the opposite: it pushed an arrow onto its own line and left
// the jump button stranded beside it. Pinned to the edges instead, the arrows
// cannot move whatever the date says.
//
// And the jump button gets its own full width line on a phone rather than
// floating off the end of the row.
export default function DateStepper({
    onBack,
    onNext,
    backLabel = 'Previous',
    nextLabel = 'Next',
    jump = null,
    children,
}) {
    const arrow =
        'h-11 w-11 flex-shrink-0 flex items-center justify-center text-xl leading-none '
        + 'bg-white border border-gray-300 rounded-lg text-gray-700 shadow-sm '
        + 'transition-colors hover:bg-gray-50 hover:border-gray-400 '
        + 'focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50'

    return (
        <div className="w-full sm:w-auto flex flex-col sm:flex-row sm:items-center gap-2">
            {/* The full width of whatever it sits in. Shrunk to fit its own
                contents it stopped short of the card edge, so the arrows were
                not on the edges and the date between them was not in the
                middle, which is exactly what it looked like. */}
            <div className="flex items-center gap-2">
                <button type="button" onClick={onBack} aria-label={backLabel} className={arrow}>
                    &lsaquo;
                </button>

                {/* Everything that is left, and no less. A date box that cannot
                    show its own date is the fault this was built to fix. */}
                <span className="flex-1 min-w-0 flex items-center justify-center">
                    {children}
                </span>

                <button type="button" onClick={onNext} aria-label={nextLabel} className={arrow}>
                    &rsaquo;
                </button>
            </div>

            {jump && <div className="flex-shrink-0 [&>*]:w-full sm:[&>*]:w-auto">{jump}</div>}
        </div>
    )
}
