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

// The arrows that step through weeks and days used to live here. They belong to
// DateStepper now, which is the only thing that drew them and the only thing
// that knows how big a thumb is.

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

// The outside of a card: any white panel sitting on the page.
//
// The app background is #F7F5F0 and the border colour is #E8E3DB. Both are
// cream, so a card edge against the page was almost invisible and the panels
// ran into the background, worst of all on the week and day pickers which are
// small and have nothing else marking them out.
//
// A plain grey border reads against cream where another cream does not, and a
// small shadow lifts the card off the page. It is the same pair the secondary
// buttons already use, which were changed for exactly the same reason.
//
// This is only for the outside edge. Rows and dividers inside a card keep
// border-border, because those are meant to be soft.
// The heading bar across the top of a card.
//
// The dark green is the same one the table heading rows use, so a heading looks
// like a heading wherever it is rather than each screen inventing its own. Use
// it with cardEdge and overflow-hidden so the bar is clipped by the rounded
// corners, and put the card's own padding on the body underneath rather than on
// the card, or the bar will not reach the edges.
// The bar across the top of a dialog, and the bar over each of its sections.
//
// Two levels rather than one. They were the same dark green and sat directly on
// top of each other, so a dialog opened looking like it had one very tall
// heading with two lines of text in it.
//
// The dialog's own title is the heavier of the two and a size up. A section is
// the same green at a tenth of its strength with the green as the text instead,
// which keeps it in the family while being unmistakably a level down.
//
// Separate from cardHeader on purpose. Cards all over the app use that one and
// none of them should move because a dialog needed a second level.
export const modalHeader =
    'bg-sidebar px-6 py-3.5 text-sm font-bold text-white uppercase tracking-wider'

export const modalSectionHeader =
    'bg-sidebar/10 border-y border-border px-6 py-2.5 text-xs font-bold text-sidebar uppercase tracking-wider'

export const cardHeader =
    'bg-sidebar px-5 py-3 text-xs font-bold text-white uppercase tracking-wider'

// The edge on its own, without a background.
//
// Most cards are white, so card is the one to reach for. A few carry a colour
// of their own, and those need this instead: putting bg-white and a tint on the
// same element does not work, because both are plain classes of equal weight
// and which one wins comes down to the order Tailwind happens to emit them in.
// The invoice summary cards were white for exactly that reason, and the total
// card ended up white with white text on it.
export const cardEdge = 'rounded-xl border border-gray-400 shadow-md'
export const card = `bg-white ${cardEdge}`

// The white box a table sits in.
//
// This exists because of a bug that only showed up on a phone. Every table was
// in a box that said overflow-hidden, which was there to keep the rounded
// corners from being squared off by the heading row. On a laptop that is all it
// does. On a 360px screen the table is wider than the box, and overflow-hidden
// does exactly what it says: the last columns are cut off and there is no way to
// reach them. Cost per unit and the Delete buttons were simply gone.
//
// Labour and Weekly Sales never had this because they were built with a
// scrolling box inside, so they were the only two that worked on a phone.
//
// overflow-x-auto lets it scroll sideways, and overflow-y-hidden keeps the
// corner clipping we wanted in the first place. Anything that was clipped
// vertically before is still clipped, so nothing else moves.
// Same edge as any other card, with the sideways scrolling added.
export const tableCard = `${card} overflow-x-auto overflow-y-hidden`

// The row of buttons at the bottom of a dialog.
//
// Same shape as the older screens already use: full width, its own rule above
// it, and a grey ground so it reads as the floor of the dialog rather than as
// one more thing in the list of fields.
export const modalFooter =
    'px-6 py-4 border-t border-border bg-gray-50 flex flex-wrap justify-end gap-3'

// The actions on a row: Edit, Allergens, Recipe, Prices, Deactivate.
//
// These were coloured words with nothing around them. On a laptop that reads as
// a link and is easy enough to hit. On a phone it is a nine pixel tall target
// sitting in a line of other nine pixel targets, and Deactivate is one of them.
//
// A function rather than a set of classes to add on, because a tone has to
// replace the plain border and text colours rather than sit beside them. Two
// plain classes of equal weight and the winner is whichever Tailwind happens to
// emit last, which has caught this project three times already.
export function rowButton(tone = 'plain') {
    const base =
        'px-3 py-1.5 rounded-lg border bg-white text-xs font-semibold shadow-sm '
        + 'whitespace-nowrap transition-colors focus:outline-none focus:ring-2 focus:ring-accent '

    return base + ({
        plain: 'border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400',
        edit: 'border-blue-300 text-blue-700 hover:bg-blue-50',
        danger: 'border-red-300 text-red-700 hover:bg-red-50',
        good: 'border-green-300 text-green-700 hover:bg-green-50',
    }[tone] || '')
}

// The small coloured pills in a table cell: a role, a section, a status.
//
// This started life on the products screen and the rest of the app was still
// writing its own. Those ones left out inline-block and whitespace-nowrap, and
// on a phone that shows: a plain span is inline, so when a two word label like
// "Super Admin" or "Cold Room" wraps, the coloured background wraps with it and
// the pill breaks in half across two lines. It looks like somebody went at it
// with a marker.
//
// Colours are not in here. Each use adds its own background and text colour on
// top, since what the colour means is different every time.
export const badge =
    'inline-block px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap'

// "This week" and "Today", which jump back to now. They read as selected when
// you are already there, so they need an on and an off state.
export function jumpButton(isCurrent) {
    return isCurrent
        ? 'px-4 py-2 bg-accent-light border border-accent rounded-lg text-sm font-semibold text-accent shadow-sm whitespace-nowrap'
        : 'px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-semibold text-gray-800 shadow-sm transition-colors hover:bg-gray-50 hover:border-gray-400 whitespace-nowrap'
}
