import { warningNote } from '@/lib/controlStyles'
import { feedTrouble } from '@/lib/nearby'

// A Ticketmaster feed that has stopped answering, said where the week is
// planned.
//
// On the roster and the calendar rather than only in settings, because those
// are the two screens where a broken feed would otherwise pass for a quiet
// fortnight: the Arena row draws a dash on every day either way. Managers only,
// since they are the ones who can do anything about it.
//
// Nothing at all when every feed is fine, which is almost always.
export default function FeedTrouble({ pairings, restaurant, className = '' }) {
    const trouble = feedTrouble(pairings, restaurant)
    if (!trouble.length) return null

    return (
        <div className={`${warningNote} ${className}`}>
            <p className="font-semibold">Events from Ticketmaster may be out of date</p>
            <ul className="mt-1 space-y-0.5 break-words">
                {trouble.map(t => <li key={t.place.id}>{t.words}</li>)}
            </ul>
        </div>
    )
}
