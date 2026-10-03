import { goodNote, warningNote, urgentNote, infoNote } from '@/lib/controlStyles'

// Something worth saying that is not an error: a week that is all in, changes
// that were not brought back, products with no allergens set.
//
// The green and amber ones were written out by hand about thirty five times,
// in a handful of text sizes and paddings, and only one of them told a screen
// reader anything. This is ErrorBanner's shape for the rest: one look per
// tone, the margin left to the caller, and nothing at all when there is
// nothing to say.
//
// Good and warn are announced as a status, since they are usually the answer
// to something just done. Urgent and info are standing notes on a page and
// would be noise read out every time it loads.
const TONES = {
    good: goodNote,
    warn: warningNote,
    urgent: urgentNote,
    info: infoNote,
}

export default function Notice({ tone = 'warn', children, className = '' }) {
    if (!children) return null

    const style = TONES[tone] || warningNote

    return (
        <div role={tone === 'good' || tone === 'warn' ? 'status' : undefined} className={`${style} ${className}`}>
            {children}
        </div>
    )
}
