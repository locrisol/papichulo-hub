import { kindChip } from '@/lib/diary'

// One diary entry drawn across the days it covers, in the month or the week.
//
// The two views each built this for themselves and had drifted: only the month
// squared off the end that carries on past the edge of the row, so in the week
// a promotion running on into next week looked like it stopped on Saturday.
// The squared end and the arrow say the same thing, and both views say it now.
//
// Where it sits in the grid is the parent's business. This is only the band.
//
// compact is the month's size, where six weeks have to fit on one screen.
// An employee gets a label rather than a button, the same as DiaryChip.
export default function DiaryBand({ entry, runsIn = false, runsOn = false, canEdit = false, onOpen, compact = false }) {
    const look = `block w-full text-left truncate rounded-md border-l-[3px] font-bold ${kindChip(entry.kind)} `
        + `${compact ? 'px-1.5 py-0.5 text-[0.6875rem]' : 'px-2 py-1 text-xs'}`
        + `${runsIn ? ' rounded-l-none' : ''}${runsOn ? ' rounded-r-none' : ''}`

    const inside = <>{runsIn && '‹ '}{entry.title}{runsOn && ' ›'}</>

    return canEdit && onOpen
        ? <button type="button" onClick={() => onOpen(entry)} className={look}>{inside}</button>
        : <span className={look}>{inside}</span>
}
