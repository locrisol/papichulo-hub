import { errorBanner } from '../lib/controlStyles'

// Something went wrong, said once.
//
// There were sixty five of these written out by hand and thirteen different
// class strings between them. Four things had drifted: the text was red 600,
// red 700 or red 800 depending on the screen; the padding was p-3, px-3 py-2 or
// px-4 py-3; some had a border and some did not; and role="alert" was on
// fifteen of them and missing from the other fifty, so whether a screen reader
// was told about a failed save came down to which file it happened on.
//
// The margin is the caller's, because where it sits genuinely differs: inside a
// form it wants mb-3, at the top of a page mb-4, and inside a dialog it has to
// reach out past the body padding with -mx-6 or sit in it with mx-6.
//
// It renders nothing at all when there is nothing to say, so a caller can drop
// the surrounding guard if it has nothing else to do.
export default function ErrorBanner({ children, className = '' }) {
    if (!children) return null

    return (
        <p role="alert" className={`${errorBanner} ${className}`}>
            {children}
        </p>
    )
}
