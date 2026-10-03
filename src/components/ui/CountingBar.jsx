import BackButton from '@/components/ui/BackButton'

// The bar across the top of a screen you work down one line at a time: a stock
// take count and a checklist round.
//
// The checklist round copied it from the stock take, class for class, and said
// so in a comment. That is the second copy, so it lives here now.
//
// Sticky on a phone, so where you are up to never scrolls away. On a computer
// the page is one screen tall with only the list scrolling, so it sits still
// at the top of that. z-20 keeps it over the section headings, which are z-10,
// and under the menu.
//
// The title is an h2, because AppLayout already gives the page its h1.
//
// Anything passed in goes on a second line inside the bar, above the progress
// strip, like the search and the filter on a stock take. progress is how far
// through, from 0 to 1, and without it there is no strip.
export default function CountingBar({ backTo, backLabel, title, subtitle, actions, progress, children }) {
    const through = Math.min(1, Math.max(0, Number(progress) || 0))

    return (
        <div className="flex-shrink-0 sticky top-0 md:static z-20 bg-white border-b border-border shadow-sm px-4 md:px-7">
            <div className="py-3 flex items-center gap-3">
                <BackButton to={backTo} label={backLabel} />
                <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-gray-900 truncate">{title}</h2>
                    {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
                </div>
                {actions && <div className="flex-shrink-0 flex items-center gap-2">{actions}</div>}
            </div>
            {children}
            {progress != null && (
                <div className="w-full bg-gray-200 h-1">
                    <div className="bg-accent h-full transition-all" style={{ width: `${through * 100}%` }} />
                </div>
            )}
        </div>
    )
}
