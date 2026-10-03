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

// The ring the buttons here share when the keyboard lands on them.
// focus-visible rather than focus, so a tap or a click does not leave a ring
// sitting on the button afterwards.
const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1'

// The one button on a screen that does the thing: Save, Publish, Add, Log it.
//
// This was typed out sixty three times and came in eight spellings. The
// differences were not decisions: some carried transition-colors and some did
// not, some had disabled:opacity-50 and some had nothing to show for being
// disabled, and the padding varied between px-4 py-2 and px-6 py-2.5 within
// the same screen. Both paddings are real, so size is an argument rather than
// something to settle by picking one.
//
// A function rather than a string, for the same reason rowButton is one: a
// caller adding its own padding beside a padding already in here would be two
// classes setting one property, and which of them wins is decided by where
// they land in the compiled stylesheet, not by the order they are written.
//
// **It has to be called.** `className={primaryButton}` hands React a function,
// which it drops, so the button comes out as plain words with nothing around
// it; writing it inside a template string is worse, because the source is
// stringified and the odd class that happens to be quote-free lands while the
// padding does not. Both of those shipped in the import dialog. structure.test
// watches for it now.
//
// Green is for reading something in rather than sending something out. Orange
// is the accent and stays the default: it is the colour of the one action on a
// screen, and having two colours of primary button in one dialog is only right
// where the second one is a different kind of act.
//
// Danger is the red one for a dialog whose whole point is taking something
// away, so a caller does not have to lay a red background over the orange.
//
// The hover goes darker, to accent-ink. It used to go to orange-600, which is
// lighter than the accent itself, so pointing at the button dropped the white
// lettering to about 3.6 to 1. accent-ink is about 6.2.
//
// Semibold to match the secondary button that usually sits beside it. Two
// weights side by side read as two kinds of button when they are one family.
export function primaryButton(size = 'md', tone = 'accent') {
    const pad = { sm: 'px-3 py-1.5', md: 'px-4 py-2', lg: 'px-6 py-2.5', xl: 'px-6 py-3' }[size]
        || 'px-4 py-2'

    const colour = {
        accent: 'bg-accent hover:bg-accent-ink',
        good: 'bg-green-700 hover:bg-green-800',
        danger: 'bg-red-600 hover:bg-red-700',
    }[tone] || 'bg-accent hover:bg-accent-ink'

    return `${pad} ${colour} text-white text-sm font-semibold rounded-lg `
        + `transition-colors disabled:opacity-50 ${focusRing}`
}

// Ordinary secondary button: Log waste, Week view, Day view, Manage Categories,
// Check for new events.
//
// A string and not a function like primaryButton. It is used as a string in
// well over a hundred places and it has no size or tone to take.
export const secondaryButton =
    'px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-semibold text-gray-800 shadow-sm transition-colors hover:bg-gray-50 hover:border-gray-400 disabled:opacity-50 whitespace-nowrap '
    + focusRing

// The arrows that step through weeks and days used to live here. They belong to
// DateStepper now, which is the only thing that drew them and the only thing
// that knows how big a thumb is.

// Date pickers sitting next to those arrows.
//
// 16px on a phone and the smaller size only with a mouse, for the reason
// given at compactField: an iPhone zooms in on a date box under 16px too.
export const dateField =
    'bg-white border border-gray-300 rounded-lg px-3 py-2 text-base pointer-fine:text-sm text-gray-800 shadow-sm cursor-pointer transition-colors hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent'

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
//
// fieldBase has no background and no border colour, so each box below picks
// exactly one of each. A caller laying a second bg- over fieldClass would be
// two classes for one property, settled by stylesheet order.
export const fieldBase =
    'w-full border rounded-lg px-3 py-2.5 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent'

export const fieldClass = `${fieldBase} bg-white border-border`

// A sales box that has a figure in it. Green 50 is the colour a filled cell
// already has in the sales tables.
export const filledField = `${fieldBase} bg-green-50 border-border`

