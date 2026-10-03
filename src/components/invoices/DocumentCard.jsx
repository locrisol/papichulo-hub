import { fmtMoney } from '@/lib/format'
import { fullDate } from '@/lib/dates'
import { card, badge, rowButton } from '@/lib/controlStyles'
import { invoiceCategory } from '@/lib/invoiceCategories'
import { PILES, documentTotal } from '@/lib/invoiceImport'
import Notice from '@/components/ui/Notice'

// One file, read, before anybody presses anything.
//
// **Everything that decides where the money goes is on the card.** The number,
// the day, the week it will be filed under, the restaurant, and the total split
// by category. That last one is the whole reason this screen exists rather than
// a button that says Import: filing a delivery of food against the cleaning
// target is the mistake that actually costs something, and it is invisible
// afterwards.

const PILE_WORDS = {
    new_to_us: 'never bought before',
    new_code: 'code has moved',
    price_changed: 'price changed',
    unchanged: 'same as before',
    ignored: 'not stock',
}

const STATE = {
    ready: { words: 'Ready to import', tint: 'bg-green-50 text-green-800 border-green-200' },
    already_here: { words: 'Already here', tint: 'bg-gray-100 text-gray-700 border-gray-300' },
    by_hand: { words: 'Entered by hand', tint: 'bg-blue-50 text-blue-800 border-blue-200' },
    blocked: { words: 'Cannot be read', tint: 'bg-red-50 text-red-800 border-red-200' },
    on_hand: { words: 'May already be counted', tint: 'bg-amber-50 text-amber-800 border-amber-200' },
    working: { words: 'Reading...', tint: 'bg-gray-100 text-gray-700 border-gray-300' },
}

