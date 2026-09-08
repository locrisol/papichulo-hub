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

// What moved, on one line. The table column already says which kind of thing it
// was, so this only has to carry the change itself.
function changeWords(entry) {
    if (entry.action === 'truncate') {
        const gone = entry.changes?.rows_removed
        return gone == null ? 'Emptied' : `${gone} rows removed`
    }
    if (entry.action === 'delete') return 'The whole row, kept in the log'
    if (entry.action === 'insert') return 'New'

    const fields = changedFields(entry)
    if (fields.length === 0) return 'Nothing that is worth showing'
    return fields.map(f => `${f.label}: ${f.was} to ${f.became}`).join(' · ')
}

function ActionPill({ action }) {
    const look = {
        bad: 'bg-red-50 text-red-800 border-red-200',
        new: 'bg-green-50 text-green-800 border-green-200',
        plain: 'bg-gray-50 text-gray-700 border-gray-300',
    }[actionTone(action)]

    return (
        <span className={`inline-block px-2 py-0.5 rounded-md border text-[0.65rem] font-bold uppercase tracking-wider ${look}`}>
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
                        <p className="text-sm text-gray-800">{changeWords(e)}</p>
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
                                <td className="px-4 py-2.5 whitespace-nowrap">
                                    <div className="flex items-center gap-2">
                                        <ActionPill action={e.action} />
                                        <span className="text-sm text-gray-900">{tableWords(e.table_name)}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-2.5 text-sm text-gray-800">{changeWords(e)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    )
}