// A box still waiting on an answer, like a till line nobody has matched yet.
// The orange edge is what says so before anything is typed.
export const askField = `${fieldBase} bg-white border-accent`

// The edit box inside a table row, and the boxes in the weekly report, where
// a full size box would make every row twice as tall.
//
// The small text is for a mouse only, through pointer-fine, and not for a
// wide screen through sm. An iPhone held sideways is wider than sm and would
// still zoom in on a box under 16px.
export const denseField =
    'w-full bg-white border border-border rounded-lg px-2 py-1.5 text-base pointer-fine:text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent'

// The same box with less padding, for a row that already has a day name and a
// remove on it.
//
// Not for a select in an ordinary form. There it sits beside fieldClass boxes
// and takes fieldClass too, or the two come out at different heights.
//
// TimeField had this written inside it and the availability dialog had a third
// copy of its own, a tenth of a rem shorter, which is why that dialog could put
// two boxes doing the same job side by side at two different heights.
//
// 16px on a phone, like every other box. This used to say a select was safe at
// text-sm because it opens a list rather than a keyboard, and that was wrong:
// iPhone Safari zooms in on a select, a date or a time box under 16px just the
// same. A computer keeps the smaller size, through pointer-fine, so it looks
// as it did there.
export const compactField =
    'w-full bg-white border border-border rounded-lg px-2 py-2 text-base pointer-fine:text-sm text-gray-900 '
    + 'focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent'

// A box that is filled in and cannot be typed in: a field locked until Edit is
// pressed, or a figure that comes from somewhere else, like the total of an
// invoice read in from the supplier's document.
//
// The same box greyed, rather than the value as loose text, so it reads as the
// field it is. LockedField and the invoice form each had this written out and
// each said it matched the other, which is the second copy.
//
// No width, padding or text size. The caller adds those to match the boxes
// beside it, and two classes for one property on an element are settled by
// stylesheet order, not by the order they are written.
export const lockedField = 'border border-border rounded-lg bg-app-bg text-muted cursor-not-allowed'

// Something went wrong.
//
// Red 700 rather than 600, which is what the majority already used and the one
// that clears the contrast ratio against the pale red behind it. No border: the
// colour is doing that job and the bordered versions were a third of the sites
// disagreeing with the other two thirds.
//
// No margin. Where one of these sits is genuinely different from screen to
// screen, so that is the caller's to say. Use the ErrorBanner component rather
// than this string, because it also carries role="alert", which fifty of the
// sixty five hand written ones were missing.
export const errorBanner = 'text-sm text-red-700 bg-red-50 rounded-lg p-3'

// Something to know before carrying on that is not an error, like unsaved
// changes that were not brought back.
//
// Amber with an amber edge, which is what most of the hand written ones already
// are. There are over a dozen of those and they differ in text size and
// padding. They move over through the Notice component, which picks this or
// one of the notes beside it by tone. No margin, for the same reason as
// errorBanner.
export const warningNote = 'text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3'

// The same note in green, for something that went right and is worth saying,
// like a week that is all in. The same family as the amber one, so a good
// note and a warning differ only in colour. Green 900 on the pale green is
// well over 7 to 1.
export const goodNote = 'text-sm text-green-900 bg-green-50 border border-green-200 rounded-lg p-3'

// The same note in red, for something already wrong that a customer could be
// told, like products with allergens not set. Not an error: nothing failed,
// so it is not errorBanner and carries no alert. Red 800 on the pale red is
// about 7.7 to 1.
//
// The roster and the invoice documents each have one of these written out by
// hand. They can move over when those screens are next worked on.
export const urgentNote = 'text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg p-3'

// The same note in blue, for a question or a sum to check before going ahead,
// like which price a claim should have been or which invoice line its money
// comes off. Nothing is wrong yet, so it is not warningNote. Blue 900 on the
// pale blue is well over 7 to 1.
//
// The invoice document card and the fill-in form each have one written out by
// hand, with less padding. They can move over when those screens are next
// worked on.
export const infoNote = 'text-sm text-blue-900 bg-blue-50 border border-blue-200 rounded-lg p-3'

