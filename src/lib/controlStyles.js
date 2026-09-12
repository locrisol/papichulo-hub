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

// A box you type in, and the label over it.
//
// These were written out by hand on every form in the app. The label was the
// same eleven characters in eleven files, which is not a problem until somebody
// changes one of them, and then it is eleven files that no longer match.
//
// The box had genuinely drifted: three files called it fieldCls and disagreed
// about whether it was py-2 text-sm or py-2.5 text-base, one had its own focus
// ring at a different opacity, one used a smaller radius and a grey border, and
// the product form used a completely different label, uppercase and letter
// spaced. Five versions of one box.
//
// text-base rather than text-sm on purpose: an iPhone zooms the whole page in
// when you focus a box whose text is under 16px, and then leaves you there.
export const fieldClass =
    'w-full bg-white border border-border rounded-lg px-3 py-2.5 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent'

// The same box at the smaller size, for a control that opens a list rather than
// a keyboard.
//
// TimeField had this written inside it and the availability dialog had a third
// copy of its own, a tenth of a rem shorter, which is why that dialog could put
// two boxes doing the same job side by side at two different heights.
//
// text-sm is safe here where it would not be on a text box: a phone zooms the
// whole page in when you focus something under 16px, and it is a keyboard that
// brings that on. A select opens a list instead, so there is no keyboard and no
// zoom.
export const compactField =
    'w-full bg-white border border-border rounded-lg px-2 py-2 text-sm text-gray-900 '
    + 'focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent'

export const labelClass = 'text-xs text-gray-500 mb-1 block'

// The small caps line over a figure: "Waste this week", "Margin", "Net sales".
//
// This is not a field label and it was written in the same class string as one,
// so the two were indistinguishable. Worth keeping apart: a caption sits over a
// number you read, a label sits over a box you type in, and the app had 37
// field labels wearing the caption's uppercase and letter spacing.
//
// Which mattered on a phone, because uppercase with tracking-wider is the
// widest way there is to write a word: "Price per case (€)" fits on one line
// and "PRICE PER CASE (€)" does not.
export const captionClass = 'text-xs font-semibold text-gray-500 uppercase tracking-wider'

// The sentence under a box, where anything longer than two or three words
// belongs.
//
// A placeholder is the wrong place for an explanation. It has the width of the
// box and no more, it is cut without warning on a narrow screen, and it
// disappears the moment somebody starts typing, which is often exactly when
// they wanted to read it. A line underneath has the full width of the form and
// stays put.
export const hintClass = 'text-xs text-gray-400 mt-1'

// A tick box.
//
// The native one was w-4 h-4 in twenty three places, which at this app's foot
// rule is about nineteen pixels. A thumb is nearer forty five, so every one of
// them was a guess, usually with a text box beside it to land in by mistake.
//
// This is the size the one in the weekly report already uses, which was written
// when somebody noticed the same thing about that section. It is the same
// native input, so it keeps its keyboard behaviour and its label association;
// only the size and the target change.
export const checkbox = 'w-6 h-6 flex-shrink-0 accent-accent cursor-pointer'

// The row a tick box sits in: the box, then whatever it is labelling.
//
// gap-3 because a 24px box needs space from its words to stop reading as one
// blob, and items-start so a label that wraps to three lines keeps its box
// beside the first line rather than floating to the middle.
export const checkRow = 'flex items-start gap-3'

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
// What that button should say.
//
// It read "This week" wherever you were, which is a label for a place rather
// than for a button. Standing on week 31 and being offered "This week" tells
// you nothing about what pressing it does, and the only thing separating the
// two states was the orange, which is a colour somebody has to already know
// the meaning of.
//
// So it names the action when there is one, and names where you are when there
// is not. The orange still marks being there, and now agrees with the words.
export function jumpLabel(isCurrent, unit = 'week') {
    if (unit === 'day') return isCurrent ? 'Today' : 'Go to today'
    return isCurrent ? 'This week' : 'Go to current week'
}

export function jumpButton(isCurrent) {
    return isCurrent
        ? 'px-4 py-2 bg-accent-light border border-accent rounded-lg text-sm font-semibold text-accent shadow-sm whitespace-nowrap'
        : 'px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-semibold text-gray-800 shadow-sm transition-colors hover:bg-gray-50 hover:border-gray-400 whitespace-nowrap'
}

