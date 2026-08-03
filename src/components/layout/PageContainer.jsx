// Decides how wide a page is allowed to get, in one place.
//
// Before this every page picked its own number and they went from 672px up to
// 1024px for no real reason, so on a desktop screen there was a big empty space
// on the right and everything was squeezed into the left side.
//
// There are two widths because it depends on what the page shows:
//
// "wide" is for lists, tables and dashboards. On a big screen the useful thing
// is to see more rows and more columns at once, so these take all the space.
//
// "form" is for pages that are mostly inputs. A text box stretched across a
// 1920px monitor is harder to use, not easier, so these stay narrower and put
// their fields in two columns instead.
//
// The page is placed inside the main area of AppLayout, which already adds the
// padding around it, so nothing here should add padding of its own.
const widths = {
    wide: 'max-w-[1600px]',
    form: 'max-w-6xl',
}

export default function PageContainer({ width = 'wide', className = '', children }) {
    return (
        <div className={`${widths[width]} ${className}`}>
            {children}
        </div>
    )
}
