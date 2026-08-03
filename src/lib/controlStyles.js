// The classes for the secondary controls, kept in one place.
//
// These used to be written out on every page, and they had drifted: some were
// px-3, some px-4, some text-gray-600 and some text-gray-700. Worse, they were
// all grey text inside a cream border on a cream background, so they faded into
// the page. On several screens the button that faded away was the main thing you
// would want to click, like Log waste or Week view.
//
// The fix is a white background, a border you can actually see, darker and
// heavier text, and a small shadow so the control sits above the page instead of
// in it. Nothing here changes the colours of the app, it just stops these
// controls disappearing.
//
// The primary action on a page keeps its accent orange and is not in here. These
// are only for the secondary controls that sit beside it.

// Ordinary secondary button: Log waste, Week view, Day view, Manage Categories,
// Check for new events.
export const secondaryButton =
    'px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-semibold text-gray-800 shadow-sm transition-colors hover:bg-gray-50 hover:border-gray-400 disabled:opacity-50 whitespace-nowrap'

// The small square arrows that step through weeks and days. Same look, less
// padding, because they hold a single character.
export const iconButton =
    'px-2.5 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 shadow-sm transition-colors hover:bg-gray-50 hover:border-gray-400 disabled:opacity-50'

// Date pickers sitting next to those arrows.
export const dateField =
    'bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 shadow-sm cursor-pointer transition-colors hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent'

// The heading row of a table.
//
// These used to be bg-gray-50, which is exactly the colour of every second
// striped row, so the heading did not read as a heading at all. A darker grey
// was tried first and it was still too close to tell apart.
//
// It is the dark sidebar green now. There is no mistaking it for a data row, and
// it ties the tables to the rest of the app rather than adding another colour.
// The child rules are so a table only has to change its heading row, and every
// heading cell inside it follows. The cells set their own text-gray-500, and a
// plain class would lose to that, but "> th" is more specific so it wins.
export const tableHeadRow = 'bg-sidebar [&>th]:text-white [&>th]:font-bold'
export const tableHeadCell = 'text-xs font-bold text-white uppercase tracking-wider'

// "This week" and "Today", which jump back to now. They read as selected when
// you are already there, so they need an on and an off state.
export function jumpButton(isCurrent) {
    return isCurrent
        ? 'px-4 py-2 bg-accent-light border border-accent rounded-lg text-sm font-semibold text-accent shadow-sm whitespace-nowrap'
        : 'px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-semibold text-gray-800 shadow-sm transition-colors hover:bg-gray-50 hover:border-gray-400 whitespace-nowrap'
}