// `busy` holds every button that writes or decides while a file is being read
// or the page is importing, so nothing is decided against lists about to change.
export default function DocumentCard({ file, busy, onForget, onLinkAccount, onFillIn, onAllow, onAsNew }) {
    const { name, state, doc, totals, piles, blocks, place, where, restaurantName } = file
    const look = STATE[state] || STATE.working

    return (
        <div className={`${card} p-4`}>
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 break-all">{name}</p>
                    {doc && (
                        <p className="text-xs text-muted mt-0.5">
                            {doc.kind === 'credit' ? 'Credit note' : 'Invoice'} {doc.number}
                            {doc.date ? `, ${fullDate(doc.date)}` : ''}
                            {doc.pages > 1 ? `, ${doc.pages} pages` : ''}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <span className={`${badge} border ${look.tint}`}>{look.words}</span>
                    <button type="button" onClick={onForget} className={rowButton()}>Remove</button>
                </div>
            </div>

            {/* Which restaurant's costs this lands in, which is the one thing on
                the paper that cannot be worked out any other way. */}
            {where?.what === 'unknown' && (
                <Notice tone="warn" className="mb-3">
                    <strong className="font-bold">Account {where.accountNo} is new.</strong>{' '}
                    Nothing in the Hub says whose it is. Suppliers are shared between the two
                    restaurants, so this is the only thing on the page that says where the money
                    goes.
                    <button type="button" disabled={busy} onClick={onLinkAccount} className={`${rowButton('good')} mt-2 block`}>
                        It is ours
                    </button>
                </Notice>
            )}

            {where?.what === 'elsewhere' && (
                <Notice tone="urgent" className="mb-3">
                    <strong className="font-bold">This one is not ours.</strong>{' '}
                    Account {where.accountNo} belongs to {restaurantName || 'the other restaurant'},
                    so importing it here would put its cost on the wrong week in two places at once.
                </Notice>
            )}

            {place?.what === 'already_here' && (
                <p className="text-xs text-muted mb-3">
                    This document is already in the Hub. Nothing to do.
                </p>
            )}

            {/* Every invoice typed in for that day, nearest total first, and
                a way to say this is another delivery. Two typed in for one day
                is the usual pattern, and only the nearest used to be offered. */}
            {state === 'by_hand' && (
                <Notice tone="info" className="mb-3">
                    <strong className="font-bold">
                        {place.candidates.length === 1
                            ? 'An invoice was typed in for that day.'
                            : `${place.candidates.length} invoices were typed in for that day.`}
                    </strong>{' '}
                    {place.candidates.length === 1
                        ? `${fmtMoney(place.candidates[0].total_amount)} with no document behind it. `
                        : 'None has a document behind it. '}
                    A hand entered total is net, because a shortage was taken off before it was
                    typed, so filling it in restores the real total and turns the difference into a
                    delivery problem. If this is another delivery that day, it goes in as new.
                    {place.candidates.length === 1 ? (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => onFillIn(place.candidates[0])}
                            className={`${rowButton('edit')} mt-2 block`}
                        >
                            Fill that one in
                        </button>
                    ) : (
                        <ul className="mt-2 space-y-1.5">
                            {place.candidates.map(typed => (
                                <li key={typed.id} className="flex flex-wrap items-center gap-2">
                                    <span className="tabular-nums font-bold">{fmtMoney(typed.total_amount)}</span>
                                    {typed.notes && <span>{typed.notes}</span>}
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => onFillIn(typed)}
                                        aria-label={`Fill in the one for ${fmtMoney(typed.total_amount)}`}
                                        className={rowButton('edit')}
                                    >
                                        Fill this one in
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    <button type="button" disabled={busy} onClick={onAsNew} className={`${rowButton()} mt-2 block`}>
                        Import as new delivery
                    </button>
                </Notice>
            )}

            {state === 'ready' && place?.what === 'by_hand' && (
                <p className="text-xs text-muted mb-3">
                    Going in as a new delivery, beside what was typed in for that day.
                </p>
            )}

            {/* A credit for an invoice that was typed in by hand, where the
                shortage was very likely taken off before the total was typed.
                Importing it would take the same money off twice. */}
            {state === 'on_hand' && (
                <Notice tone="warn" className="mb-3">
                    <strong className="font-bold">
                        This credits invoice {file.onHand.invoiceNumber}, which was typed in by hand
                        {file.onHand.typed?.invoice_date ? ` on ${fullDate(file.onHand.typed.invoice_date)}` : ''}.
                    </strong>{' '}
                    {file.onHand.waitingOn
                        ? `Fill that invoice in first. It is ${file.onHand.waitingOn}, above, and once it is filled in this credit settles the shortage instead of taking it off a second time.`
                        : file.onHand.sure
                            ? 'The total typed in is the invoice less this credit, so it was already taken off and importing it would take it off again.'
                            : 'If the shortage was taken off that total before it was typed, this credit is already counted and importing it would take it off again.'}
                    {/* Nothing to choose when the invoice is in the batch: filling
                        it in is what lets this one through on its own. */}
                    {!file.onHand.waitingOn && (
                        <div className="flex flex-wrap gap-2 mt-2">
                            <button type="button" onClick={onForget} className={rowButton('good')}>
                                Leave it out
                            </button>
                            <button type="button" disabled={busy} onClick={onAllow} className={rowButton()}>
                                It was not taken off, import it
                            </button>
                        </div>
                    )}
                </Notice>
            )}

            {blocks?.length > 0 && (
                <Notice tone="urgent" className="mb-3">
                    <ul className="space-y-1">
                        {blocks.map(said => <li key={said}>{said}</li>)}
                    </ul>
                </Notice>
            )}

            {totals?.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                    {totals.map(t => {
                        const cat = invoiceCategory(t.category)
                        return (
                            <span key={t.category} className={`${badge} border ${cat.soft}`}>
                                {cat.label} {fmtMoney(t.amount)}
                            </span>
                        )
                    })}
                </div>
            )}

            {doc?.lines?.length > 0 && (
                <p className="text-xs text-muted">
                    {doc.lines.length} {doc.lines.length === 1 ? 'line' : 'lines'},{' '}
                    {fmtMoney(documentTotal(doc))}
                    {/* What it costs, which is what it charges: said so
                        nobody wonders why it is more than the goods. */}
                    {extrasIn(doc)}
                    {piles && (
                        <>
                            {': '}
                            {PILES
                                .filter(pile => piles[pile]?.length)
                                .map(pile => `${piles[pile].length} ${PILE_WORDS[pile]}`)
                                .join(', ')}
                        </>
                    )}
                </p>
            )}
        </div>
    )
}

// "including €24.23 VAT and a €21.60 container deposit", or nothing when there
// is neither. Without the sign, because on a credit the total above already
// has one.
function extrasIn(doc) {
    const said = []
    if (doc?.vat) said.push(`${fmtMoney(Math.abs(doc.vat))} VAT`)
    if (doc?.deposits) said.push(`a ${fmtMoney(Math.abs(doc.deposits))} container deposit`)
    return said.length ? ` including ${said.join(' and ')}` : ''
}
