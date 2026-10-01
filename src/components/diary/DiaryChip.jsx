import { kindChip, kindDash } from '@/lib/diary'
import { offWords } from '@/lib/nearby'

// One thing on a day, wherever it is drawn.
//
// The time picked out from the name because the time is the half you scan for,
// the same reason the roster does it: a delivery at eleven and a delivery at
// three are different problems.
//
// What is a button here depends on what you can do with it. A listing from
// next door always opens, because it opens to be read. A diary entry opens only
// if you can change it, so an employee gets a label rather than a control that
// looks pressable and does nothing, which is worse than a plain label.
export default function DiaryChip({ item, onOpen, canEdit = true, compact = false }) {
    const look = `block w-full text-left rounded-md border-l-[3px] ${kindChip(item.kind)} `
        + `${compact ? 'px-1 py-0.5 text-[0.6875rem]' : 'px-1.5 py-1 text-xs'} `
        + 'leading-tight font-semibold truncate'

    // Struck through when it is called off, with the reason in the tooltip and
    // in the listing when it is opened. A night called off stays on the
    // calendar so whoever looks learns it is off, rather than wondering where
    // it went.
    //
    // **A night the feed stopped listing is said instead**, because it may
    // still be on: we worked it out, Ticketmaster never said so, and a line
    // through it reads as called off. My shifts draws this chip too, on a
    // phone, where a tooltip is never seen.
    const off = offWords(item.off)
    const struck = item.off === 'cancelled' ? 'line-through' : ''
    const said = item.off === 'withdrawn' ? ` (${off})` : ''
    const title = off ? `${item.title} (${off})` : item.title

    const inside = (
        <>
            {item.time && <span className="tabular-nums font-bold">{item.time}</span>}
            {item.time && ' '}
            {item.title}{said}
        </>
    )

    // Dashed means nobody has checked it. It used to mean the Arena, on the
    // grounds that it was the one thing here nobody at Papi Chulo typed, but
    // the colour already says that about all three of the nearby kinds. This
    // says something the colour cannot: a model read it off a page and no
    // person has looked at it yet.
    const edge = item.checked === false ? kindDash(item.kind) : ''

    // A delivery belongs to the day it was ticked onto, so it is not a button
    // here. Pressing it would have to take you somewhere else to change it, and
    // a chip that navigates away from a month you were reading is a surprise.
    if (item.source === 'delivery' || !onOpen || (item.source === 'diary' && !canEdit)) {
        return <span className={`${look} ${edge} ${struck}`} title={title}>{inside}</span>
    }

    return (
        <button
            type="button"
            onClick={() => onOpen(item.entry)}
            className={`${look} ${edge} ${struck} transition-opacity hover:opacity-80`}
            title={title}
        >
            {inside}
        </button>
    )
}