// The label over a box. Muted, which is the app's one quiet text colour.
// gray-500 was a second grey doing the same job.
export const labelClass = 'text-xs text-muted mb-1 block'

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
//
// Muted rather than gray-500, for the same reason as labelClass.
export const captionClass = 'text-xs font-semibold text-muted uppercase tracking-wider'

// The sentence under a box, where anything longer than two or three words
// belongs.
//
// A placeholder is the wrong place for an explanation. It has the width of the
// box and no more, it is cut without warning on a narrow screen, and it
// disappears the moment somebody starts typing, which is often exactly when
// they wanted to read it. A line underneath has the full width of the form and
// stays put.
//
// muted rather than gray-400. It is the hint under every field in the app and
// gray-400 on white is 2.6 to 1, so the sentence explaining the box was the
// hardest thing on the form to read.
export const hintClass = 'text-xs text-muted mt-1'

// The line under a box that says what is wrong with what was typed in it.
// The same size and place as the hint, in the red errorBanner uses, so it
// reads as being about that box and not about the whole form.
export const fieldError = 'text-xs text-red-700 mt-1'

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
        + 'whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent '

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

// The two badges that mean the same thing on every screen, so they are here
// with their colours rather than added on by each use.
//
// mixBadge is dark amber lettering on pale amber. The white on amber-500 it
// replaces was about 2.1 to 1.
//
// inactiveBadge is the strong red the products list already used for a
// switched off row. It is darker than the pale red row behind it, so it still
// shows there.
export const mixBadge = `${badge} bg-amber-100 text-amber-800`
export const inactiveBadge = `${badge} bg-red-200 text-red-800`

// The little count at the end of an item in the sidebar: requests waiting on
// Roster, products with allergens not set on Products.
//
// The roster's was written inside AppLayout, and a second one was coming, with
// more planned after it. Here so they are one size and one shape, and only the
// colour says which kind it is.
//
//   waiting   amber, something waiting on you. Its white number is about 2.1
//             to 1, which fails for text this size. Kept as it was for now;
//             the plan for the rest of the sidebar counts gives it a dark
//             number instead.
//   urgent    red, something already wrong that a customer could be told.
//             red-600 is the one that works both ways: the white number on it
//             is 4.8 to 1, and the disc is 3 to 1 against the sidebar green.
//             red-700 makes a better number and a disc that sinks into the
//             green at 2.2.
//
// relative because the count carries words for a screen reader beside the
// number, and those are absolutely placed. Without a positioned parent they
// are placed against the whole page, and a sidebar item low enough down can
// stretch it.
export function navBadge(tone = 'waiting') {
    const colour = {
        waiting: 'bg-amber-500 text-white',
        urgent: 'bg-red-600 text-white',
    }[tone] || 'bg-amber-500 text-white'

    return `relative ${colour} text-[0.65rem] font-bold min-w-[1.15rem] h-[1.15rem] px-1 `
        + 'rounded-full grid place-items-center flex-shrink-0'
}

// The same counts as a dot on the menu button, for a phone. The sidebar is a
// drawer there, so none of its counts show until it is opened, and this says
// there is something in it. The tones are navBadge's, and the most urgent one
// present wins.
//
// A shape with no number, so it needs 3 to 1 against what is around it, which
// is the white ring. red-600 is 4.8. The roster count's own amber-500 is about
// 2.1, so waiting is one step darker here: amber-600 is 3.2 and still reads as
// the same amber. The ring keeps it apart from the lines of the icon under it.
//
// The button it sits on has to be relative, and carries the words for it.
export function menuDot(tone = 'waiting') {
    const colour = {
        waiting: 'bg-amber-600',
        urgent: 'bg-red-600',
    }[tone] || 'bg-amber-600'

    return `absolute top-1 right-1 w-2.5 h-2.5 rounded-full ring-2 ring-white ${colour}`
}

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
    if (unit === 'month') return isCurrent ? 'This month' : 'Go to current month'
    // The timesheet is the one screen whose home is not now. It is filled in
    // once a week has finished and the till's report for it exists, so the week
    // it opens on is last week, and a button offering to take you to this one
    // is offering the week there is nothing to do on yet.
    if (unit === 'lastWeek') return isCurrent ? 'Last week' : 'Go to last week'
    return isCurrent ? 'This week' : 'Go to current week'
}

