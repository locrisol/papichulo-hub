import { pageTitle, pageSubtitle } from '@/lib/controlStyles'

// The title at the top of a page, the line under it, and the page's own
// buttons on the right.
//
// Every page wrote this by hand, in several layouts, with two greys for the
// line under the title and the serif typed out where pageTitle already had it.
// Thirteen of them also made the title an h1, which gave the page two, since
// AppLayout already puts the page's name in the header as the h1. So this one
// is an h2.
//
// The buttons wrap under the title on a phone rather than squeezing it, and
// min-w-0 lets a long title wrap instead of pushing them off the screen.
export default function PageHeader({ title, subtitle, children }) {
    return (
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
                <h2 className={pageTitle}>{title}</h2>
                {subtitle && <p className={pageSubtitle}>{subtitle}</p>}
            </div>
            {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
        </div>
    )
}
