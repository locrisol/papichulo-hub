# Building a screen in the Hub

Every screen is made from the same small set of pieces, so the app looks and
behaves the same everywhere. Before writing anything new, look here, then at
`src/lib/controlStyles.js` and the nearest screen that already does something
similar. If a piece is missing, add it to the shared place rather than writing
a one off copy.

`src/test/structure.test.js` checks the most important of these rules on every
pull request, so breaking one fails the build and the message names the piece to
use instead.

## Styles (`src/lib/controlStyles.js`)

| For | Use | Note |
|---|---|---|
| A box you type in | `fieldClass` | 16px on a phone, so an iPhone does not zoom in. Checked. |
| A tight row on a computer (inline edits, report boxes, the sales grid) | `denseField` | Small text only with a mouse (`pointer-fine:`), still 16px on a phone. Checked. |
| A select or time box in a dense row | `compactField` | |
| A date box | `dateField` | |
| A box filled in for you, or one asking for an answer | `filledField`, `askField` | |
| A box you cannot change | `lockedField`, or the `LockedField` component | |
| The main button | `primaryButton(size, tone)` | Tones: accent (orange), good (green), danger. Checked. |
| Cancel and other second buttons | `secondaryButton` | The old faded grey one is checked for. |
| A small button on a row | `rowButton(tone)` | |
| The × that removes or closes | `removeButton`, `closeButton` | Checked: never drawn by hand. |
| A switched off product, supplier, user and so on | `inactiveBadge` | Platforms, tenders and positions say "Retired" in the same pill. |
| A pill | `badge`, `mixBadge` | |
| An on/off filter chip | `chip(isOn)` | Orange when on. |
| Two or three options side by side | `segmentTrack` with `segmentButton(isOn)` | |
| A note that is not an error | `goodNote`, `warningNote`, `urgentNote`, `infoNote` | Prefer the `Notice` component. |
| Labels, captions, hints, a field's error | `labelClass`, `captionClass`, `hintClass`, `fieldError` | |
| Cards, tables and modal parts | `card`, `tableCard`, `tableHeadRow`, `modalHeader`, `modalFooter` | |
| A page title and the line under it | `pageTitle`, `pageSubtitle` | Prefer `PageHeader`. |

Never add a class that fights one a shared style already sets, such as a
second text size or padding next to `fieldClass`. Tailwind picks the winner by
its own order, not by what was written last. Checked.

## Components (`src/components/ui/`)

| For | Use |
|---|---|
| Something went wrong | `ErrorBanner` |
| Anything else worth saying (good, warn, urgent, info) | `Notice` |
| A warning that stays until it is read | `WarningUntilSeen` |
| The top of a page: title, line under it, its buttons | `PageHeader` (an h2; the layout already has the page's h1, and a page has only one. Checked.) |
| Where an autosave is up to | `SaveState` |
| A button that makes a PDF | `PdfButton` |
| The bar on a screen worked one line at a time | `CountingBar` |
| Moving by day, week or month | `DateStepper`, `JumpButton` |
| Back to the page before | `BackButton` |
| Adding a row | `AddButton` |
| Showing switched off rows | `ShowInactiveButton` with `useShowInactive` |
| Reordering a list | `ArrangeList` |
| A dialog | `Modal` (it takes focus, and Escape closes only the top one) |
| Asking before doing something | `useConfirm` from `src/context/confirm` |
| Stopping a form saving twice | `useSaveOnce` |
| Searching a list, picking a product, a time, a clock time | `SearchBox`, `ProductSelect`, `TimeField`, `ClockField` |

A page that breaks while it is drawn shows a message in place of the page and
keeps the menu, through `ErrorBoundary` in the layout. Nothing needs adding to
a new page for that.

## Dates, money and numbers

- **Dates and times are only worded in `src/lib/dates.js`** (`shortDate`,
  `fullDate`, `stampDate`, `stampDateTime`, `clockTime`, `weekRange` and the
  rest). Nothing else calls `toLocaleDateString` or `toLocaleTimeString`.
  Checked.
- A timestamp from the database is UTC. Use `stampDay` for the day it happened
  in Ireland, never the first ten characters of the string, which files
  anything just after midnight in summer under the day before.
- Money, quantities and percents go through `src/lib/format.js` (`fmtMoney`,
  `fmtQty`, `fmtPct`, `round2`).
- Tests that build a time use local parts, `new Date(2026, 8, 27, 23, 30)`,
  not a string ending in Z, because the checks run in UTC and a laptop in
  Ireland does not.

## Browser storage

Only through `src/lib/browserStore.js` (`readStored`, `writeStored`, `forgetStored`), and only
for things that are fine to lose: a filter, a folded heading, a draft. A private
window refuses the store, and read directly that blanks the page. Checked.

## PDFs

Every printed page uses `src/lib/pdfPage.js`: `loadJsPdf` (fetched only when
someone asks for a PDF), the letterhead, the footer and the logo size. Dates on
paper are 03/10/2026.

## Mail

The report and hours mails are built in
`supabase/functions/weekly-report-email/email.js` and share its page shell.
Email HTML is not web HTML: tables and inline styles only, nothing wider than a
phone (one wide thing makes the Gmail app shrink the whole mail), solid colours
only (no 8 digit hex), a full head with a preheader, typed line breaks kept, and
no space at the end of a line. A test fails if a heavy week gets near the size Gmail cuts
off at.

## Every screen, before it is done

- Works at 360px wide and on a computer: rows wrap, nothing wider than the
  screen.
- Text is at least 4.5 to 1 against its background. Quiet text is
  `text-muted`; there is no second grey.
- Words are plain app English, the way the rest of the app says it.
