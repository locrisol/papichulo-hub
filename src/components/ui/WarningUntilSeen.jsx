import { warningNote, rowButton } from '@/lib/controlStyles'

// Something to act on that stays until somebody says they have seen it, rather
// than going with the next tap the way a green message does. Made for the
// import's credit note matched to a delivery problem on another invoice: the
// money is wrong until somebody puts it right, and as a green message it was
// gone at the first decision on Review.
export default function WarningUntilSeen({ children, onSeen, className = '' }) {
    return (
        <div className={`${warningNote} ${className} flex flex-wrap items-start justify-between gap-3`}>
            <p className="min-w-0 flex-1">{children}</p>
            <button type="button" onClick={onSeen} className={rowButton()}>Got it</button>
        </div>
    )
}
