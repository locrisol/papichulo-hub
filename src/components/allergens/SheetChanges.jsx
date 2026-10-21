import { changeWords } from '@/lib/allergenSheet'

// The lines of the allergen sheet that differ from the one printed, one to a
// line, and how many more there are. On the Public allergens page and in the
// weekly report, worded once in lib/allergenSheet.
export default function SheetChanges({ changes, more = 0, className = '' }) {
    if (!changes?.length) return null
    return (
        <ul className={`list-disc pl-5 space-y-0.5 ${className}`}>
            {changes.map(change => (
                <li key={`${change.category}|${change.name}|${change.what}`} className="break-words">{changeWords(change)}</li>
            ))}
            {more > 0 && <li className="list-none -ml-5">and {more} more</li>}
        </ul>
    )
}
