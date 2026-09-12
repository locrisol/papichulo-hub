import {
    tableWords, changedFields, whoWords, throughTheApp, actionWords, actionTone, dayOf,
} from '../../lib/changeLog'
import { tableHeadRow, tableCard, card } from '../../lib/controlStyles'

// The change log as a list.
//
// A table on anything wide enough and cards on a phone, because a table with a
// column of sentences in it scrolls sideways on a small screen and the sentence
// is the column you came to read.
//
// Nothing here is a control. Every row is a record of something that already
// happened and there is nothing to press, so it is laid out to be read down
// rather than worked across.

function shortDate(at) {
    const day = dayOf(at)
    return `${day.slice(8, 10)}/${day.slice(5, 7)}`
}

function timeWords(at) {
    const d = new Date(at)
    if (isNaN(d)) return ''
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// What moved.
//
// One line per field rather than a sentence with everything in it. The old
// value is struck through and the new one is the only bold thing on the row, so
// the answer to "what does it say now" is findable without reading.
function Change({ entry }) {
    if (entry.action === 'truncate') {
        const gone = entry.changes?.rows_removed
        return (
            <span className="font-semibold text-red-800">
                {gone == null ? 'Emptied' : `${gone} rows removed`}
            </span>
        )
    }

    if (entry.action === 'delete') {
        return <span className="text-red-800">The whole row, kept in the log</span>
    }

    if (entry.action === 'insert') return <span className="text-muted">New</span>

    const fields = changedFields(entry)
    if (fields.length === 0) return <span className="text-muted">Nothing worth showing</span>

    return (
        <div className="space-y-0.5">
            {fields.map(f => (
                <div key={f.field} className="flex flex-wrap items-baseline gap-x-1.5">
                    <span className="text-muted">{f.label}</span>
                    <span className="text-gray-500 line-through decoration-gray-400">{f.was}</span>
                    {/* The arrow and what it points at are one thing. Apart,
                        a narrow screen leaves the arrow stranded at the end of
                        a line with the new value alone underneath it. */}
                    <span className="whitespace-nowrap">
                        <span className="text-muted" aria-label="became">&rarr;</span>{' '}
                        <span className="font-semibold text-gray-900">{f.became}</span>
                    </span>
                </div>
            ))}
        </div>
    )
}

function ActionPill({ action }) {
    const look = {
        bad: 'bg-red-50 text-red-800 border-red-200',
        new: 'bg-green-50 text-green-800 border-green-200',
        plain: 'bg-gray-50 text-gray-700 border-gray-300',
    }[actionTone(action)]

    // All four the same width, so the name beside them starts in the same
    // place down the column instead of stepping in and out as the word
    // changes. A minimum rather than a fixed size: the longest word today is
    // CHANGED and a longer one later should push the box out, not be cut off.
    return (
        <span className={`inline-block min-w-[4.75rem] text-center px-2 py-0.5 rounded-md border text-[0.65rem] font-bold uppercase tracking-wider ${look}`}>
            {actionWords(action)}
        </span>
    )
}

// A change nobody was signed in for is marked rather than left to be spotted.
// It is the entry most worth a second look and it would otherwise be the
// quietest thing on the page.
function Who({ entry }) {
    return (
        <span className={throughTheApp(entry) ? 'text-gray-700' : 'text-amber-800 font-semibold'}>
            {whoWords(entry)}
        </span>
    )
}

export default function ChangeLog({ entries }) {
    if (entries.length === 0) {
        return (
            <div className={`${card} p-8 text-center`}>
                <p className="text-sm text-muted max-w-sm mx-auto">
                    Nothing changed in these days. The record began on 8 September 2026, so
                    anything before that is not missing, it was never kept.
                </p>
            </div>
        )
    }

    return (
        <>
            <div className="md:hidden space-y-2">
                {entries.map(e => (
                    <div key={e.id} className={`${card} p-3`}>
                        <div className="flex items-center gap-2 mb-1.5">
                            <ActionPill action={e.action} />
                            <span className="text-sm font-semibold text-gray-900">
                                {tableWords(e.table_name)}
                            </span>
                            <span className="text-xs text-muted ml-auto tabular-nums whitespace-nowrap">
                                {shortDate(e.changed_at)}, {timeWords(e.changed_at)}
                            </span>
                        </div>
                        {e.label && (
                            <p className="text-sm text-gray-900 font-medium mb-1">{e.label}</p>
                        )}
                        <div className="text-sm text-gray-800"><Change entry={e} /></div>
                        <p className="text-xs mt-1"><Who entry={e} /></p>
                    </div>
                ))}
            </div>

            <div className={`hidden md:block ${tableCard}`}>
                <table className="w-full">
                    <thead>
                        <tr className={tableHeadRow}>
                            <th className="text-left px-4 py-2.5 text-xs uppercase tracking-wider whitespace-nowrap">When</th>
                            <th className="text-left px-4 py-2.5 text-xs uppercase tracking-wider">Who</th>
                            <th className="text-left px-4 py-2.5 text-xs uppercase tracking-wider">What</th>
                            {/* w-full on the last column so the three before it
                                take only what they need and the change gets the
                                rest, rather than the four sharing evenly. */}
                            <th className="text-left px-4 py-2.5 text-xs uppercase tracking-wider w-full">Change</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {entries.map(e => (
                            <tr key={e.id} className="align-baseline">
                                <td className="px-4 py-2.5 text-xs text-muted tabular-nums whitespace-nowrap">
                                    {shortDate(e.changed_at)}, {timeWords(e.changed_at)}
                                </td>
                                <td className="px-4 py-2.5 text-xs whitespace-nowrap"><Who entry={e} /></td>
                                <td className="px-4 py-2.5">
                                    <div className="flex items-center gap-2 whitespace-nowrap">
                                        <ActionPill action={e.action} />
                                        <span className="text-sm text-gray-900">{tableWords(e.table_name)}</span>
                                    </div>
                                    {/* Which one it was. Under the kind rather
                                        than beside it, because a name can be
                                        long and this column is already the
                                        widest of the three fixed ones. */}
                                    {e.label && (
                                        <p className="text-xs text-muted mt-0.5 max-w-xs">{e.label}</p>
                                    )}
                                </td>
                                <td className="px-4 py-2.5 text-sm text-gray-800"><Change entry={e} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    )
}
