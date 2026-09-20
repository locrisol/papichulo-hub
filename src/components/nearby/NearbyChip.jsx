import { kindChip, kindDash } from '@/lib/diary'
import { chipWords } from '@/lib/nearby'

// One thing on near us, on a roster.
//
// Three screens draw this and they have to agree, because they are three views
// of the same week and a chip that says something different on one of them is
// worse than a chip that is missing.
//
// **Cheap in height, on purpose.** The roster week shows everything a day has
// on it with no cap, which is his call and the right one: a row that hides the
// fourth thing on the one day that has four things hides exactly the day you
// opened it for. That decision has to be paid for somewhere, and it is paid for
// here, in a tight line height and the time and the name on one line wherever
// they fit.
//
// The time is picked out because the time is the half you scan for. The name
// leads the rest because with a concert the question is which one, and the
// place follows it because "Pentangle" on its own leaves you looking it up.
//
// City says CITY out loud rather than resting on somebody telling two blues
// apart at eleven pixels. It is also a different claim from every other badge
// here: nobody is walking from it, it is on the row because it fills the hotels
// beside us, and that is worth a word rather than a shade.
//
// Not a button on the roster week, though it looks like one it could be. That
// whole cell is already a button that opens the day for a manager, and a button
// inside a button is not a thing. Pass onOpen where there is room for one.
export default function NearbyChip({ row, short = false, compact = true, onOpen }) {
    const kind = row?.kind || 'nearby'
    const words = chipWords(row, { short })

    const look = `block w-full text-left rounded-md border-l-[3px] ${kindChip(kind)} `
        + `${row?.checked === false ? kindDash(kind) : ''} `
        + `${compact ? 'px-1.5 py-0.5 text-[0.6875rem]' : 'px-2 py-1 text-xs'} `
        + 'leading-tight break-words'

    const inside = (
        <>
            {row?.time && (
                <>
                    <span className="font-bold tabular-nums">{row.time}</span>{' '}
                </>
            )}
            {kind === 'city' && (
                <>
                    <span className="font-bold uppercase tracking-wide">City</span>{' '}
                </>
            )}
            {words}
        </>
    )

    // Said out loud rather than drawn, because a dashed edge is a hint and not
    // a sentence, and on a phone it is barely a hint.
    const title = row?.checked === false ? `${words} (found, nobody has checked it)` : words

    if (!onOpen) return <span className={look} title={title}>{inside}</span>

    return (
        <button
            type="button"
            onClick={() => onOpen(row)}
            className={`${look} transition-opacity hover:opacity-80`}
            title={title}
        >
            {inside}
        </button>
    )
}
