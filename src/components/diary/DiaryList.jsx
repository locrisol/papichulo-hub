import { agendaRows, dayName } from '@/lib/events'
import { kindChip, kindTag, kindLabel, scopeLabel, timeLabel, layerOf } from '@/lib/diary'

// What have I got coming up, and when.
//
// The complaint this whole screen answers. The roster shows one week, so
// anything further out than Sunday had nowhere to be seen at all, and a
// catering job three weeks away is exactly the kind of thing worth knowing
// about three weeks away.
//
// The month and week headings are the ones the events list already builds, from
// agendaRows, so a week running across the end of a month reads the same here
// as it does there.
//
// Every row carries its colour down the left edge and on the date, not only on
// the badge at the end. A badge is a word you read; a colour is something you
// see without reading, and the point of this list is scanning it.

function Row({ item, restaurants, onOpen }) {
    const entry = item.source === 'diary' ? item.entry : null
    const edge = kindChip(item.kind).split(' ').find(c => c.startsWith('border-l-')) || 'border-l-gray-400'
    const tint = kindTag(item.kind)

    const inside = (
        <div className="flex items-start gap-3 w-full text-left">
            <div className={`flex-none w-12 rounded-lg py-1 text-center ${tint}`}>
                <div className="text-base font-bold leading-tight tabular-nums">
                    {Number(item.date.slice(8, 10))}
                </div>
                <div className="text-[0.6rem] font-bold uppercase tracking-wider">
                    {dayName(item.date)}
                </div>
            </div>

            <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 break-words">{item.title}</p>
                <p className="text-xs text-muted mt-0.5">
                    {entry ? timeLabel(entry) : (item.time || 'All day')}
                    {entry?.location && ` · ${entry.location}`}
                    {entry?.contact_name && ` · ${entry.contact_name}`}
                    {entry?.contact_detail && `, ${entry.contact_detail}`}
                </p>
                {entry?.note && (
                    <p className="text-xs text-muted mt-0.5 break-words">{entry.note}</p>
                )}
            </div>

            <div className="flex-none flex flex-col items-end gap-1">
                <span className={`inline-block rounded px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider ${tint}`}>
                    {item.source === 'delivery' ? 'Delivery' : kindLabel(item.kind)}
                </span>
                {entry && (
                    <span className="text-[0.65rem] font-semibold text-muted border border-border rounded-full px-2 whitespace-nowrap">
                        {scopeLabel(entry, restaurants)}
                    </span>
                )}
                {entry && entry.status !== 'confirmed' && (
                    <span className="text-[0.65rem] font-bold text-accent-ink uppercase tracking-wider">
                        {entry.status}
                    </span>
                )}
                {entry && entry.scope !== 'private' && (
                    <span className={`text-[0.65rem] font-bold ${entry.google_synced_at ? 'text-green-700' : 'text-muted'}`}>
                        {entry.google_synced_at ? '✓ on Google' : 'not on Google'}
                    </span>
                )}
            </div>
        </div>
    )

    const shell = `w-full border-l-[4px] ${edge} px-3 py-2.5 border-b border-border last:border-b-0`

    return entry
        ? <button type="button" onClick={() => onOpen(entry)} className={`${shell} hover:bg-gray-50 transition-colors`}>{inside}</button>
        : <div className={shell}>{inside}</div>
}

export default function DiaryList({ items, today, restaurants, layers, onOpen }) {
    const on = new Set(layers)
    const shown = [...items]
        .filter(i => on.has(layerOf(i)))
        .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''))

    const rows = agendaRows(shown, today, i => i.date)

    if (!rows.length) {
        return (
            <p className="p-6 text-sm text-muted italic text-center">
                Nothing coming up. Add something and it will show here, on the roster and on
                the right calendar.
            </p>
        )
    }

    return (
        <div>
            {rows.map(row => {
                if (row.type === 'month') {
                    return (
                        <h3 key={row.key} className="font-serif text-lg font-bold text-gray-900 px-3 pt-4 pb-1">
                            {row.label}
                        </h3>
                    )
                }
                if (row.type === 'week') {
                    return (
                        <div key={row.key} className="bg-gray-100 border-y border-border px-3 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-gray-700">
                            {row.label}
                        </div>
                    )
                }
                return row.events.map(item => (
                    <Row key={item.key} item={item} restaurants={restaurants} onOpen={onOpen} />
                ))
            })}
        </div>
    )
}