// A switch between two or three ways of looking at the same thing: Day or
// Week on the roster, Mine or Everyone on the staff page.
//
// Not a row of buttons. Buttons offer to do something; this says which of them
// you are already in, so it is one sunk track with the chosen one raised out of
// it. Written down here because the roster had it typed into the page and the
// staff week needed the same control, and the second copy is where these things
// start drifting apart.
// A row of choices where only one is on: Bars or Pie, one month or twelve.
//
// This was inline-flex with px-4 on every button, which is a width nobody
// chose: it is whatever the longest label happens to need. Four ranges reading
// "1 month" to "12 months" come to more than a 390px screen holds, and
// inline-flex neither wraps nor shrinks, so the twelfth month simply went off
// the side of the page with no way to reach it.
//
// A grid that fills its container cannot do that. The buttons share the width
// evenly however many there are and whatever they are called, so it fits by
// construction rather than because somebody measured a phone. From sm up it
// goes back to sitting at its natural width beside whatever it belongs to.
export const segmentTrack =
    'grid grid-flow-col auto-cols-fr w-full sm:w-auto sm:inline-flex bg-gray-100 rounded-lg p-1 gap-1'

export function segmentButton(isOn) {
    return 'px-2 sm:px-4 py-1.5 text-xs font-semibold rounded-md transition-colors capitalize text-center whitespace-nowrap '
        + (isOn ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900')
}

// The small × that takes a line away.
//
// These were all written by hand and all came out as an eleven pixel glyph with
// px-1 either side, which is a target about sixteen pixels across. A thumb is
// nearer forty five, so on a phone every one of them was a guess, and the thing
// beside it was usually a text box you did not want to be in. The target was
// fixed first, and the look is this pass.
//
// A grey disc rather than a bare mark. Sitting in a row of bordered boxes, a
// glyph on the page with no ground and no edge reads as a piece of text that
// happens to be a cross, and it was the only control in some of those rows with
// nothing around it at all. The disc is enough to say press me without adding a
// third border to a row that already has two.
//
// Grey and not red on purpose. Fifteen places use this and two of them are not
// deletions: the × in Opening hours empties the two times to say the restaurant
// is shut that day, and the row stays where it is. A bin or a red ground would
// be telling those two a lie.
//
// It gives up the -m-1.5 the bare glyph used to carry, which pulled the padding
// back out of the layout so a row would not grow to hold it. A control with a
// ground of its own has to take its own space or it laps over whatever is
// beside it. The rows that hold one are about thirteen pixels tighter for it,
// which the tightest of them, the Opening hours week, has been measured
// against: the two time boxes still have eighty nine pixels each and need
// seventy seven.
export const removeButton =
    'flex-shrink-0 min-w-[2.25rem] min-h-[2.25rem] inline-flex items-center justify-center '
    + 'rounded-full bg-gray-100 text-lg leading-none text-gray-600 transition-colors '
    + 'hover:bg-red-100 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-accent'

// The same control on a dark heading bar, which is only ever the close on a
// dialog. Same size and shape, different colours.
//
// This one keeps its negative margin. The heading bar is about fifty five
// pixels tall and the button is thirty eight, so taking its own space would
// push every dialog heading in the app out by the difference for no reason.
export const closeButton =
    'flex-shrink-0 -m-1.5 p-1.5 min-w-[2.25rem] min-h-[2.25rem] inline-flex items-center justify-center '
    + 'rounded-full bg-white/10 text-lg leading-none text-white/80 transition-colors '
    + 'hover:bg-white/25 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/60'

// The title at the top of a page.
//
// There were two of these and the split was chronological rather than
// deliberate: thirteen older pages used text-lg font-semibold, and the four
// written most recently used the serif display face at text-2xl. Nothing
// distinguished them except when they were written.
//
// The serif wins. It is the face the theme carries for exactly this, and at
// text-lg semibold a page title was the same weight and nearly the same size as
// the heading on a card inside it, so the page did not read as having a name.
export const pageTitle = 'font-serif text-2xl font-bold text-gray-900'