// accent-ink for the lettering, not accent. The brand orange on the light
// ground behind it is 3.9 to 1, and accent-ink exists for exactly this: the
// same orange taken down until it reads. Every other piece of orange lettering
// in the app already uses it, including on this background. This was the one
// that was missed.
export function jumpButton(isCurrent) {
    return (isCurrent
        ? 'px-4 py-2 bg-accent-light border border-accent rounded-lg text-sm font-semibold text-accent-ink shadow-sm whitespace-nowrap '
        : 'px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-semibold text-gray-800 shadow-sm transition-colors hover:bg-gray-50 hover:border-gray-400 whitespace-nowrap ')
        + focusRing
}

// An on and off switch in a row of them: a label on a diary entry, an extra on
// a roster day, a product filter. Each one is its own switch, so several can be
// on at once, which is what makes it a chip and not a segment. On is the
// accent orange the product filters already use.
//
// The caller adds aria-pressed, because the colour alone does not tell a
// screen reader whether it is on.
export function chip(isOn) {
    return 'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors whitespace-nowrap '
        + 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent '
        + (isOn
            ? 'bg-accent border-accent text-white'
            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400')
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

// keepCase is for a label that is already written the way it should read,
// like a name or "1 month", where capitalize would make "1 Month". The labels
// that come straight from a value, like "day" and "week", still want it.
export function segmentButton(isOn, keepCase = false) {
    return 'px-2 sm:px-4 py-1.5 text-xs font-semibold rounded-md transition-colors text-center whitespace-nowrap '
        + (keepCase ? '' : 'capitalize ')
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
//
// The ring here and on rowButton and closeButton is focus-visible, for the
// keyboard only. With focus, a tapped × kept its ring until something else
// was touched.
export const removeButton =
    'flex-shrink-0 min-w-[2.25rem] min-h-[2.25rem] inline-flex items-center justify-center '
    + 'rounded-full bg-gray-100 text-lg leading-none text-gray-600 transition-colors '
    + 'hover:bg-red-100 hover:text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'

// The same control on a dark heading bar, which is only ever the close on a
// dialog. Same size and shape, different colours.
//
// This one keeps its negative margin. The heading bar is about fifty five
// pixels tall and the button is thirty eight, so taking its own space would
// push every dialog heading in the app out by the difference for no reason.
export const closeButton =
    'flex-shrink-0 -m-1.5 p-1.5 min-w-[2.25rem] min-h-[2.25rem] inline-flex items-center justify-center '
    + 'rounded-full bg-white/10 text-lg leading-none text-white/80 transition-colors '
    + 'hover:bg-white/25 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60'

// A control that is only a picture, with no words: the back arrow in a sticky
// bar, the + on a diary week, the up and down arrows that rearrange a list.
//
// Forty four pixels square at the least, a thumb's width, since a glyph alone
// is a small thing to aim at. No border or ground until it is pointed at, so a
// row of them does not read as a row of buttons fighting the content. Dimmed
// when disabled, the way the arrange arrows already show the end of a list.
//
// The caller gives it an aria-label, because there are no words on it for a
// screen reader to read.
export const iconButton =
    'flex-shrink-0 min-w-[2.75rem] min-h-[2.75rem] inline-flex items-center justify-center '
    + 'rounded-lg text-gray-700 transition-colors hover:bg-gray-100 '
    + 'disabled:opacity-30 disabled:hover:bg-transparent '
    + 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'

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

// The line under a page title that says what the page is for. The same muted
// text as a hint, a size up, with the gap to the title built in so each page
// does not pick its own.
export const pageSubtitle = 'text-sm text-muted mt-1'
