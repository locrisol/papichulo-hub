import { useAuth } from '@/context/auth'
import { can, SEES_INACTIVE } from '@/lib/access'

// Show Inactive, written once and refusing employees on its own.
//
// It was the same twenty lines on Products, Menu Items and Suppliers. Two of
// those three are manager only routes, so an employee could only ever reach the
// one on Suppliers, and that is the one he asked to take away on 13 September:
// a record somebody turned off is not an employee's business, even when seeing
// it is harmless.
//
// The rule lives in here rather than in each caller because "anywhere" includes
// pages nobody has written yet. A new list that drops this in gets the rule
// without knowing there is one, which is the only version of this that survives
// somebody being in a hurry.
//
// It returns nothing at all for anybody below the line. Not disabled: a control
// that is on screen and refuses you is a worse answer than a control that was
// never offered, and there is nothing here for an employee to ask about.
export default function ShowInactiveButton({ showing, onToggle }) {
    const { user } = useAuth()
    if (!can(user, SEES_INACTIVE)) return null

    return (
        <button
            type="button"
            onClick={onToggle}
            aria-pressed={showing}
            className={`px-4 py-2 border text-sm font-medium rounded-lg transition-colors ${
                showing
                    ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                    : 'border-border text-gray-600 hover:bg-gray-50'
            }`}
        >
            {showing ? 'Hide Inactive' : 'Show Inactive'}
        </button>
    )
}
